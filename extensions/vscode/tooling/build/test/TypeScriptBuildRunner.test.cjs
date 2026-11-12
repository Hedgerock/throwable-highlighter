const assert = require("node:assert/strict");
const fs = require("node:fs");
const {dirname, join} = require("node:path");
const {test} = require("node:test");

const {BuildOutputRegistryStore, REGISTRY_FILE_NAME} = require("../BuildOutputRegistryStore.cjs");
const {TypeScriptBuildRunner} = require("../TypeScriptBuildRunner.cjs");
const {createWorkspace} = require("./support/workspace.cjs");

function createProject(context, include = ["src/**/*.ts"]) {
    const {root, output} = createWorkspace(context);
    const config = join(root, "tsconfig.json");
    fs.mkdirSync(join(root, "src"));
    fs.writeFileSync(
        config,
        JSON.stringify({
            compilerOptions: {
                target: "ES2022",
                module: "commonjs",
                moduleResolution: "node",
                lib: ["ES2022"],
                types: [],
                rootDir: "src",
                outDir: "out",
                sourceMap: true,
                strict: true,
                skipLibCheck: true,
                baseUrl: "src",
                paths: {"@fixture/*": ["*"]}
            },
            include
        })
    );

    return {
        root,
        output,
        config,
        writeSource(file, content) {
            const target = join(root, "src", file);
            fs.mkdirSync(dirname(target), {recursive: true});
            fs.writeFileSync(target, content);
        }
    };
}

test("tracks transitive outputs and rewrites their aliases", async context => {
    // Arrange
    const project = createProject(context, ["src/index.ts"]);
    project.writeSource("value.ts", "export const value = 1;");
    project.writeSource("index.ts", 'export {value} from "@fixture/value";');

    // Act
    await new TypeScriptBuildRunner().build(project.config);

    // Assert
    const files = new BuildOutputRegistryStore(project.output).load().getFiles();
    assert.deepEqual(files, ["index.js", "index.js.map", "value.js", "value.js.map"]);
    assert.doesNotMatch(fs.readFileSync(join(project.output, "index.js"), "utf8"), /@fixture\//);
    assert.equal(require(join(project.output, "index.js")).value, 1);
});

test("cleans renamed and deleted outputs while preserving unregistered files", async context => {
    // Arrange
    const project = createProject(context);
    project.writeSource("keep.ts", "export const keep = 1;");
    project.writeSource("old.ts", "export const value = 2;");
    const runner = new TypeScriptBuildRunner();
    await runner.build(project.config);
    const manual = 'require("@fixture/keep");';
    fs.writeFileSync(join(project.output, "manual.js"), manual);
    fs.writeFileSync(join(project.output, "manual.js.map"), "manual map");
    fs.renameSync(join(project.root, "src", "old.ts"), join(project.root, "src", "renamed.ts"));

    // Act
    await runner.build(project.config);

    // Assert
    assert.equal(fs.existsSync(join(project.output, "old.js")), false);
    assert.equal(fs.existsSync(join(project.output, "old.js.map")), false);
    assert.equal(fs.existsSync(join(project.output, "renamed.js")), true);
    assert.equal(fs.existsSync(join(project.output, "renamed.js.map")), true);

    // Act
    fs.unlinkSync(join(project.root, "src", "renamed.ts"));
    await runner.build(project.config);

    // Assert
    assert.equal(fs.existsSync(join(project.output, "renamed.js")), false);
    assert.equal(fs.existsSync(join(project.output, "renamed.js.map")), false);
    assert.equal(fs.readFileSync(join(project.output, "manual.js"), "utf8"), manual);
    assert.equal(fs.readFileSync(join(project.output, "manual.js.map"), "utf8"), "manual map");
    assert.deepEqual(new BuildOutputRegistryStore(project.output).load().getFiles(), ["keep.js", "keep.js.map"]);
});

test("preserves outputs and their registry when TypeScript reports errors", async context => {
    // Arrange
    const project = createProject(context);
    project.writeSource("old.ts", "export const value = 1;");
    const runner = new TypeScriptBuildRunner();
    await runner.build(project.config);
    const previous = fs.readFileSync(join(project.output, REGISTRY_FILE_NAME), "utf8");
    fs.renameSync(join(project.root, "src", "old.ts"), join(project.root, "src", "renamed.ts"));
    project.writeSource("renamed.ts", 'export const value: number = "invalid";');

    // Act
    const act = () => runner.build(project.config);

    // Assert
    await assert.rejects(act, /TS2322/);
    assert.equal(fs.existsSync(join(project.output, "old.js")), true);
    assert.equal(fs.existsSync(join(project.output, "old.js.map")), true);
    assert.equal(fs.existsSync(join(project.output, "renamed.js")), false);
    assert.equal(fs.readFileSync(join(project.output, REGISTRY_FILE_NAME), "utf8"), previous);
});

test("retains outputs from a failed alias pass and cleans them after a successful build", async context => {
    // Arrange
    const project = createProject(context);
    project.writeSource("old.ts", "export const value = 1;");
    const runner = new TypeScriptBuildRunner();
    await runner.build(project.config);
    fs.renameSync(join(project.root, "src", "old.ts"), join(project.root, "src", "failed.ts"));
    const expected = new Error("Alias processing failed.");
    const failingRunner = new TypeScriptBuildRunner({
        prepareAliases: async () => {
            throw expected;
        }
    });

    // Act
    const act = () => failingRunner.build(project.config);

    // Assert
    await assert.rejects(act, error => error === expected);
    assert.equal(fs.existsSync(join(project.output, "old.js")), true);
    assert.deepEqual(new BuildOutputRegistryStore(project.output).load().getFiles(), [
        "failed.js",
        "failed.js.map",
        "old.js",
        "old.js.map"
    ]);

    // Act
    fs.renameSync(join(project.root, "src", "failed.ts"), join(project.root, "src", "current.ts"));
    await runner.build(project.config);

    // Assert
    for (const name of ["old.js", "old.js.map", "failed.js", "failed.js.map"]) {
        assert.equal(fs.existsSync(join(project.output, name)), false);
    }
    assert.deepEqual(new BuildOutputRegistryStore(project.output).load().getFiles(), ["current.js", "current.js.map"]);
});

test("records an output even when writing its contents fails", async context => {
    // Arrange
    const project = createProject(context);
    project.writeSource("old.ts", "export const value = 1;");
    const runner = new TypeScriptBuildRunner();
    await runner.build(project.config);
    fs.renameSync(join(project.root, "src", "old.ts"), join(project.root, "src", "current.ts"));
    const expected = Object.assign(new Error("Disk full."), {code: "ENOSPC"});
    const openSync = fs.openSync.bind(fs);
    const writeFileSync = fs.writeFileSync.bind(fs);
    const outputs = new Map();
    let failedFile;

    context.mock.method(fs, "openSync", (file, flags, ...args) => {
        const descriptor = openSync(file, flags, ...args);
        if (flags === "w") {
            outputs.set(descriptor, file);
        }
        return descriptor;
    });
    context.mock.method(fs, "writeFileSync", (file, ...args) => {
        if (failedFile === undefined && outputs.has(file)) {
            failedFile = outputs.get(file);
            writeFileSync(file, "partial");
            throw expected;
        }
        return writeFileSync(file, ...args);
    });

    // Act
    const act = () => runner.build(project.config);

    // Assert
    await assert.rejects(act, error => error === expected);
    assert.equal(fs.readFileSync(failedFile, "utf8"), "partial");
    assert.equal(fs.existsSync(join(project.output, "old.js")), true);
    const files = new BuildOutputRegistryStore(project.output).load().getFiles();
    assert.equal(files.includes(failedFile.endsWith(".map") ? "current.js.map" : "current.js"), true);
    assert.equal(files.includes("old.js"), true);
    assert.equal(files.includes("old.js.map"), true);
});
