const assert = require("node:assert/strict");
const fs = require("node:fs");
const {dirname, join} = require("node:path");
const {test} = require("node:test");

const {CheckPlanBuilder} = require("../local-checks/CheckPlanBuilder.cjs");
const {GitChangesReader} = require("../local-checks/GitChangesReader.cjs");
const {createRepository} = require("../support/repository.cjs");

test("reads staged additions before the first commit", context => {
    // Arrange
    const {root, env, git, write} = createRepository(context);
    write("value.ts", "export const value = 1;\n");
    git(["add", "--", "value.ts"]);
    const reader = new GitChangesReader(root, {env});

    // Act
    const actual = reader.readStaged();

    // Assert
    assert.deepEqual(actual, [{status: "A", path: "value.ts"}]);
});

test("separates staged, unstaged and untracked changes without modifying the index", context => {
    // Arrange
    const {root, env, git, write, commit} = createRepository(context);
    write("staged.ts", "original\n");
    write("working.ts", "original\n");
    commit();
    write("staged.ts", "staged\n");
    git(["add", "--", "staged.ts"]);
    write("staged.ts", "additional working change\n");
    write("working.ts", "unstaged working change\n");
    write("untracked.ts", "untracked\n");
    const index = join(root, ".git", "index");
    const indexBefore = fs.readFileSync(index);
    const reader = new GitChangesReader(root, {env});

    // Act
    const staged = reader.readStaged();
    const local = reader.readLocal();
    const tracked = reader.readTrackedPaths();

    // Assert
    assert.deepEqual(staged, [{status: "M", path: "staged.ts"}]);
    assert.deepEqual(local, [
        {status: "M", path: "staged.ts"},
        {status: "M", path: "staged.ts"},
        {status: "M", path: "working.ts"}
    ]);
    assert.deepEqual(tracked, ["staged.ts", "working.ts"]);
    assert.deepEqual(fs.readFileSync(index), indexBefore);
    assert.equal(fs.readFileSync(join(root, "staged.ts"), "utf8"), "additional working change\n");
    assert.equal(fs.readFileSync(join(root, "untracked.ts"), "utf8"), "untracked\n");
});

test("retains staged changes when the working file matches HEAD", context => {
    // Arrange
    const {root, env, git, write, commit} = createRepository(context);
    write("value.ts", "original\n");
    commit();
    write("value.ts", "staged\n");
    git(["add", "--", "value.ts"]);
    write("value.ts", "original\n");
    const reader = new GitChangesReader(root, {env});

    // Act
    const actual = reader.readLocal();

    // Assert
    assert.deepEqual(actual, [
        {status: "M", path: "value.ts"},
        {status: "M", path: "value.ts"}
    ]);
    assert.equal(fs.readFileSync(join(root, "value.ts"), "utf8"), git(["show", "HEAD:value.ts"]));
});

test("detects a rename between platforms and selects both check groups", context => {
    // Arrange
    const {root, env, git, write, commit} = createRepository(context);
    const previousPath = "src/main/resources/moved.txt";
    const path = "prototypes/vscode/webview/moved.txt";
    write(previousPath, "unchanged file content\n");
    commit();
    fs.mkdirSync(dirname(join(root, path)), {recursive: true});
    git(["mv", "--", previousPath, path]);
    const reader = new GitChangesReader(root, {env});
    const builder = new CheckPlanBuilder();

    // Act
    const changes = reader.readStaged();
    const plan = builder.build(changes);

    // Assert
    assert.deepEqual(changes, [{status: "R", path, previousPath}]);
    assert.deepEqual(plan, {intellij: true, vscode: true, formatting: "changed"});
});

test("detects deletion and excludes the deleted file from tracked paths", context => {
    // Arrange
    const {root, env, git, write, commit} = createRepository(context);
    const path = "prototypes/vscode/src/removed.ts";
    write(path, "export const value = 1;\n");
    commit();
    git(["rm", "--", path]);
    const reader = new GitChangesReader(root, {env});

    // Act
    const changes = reader.readStaged();
    const tracked = reader.readTrackedPaths();
    const plan = new CheckPlanBuilder().build(changes);

    // Assert
    assert.deepEqual(changes, [{status: "D", path}]);
    assert.deepEqual(tracked, []);
    assert.deepEqual(plan, {intellij: false, vscode: true, formatting: "changed"});
});

test("reads an alternative index without modifying either index", context => {
    // Arrange
    const {root, env, git, write, commit} = createRepository(context);
    write("baseline.ts", "baseline\n");
    commit();
    write("default.ts", "default index\n");
    git(["add", "--", "default.ts"]);
    const index = join(root, ".git", "index");
    const indexBefore = fs.readFileSync(index);
    const alternative = join(root, ".git", "alternative-index");
    const alternativeEnv = {...env, GIT_INDEX_FILE: alternative};
    git(["read-tree", "HEAD"], alternativeEnv);
    write("alternative.ts", "alternative index\n");
    git(["add", "--", "alternative.ts"], alternativeEnv);
    const alternativeBefore = fs.readFileSync(alternative);
    const reader = new GitChangesReader(root, {env: alternativeEnv});

    // Act
    const changes = reader.readStaged();
    const tracked = reader.readTrackedPaths();

    // Assert
    assert.deepEqual(changes, [{status: "A", path: "alternative.ts"}]);
    assert.deepEqual(tracked, ["alternative.ts", "baseline.ts"]);
    assert.deepEqual(fs.readFileSync(index), indexBefore);
    assert.deepEqual(fs.readFileSync(alternative), alternativeBefore);
    assert.equal(alternativeEnv.GIT_INDEX_FILE, alternative);
});

test("preserves a real file name containing spaces, brackets and Unicode", context => {
    // Arrange
    const {root, env, git, write} = createRepository(context);
    const path = "prototypes/vscode/src/имя файла [draft].ts";
    write(path, "export const value = 1;\n");
    git(["add", "--all"]);
    const reader = new GitChangesReader(root, {env});

    // Act
    const actual = reader.readStaged();

    // Assert
    assert.deepEqual(actual, [{status: "A", path}]);
});

test("reads a clean repository after a commit", context => {
    // Arrange
    const {root, env, write, commit} = createRepository(context);
    write("value.ts", "original\n");
    commit();
    const reader = new GitChangesReader(root, {env});

    // Act
    const staged = reader.readStaged();
    const local = reader.readLocal();

    // Assert
    assert.deepEqual(staged, []);
    assert.deepEqual(local, []);
});

test("rejects an invalid index without modifying the default index", context => {
    // Arrange
    const {root, env, write, commit} = createRepository(context);
    write("baseline.ts", "baseline\n");
    commit();
    const index = join(root, ".git", "index");
    const indexBefore = fs.readFileSync(index);
    const invalidIndex = join(root, ".git", "invalid-index");
    fs.writeFileSync(invalidIndex, "invalid index");
    const reader = new GitChangesReader(root, {env: {...env, GIT_INDEX_FILE: invalidIndex}});

    // Act
    const act = () => reader.readStaged();

    // Assert
    assert.throws(act, /git .* failed: exit code/);
    assert.deepEqual(fs.readFileSync(index), indexBefore);
    assert.equal(fs.readFileSync(invalidIndex, "utf8"), "invalid index");
});
