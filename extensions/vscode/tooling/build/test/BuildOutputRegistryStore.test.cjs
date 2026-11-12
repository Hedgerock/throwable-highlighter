const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const {join} = require("node:path");
const {test} = require("node:test");

const {BuildOutputRegistry} = require("../BuildOutputRegistry.cjs");
const {BuildOutputRegistryStore, REGISTRY_FILE_NAME} = require("../BuildOutputRegistryStore.cjs");
const {createWorkspace, createDirectoryLink} = require("./support/workspace.cjs");

test("loads an empty registry without creating a missing output directory", context => {
    // Arrange
    const {output} = createWorkspace(context);
    const store = new BuildOutputRegistryStore(output);

    // Act
    const registry = store.load();

    // Assert
    assert.deepEqual(registry.getFiles(), []);
    assert.equal(fs.existsSync(output), false);
});

test("does not adopt files when the registry is missing", context => {
    // Arrange
    const {output} = createWorkspace(context);
    fs.mkdirSync(output);
    const manual = join(output, "manual.js");
    fs.writeFileSync(manual, "manual content");
    const store = new BuildOutputRegistryStore(output);

    // Act
    const registry = store.load();

    // Assert
    assert.deepEqual(registry.getFiles(), []);
    assert.equal(fs.readFileSync(manual, "utf8"), "manual content");
    assert.deepEqual(fs.readdirSync(output), ["manual.js"]);
});

test("saves and restores registry data and the selected comparison policy", context => {
    // Arrange
    const {output} = createWorkspace(context);
    const store = new BuildOutputRegistryStore(output, {caseSensitive: false});
    const registry = new BuildOutputRegistry(["src/Example.js", "src/Example.js.map"]);

    // Act
    store.save(registry);
    const restored = store.load();
    const content = fs.readFileSync(join(output, REGISTRY_FILE_NAME), "utf8");

    // Assert
    assert.deepEqual(restored.toJSON(), registry.toJSON());
    assert.deepEqual(restored.getStaleFiles(["src/example.js", "src/example.js.map"]), []);
    assert.equal(content, JSON.stringify(registry.toJSON(), null, 2) + "\n");
    assert.deepEqual(fs.readdirSync(output), [REGISTRY_FILE_NAME]);
});

test("stores main and test registries independently", context => {
    // Arrange
    const {root, output} = createWorkspace(context);
    const main = new BuildOutputRegistryStore(output);
    const tests = new BuildOutputRegistryStore(join(root, "out-test"));

    // Act
    main.save(new BuildOutputRegistry(["extension.js"]));
    tests.save(new BuildOutputRegistry(["test/example.test.js"]));

    // Assert
    assert.deepEqual(main.load().getFiles(), ["extension.js"]);
    assert.deepEqual(tests.load().getFiles(), ["test/example.test.js"]);
});

test("rejects malformed registry content without changing it", async context => {
    const invalidContents = ["{", '{"version":2,"files":[]}', '{"version":1,"files":["../outside.js"]}'];

    for (const content of invalidContents) {
        await context.test(content, subcontext => {
            // Arrange
            const {output} = createWorkspace(subcontext);
            fs.mkdirSync(output);
            const file = join(output, REGISTRY_FILE_NAME);
            fs.writeFileSync(file, content);
            const store = new BuildOutputRegistryStore(output);

            // Act
            const act = () => store.load();

            // Assert
            assert.throws(act);
            assert.equal(fs.readFileSync(file, "utf8"), content);
        });
    }
});

test("propagates read failures after locating an existing registry", async context => {
    for (const code of ["EACCES", "ENOENT"]) {
        await context.test(code, subcontext => {
            // Arrange
            const {output} = createWorkspace(subcontext);
            const store = new BuildOutputRegistryStore(output);
            store.save(new BuildOutputRegistry(["extension.js"]));
            const expected = Object.assign(new Error("Read failed"), {code});
            subcontext.mock.method(fs, "readFileSync", () => {
                throw expected;
            });

            // Act
            const act = () => store.load();

            // Assert
            assert.throws(act, error => error === expected);
        });
    }
});

test("rejects a directory in place of the registry file", context => {
    // Arrange
    const {output} = createWorkspace(context);
    fs.mkdirSync(join(output, REGISTRY_FILE_NAME), {recursive: true});
    const store = new BuildOutputRegistryStore(output);

    // Act
    const load = () => store.load();
    const save = () => store.save(new BuildOutputRegistry());

    // Assert
    assert.throws(load, /regular file/);
    assert.throws(save, /regular file/);
    assert.equal(fs.lstatSync(join(output, REGISTRY_FILE_NAME)).isDirectory(), true);
    assert.deepEqual(fs.readdirSync(output), [REGISTRY_FILE_NAME]);
});

test("rejects a symbolic output directory", context => {
    // Arrange
    const {root, output} = createWorkspace(context);
    const outside = join(root, "outside");
    fs.mkdirSync(outside);

    if (!createDirectoryLink(context, outside, output)) {
        return;
    }

    const store = new BuildOutputRegistryStore(output);

    // Act
    const load = () => store.load();
    const save = () => store.save(new BuildOutputRegistry());

    // Assert
    assert.throws(load, /real directory/);
    assert.throws(save, /real directory/);
    assert.deepEqual(fs.readdirSync(outside), []);
});

test("preserves the previous registry when writing the temporary file fails", context => {
    // Arrange
    const {output} = createWorkspace(context);
    const store = new BuildOutputRegistryStore(output);
    const previous = new BuildOutputRegistry(["previous.js"]);
    store.save(previous);
    const expected = Object.assign(new Error("Write failed"), {code: "ENOSPC"});
    context.mock.method(fs, "writeFileSync", () => {
        throw expected;
    });

    // Act
    const act = () => store.save(new BuildOutputRegistry(["next.js"]));

    // Assert
    assert.throws(act, error => error === expected);
    assert.deepEqual(store.load().toJSON(), previous.toJSON());
    assert.deepEqual(fs.readdirSync(output), [REGISTRY_FILE_NAME]);
});

test("preserves the previous registry when replacement fails", context => {
    // Arrange
    const {output} = createWorkspace(context);
    const store = new BuildOutputRegistryStore(output);
    const previous = new BuildOutputRegistry(["previous.js"]);
    store.save(previous);
    const expected = Object.assign(new Error("Rename failed"), {code: "EPERM"});
    context.mock.method(fs, "renameSync", () => {
        throw expected;
    });

    // Act
    const act = () => store.save(new BuildOutputRegistry(["next.js"]));

    // Assert
    assert.throws(act, error => error === expected);
    assert.deepEqual(store.load().toJSON(), previous.toJSON());
    assert.deepEqual(fs.readdirSync(output), [REGISTRY_FILE_NAME]);
});

test("preserves an existing file that collides with the temporary name", context => {
    // Arrange
    const {output} = createWorkspace(context);
    const store = new BuildOutputRegistryStore(output);
    const previous = new BuildOutputRegistry(["previous.js"]);
    store.save(previous);
    const occupied = join(output, REGISTRY_FILE_NAME + ".occupied.tmp");
    fs.writeFileSync(occupied, "manual content");
    context.mock.method(crypto, "randomUUID", () => "occupied");

    // Act
    const act = () => store.save(new BuildOutputRegistry(["next.js"]));

    // Assert
    assert.throws(act, {code: "EEXIST"});
    assert.equal(fs.readFileSync(occupied, "utf8"), "manual content");
    assert.deepEqual(store.load().toJSON(), previous.toJSON());
});
