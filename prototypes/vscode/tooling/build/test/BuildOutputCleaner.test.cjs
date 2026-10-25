const assert = require("node:assert/strict");
const fs = require("node:fs");
const {join} = require("node:path");
const {test} = require("node:test");

const {BuildOutputCleaner} = require("../BuildOutputCleaner.cjs");
const {BuildOutputRegistry} = require("../BuildOutputRegistry.cjs");
const {REGISTRY_FILE_NAME} = require("../BuildOutputRegistryStore.cjs");
const {createWorkspace, createDirectoryLink} = require("./support/workspace.cjs");

test("removes only stale registered outputs and their source maps", context => {
    // Arrange
    const {output} = createWorkspace(context);
    fs.mkdirSync(output);
    const files = ["current.js", "old.js", "old.js.map", "manual.js", "manual.js.map", "asset.txt"];
    for (const file of files) {
        fs.writeFileSync(join(output, file), file);
    }
    const registry = new BuildOutputRegistry(["current.js", "old.js", "old.js.map"]);
    const cleaner = new BuildOutputCleaner(output);

    // Act
    cleaner.clean(registry, ["current.js"]);

    // Assert
    assert.equal(fs.existsSync(join(output, "old.js")), false);
    assert.equal(fs.existsSync(join(output, "old.js.map")), false);
    for (const file of ["current.js", "manual.js", "manual.js.map", "asset.txt"]) {
        assert.equal(fs.readFileSync(join(output, file), "utf8"), file);
    }
    assert.deepEqual(registry.getFiles(), ["current.js"]);
});

test("removes empty ancestors of deleted outputs and preserves the output root", context => {
    // Arrange
    const {output} = createWorkspace(context);
    fs.mkdirSync(join(output, "old", "nested"), {recursive: true});
    fs.writeFileSync(join(output, "old", "nested", "file.js"), "generated");
    const registry = new BuildOutputRegistry(["old/nested/file.js"]);

    // Act
    new BuildOutputCleaner(output).clean(registry, []);

    // Assert
    assert.equal(fs.existsSync(join(output, "old")), false);
    assert.equal(fs.lstatSync(output).isDirectory(), true);
    assert.deepEqual(registry.getFiles(), []);
});

test("preserves parent directories containing unregistered files", context => {
    // Arrange
    const {output} = createWorkspace(context);
    fs.mkdirSync(join(output, "mixed"), {recursive: true});
    fs.writeFileSync(join(output, "mixed", "old.js"), "generated");
    fs.writeFileSync(join(output, "mixed", "manual.js"), "manual");
    const registry = new BuildOutputRegistry(["mixed/old.js"]);

    // Act
    new BuildOutputCleaner(output).clean(registry, []);

    // Assert
    assert.equal(fs.existsSync(join(output, "mixed", "old.js")), false);
    assert.equal(fs.readFileSync(join(output, "mixed", "manual.js"), "utf8"), "manual");
    assert.deepEqual(registry.getFiles(), []);
});

test("forgets missing stale outputs without creating an output directory", context => {
    // Arrange
    const {output} = createWorkspace(context);
    const registry = new BuildOutputRegistry(["missing.js", "current.js"]);

    // Act
    new BuildOutputCleaner(output).clean(registry, ["current.js"]);

    // Assert
    assert.equal(fs.existsSync(output), false);
    assert.deepEqual(registry.getFiles(), ["current.js"]);
});

test("forgets missing files inside an existing output directory", context => {
    // Arrange
    const {output} = createWorkspace(context);
    fs.mkdirSync(output);
    const registry = new BuildOutputRegistry(["missing/old.js"]);

    // Act
    new BuildOutputCleaner(output).clean(registry, []);

    // Assert
    assert.deepEqual(registry.getFiles(), []);
    assert.deepEqual(fs.readdirSync(output), []);
});

test("validates all entries before deleting any files", context => {
    // Arrange
    const {output} = createWorkspace(context);
    fs.mkdirSync(join(output, "z.js"), {recursive: true});
    fs.writeFileSync(join(output, "a.js"), "generated");
    fs.writeFileSync(join(output, "z.js", "manual.txt"), "manual");
    const registry = new BuildOutputRegistry(["a.js", "z.js"]);

    // Act
    const act = () => new BuildOutputCleaner(output).clean(registry, []);

    // Assert
    assert.throws(act, /regular file/);
    assert.equal(fs.readFileSync(join(output, "a.js"), "utf8"), "generated");
    assert.equal(fs.readFileSync(join(output, "z.js", "manual.txt"), "utf8"), "manual");
    assert.deepEqual(registry.getFiles(), ["a.js", "z.js"]);
});

test("rejects service files registered as compiler outputs", async context => {
    for (const file of [REGISTRY_FILE_NAME, REGISTRY_FILE_NAME + ".occupied.tmp"]) {
        await context.test(file, subcontext => {
            // Arrange
            const {output} = createWorkspace(subcontext);
            fs.mkdirSync(output);
            fs.writeFileSync(join(output, file), "service");
            const registry = new BuildOutputRegistry([file]);

            // Act
            const act = () => new BuildOutputCleaner(output).clean(registry, []);

            // Assert
            assert.throws(act, /reserved/);
            assert.equal(fs.readFileSync(join(output, file), "utf8"), "service");
            assert.deepEqual(registry.getFiles(), [file]);
        });
    }
});

test("rejects a symbolic output directory", context => {
    // Arrange
    const {root, output} = createWorkspace(context);
    const outside = join(root, "outside");
    fs.mkdirSync(outside);
    fs.writeFileSync(join(outside, "old.js"), "outside");
    if (!createDirectoryLink(context, outside, output)) {
        return;
    }
    const registry = new BuildOutputRegistry(["old.js"]);

    // Act
    const act = () => new BuildOutputCleaner(output).clean(registry, []);

    // Assert
    assert.throws(act, /real directory/);
    assert.equal(fs.readFileSync(join(outside, "old.js"), "utf8"), "outside");
    assert.deepEqual(registry.getFiles(), ["old.js"]);
});

test("rejects a symbolic parent before deleting other registered files", context => {
    // Arrange
    const {root, output} = createWorkspace(context);
    fs.mkdirSync(output);
    fs.writeFileSync(join(output, "a.js"), "generated");
    const outside = join(root, "outside");
    fs.mkdirSync(outside);
    fs.writeFileSync(join(outside, "old.js"), "outside");
    if (!createDirectoryLink(context, outside, join(output, "linked"))) {
        return;
    }
    const registry = new BuildOutputRegistry(["a.js", "linked/old.js"]);

    // Act
    const act = () => new BuildOutputCleaner(output).clean(registry, []);

    // Assert
    assert.throws(act, /real directory/);
    assert.equal(fs.readFileSync(join(output, "a.js"), "utf8"), "generated");
    assert.equal(fs.readFileSync(join(outside, "old.js"), "utf8"), "outside");
    assert.deepEqual(registry.getFiles(), ["a.js", "linked/old.js"]);
});

test("rejects unsafe physical resolutions before deleting files", async context => {
    for (const destination of ["outside", "current"]) {
        await context.test(destination, subcontext => {
            // Arrange
            const {root, output} = createWorkspace(subcontext);
            fs.mkdirSync(output);
            for (const file of ["a.js", "current.js", "z.js"]) {
                fs.writeFileSync(join(output, file), file);
            }
            const outside = join(root, "outside.js");
            fs.writeFileSync(outside, "outside");
            const original = fs.realpathSync;
            const target = destination === "outside" ? outside : join(output, "current.js");
            subcontext.mock.method(fs, "realpathSync", (file, ...args) =>
                file === join(output, "z.js") ? target : original(file, ...args)
            );
            const registry = new BuildOutputRegistry(["a.js", "current.js", "z.js"]);

            // Act
            const act = () => new BuildOutputCleaner(output).clean(registry, ["current.js"]);

            // Assert
            assert.throws(act, /outside|current output/);
            for (const file of ["a.js", "current.js", "z.js"]) {
                assert.equal(fs.readFileSync(join(output, file), "utf8"), file);
            }
            assert.equal(fs.readFileSync(outside, "utf8"), "outside");
            assert.deepEqual(registry.getFiles(), ["a.js", "current.js", "z.js"]);
        });
    }
});

test("forgets only confirmed deletions when unlink fails", context => {
    // Arrange
    const {output} = createWorkspace(context);
    fs.mkdirSync(output);
    fs.writeFileSync(join(output, "a.js"), "a");
    fs.writeFileSync(join(output, "b.js"), "b");
    const expected = Object.assign(new Error("Unlink failed"), {code: "EACCES"});
    const original = fs.unlinkSync;
    context.mock.method(fs, "unlinkSync", file => {
        if (file === join(output, "b.js")) {
            throw expected;
        }
        original(file);
    });
    const registry = new BuildOutputRegistry(["a.js", "b.js"]);

    // Act
    const act = () => new BuildOutputCleaner(output).clean(registry, []);

    // Assert
    assert.throws(act, error => error === expected);
    assert.equal(fs.existsSync(join(output, "a.js")), false);
    assert.equal(fs.readFileSync(join(output, "b.js"), "utf8"), "b");
    assert.deepEqual(registry.getFiles(), ["b.js"]);
});

test("accepts a file disappearing immediately before unlink", context => {
    // Arrange
    const {output} = createWorkspace(context);
    fs.mkdirSync(output);
    fs.writeFileSync(join(output, "old.js"), "generated");
    const original = fs.unlinkSync;
    context.mock.method(fs, "unlinkSync", file => {
        original(file);
        throw Object.assign(new Error("Already removed"), {code: "ENOENT"});
    });
    const registry = new BuildOutputRegistry(["old.js"]);

    // Act
    new BuildOutputCleaner(output).clean(registry, []);

    // Assert
    assert.equal(fs.existsSync(join(output, "old.js")), false);
    assert.deepEqual(registry.getFiles(), []);
});

test("rechecks parents before each deletion", context => {
    // Arrange
    const {output} = createWorkspace(context);
    const parent = join(output, "nested");
    fs.mkdirSync(parent, {recursive: true});
    fs.writeFileSync(join(output, "a.js"), "a");
    fs.writeFileSync(join(parent, "b.js"), "b");
    const originalStat = fs.lstatSync;
    const originalUnlink = fs.unlinkSync;
    let changed = false;
    context.mock.method(fs, "unlinkSync", file => {
        originalUnlink(file);
        changed = true;
    });
    context.mock.method(fs, "lstatSync", (file, ...args) =>
        changed && file === parent ? {isDirectory: () => false} : originalStat(file, ...args)
    );
    const registry = new BuildOutputRegistry(["a.js", "nested/b.js"]);

    // Act
    const act = () => new BuildOutputCleaner(output).clean(registry, []);

    // Assert
    assert.throws(act, /real directory/);
    assert.equal(fs.existsSync(join(output, "a.js")), false);
    assert.equal(fs.readFileSync(join(parent, "b.js"), "utf8"), "b");
    assert.deepEqual(registry.getFiles(), ["nested/b.js"]);
});

test("validates outputs without deleting files or changing ownership", context => {
    // Arrange
    const {output} = createWorkspace(context);
    fs.mkdirSync(output);
    fs.writeFileSync(join(output, "old.js"), "generated");
    const registry = new BuildOutputRegistry(["old.js"]);

    // Act
    new BuildOutputCleaner(output).validate(registry, ["new.js"]);

    // Assert
    assert.equal(fs.readFileSync(join(output, "old.js"), "utf8"), "generated");
    assert.deepEqual(registry.getFiles(), ["old.js"]);
});

test("preserves ownership when validating a missing output directory", context => {
    // Arrange
    const {output} = createWorkspace(context);
    const registry = new BuildOutputRegistry(["old.js"]);

    // Act
    new BuildOutputCleaner(output).validate(registry, []);

    // Assert
    assert.equal(fs.existsSync(output), false);
    assert.deepEqual(registry.getFiles(), ["old.js"]);
});
