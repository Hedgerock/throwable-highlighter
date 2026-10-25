const assert = require("node:assert/strict");
const fs = require("node:fs");
const {dirname, join} = require("node:path");
const {test} = require("node:test");

const {prepareSingleFileReplaceTscAliasPaths} = require("tsc-alias");
const ts = require("typescript");

const {BuildOutputRegistryStore, REGISTRY_FILE_NAME} = require("../BuildOutputRegistryStore.cjs");
const {TypeScriptBuildRunner} = require("../TypeScriptBuildRunner.cjs");
const {TypeScriptBuildWatcher} = require("../TypeScriptBuildWatcher.cjs");
const {createWatchSystem} = require("./support/watchSystem.cjs");
const {createWorkspace} = require("./support/workspace.cjs");

function createDeferred() {
    let resolve;
    const promise = new Promise(done => {
        resolve = done;
    });
    return {promise, resolve};
}

function createProject(context) {
    let watcher;
    const {root, output} = createWorkspace({
        after(cleanup) {
            context.after(async () => {
                try {
                    await watcher?.dispose();
                } finally {
                    cleanup();
                }
            });
        }
    });

    const file = name => join(root, name);
    const write = (name, content) => {
        fs.mkdirSync(dirname(file(name)), {recursive: true});
        fs.writeFileSync(file(name), content);
    };

    write(
        "tsconfig.json",
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
            include: ["src/**/*.ts"]
        })
    );

    write(
        "tsconfig.test.json",
        JSON.stringify({
            extends: "./tsconfig.json",
            compilerOptions: {rootDir: ".", outDir: "out-test", sourceMap: false},
            include: ["test/**/*.ts"]
        })
    );

    write("src/value.ts", "export const value = 1;");
    write("src/index.ts", 'export {value} from "@fixture/value";');
    write("test/probe.ts", 'export {value} from "@fixture/value";');

    return {
        root,
        output,
        file,
        write,
        files(directory = "out") {
            return new BuildOutputRegistryStore(file(directory)).load().getFiles();
        },
        start(runner = new TypeScriptBuildRunner()) {
            const driver = createWatchSystem();
            const errors = [];
            let cycle;

            watcher = new TypeScriptBuildWatcher(file("tsconfig.json"), {
                runner,
                system: driver.system,
                onError: error => errors.push(error),
                onStatus() {},
                createWatchProgram(host) {
                    const after = host.afterProgramCreate;
                    host.afterProgramCreate = program => {
                        cycle = after(program);
                        return cycle;
                    };
                    return ts.createWatchProgram(host);
                }
            });

            return {
                ...driver,
                errors,
                async settle() {
                    driver.flush();
                    await cycle;
                }
            };
        }
    };
}

function move(project, watch, from, to) {
    fs.mkdirSync(dirname(project.file(to)), {recursive: true});
    fs.renameSync(project.file(from), project.file(to));
    watch.notify(project.file(from), ts.FileWatcherEventKind.Deleted);
    watch.notify(project.file(to), ts.FileWatcherEventKind.Created);
}

test(
    "cleans moved and deleted outputs while preserving unrelated files and the test build",
    {timeout: 30_000},
    async context => {
        // Arrange
        const project = createProject(context);
        const manual = 'require("@fixture/value");';
        project.write("out/manual.js", manual);
        project.write("out/manual.js.map", "manual map");
        const watch = project.start();
        await watch.settle();

        await new TypeScriptBuildRunner().build(project.file("tsconfig.test.json"));
        const testRegistry = fs.readFileSync(project.file("out-test/" + REGISTRY_FILE_NAME), "utf8");
        const testOutput = fs.readFileSync(project.file("out-test/test/probe.js"), "utf8");
        assert.doesNotMatch(testOutput, /@fixture\//);

        // Act
        move(project, watch, "src/index.ts", "src/nested/renamed.ts");
        await watch.settle();

        // Assert
        assert.equal(fs.existsSync(project.file("out/index.js")), false);
        assert.equal(fs.existsSync(project.file("out/index.js.map")), false);
        assert.deepEqual(project.files(), ["nested/renamed.js", "nested/renamed.js.map", "value.js", "value.js.map"]);
        assert.doesNotMatch(fs.readFileSync(project.file("out/nested/renamed.js"), "utf8"), /@fixture\//);

        // Act
        fs.unlinkSync(project.file("src/nested/renamed.ts"));
        watch.notify(project.file("src/nested/renamed.ts"), ts.FileWatcherEventKind.Deleted);
        await watch.settle();

        // Assert
        assert.equal(fs.existsSync(project.file("out/nested")), false);
        assert.equal(fs.existsSync(project.file("out/value.js")), true);
        assert.equal(fs.existsSync(project.file("out/value.js.map")), true);
        assert.deepEqual(project.files(), ["value.js", "value.js.map"]);
        assert.equal(fs.readFileSync(project.file("out/manual.js"), "utf8"), manual);
        assert.equal(fs.readFileSync(project.file("out/manual.js.map"), "utf8"), "manual map");
        assert.equal(fs.readFileSync(project.file("out-test/" + REGISTRY_FILE_NAME), "utf8"), testRegistry);
        assert.equal(fs.readFileSync(project.file("out-test/test/probe.js"), "utf8"), testOutput);
        assert.deepEqual(project.files("out-test"), ["src/value.js", "test/probe.js"]);
        assert.deepEqual(watch.errors, []);
    }
);

test("preserves outputs after a type error and cleans them after recovery", {timeout: 30_000}, async context => {
    // Arrange
    const project = createProject(context);
    const watch = project.start();
    await watch.settle();
    const previous = fs.readFileSync(join(project.output, REGISTRY_FILE_NAME), "utf8");

    // Act
    move(project, watch, "src/index.ts", "src/broken.ts");
    project.write("src/broken.ts", 'export const value: number = "invalid";');
    await watch.settle();

    // Assert
    assert.equal(watch.errors.length, 1);
    assert.match(watch.errors[0].message, /TS2322/);
    assert.equal(fs.existsSync(project.file("out/index.js")), true);
    assert.equal(fs.existsSync(project.file("out/broken.js")), false);
    assert.equal(fs.readFileSync(join(project.output, REGISTRY_FILE_NAME), "utf8"), previous);

    // Act
    project.write("src/broken.ts", 'export {value} from "@fixture/value";');
    watch.notify(project.file("src/broken.ts"));
    await watch.settle();

    // Assert
    assert.deepEqual(project.files(), ["broken.js", "broken.js.map", "value.js", "value.js.map"]);
    assert.equal(fs.existsSync(project.file("out/index.js")), false);
    assert.equal(fs.existsSync(project.file("out/index.js.map")), false);
    assert.equal(watch.errors.length, 1);
});

test("retains outputs from a failed alias pass and cleans them after recovery", {timeout: 30_000}, async context => {
    // Arrange
    const project = createProject(context);
    const expected = new Error("Alias processing failed.");
    let fail = false;
    const runner = new TypeScriptBuildRunner({
        prepareAliases: async options => {
            if (fail) {
                throw expected;
            }
            return prepareSingleFileReplaceTscAliasPaths(options);
        }
    });
    const watch = project.start(runner);
    await watch.settle();

    // Act
    fail = true;
    move(project, watch, "src/index.ts", "src/failed.ts");
    await watch.settle();

    // Assert
    assert.deepEqual(watch.errors, [expected]);
    assert.deepEqual(project.files(), [
        "failed.js",
        "failed.js.map",
        "index.js",
        "index.js.map",
        "value.js",
        "value.js.map"
    ]);
    assert.equal(fs.existsSync(project.file("out/index.js")), true);
    assert.equal(fs.existsSync(project.file("out/failed.js")), true);

    // Act
    fail = false;
    move(project, watch, "src/failed.ts", "src/current.ts");
    await watch.settle();

    // Assert
    assert.deepEqual(project.files(), ["current.js", "current.js.map", "value.js", "value.js.map"]);
    for (const name of ["index.js", "index.js.map", "failed.js", "failed.js.map"]) {
        assert.equal(fs.existsSync(project.file("out/" + name)), false);
    }
    assert.doesNotMatch(fs.readFileSync(project.file("out/current.js"), "utf8"), /@fixture\//);
});

test("finishes an active alias pass before building changed sources", {timeout: 30_000}, async context => {
    // Arrange
    const project = createProject(context);
    const started = createDeferred();
    const release = createDeferred();
    let aliasCalls = 0;

    const runner = new TypeScriptBuildRunner({
        prepareAliases: async options => {
            if (++aliasCalls === 1) {
                started.resolve();
                await release.promise;
            }
            return prepareSingleFileReplaceTscAliasPaths(options);
        }
    });

    let calls = 0;
    let active = 0;
    let maximumActive = 0;
    const watch = project.start({
        async build(config) {
            calls++;
            active++;
            maximumActive = Math.max(maximumActive, active);
            try {
                await runner.build(config);
            } finally {
                active--;
            }
        }
    });

    // Act
    try {
        await started.promise;
        move(project, watch, "src/index.ts", "src/current.ts");
        watch.flush();

        // Assert
        assert.equal(calls, 1);
    } finally {
        release.resolve();
    }
    await watch.settle();

    // Assert
    assert.equal(calls, 2);
    assert.equal(maximumActive, 1);
    assert.deepEqual(project.files(), ["current.js", "current.js.map", "value.js", "value.js.map"]);
    assert.equal(fs.existsSync(project.file("out/index.js")), false);
    assert.equal(fs.existsSync(project.file("out/index.js.map")), false);
    assert.deepEqual(watch.errors, []);
});
