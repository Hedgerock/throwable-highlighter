const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const {basename, dirname, join, resolve} = require("node:path");
const process = require("node:process");

const TEMP_PREFIX = "throwable-highlighter-runner-test-";

function createRepository(context) {
    const temporaryRoot = fs.realpathSync(os.tmpdir());
    const root = fs.mkdtempSync(join(temporaryRoot, TEMP_PREFIX));

    context.after(() => {
        const target = resolve(root);
        assert.equal(dirname(target), temporaryRoot);
        assert.ok(basename(target).startsWith(TEMP_PREFIX));
        fs.rmSync(target, {recursive: true, force: true, maxRetries: 3});
    });

    const env = {...process.env};
    const localVariables = childProcess.execFileSync("git", ["rev-parse", "--local-env-vars"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
    });
    const localNames = new Set(
        localVariables
            .trim()
            .split(/\r?\n/)
            .map(name => name.toUpperCase())
    );

    for (const name of Object.keys(env)) {
        if (localNames.has(name.toUpperCase())) {
            delete env[name];
        }
    }

    function git(args, commandEnv = env) {
        return childProcess.execFileSync("git", ["--no-optional-locks", ...args], {
            cwd: root,
            env: commandEnv,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true
        });
    }

    git(["init", "--quiet", "--template="]);

    const settings = {
        "core.autocrlf": "false",
        "core.fsmonitor": "false",
        "core.hooksPath": join(root, ".git", "disabled-hooks"),
        "core.excludesFile": join(root, ".git", "no-global-ignore"),
        "core.attributesFile": join(root, ".git", "no-global-attributes"),
        "commit.gpgSign": "false",
        "user.name": "Local Checks Test",
        "user.email": "local-checks@example.invalid"
    };

    for (const [name, value] of Object.entries(settings)) {
        git(["config", "--local", name, value]);
    }

    function write(path, content) {
        const file = join(root, path);
        fs.mkdirSync(dirname(file), {recursive: true});
        fs.writeFileSync(file, content);
        return file;
    }

    function commit(message = "Test baseline") {
        git(["add", "--all"]);
        git(["commit", "--quiet", "-m", message]);
    }

    return {root, env, git, write, commit};
}

module.exports = {createRepository};
