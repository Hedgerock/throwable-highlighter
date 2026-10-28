const assert = require("node:assert/strict");
const fs = require("node:fs");
const moduleApi = require("node:module");
const {join, resolve} = require("node:path");
const {test} = require("node:test");

const {PrettierCheckRunner} = require("../local-checks/PrettierCheckRunner.cjs");
const {PrettierFileChecker} = require("../local-checks/PrettierFileChecker.cjs");
const {PrettierFileSelector} = require("../local-checks/PrettierFileSelector.cjs");

function createRunner(context, files = []) {
    const root = resolve("repository with spaces");
    const loadPrettier = context.mock.fn(() => ({}));
    const select = context.mock.method(PrettierFileSelector.prototype, "select", async () => files);
    const check = context.mock.method(PrettierFileChecker.prototype, "check", async () => ({
        checked: files.length,
        unformatted: []
    }));

    return {
        root,
        loadPrettier,
        select,
        check,
        runner: new PrettierCheckRunner(root, {loadPrettier})
    };
}

test("skips selection and dependency loading in none mode", async context => {
    // Arrange
    const {runner, select, loadPrettier} = createRunner(context);

    // Act
    const actual = await runner.run({mode: "none"});

    // Assert
    assert.deepEqual(actual, {checked: 0, unformatted: []});
    assert.equal(select.mock.calls.length, 0);
    assert.equal(loadPrettier.mock.calls.length, 0);
});

test("does not load Prettier for an empty selection", async context => {
    // Arrange
    const {runner, loadPrettier, check} = createRunner(context);

    // Act
    const actual = await runner.run({mode: "changed", changes: [], trackedPaths: []});

    // Assert
    assert.deepEqual(actual, {checked: 0, unformatted: []});
    assert.equal(loadPrettier.mock.calls.length, 0);
    assert.equal(check.mock.calls.length, 0);
});

test("passes the selection and checks the selected files", async context => {
    // Arrange
    const files = [resolve("first.ts"), resolve("second.ts")];
    const selection = {mode: "all", trackedPaths: ["prototypes/vscode/src/value.ts"]};
    const {root, runner, select, loadPrettier, check} = createRunner(context, files);

    // Act
    const actual = await runner.run(selection);

    // Assert
    assert.deepEqual(actual, {checked: 2, unformatted: []});
    assert.deepEqual(select.mock.calls[0].arguments, [selection]);
    assert.deepEqual(loadPrettier.mock.calls[0].arguments, [root]);
    assert.equal(loadPrettier.mock.calls.length, 1);
    assert.deepEqual(check.mock.calls[0].arguments, [files]);
});

test("shares one Prettier instance between selection and checking", async context => {
    // Arrange
    const root = resolve("repository with spaces");
    const path = "prototypes/vscode/src/value.ts";
    context.mock.method(fs, "lstatSync", () => ({isFile: () => true}));
    context.mock.method(fs, "realpathSync", file => file);
    context.mock.method(fs, "readFileSync", () => "const value = 1;\n");
    const prettier = {
        getFileInfo: context.mock.fn(async () => ({ignored: false, inferredParser: "typescript"})),
        resolveConfig: context.mock.fn(async () => null),
        check: context.mock.fn(async () => true)
    };
    const loadPrettier = context.mock.fn(() => prettier);
    const runner = new PrettierCheckRunner(root, {loadPrettier});

    // Act
    const actual = await runner.run({mode: "all", trackedPaths: [path]});

    // Assert
    assert.deepEqual(actual, {checked: 1, unformatted: []});
    assert.equal(loadPrettier.mock.calls.length, 1);
    assert.equal(prettier.getFileInfo.mock.calls.length, 2);
    assert.equal(prettier.check.mock.calls.length, 1);
});

test("loads Prettier relative to the prototype package", async context => {
    // Arrange
    const root = resolve("repository with spaces");
    const files = [join(root, "prototypes", "vscode", "src", "value.ts")];
    createRunner(context, files);
    const loader = context.mock.fn(() => ({}));
    const createRequire = context.mock.method(moduleApi, "createRequire", () => loader);
    const runner = new PrettierCheckRunner(root);

    // Act
    await runner.run({mode: "all", trackedPaths: []});

    // Assert
    assert.deepEqual(createRequire.mock.calls[0].arguments, [join(root, "prototypes", "vscode", "package.json")]);
    assert.deepEqual(loader.mock.calls[0].arguments, ["prettier"]);
});

for (const phase of ["select", "loadPrettier", "check"]) {
    test("propagates " + phase + " failures", async context => {
        // Arrange
        const fixture = createRunner(context, [resolve("value.ts")]);
        const error = new Error("Unable to run formatting checks.");
        fixture[phase].mock.mockImplementation(() => {
            throw error;
        });

        // Act
        const act = () => fixture.runner.run({mode: "all", trackedPaths: []});

        // Assert
        await assert.rejects(act, error);
    });
}
