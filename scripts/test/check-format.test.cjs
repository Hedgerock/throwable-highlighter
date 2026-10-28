const assert = require("node:assert/strict");
const {join, resolve} = require("node:path");
const {test} = require("node:test");
const fs = require("node:fs");

const {checkFormat, main} = require("../check-format.cjs");
const {GitChangesReader} = require("../local-checks/GitChangesReader.cjs");
const {PrettierCheckRunner} = require("../local-checks/PrettierCheckRunner.cjs");

function createCheck(context, changes = [], trackedPaths = []) {
    const root = resolve("repository with spaces");
    const local = context.mock.method(GitChangesReader.prototype, "readLocal", () => changes);
    const tracked = context.mock.method(GitChangesReader.prototype, "readTrackedPaths", () => trackedPaths);
    const run = context.mock.method(PrettierCheckRunner.prototype, "run", async () => ({
        checked: 0,
        unformatted: []
    }));

    return {root, local, tracked, run};
}

for (const [name, path, mode] of [
    ["prototype sources", "prototypes/vscode/src/extension.ts", "changed"],
    ["formatting configuration", "prototypes/vscode/.prettierrc.json", "all"],
    ["prototype dependencies", "prototypes/vscode/package.json", "all"],
    ["common infrastructure", "scripts/check-staged.cjs", "all"]
]) {
    test("selects " + mode + " formatting for " + name, async context => {
        // Arrange
        const changes = [{status: "M", path}];
        const trackedPaths = ["prototypes/vscode/src/extension.ts"];
        const {root, local, tracked, run} = createCheck(context, changes, trackedPaths);

        // Act
        await checkFormat({repositoryRoot: root});

        // Assert
        assert.equal(local.mock.calls.length, 1);
        assert.equal(tracked.mock.calls.length, 1);
        assert.deepEqual(run.mock.calls[0].arguments, [{mode, changes, trackedPaths}]);
    });
}

test("skips tracked path discovery for documentation-only changes", async context => {
    // Arrange
    const changes = [{status: "M", path: "docs/roadmap.md"}];
    const {root, tracked, run} = createCheck(context, changes);

    // Act
    await checkFormat({repositoryRoot: root});

    // Assert
    assert.equal(tracked.mock.calls.length, 0);
    assert.deepEqual(run.mock.calls[0].arguments, [{mode: "none", changes, trackedPaths: []}]);
});

test("checks all tracked files explicitly without reading local changes", async context => {
    // Arrange
    const trackedPaths = ["prototypes/vscode/src/extension.ts"];
    const {root, local, run} = createCheck(context, [], trackedPaths);

    // Act
    await checkFormat({repositoryRoot: root, full: true});

    // Assert
    assert.equal(local.mock.calls.length, 0);
    assert.deepEqual(run.mock.calls[0].arguments, [{mode: "all", changes: [], trackedPaths}]);
});

for (const phase of ["local", "tracked"]) {
    test("propagates Git " + phase + " discovery errors", async context => {
        // Arrange
        const fixture = createCheck(context, [{status: "M", path: "prototypes/vscode/src/value.ts"}]);
        const error = new Error("Unable to read Git state.");
        fixture[phase].mock.mockImplementation(() => {
            throw error;
        });

        // Act
        const act = () => checkFormat({repositoryRoot: fixture.root});

        // Assert
        await assert.rejects(act, error);
        assert.equal(fixture.run.mock.calls.length, 0);
    });
}

function createMain(context, report = {checked: 2, unformatted: []}) {
    const root = resolve("repository with spaces");
    const env = {EXAMPLE: "value"};
    const run = context.mock.fn(async () => report);
    const log = context.mock.fn();
    const error = context.mock.fn();

    return {root, run, log, error, options: {repositoryRoot: root, env, run, log, error}};
}

for (const [args, full] of [
    [["--changed"], false],
    [["--all"], true]
]) {
    test("accepts " + args[0] + " and returns success", async context => {
        // Arrange
        const {root, run, log, error, options} = createMain(context);

        // Act
        const code = await main(args, options);

        // Assert
        assert.equal(code, 0);
        assert.deepEqual(run.mock.calls[0].arguments, [{repositoryRoot: root, env: options.env, full}]);
        assert.equal(log.mock.calls.length, 1);
        assert.equal(error.mock.calls.length, 0);
    });
}

test("reports an empty selection as success", async context => {
    // Arrange
    const {log, options} = createMain(context, {checked: 0, unformatted: []});

    // Act
    const code = await main(["--changed"], options);

    // Assert
    assert.equal(code, 0);
    assert.match(log.mock.calls[0].arguments[0], /No matching tracked files/);
});

test("reports formatting violations with repository-relative paths", async context => {
    // Arrange
    const root = resolve("repository with spaces");
    const file = join(root, "prototypes", "vscode", "src", "value.ts");
    const {log, error, options} = createMain(context, {checked: 1, unformatted: [file]});

    // Act
    const code = await main(["--changed"], options);

    // Assert
    assert.equal(code, 1);
    assert.equal(log.mock.calls.length, 0);
    assert.deepEqual(
        error.mock.calls.map(call => call.arguments[0]),
        ["[format-check] Unformatted files:", "  prototypes/vscode/src/value.ts"]
    );
});

for (const args of [[], ["--changed", "--all"], ["--unknown"], ["--changed", "extra"]]) {
    test("rejects invalid arguments " + JSON.stringify(args), async context => {
        // Arrange
        const {run, error, options} = createMain(context);

        // Act
        const code = await main(args, options);

        // Assert
        assert.equal(code, 2);
        assert.equal(run.mock.calls.length, 0);
        assert.equal(error.mock.calls.length, 1);
    });
}

test("reports runtime errors with a failing exit code", async context => {
    // Arrange
    const {run, error, options} = createMain(context);
    run.mock.mockImplementation(async () => {
        throw new Error("Formatting check failed.");
    });

    // Act
    const code = await main(["--changed"], options);

    // Assert
    assert.equal(code, 2);
    assert.match(error.mock.calls[0].arguments[0], /Formatting check failed/);
});

test("checks a supplied selection without querying Git", async context => {
    // Arrange
    const selection = {mode: "changed", changes: [], trackedPaths: []};
    const {root, local, tracked, run} = createCheck(context);

    // Act
    await checkFormat({repositoryRoot: root, selection});

    // Assert
    assert.equal(local.mock.calls.length, 0);
    assert.equal(tracked.mock.calls.length, 0);
    assert.deepEqual(run.mock.calls[0].arguments, [selection]);
});

test("reads the formatting selection file", async context => {
    // Arrange
    const selection = {
        mode: "changed",
        changes: [{status: "M", path: "prototypes/vscode/src/value.ts"}],
        trackedPaths: ["prototypes/vscode/src/value.ts"]
    };
    const selectionFile = resolve("format selection.json");
    const read = context.mock.method(fs, "readFileSync", () =>
        JSON.stringify({version: 1, ...selection})
    );
    const {root, run, options} = createMain(context);

    // Act
    const code = await main(["--selection", selectionFile], options);

    // Assert
    assert.equal(code, 0);
    assert.deepEqual(read.mock.calls[0].arguments, [selectionFile, "utf8"]);
    assert.deepEqual(run.mock.calls[0].arguments, [
        {repositoryRoot: root, env: options.env, full: false, selection}
    ]);
});

for (const content of [
    "{",
    JSON.stringify({version: 2, mode: "all", changes: [], trackedPaths: []}),
    JSON.stringify({version: 1, mode: "unexpected", changes: [], trackedPaths: []}),
    JSON.stringify({version: 1, mode: "all", changes: null, trackedPaths: []}),
    JSON.stringify({version: 1, mode: "all", changes: [], trackedPaths: "../outside.ts"}),
    JSON.stringify({version: 1, mode: "all", changes: [], trackedPaths: ["../outside.ts"]}),
    JSON.stringify({version: 1, mode: "changed", changes: [{path: "value.ts"}], trackedPaths: []}),
    JSON.stringify({
        version: 1,
        mode: "changed",
        changes: [{status: "R", path: "value.ts"}],
        trackedPaths: []
    })
]) {
    test("rejects invalid formatting selection " + content, async context => {
        // Arrange
        context.mock.method(fs, "readFileSync", () => content);
        const {run, options} = createMain(context);

        // Act
        const code = await main(["--selection", "selection.json"], options);

        // Assert
        assert.equal(code, 2);
        assert.equal(run.mock.calls.length, 0);
    });
}

for (const args of [["--selection"], ["--selection", ""], ["--selection", "file.json", "--all"]]) {
    test("rejects invalid selection arguments " + JSON.stringify(args), async context => {
        // Arrange
        const {run, options} = createMain(context);

        // Act
        const code = await main(args, options);

        // Assert
        assert.equal(code, 2);
        assert.equal(run.mock.calls.length, 0);
    });
}
