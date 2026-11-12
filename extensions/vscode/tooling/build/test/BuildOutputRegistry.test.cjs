const assert = require("node:assert/strict");
const {test} = require("node:test");

const {BuildOutputRegistry} = require("../BuildOutputRegistry.cjs");

test("starts without ownership of existing or expected files", () => {
    // Arrange
    const registry = new BuildOutputRegistry();

    // Act
    const stale = registry.getStaleFiles(["manual.js", "manual.js.map"]);

    // Assert
    assert.deepEqual(stale, []);
    assert.deepEqual(registry.toJSON(), {version: 1, files: []});
});

test("finds old JavaScript files and source maps after a rename", () => {
    // Arrange
    const registry = new BuildOutputRegistry(["src/Old.js", "src/Old.js.map", "src/Kept.js"]);

    // Act
    registry.recordWrittenFiles(["src/New.js", "src/New.js.map"]);
    const stale = registry.getStaleFiles(["src/New.js", "src/New.js.map", "src/Kept.js"]);

    // Assert
    assert.deepEqual(stale, ["src/Old.js", "src/Old.js.map"]);
});

test("preserves unchanged outputs during a partial watch rebuild", () => {
    // Arrange
    const registry = new BuildOutputRegistry(["src/Changed.js", "src/Unchanged.js"]);

    // Act
    registry.recordWrittenFiles(["src/Changed.js"]);
    const stale = registry.getStaleFiles(["src/Changed.js", "src/Unchanged.js"]);

    // Assert
    assert.deepEqual(stale, []);
    assert.deepEqual(registry.getFiles(), ["src/Changed.js", "src/Unchanged.js"]);
});

test("retains ownership of outputs from an unsuccessful attempt", () => {
    // Arrange
    const registry = new BuildOutputRegistry(["src/Previous.js"]);

    // Act
    registry.recordWrittenFiles(["src/FailedAttempt.js"]);
    const restored = BuildOutputRegistry.fromJSON(JSON.parse(JSON.stringify(registry)));

    // Assert
    assert.deepEqual(restored.getFiles(), ["src/FailedAttempt.js", "src/Previous.js"]);
    assert.deepEqual(restored.getStaleFiles(["src/Previous.js"]), ["src/FailedAttempt.js"]);
});

test("keeps stale files registered until their deletion is confirmed", () => {
    // Arrange
    const registry = new BuildOutputRegistry(["src/Kept.js", "src/Removed.js", "src/Removed.js.map"]);

    // Act
    const stale = registry.getStaleFiles(["src/Kept.js"]);
    registry.forgetDeletedFiles(["src/Removed.js"]);

    // Assert
    assert.deepEqual(stale, ["src/Removed.js", "src/Removed.js.map"]);
    assert.deepEqual(registry.getFiles(), ["src/Kept.js", "src/Removed.js.map"]);
    assert.deepEqual(registry.getStaleFiles(["src/Kept.js"]), ["src/Removed.js.map"]);
});

test("keeps registries of different configurations independent", () => {
    // Arrange
    const main = new BuildOutputRegistry(["extension.js"]);
    const tests = new BuildOutputRegistry(["test/example.test.js"]);

    // Act
    main.recordWrittenFiles(["new.js"]);
    tests.forgetDeletedFiles(["test/example.test.js"]);

    // Assert
    assert.deepEqual(main.getFiles(), ["extension.js", "new.js"]);
    assert.deepEqual(tests.getFiles(), []);
});

test("normalizes path separators and removes duplicate entries", () => {
    // Arrange
    const files = ["src\\Example.js", "src/Example.js", "extension.js"];

    // Act
    const registry = new BuildOutputRegistry(files);

    // Assert
    assert.deepEqual(registry.toJSON(), {
        version: 1,
        files: ["extension.js", "src/Example.js"]
    });
});

test("preserves case-only renames when path comparison is case insensitive", () => {
    // Arrange
    const registry = new BuildOutputRegistry(["src/example.js"], {caseSensitive: false});

    // Act
    const stale = registry.getStaleFiles(["src/Example.js"]);
    registry.recordWrittenFiles(["src/Example.js"]);

    // Assert
    assert.deepEqual(stale, []);
    assert.deepEqual(registry.getFiles(), ["src/Example.js"]);
});

test("forgets deleted files using case-insensitive comparison", () => {
    // Arrange
    const registry = new BuildOutputRegistry(["src/Example.js"], {caseSensitive: false});

    // Act
    registry.forgetDeletedFiles(["SRC/EXAMPLE.JS"]);

    // Assert
    assert.deepEqual(registry.getFiles(), []);
});

test("restores the selected path comparison policy", () => {
    // Arrange
    const value = {version: 1, files: ["src/Example.js"]};

    // Act
    const registry = BuildOutputRegistry.fromJSON(value, {caseSensitive: false});
    const stale = registry.getStaleFiles(["src/example.js"]);

    // Assert
    assert.deepEqual(stale, []);
});

test("distinguishes file names when path comparison is case sensitive", () => {
    // Arrange
    const registry = new BuildOutputRegistry(["src/example.js"], {caseSensitive: true});

    // Act
    registry.recordWrittenFiles(["src/Example.js"]);
    const stale = registry.getStaleFiles(["src/Example.js"]);

    // Assert
    assert.deepEqual(stale, ["src/example.js"]);
    assert.deepEqual(registry.getFiles(), ["src/Example.js", "src/example.js"]);
});

test("returns detached registry data", () => {
    // Arrange
    const registry = new BuildOutputRegistry(["extension.js"]);
    const files = registry.getFiles();
    const json = registry.toJSON();

    // Act
    files.push("manual.js");
    json.files.length = 0;

    // Assert
    assert.deepEqual(registry.getFiles(), ["extension.js"]);
});

test("rejects malformed or unsupported registry data", async context => {
    const invalidValues = [
        null,
        [],
        "registry",
        {},
        {version: 1},
        {version: 2, files: []},
        {version: "1", files: []},
        {version: 1, files: "extension.js"},
        {version: 1, files: [null]},
        {version: 1, files: ["../outside.js"]},
        {version: 1, files: [], extra: true}
    ];

    for (const value of invalidValues) {
        await context.test(JSON.stringify(value), () => {
            // Act
            const act = () => BuildOutputRegistry.fromJSON(value);

            // Assert
            assert.throws(act, /registry|files|path/);
        });
    }
});

test("rejects invalid output paths before changing ownership", async context => {
    const invalidPaths = [
        "",
        ".",
        "..",
        "../outside.js",
        "src/../outside.js",
        "./extension.js",
        "/outside.js",
        "C:\\outside.js",
        "C:outside.js",
        "\\\\server\\share\\outside.js",
        "src//Example.js",
        "src/",
        "src/Example.js:stream",
        "src/Example.js\0",
        "src/.. /outside.js",
        "src./Example.js",
        "src/Example.js ",
        42,
        null
    ];

    for (const file of invalidPaths) {
        await context.test(JSON.stringify(file), () => {
            // Arrange
            const registry = new BuildOutputRegistry(["extension.js"]);

            // Act
            const act = () => registry.recordWrittenFiles(["src/New.js", file]);

            // Assert
            assert.throws(act, /path/);
            assert.deepEqual(registry.getFiles(), ["extension.js"]);
        });
    }
});

test("rejects an invalid expected set without changing ownership", () => {
    // Arrange
    const registry = new BuildOutputRegistry(["extension.js"]);

    // Act
    const act = () => registry.getStaleFiles(["extension.js", "../outside.js"]);

    // Assert
    assert.throws(act, /path/);
    assert.deepEqual(registry.getFiles(), ["extension.js"]);
});

test("validates a deletion batch before forgetting any files", () => {
    // Arrange
    const registry = new BuildOutputRegistry(["extension.js"]);

    // Act
    const act = () => registry.forgetDeletedFiles(["extension.js", "../outside.js"]);

    // Assert
    assert.throws(act, /path/);
    assert.deepEqual(registry.getFiles(), ["extension.js"]);
});
