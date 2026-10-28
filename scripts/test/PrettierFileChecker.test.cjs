const assert = require("node:assert/strict");
const fs = require("node:fs");
const moduleApi = require("node:module");
const {resolve} = require("node:path");
const {test} = require("node:test");

const {PrettierFileChecker} = require("../local-checks/PrettierFileChecker.cjs");

function createChecker(context) {
    const file = resolve("repository with spaces", "prototypes", "vscode", "src", "value.ts");
    const read = context.mock.method(fs, "readFileSync", () => "const value = 1;\n");
    const write = context.mock.method(fs, "writeFileSync", () => assert.fail("Unexpected file write."));
    const prettier = {
        resolveConfig: context.mock.fn(async () => null),
        getFileInfo: context.mock.fn(async () => ({ignored: false, inferredParser: "typescript"})),
        check: context.mock.fn(async () => true)
    };

    return {file, read, write, prettier, checker: new PrettierFileChecker(prettier)};
}

test("reports every unformatted file and checks duplicate paths once", async context => {
    // Arrange
    const {file, read, write, prettier, checker} = createChecker(context);
    const another = resolve(file, "..", "another.ts");
    const formatted = resolve(file, "..", "formatted.ts");
    prettier.check.mock.mockImplementation(async (content, options) => options.filepath === formatted);

    // Act
    const actual = await checker.check([file, another, formatted, file]);

    // Assert
    assert.deepEqual(actual, {checked: 3, unformatted: [another, file]});
    assert.equal(read.mock.calls.length, 3);
    assert.equal(prettier.check.mock.calls.length, 3);
    assert.equal(write.mock.calls.length, 0);
});

test("does not read files or call Prettier for an empty selection", async context => {
    // Arrange
    const {read, prettier, checker} = createChecker(context);

    // Act
    const actual = await checker.check([]);

    // Assert
    assert.deepEqual(actual, {checked: 0, unformatted: []});
    assert.equal(read.mock.calls.length, 0);
    assert.equal(prettier.resolveConfig.mock.calls.length, 0);
    assert.equal(prettier.check.mock.calls.length, 0);
    assert.equal(prettier.getFileInfo.mock.calls.length, 0);
});

test("uses default options when no configuration is found", async context => {
    // Arrange
    const {file, read, prettier, checker} = createChecker(context);

    // Act
    const actual = await checker.check([file]);

    // Assert
    assert.deepEqual(actual, {checked: 1, unformatted: []});
    assert.deepEqual(read.mock.calls[0].arguments, [file, "utf8"]);
    assert.deepEqual(prettier.check.mock.calls[0].arguments, ["const value = 1;\n", {filepath: file}]);
});

test("resolves configuration and EditorConfig separately for each file", async context => {
    // Arrange
    const {file, prettier, checker} = createChecker(context);
    const another = resolve(file, "..", "another.ts");
    prettier.resolveConfig.mock.mockImplementation(async current => ({
        semi: current === file,
        filepath: "ignored.ts"
    }));

    // Act
    await checker.check([file, another]);

    // Assert
    assert.deepEqual(
        prettier.resolveConfig.mock.calls.map(call => call.arguments),
        [
            [another, {editorconfig: true}],
            [file, {editorconfig: true}]
        ]
    );
    assert.deepEqual(
        prettier.check.mock.calls.map(call => call.arguments[1]),
        [
            {semi: false, filepath: another},
            {semi: true, filepath: file}
        ]
    );
});

test("resolves plugin names from the checked file and preserves configuration", async context => {
    // Arrange
    const {file, prettier, checker} = createChecker(context);
    const plugin = {languages: []};
    const configuration = {plugins: ["test-plugin", plugin], semi: false};
    const resolvedPlugin = resolve("resolved plugins", "test-plugin.cjs");
    const resolvePlugin = context.mock.fn(() => resolvedPlugin);
    const createRequire = context.mock.method(moduleApi, "createRequire", () => ({resolve: resolvePlugin}));
    prettier.resolveConfig.mock.mockImplementation(async () => configuration);

    // Act
    await checker.check([file]);

    // Assert
    assert.deepEqual(createRequire.mock.calls[0].arguments, [file]);
    assert.deepEqual(resolvePlugin.mock.calls[0].arguments, ["test-plugin"]);
    assert.deepEqual(prettier.check.mock.calls[0].arguments[1], {
        plugins: [resolvedPlugin, plugin],
        semi: false,
        filepath: file
    });
    assert.deepEqual(configuration, {plugins: ["test-plugin", plugin], semi: false});
});

test("does not load configuration or plugins for ignored files", async context => {
    // Arrange
    const {file, read, prettier, checker} = createChecker(context);
    const ignored = {ignored: true, inferredParser: null};
    const options = {ignorePath: ["ignore-file"], withNodeModules: false};
    prettier.getFileInfo.mock.mockImplementation(async () => ignored);

    // Act
    const actual = await checker.getFileInfo(file, options);

    // Assert
    assert.deepEqual(actual, ignored);
    assert.equal(prettier.getFileInfo.mock.calls.length, 1);
    assert.deepEqual(prettier.getFileInfo.mock.calls[0].arguments, [
        file,
        {...options, resolveConfig: false, plugins: []}
    ]);
    assert.equal(prettier.resolveConfig.mock.calls.length, 0);
    assert.equal(read.mock.calls.length, 0);
});

test("provides resolved plugins for configuration-based parser inference", async context => {
    // Arrange
    const {file, prettier, checker} = createChecker(context);
    const customFile = resolve(file, "..", "value.custom");
    const plugin = resolve("resolved plugins", "custom-parser.cjs");
    const options = {ignorePath: ["ignore-file"], withNodeModules: false};
    let calls = 0;
    prettier.resolveConfig.mock.mockImplementation(async () => ({plugins: ["custom-parser"]}));
    prettier.getFileInfo.mock.mockImplementation(async () =>
        ++calls === 1 ? {ignored: false, inferredParser: null} : {ignored: false, inferredParser: "custom"}
    );
    context.mock.method(moduleApi, "createRequire", () => ({resolve: () => plugin}));

    // Act
    const actual = await checker.getFileInfo(customFile, options);

    // Assert
    assert.deepEqual(actual, {ignored: false, inferredParser: "custom"});
    assert.deepEqual(prettier.getFileInfo.mock.calls[1].arguments, [
        customFile,
        {...options, resolveConfig: true, plugins: [plugin]}
    ]);
});

test("propagates file read errors", async context => {
    // Arrange
    const {file, read, prettier, checker} = createChecker(context);
    const error = Object.assign(new Error("File was removed."), {code: "ENOENT"});
    read.mock.mockImplementation(() => {
        throw error;
    });

    // Act
    const act = () => checker.check([file]);

    // Assert
    await assert.rejects(act, error);
    assert.equal(prettier.check.mock.calls.length, 0);
});

for (const method of ["resolveConfig", "check", "getFileInfo"]) {
    test("propagates Prettier " + method + " errors", async context => {
        // Arrange
        const {file, prettier, checker} = createChecker(context);
        const error = new Error("Prettier failure.");
        prettier[method].mock.mockImplementation(async () => {
            throw error;
        });

        // Act
        const act = () => (method === "getFileInfo" ? checker.getFileInfo(file) : checker.check([file]));

        // Assert
        await assert.rejects(act, error);
    });
}

test("propagates plugin resolution errors", async context => {
    // Arrange
    const {file, prettier, checker} = createChecker(context);
    const error = new Error("Plugin is unavailable.");
    prettier.resolveConfig.mock.mockImplementation(async () => ({plugins: ["missing-plugin"]}));
    context.mock.method(moduleApi, "createRequire", () => ({
        resolve() {
            throw error;
        }
    }));

    // Act
    const act = () => checker.check([file]);

    // Assert
    await assert.rejects(act, error);
    assert.equal(prettier.check.mock.calls.length, 0);
});
