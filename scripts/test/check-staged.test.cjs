const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const {join, resolve} = require("node:path");
const {test} = require("node:test");
const process = require("node:process");

const {checkStaged} = require("../check-staged.cjs");
const {createRepository} = require("../support/repository.cjs");

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

test("removes the temporary directory when preparing the snapshot fails", context => {
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

test("uses the frozen index after the original index changes", context => {
    // Arrange
    const {root, env, git, write} = createRepository(context);
    const path = "prototypes/vscode/src/value.ts";
    const added = "src/main/java/Added.java";
    write(path, "staged content\n");
    git(["add", "--all"]);
    const index = join(root, ".git", "index");
    const copy = fs.copyFileSync;
    let updatedIndex;
    let snapshot;

    context.mock.method(fs, "copyFileSync", (source, destination) => {
        copy(source, destination);
        write(path, "new working content\n");
        write(added, "class Added {}\n");
        git(["add", "--all"]);
        updatedIndex = fs.readFileSync(index);
    });

    // Act
    checkStaged({
        repositoryRoot: root,
        env,
        check(directory, isolatedEnv, {plan, selectionFile}) {
            snapshot = directory;
            const selection = JSON.parse(fs.readFileSync(selectionFile, "utf8"));

            assert.deepEqual(plan, {intellij: false, vscode: true, formatting: "changed"});
            assert.deepEqual(selection, {
                version: 1,
                mode: "changed",
                changes: [{status: "A", path}],
                trackedPaths: [path]
            });
            assert.equal(fs.readFileSync(join(directory, path), "utf8"), "staged content\n");
            assert.equal(fs.existsSync(join(directory, added)), false);
            assert.equal(isolatedEnv.GIT_INDEX_FILE, undefined);
        }
    });

    // Assert
    assert.equal(fs.existsSync(snapshot), false);
    assert.deepEqual(fs.readFileSync(index), updatedIndex);
    assert.equal(fs.readFileSync(join(root, path), "utf8"), "new working content\n");
});

test("selects both platforms explicitly for documentation changes", context => {
    // Arrange
    const {root, env, git, write} = createRepository(context);
    write("docs/example.md", "# Example\n");
    git(["add", "--all"]);
    let actualPlan;

    // Act
    checkStaged({
        repositoryRoot: root,
        env,
        full: true,
        check(directory, isolatedEnv, {plan, selectionFile}) {
            actualPlan = plan;
            assert.equal(JSON.parse(fs.readFileSync(selectionFile, "utf8")).mode, "all");
        }
    });

    // Assert
    assert.deepEqual(actualPlan, {intellij: true, vscode: true, formatting: "all"});
});

test("handles a missing initial index without creating the original index", context => {
    // Arrange
    const {root, env} = createRepository(context);
    const index = join(root, ".git", "index");
    assert.equal(fs.existsSync(index), false);
    let actualPlan;

    // Act
    checkStaged({
        repositoryRoot: root,
        env,
        check(directory, isolatedEnv, {plan, selectionFile}) {
            actualPlan = plan;
            const selection = JSON.parse(fs.readFileSync(selectionFile, "utf8"));

            assert.deepEqual(selection, {
                version: 1,
                mode: "none",
                changes: [],
                trackedPaths: []
            });
        }
    });

    // Assert
    assert.equal(fs.existsSync(index), false);
    assert.deepEqual(actualPlan, {intellij: false, vscode: false, formatting: "none"});
});

test("runs against the index supplied by a real pre-commit hook", context => {
    // Arrange
    const {root, git, write} = createRepository(context);
    const hooks = join(root, ".git", "test-hooks");
    const script = join(root, ".git", "hook-check.cjs");
    const marker = join(root, ".git", "hook-result.txt");
    const program = [
        'const fs = require("node:fs");',
        'const {join} = require("node:path");',
        "const {checkStaged} = require(" + JSON.stringify(resolve(__dirname, "../check-staged.cjs")) + ");",
        "checkStaged({repositoryRoot:process.cwd(),check(snapshot){fs.writeFileSync(" +
        JSON.stringify(marker) +
        ',fs.readFileSync(join(snapshot,"value.ts")));}});'
    ].join("\n");
    const shellQuote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";

    fs.mkdirSync(hooks);
    fs.writeFileSync(script, program);

    const hook = join(hooks, "pre-commit");
    fs.writeFileSync(
        hook,
        "#!/bin/sh\nexec " +
        shellQuote(process.execPath.replaceAll("\\", "/")) +
        " " +
        shellQuote(script.replaceAll("\\", "/")) +
        "\n"
    );

    fs.chmodSync(hook, 0o755);
    git(["config", "--local", "core.hooksPath", hooks]);
    write("value.ts", "staged content\n");
    git(["add", "--all"]);

    // Act
    git(["commit", "--quiet", "-m", "Test pre-commit hook"]);

    // Assert
    assert.equal(fs.readFileSync(marker, "utf8"), "staged content\n");
    assert.equal(git(["show", "HEAD:value.ts"]), "staged content\n");
});
