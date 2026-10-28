const assert = require("node:assert/strict");
const fs = require("node:fs");
const {resolve} = require("node:path");
const {test} = require("node:test");

const {PrettierFileSelector} = require("../local-checks/PrettierFileSelector.cjs");

function createSelector(context, files = {}) {
    const root = resolve("repository with spaces");
    const absolute = path => resolve(root, path);
    const entries = new Map(Object.entries(files).map(([path, entry]) => [absolute(path), entry]));

    const lstat = context.mock.method(fs, "lstatSync", file => {
        const entry = entries.get(file);

        if (entry?.statError) {
            throw entry.statError;
        }

        if (entry === undefined) {
            throw Object.assign(new Error("Missing file."), {code: "ENOENT"});
        }

        return {isFile: () => (entry.kind ?? "file") === "file"};
    });

    context.mock.method(fs, "realpathSync", file => {
        const entry = entries.get(file);

        if (entry?.realpathError) {
            throw entry.realpathError;
        }

        return entry?.realPath ?? file;
    });

    const getFileInfo = context.mock.fn(async file => {
        const entry = entries.get(file);

        if (entry.infoError) {
            throw entry.infoError;
        }

        return {
            ignored: entry.ignored ?? false,
            inferredParser: entry.parser === undefined ? "typescript" : entry.parser
        };
    });

    return {
        root,
        absolute,
        lstat,
        getFileInfo,
        selector: new PrettierFileSelector(root, {getFileInfo})
    };
}

test("selects only changed tracked prototype files and removes duplicates", async context => {
    // Arrange
    const first = "prototypes/vscode/src/first.ts";
    const second = "prototypes/vscode/src/second.ts";
    const unchanged = "prototypes/vscode/src/unchanged.ts";
    const untracked = "prototypes/vscode/src/untracked.ts";
    const outside = "src/main/java/Example.java";
    const {selector, absolute, getFileInfo} = createSelector(context, {
        [first]: {},
        [second]: {},
        [unchanged]: {},
        [untracked]: {},
        [outside]: {}
    });

    // Act
    const actual = await selector.select({
        mode: "changed",
        changes: [
            {status: "M", path: second},
            {status: "A", path: first},
            {status: "M", path: second},
            {status: "M", path: untracked},
            {status: "M", path: outside}
        ],
        trackedPaths: [first, second, unchanged, outside]
    });

    // Assert
    assert.deepEqual(actual, [absolute(first), absolute(second)]);
    assert.equal(getFileInfo.mock.calls.length, 2);
});

test("selects unchanged tracked files in all mode and excludes untracked files", async context => {
    // Arrange
    const tracked = "prototypes/vscode/src/tracked.ts";
    const untracked = "prototypes/vscode/src/untracked.ts";
    const {selector, absolute} = createSelector(context, {[tracked]: {}, [untracked]: {}});

    // Act
    const actual = await selector.select({mode: "all", trackedPaths: [tracked, tracked]});

    // Assert
    assert.deepEqual(actual, [absolute(tracked)]);
});

test("selects only the destination of a copied file", async context => {
    // Arrange
    const previousPath = "prototypes/vscode/src/original.ts";
    const path = "prototypes/vscode/src/copied.ts";
    const {selector, absolute} = createSelector(context, {[previousPath]: {}, [path]: {}});

    // Act
    const actual = await selector.select({
        mode: "changed",
        changes: [{status: "C", path, previousPath}],
        trackedPaths: [previousPath, path]
    });

    // Assert
    assert.deepEqual(actual, [absolute(path)]);
});

test("excludes deleted changes before reading files", async context => {
    // Arrange
    const path = "prototypes/vscode/src/deleted.ts";
    const {selector, lstat, getFileInfo} = createSelector(context, {[path]: {}});

    // Act
    const actual = await selector.select({
        mode: "changed",
        changes: [{status: "D", path}],
        trackedPaths: [path]
    });

    // Assert
    assert.deepEqual(actual, []);
    assert.equal(lstat.mock.calls.length, 0);
    assert.equal(getFileInfo.mock.calls.length, 0);
});

for (const [name, files] of [
    ["a missing file", {}],
    ["a directory", {"prototypes/vscode/src/value.ts": {kind: "directory"}}],
    ["a symbolic link", {"prototypes/vscode/src/value.ts": {kind: "symlink"}}],
    ["an ignored file", {"prototypes/vscode/src/value.ts": {ignored: true}}],
    ["an unsupported file", {"prototypes/vscode/src/value.ts": {parser: null}}]
]) {
    test("excludes " + name, async context => {
        // Arrange
        const path = "prototypes/vscode/src/value.ts";
        const {selector} = createSelector(context, files);

        // Act
        const actual = await selector.select({mode: "all", trackedPaths: [path]});

        // Assert
        assert.deepEqual(actual, []);
    });
}

test("uses prototype ignore files and allows configuration-based parser selection", async context => {
    // Arrange
    const path = "prototypes/vscode/src/имя файла [draft].ts";
    const {selector, absolute, getFileInfo} = createSelector(context, {[path]: {}});

    // Act
    const actual = await selector.select({mode: "all", trackedPaths: [path]});

    // Assert
    assert.deepEqual(actual, [absolute(path)]);
    assert.deepEqual(getFileInfo.mock.calls[0].arguments, [
        absolute(path),
        {
            ignorePath: [absolute("prototypes/vscode/.gitignore"), absolute("prototypes/vscode/.prettierignore")],
            withNodeModules: false,
            resolveConfig: true
        }
    ]);
});

test("does not access files or Prettier in none mode", async context => {
    // Arrange
    const path = "prototypes/vscode/src/value.ts";
    const {selector, lstat, getFileInfo} = createSelector(context, {[path]: {}});

    // Act
    const actual = await selector.select({
        mode: "none",
        changes: [{status: "M", path}],
        trackedPaths: [path]
    });

    // Assert
    assert.deepEqual(actual, []);
    assert.equal(lstat.mock.calls.length, 0);
    assert.equal(getFileInfo.mock.calls.length, 0);
});

test("does not call Prettier for an empty tracked set", async context => {
    // Arrange
    const {selector, getFileInfo} = createSelector(context);

    // Act
    const actual = await selector.select({mode: "all", trackedPaths: []});

    // Assert
    assert.deepEqual(actual, []);
    assert.equal(getFileInfo.mock.calls.length, 0);
});

test("rejects an unknown mode", async context => {
    // Arrange
    const {selector} = createSelector(context);

    // Act
    const act = () => selector.select({mode: "unexpected"});

    // Assert
    await assert.rejects(act, /Unknown formatting mode/);
});

test("rejects a path leaving the prototype directory", async context => {
    // Arrange
    const path = "prototypes/vscode/../../outside.ts";
    const {selector, lstat} = createSelector(context);

    // Act
    const act = () => selector.select({mode: "all", trackedPaths: [path]});

    // Assert
    await assert.rejects(act, /leaves the prototype directory/);
    assert.equal(lstat.mock.calls.length, 0);
});

test("excludes a file resolved outside the prototype directory", async context => {
    // Arrange
    const path = "prototypes/vscode/src/value.ts";
    const {selector, getFileInfo} = createSelector(context, {
        [path]: {realPath: resolve("another directory", "value.ts")}
    });

    // Act
    const actual = await selector.select({mode: "all", trackedPaths: [path]});

    // Assert
    assert.deepEqual(actual, []);
    assert.equal(getFileInfo.mock.calls.length, 0);
});

test("skips a file removed before resolving its real path", async context => {
    // Arrange
    const path = "prototypes/vscode/src/value.ts";
    const error = Object.assign(new Error("Removed file."), {code: "ENOENT"});
    const {selector} = createSelector(context, {[path]: {realpathError: error}});

    // Act
    const actual = await selector.select({mode: "all", trackedPaths: [path]});

    // Assert
    assert.deepEqual(actual, []);
});

for (const field of ["statError", "realpathError", "infoError"]) {
    test("propagates " + field, async context => {
        // Arrange
        const path = "prototypes/vscode/src/value.ts";
        const error = Object.assign(new Error("Unable to inspect file."), {code: "EACCES"});
        const {selector} = createSelector(context, {[path]: {[field]: error}});

        // Act
        const act = () => selector.select({mode: "all", trackedPaths: [path]});

        // Assert
        await assert.rejects(act, error);
    });
}
