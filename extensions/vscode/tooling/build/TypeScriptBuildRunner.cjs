const fs = require("node:fs");
const {dirname, relative, resolve} = require("node:path");

const {prepareSingleFileReplaceTscAliasPaths} = require("tsc-alias");
const ts = require("typescript");

const {BuildOutputCleaner} = require("./BuildOutputCleaner.cjs");
const {BuildOutputRegistry} = require("./BuildOutputRegistry.cjs");
const {BuildOutputRegistryStore} = require("./BuildOutputRegistryStore.cjs");

const ALIAS_OUTPUT = /\.(?:[cm]?js|jsx|d\.[cm]?ts)$/;

function checkDiagnostics(diagnostics) {
    if (diagnostics.length === 0) {
        return;
    }

    throw new Error(
        ts.formatDiagnostics(diagnostics, {
            getCanonicalFileName: file => file,
            getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
            getNewLine: () => ts.sys.newLine
        })
    );
}

function createBuildPlan(configFile) {
    const input = ts.readConfigFile(configFile, ts.sys.readFile);
    checkDiagnostics(input.error ? [input.error] : []);

    const parsed = ts.parseJsonConfigFileContent(input.config, ts.sys, dirname(configFile), undefined, configFile);
    checkDiagnostics(parsed.errors);

    if (!parsed.options.outDir) {
        throw new Error("Build configuration must specify outDir.");
    }

    if (parsed.options.noEmit) {
        throw new Error("Build configuration must allow output emission.");
    }

    const program = ts.createProgram({
        rootNames: parsed.fileNames,
        options: parsed.options,
        projectReferences: parsed.projectReferences
    });
    checkDiagnostics(ts.getPreEmitDiagnostics(program));

    const directory = resolve(parsed.options.outDir);
    const outputs = new Map();
    const result = program.emit(undefined, (file, content, bom) => {
        const absolute = resolve(file);
        const name = relative(directory, absolute).replaceAll("\\", "/");
        outputs.set(name, {
            file: absolute,
            content: (bom ? "\uFEFF" : "") + content
        });
    });

    checkDiagnostics(result.diagnostics);

    if (result.emitSkipped) {
        throw new Error("TypeScript skipped output emission.");
    }

    return {directory, outputs};
}

function createAliasOutput() {
    return {
        verbose: false,
        debug() {},
        info() {},
        clear() {},
        assert(condition, message) {
            if (!condition) {
                throw new Error(String(message));
            }
        },
        error(message) {
            throw new Error(String(message));
        }
    };
}

class TypeScriptBuildRunner {
    #prepareAliases;

    constructor({prepareAliases = prepareSingleFileReplaceTscAliasPaths} = {}) {
        this.#prepareAliases = prepareAliases;
    }

    async build(configFile) {
        const config = resolve(configFile);
        const {directory, outputs} = createBuildPlan(config);
        const options = {caseSensitive: ts.sys.useCaseSensitiveFileNames};
        const store = new BuildOutputRegistryStore(directory, options);
        const registry = store.load();
        const cleaner = new BuildOutputCleaner(directory, options);
        const expected = [...outputs.keys()];
        const empty = new BuildOutputRegistry([], options);

        cleaner.validate(registry, expected);

        await this.#runAndSave(store, registry, () => {
            for (const [name, output] of outputs) {
                this.#writeOutput(cleaner, empty, registry, name, output.file, output.content);
            }
        });

        await this.#runAndSave(store, registry, async () => {
            const replace = await this.#prepareAliases({
                configFile: config,
                outDir: directory,
                output: createAliasOutput()
            });

            for (const [name, output] of outputs) {
                if (!ALIAS_OUTPUT.test(name)) {
                    continue;
                }

                const content = replace({filePath: output.file, fileContents: output.content});

                if (content !== output.content) {
                    this.#writeOutput(cleaner, empty, registry, name, output.file, content);
                }
            }

            cleaner.clean(registry, expected);
        });
    }

    #writeOutput(cleaner, empty, registry, name, file, content) {
        fs.mkdirSync(dirname(file), {recursive: true});
        cleaner.validate(empty, [name]);

        const descriptor = fs.openSync(file, "w");

        try {
            registry.recordWrittenFiles([name]);
            fs.writeFileSync(descriptor, content, "utf8");
        } finally {
            fs.closeSync(descriptor);
        }
    }

    async #runAndSave(store, registry, action) {
        try {
            await action();
        } catch (error) {
            try {
                store.save(registry);
            } catch (saveError) {
                throw new AggregateError([error, saveError], "Build failed and its registry could not be saved.");
            }

            throw error;
        }

        store.save(registry);
    }
}

module.exports = {TypeScriptBuildRunner};
