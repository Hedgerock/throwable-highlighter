const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const {resolve} = require("node:path");
const process = require("node:process");
const {test} = require("node:test");

const {GitChangesReader} = require("../local-checks/GitChangesReader.cjs");

function mockGit(context, ...results) {
    let index = 0;

    return context.mock.method(childProcess, "spawnSync", () => {
        assert.ok(index < results.length, "Unexpected Git command.");
        const result = results[index++];

        return typeof result === "string" ? {status: 0, stdout: result, stderr: ""} : result;
    });
}

test("reads staged additions, changes, deletions and type changes", context => {
    // Arrange
    mockGit(context, "A\0new.ts\0M\0changed.ts\0D\0deleted.ts\0T\0linked.ts\0");
    const reader = new GitChangesReader(resolve("repository with spaces"));

    // Act
    const actual = reader.readStaged();

    // Assert
    assert.deepEqual(actual, [
        {status: "A", path: "new.ts"},
        {status: "M", path: "changed.ts"},
        {status: "D", path: "deleted.ts"},
        {status: "T", path: "linked.ts"}
    ]);
});

test("retains both paths of renames and copies", context => {
    // Arrange
    mockGit(context, "R100\0old.ts\0new.ts\0C075\0source.ts\0copy.ts\0");
    const reader = new GitChangesReader(resolve("repository"));

    // Act
    const actual = reader.readStaged();

    // Assert
    assert.deepEqual(actual, [
        {status: "R", path: "new.ts", previousPath: "old.ts"},
        {status: "C", path: "copy.ts", previousPath: "source.ts"}
    ]);
});

test("preserves spaces, tabs, line breaks and Unicode in paths", context => {
    // Arrange
    const path = "prototypes/vscode/src/имя файла\tс\nпереносом.ts";
    mockGit(context, "M\0" + path + "\0");
    const reader = new GitChangesReader(resolve("repository"));

    // Act
    const actual = reader.readStaged();

    // Assert
    assert.deepEqual(actual, [{status: "M", path}]);
});

test("combines staged and unstaged changes without cancelling staged changes", context => {
    // Arrange
    const git = mockGit(context, "M\0same.ts\0", "M\0same.ts\0M\0working.ts\0");
    const reader = new GitChangesReader(resolve("repository"));

    // Act
    const actual = reader.readLocal();

    // Assert
    assert.deepEqual(actual, [
        {status: "M", path: "same.ts"},
        {status: "M", path: "same.ts"},
        {status: "M", path: "working.ts"}
    ]);
    assert.ok(git.mock.calls[0].arguments[1].includes("--cached"));
    assert.equal(git.mock.calls[1].arguments[1].includes("--cached"), false);
});

test("reads unique tracked paths from the index", context => {
    // Arrange
    const git = mockGit(context, "src/first.ts\0src/second name.ts\0src/first.ts\0");
    const reader = new GitChangesReader(resolve("repository"));

    // Act
    const actual = reader.readTrackedPaths();

    // Assert
    assert.deepEqual(actual, ["src/first.ts", "src/second name.ts"]);
    assert.ok(git.mock.calls[0].arguments[1].includes("--cached"));
    assert.equal(git.mock.calls[0].arguments[1].includes("--others"), false);
});

test("preserves the supplied index environment and avoids optional index writes", context => {
    // Arrange
    const root = resolve("repository with spaces");
    const env = {...process.env, GIT_INDEX_FILE: resolve("alternative index")};
    const git = mockGit(context, "");
    const reader = new GitChangesReader(root, {env});

    // Act
    reader.readStaged();

    // Assert
    const [command, args, options] = git.mock.calls[0].arguments;
    assert.equal(command, "git");
    assert.ok(args.includes("--no-optional-locks"));
    assert.ok(args.includes("-z"));
    assert.ok(args.includes("--no-relative"));
    assert.ok(args.includes("--no-ext-diff"));
    assert.ok(args.includes("--no-textconv"));
    assert.equal(args.includes("HEAD"), false);
    assert.equal(options.cwd, root);
    assert.equal(options.env, env);
    assert.equal(options.env.GIT_INDEX_FILE, env.GIT_INDEX_FILE);
    assert.equal(options.shell, undefined);
});

test("reads an empty change set", context => {
    // Arrange
    mockGit(context, "");
    const reader = new GitChangesReader(resolve("repository"));

    // Act
    const actual = reader.readStaged();

    // Assert
    assert.deepEqual(actual, []);
});

for (const output of [
    "M\0file.ts",
    "M\0",
    "R100\0old.ts\0",
    "M\0\0",
    "U\0conflict.ts\0",
    "X\0unknown.ts\0",
    "R101\0old.ts\0new.ts\0",
    "A100\0file.ts\0"
]) {
    test("rejects malformed or unsupported Git changes: " + JSON.stringify(output), context => {
        // Arrange
        mockGit(context, output);
        const reader = new GitChangesReader(resolve("repository"));

        // Act
        const act = () => reader.readStaged();

        // Assert
        assert.throws(act, /Git/);
    });
}

for (const [name, result, message] of [
    ["an unavailable Git executable", {error: new Error("ENOENT")}, /Unable to start git/],
    ["a failed Git command", {status: 128, stdout: "", stderr: "invalid index"}, /exit code 128.*invalid index/s],
    ["a terminated Git command", {status: null, signal: "SIGTERM"}, /signal SIGTERM/],
    ["missing Git output", {status: 0, stdout: null}, /textual output/]
]) {
    test("rejects " + name, context => {
        // Arrange
        mockGit(context, result);
        const reader = new GitChangesReader(resolve("repository"));

        // Act
        const act = () => reader.readStaged();

        // Assert
        assert.throws(act, message);
    });
}

test("stops after a failed staged read in local mode", context => {
    // Arrange
    const git = mockGit(context, {status: 128, stdout: "", stderr: "invalid index"});
    const reader = new GitChangesReader(resolve("repository"));

    // Act
    const act = () => reader.readLocal();

    // Assert
    assert.throws(act, /invalid index/);
    assert.equal(git.mock.calls.length, 1);
});
