const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const {basename, dirname, join, resolve} = require("node:path");
const {test} = require("node:test");

const {checkStaged, runProjectChecks} = require("../check-staged.cjs");

function createRepository(context) {
    const temporaryRoot = fs.realpathSync(os.tmpdir());
    const root = fs.mkdtempSync(join(temporaryRoot, "throwable-highlighter-runner-test-"));

    context.after(() => {
        const target = resolve(root);
        assert.equal(dirname(target), temporaryRoot);
        assert.ok(basename(target).startsWith("throwable-highlighter-runner-test-"));
        fs.rmSync(target, {recursive: true, force: true, maxRetries: 3});
    });

    const env = {...process.env};
    const localVariables = childProcess.execFileSync("git", ["rev-parse", "--local-env-vars"], {encoding: "utf8"});
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
        return childProcess.execFileSync("git", ["-c", "core.autocrlf=false", ...args], {
            cwd: root,
            env: commandEnv,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"]
        });
    }

    git(["init", "--quiet"]);
    return {root, env, git};
}

test("checks staged content without changing unstaged or untracked files", context => {
    // Arrange
    const {root, env, git} = createRepository(context);
    const file = join(root, "value.txt");
    fs.writeFileSync(file, "staged\n");
    git(["add", "value.txt"]);
    fs.writeFileSync(file, "unstaged\n");
    fs.writeFileSync(join(root, "untracked.txt"), "untracked\n");
    const indexBefore = fs.readFileSync(join(root, ".git", "index"));
    let snapshot;

    // Act
    checkStaged({
        repositoryRoot: root,
        env,
        check(directory) {
            snapshot = directory;
            assert.equal(fs.readFileSync(join(directory, "value.txt"), "utf8"), "staged\n");
            assert.equal(fs.existsSync(join(directory, "untracked.txt")), false);
            fs.writeFileSync(join(directory, "generated.txt"), "build output");
        }
    });

    // Assert
    assert.equal(fs.existsSync(snapshot), false);
    assert.equal(fs.readFileSync(file, "utf8"), "unstaged\n");
    assert.equal(fs.readFileSync(join(root, "untracked.txt"), "utf8"), "untracked\n");
    assert.equal(fs.existsSync(join(root, "generated.txt")), false);
    assert.deepEqual(fs.readFileSync(join(root, ".git", "index")), indexBefore);
});

test("rejects staged errors even when the working copy is fixed", context => {
    // Arrange
    const {root, env, git} = createRepository(context);
    const file = join(root, "value.txt");
    fs.writeFileSync(file, "invalid\n");
    git(["add", "value.txt"]);
    fs.writeFileSync(file, "valid\n");
    const indexBefore = fs.readFileSync(join(root, ".git", "index"));
    let snapshot;

    // Act
    const act = () =>
        checkStaged({
            repositoryRoot: root,
            env,
            check(directory) {
                snapshot = directory;
                if (fs.readFileSync(join(directory, "value.txt"), "utf8") !== "valid\n") {
                    throw new Error("Staged content is invalid");
                }
            }
        });

    // Assert
    assert.throws(act, /Staged content is invalid/);
    assert.equal(fs.existsSync(snapshot), false);
    assert.equal(fs.readFileSync(file, "utf8"), "valid\n");
    assert.deepEqual(fs.readFileSync(join(root, ".git", "index")), indexBefore);
});

test("uses the inherited index and removes Git-local variables from build commands", context => {
    // Arrange
    const {root, env, git} = createRepository(context);
    const file = join(root, "value.txt");
    fs.writeFileSync(file, "default index\n");
    git(["add", "value.txt"]);
    const indexBefore = fs.readFileSync(join(root, ".git", "index"));
    const index = join(root, "alternative index");
    const inheritedEnv = {...env, GIT_INDEX_FILE: index};
    git(["read-tree", "--empty"], inheritedEnv);
    fs.writeFileSync(file, "alternative index\n");
    git(["add", "value.txt"], inheritedEnv);
    const alternativeBefore = fs.readFileSync(index);
    fs.writeFileSync(file, "working copy\n");
    let checked = false;

    // Act
    checkStaged({
        repositoryRoot: root,
        env: inheritedEnv,
        check(directory, isolatedEnv) {
            assert.equal(fs.readFileSync(join(directory, "value.txt"), "utf8"), "alternative index\n");
            assert.equal(isolatedEnv.GIT_INDEX_FILE, undefined);
            checked = true;
        }
    });

    // Assert
    assert.equal(checked, true);
    assert.equal(inheritedEnv.GIT_INDEX_FILE, index);
    assert.equal(fs.readFileSync(file, "utf8"), "working copy\n");
    assert.deepEqual(fs.readFileSync(join(root, ".git", "index")), indexBefore);
    assert.deepEqual(fs.readFileSync(index), alternativeBefore);
});

test("removes the temporary directory when exporting the index fails", context => {
    // Arrange
    const {root, env} = createRepository(context);
    const index = join(root, "invalid-index");
    fs.writeFileSync(index, "invalid index");
    const filesBefore = fs.readdirSync(root).sort();
    context.mock.method(os, "tmpdir", () => root);
    let checked = false;

    // Act
    const act = () =>
        checkStaged({
            repositoryRoot: root,
            env: {...env, GIT_INDEX_FILE: index},
            check() {
                checked = true;
            }
        });

    // Assert
    assert.throws(act, /failed/);
    assert.equal(checked, false);
    assert.deepEqual(fs.readdirSync(root).sort(), filesBefore);
});

test("rejects an unavailable Git executable", context => {
    // Arrange
    const error = new Error("spawn git ENOENT");
    context.mock.method(childProcess, "spawnSync", () => ({error}));

    // Act
    const act = () => checkStaged();

    // Assert
    assert.throws(act, /Unable to start git/);
});

test("runs runner tests and both project check groups", context => {
    // Arrange
    const commands = [];
    context.mock.method(childProcess, "spawnSync", (command, args, options) => {
        commands.push({command, args, cwd: options.cwd});
        return {status: 0, stdout: null};
    });
    const snapshot = resolve("snapshot with spaces");
    const env = {...process.env};

    // Act
    runProjectChecks(snapshot, env);

    // Assert
    assert.equal(commands.length, 4);
    assert.equal(commands[0].command, process.execPath);
    assert.deepEqual(commands[0].args, ["--test", "scripts/test/check-staged.test.cjs"]);
    assert.equal(commands[0].cwd, snapshot);
    assert.equal(commands[1].cwd, snapshot);
    assert.equal(commands[2].cwd, join(snapshot, "prototypes", "vscode"));
    assert.equal(commands[3].cwd, join(snapshot, "prototypes", "vscode"));

    if (process.platform === "win32") {
        assert.deepEqual(commands[1].args, ["/d", "/s", "/c", "gradlew.bat test verifyPlugin buildPlugin --no-daemon"]);
        assert.deepEqual(commands[2].args, ["/d", "/s", "/c", "npm ci"]);
        assert.deepEqual(commands[3].args, ["/d", "/s", "/c", "npm run check"]);
    } else {
        assert.equal(commands[1].command, "sh");
        assert.deepEqual(commands[1].args, ["./gradlew", "test", "verifyPlugin", "buildPlugin", "--no-daemon"]);
        assert.equal(commands[2].command, "npm");
        assert.deepEqual(commands[2].args, ["ci"]);
        assert.deepEqual(commands[3].args, ["run", "check"]);
    }
});

test("stops the checks after a failed command", context => {
    // Arrange
    const commands = [];
    context.mock.method(childProcess, "spawnSync", (command, args) => {
        commands.push({command, args});
        return {status: commands.length === 2 ? 1 : 0, stdout: null};
    });

    // Act
    const act = () => runProjectChecks(resolve("snapshot"), {...process.env});

    // Assert
    assert.throws(act, /exit code 1/);
    assert.equal(commands.length, 2);
});

test("rejects a command terminated by a signal", context => {
    // Arrange
    context.mock.method(childProcess, "spawnSync", () => ({status: null, signal: "SIGTERM", stdout: null}));

    // Act
    const act = () => runProjectChecks(resolve("snapshot"), {...process.env});

    // Assert
    assert.throws(act, /signal SIGTERM/);
});
