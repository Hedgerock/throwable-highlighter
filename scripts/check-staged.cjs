const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const {basename, dirname, isAbsolute, join, resolve} = require("node:path");
const process = require("node:process");
const {parseArgs} = require("node:util");

const {CheckPlanBuilder} = require("./local-checks/CheckPlanBuilder.cjs");
const {GitChangesReader} = require("./local-checks/GitChangesReader.cjs");

const TEMP_PREFIX = "throwable-highlighter-check-";

function runCommand(command, args, cwd, env, capture = false) {
    const result = childProcess.spawnSync(command, args, {
        cwd,
        env,
        encoding: "utf8",
        stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
        windowsHide: true
    });

    if (result.error) {
        throw new Error("Unable to start " + command + ": " + result.error.message, {cause: result.error});
    }

    if (result.status !== 0) {
        const reason = result.signal ? "signal " + result.signal : "exit code " + result.status;
        const details = capture && typeof result.stderr === "string" ? result.stderr.trim() : "";
        throw new Error(command + " " + args.join(" ") + " failed: " + reason + (details ? "\n" + details : ""));
    }

    return result.stdout ?? "";
}

function runNpm(args, cwd, env) {
    console.log("[local-ci] npm " + args.join(" "));

    if (process.platform === "win32") {
        runCommand(env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm " + args.join(" ")], cwd, env);
    } else {
        runCommand("npm", args, cwd, env);
    }
}

function runProjectChecks(snapshot, env, {plan, selectionFile}) {
    console.log("[local-ci] Checking the local runner.");
    runCommand(process.execPath, ["--test", "scripts/test/*.test.cjs"], snapshot, env);

    if (plan.intellij) {
        console.log("[local-ci] Checking the IntelliJ plugin.");

        if (process.platform === "win32") {
            runCommand(
                env.ComSpec || "cmd.exe",
                ["/d", "/s", "/c", "gradlew.bat test verifyPlugin buildPlugin --no-daemon"],
                snapshot,
                env
            );
        } else {
            runCommand("sh", ["./gradlew", "test", "verifyPlugin", "buildPlugin", "--no-daemon"], snapshot, env);
        }
    }

    if (plan.vscode) {
        const prototype = join(snapshot, "prototypes", "vscode");
        runNpm(["ci"], prototype, env);
        runCommand(
            process.execPath,
            [join(snapshot, "scripts", "check-format.cjs"), "--selection", selectionFile],
            prototype,
            env
        );
        runNpm(["run", "compile"], prototype, env);
        runNpm(["test"], prototype, env);
    }
}

function checkStaged({
                         repositoryRoot = resolve(__dirname, ".."),
                         env = process.env,
                         full = false,
                         check = runProjectChecks
                     } = {}) {
    const root = resolve(repositoryRoot);
    const localVariables = runCommand("git", ["--no-optional-locks", "rev-parse", "--local-env-vars"], root, env, true);
    const localNames = new Set(
        localVariables
            .trim()
            .split(/\r?\n/)
            .map(name => name.toUpperCase())
    );
    const isolatedEnv = Object.fromEntries(Object.entries(env).filter(([name]) => !localNames.has(name.toUpperCase())));
    const sourceIndex = runCommand(
        "git",
        ["--no-optional-locks", "rev-parse", "--path-format=absolute", "--git-path", "index"],
        root,
        env,
        true
    ).replace(/\n$/, "");

    if (!isAbsolute(sourceIndex)) {
        throw new Error("Git did not return an absolute index path.");
    }

    const temporaryRoot = fs.realpathSync(os.tmpdir());
    const temporary = fs.mkdtempSync(join(temporaryRoot, TEMP_PREFIX));
    const snapshot = join(temporary, "snapshot");
    const frozenIndex = join(temporary, "index");
    const selectionFile = join(temporary, "format-selection.json");
    const frozenEnv = Object.fromEntries(
        Object.entries(env).filter(([name]) => name.toUpperCase() !== "GIT_INDEX_FILE")
    );
    frozenEnv.GIT_INDEX_FILE = frozenIndex;

    try {
        try {
            fs.copyFileSync(sourceIndex, frozenIndex);
        } catch (error) {
            if (error.code !== "ENOENT") {
                throw error;
            }

            runCommand("git", ["--no-optional-locks", "read-tree", "--empty"], root, frozenEnv);
        }

        const reader = new GitChangesReader(root, {env: frozenEnv});
        const changes = reader.readStaged();
        const plan = new CheckPlanBuilder().build(changes, {full});
        const selection = {
            version: 1,
            mode: plan.formatting,
            changes,
            trackedPaths: plan.formatting === "none" ? [] : reader.readTrackedPaths()
        };

        fs.writeFileSync(selectionFile, JSON.stringify(selection), "utf8");
        fs.mkdirSync(snapshot);

        console.log("[local-ci] Exporting the frozen Git index.");
        runCommand(
            "git",
            [
                "--no-optional-locks",
                "-c",
                "core.autocrlf=false",
                "-c",
                "core.eol=lf",
                "checkout-index",
                "--all",
                "--ignore-skip-worktree-bits",
                "--prefix=" + snapshot.replaceAll("\\", "/") + "/"
            ],
            root,
            frozenEnv
        );

        check(snapshot, isolatedEnv, {plan, selectionFile});
    } finally {
        const target = resolve(temporary);

        if (dirname(target) !== temporaryRoot || !basename(target).startsWith(TEMP_PREFIX)) {
            throw new Error("Refusing to remove an unexpected temporary directory: " + target);
        }

        fs.rmSync(target, {recursive: true, force: true, maxRetries: 3});
    }
}

module.exports = {checkStaged, runProjectChecks};

if (require.main === module) {
    try {
        const {values} = parseArgs({
            options: {all: {type: "boolean", default: false}},
            strict: true,
            allowPositionals: false
        });
        checkStaged({full: values.all});
        console.log("[local-ci] Staged checks passed.");
    } catch (error) {
        console.error("[local-ci] " + (error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
    }
}
