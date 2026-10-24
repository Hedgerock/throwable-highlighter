const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const {basename, dirname, join, resolve} = require("node:path");
const process = require("node:process");

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
        throw new Error(`Unable to start ${command}: ${result.error.message}`, {cause: result.error});
    }

    if (result.status !== 0) {
        const reason = result.signal ? `signal ${result.signal}` : `exit code ${result.status}`;
        const details = capture ? result.stderr.trim() : "";
        throw new Error(`${command} ${args.join(" ")} failed: ${reason}${details ? "\n" + details : ""}`);
    }

    return result.stdout ?? "";
}

function runProjectChecks(snapshot, env) {
    console.log("[local-ci] Checking the local runner.");
    runCommand(process.execPath, ["--test", "scripts/test/check-staged.test.cjs"], snapshot, env);

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

    const prototype = join(snapshot, "prototypes", "vscode");

    for (const args of [["ci"], ["run", "check"]]) {
        console.log("[local-ci] npm " + args.join(" "));
        if (process.platform === "win32") {
            runCommand(env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm " + args.join(" ")], prototype, env);
        } else {
            runCommand("npm", args, prototype, env);
        }
    }
}

function checkStaged({repositoryRoot = resolve(__dirname, ".."), env = process.env, check = runProjectChecks} = {}) {
    const root = resolve(repositoryRoot);
    const localVariables = runCommand("git", ["rev-parse", "--local-env-vars"], root, env, true);
    const localNames = new Set(
        localVariables
            .trim()
            .split(/\r?\n/)
            .map(name => name.toUpperCase())
    );
    const isolatedEnv = Object.fromEntries(Object.entries(env).filter(([name]) => !localNames.has(name.toUpperCase())));

    const temporaryRoot = fs.realpathSync(os.tmpdir());
    const snapshot = fs.mkdtempSync(join(temporaryRoot, TEMP_PREFIX));

    try {
        console.log("[local-ci] Exporting the Git index.");
        runCommand(
            "git",
            [
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
            env
        );

        check(snapshot, isolatedEnv);
    } finally {
        const target = resolve(snapshot);
        if (dirname(target) !== temporaryRoot || !basename(target).startsWith(TEMP_PREFIX)) {
            throw new Error("Refusing to remove an unexpected temporary directory: " + target);
        }

        fs.rmSync(target, {recursive: true, force: true, maxRetries: 3});
    }
}

module.exports = {checkStaged, runProjectChecks};

if (require.main === module) {
    try {
        checkStaged();
        console.log("[local-ci] Staged checks passed.");
    } catch (error) {
        console.error("[local-ci] " + (error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
    }
}
