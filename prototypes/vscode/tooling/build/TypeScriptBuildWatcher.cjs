const {resolve} = require("node:path");

const ts = require("typescript");

const {BuildCycleQueue} = require("./BuildCycleQueue.cjs");
const {TypeScriptBuildRunner} = require("./TypeScriptBuildRunner.cjs");

function createDiagnosticError(diagnostic, system) {
    return new Error(
        ts.formatDiagnostics([diagnostic], {
            getCanonicalFileName: file => file,
            getCurrentDirectory: () => system.getCurrentDirectory(),
            getNewLine: () => system.newLine
        })
    );
}

class TypeScriptBuildWatcher {
    #queue;
    #watcher;

    constructor(
        configFile,
        {
            runner = new TypeScriptBuildRunner(),
            system = ts.sys,
            createWatchProgram = ts.createWatchProgram,
            onError = error => console.error(error),
            onStatus = message => console.log(message)
        } = {}
    ) {
        const config = resolve(configFile);
        this.#queue = new BuildCycleQueue(
            async () => {
                onStatus("[watch] Build started.");
                await runner.build(config);
                onStatus("[watch] Build completed. Waiting for changes.");
            },
            {onError}
        );

        const host = ts.createWatchCompilerHost(
            config,
            undefined,
            system,
            ts.createSemanticDiagnosticsBuilderProgram,
            diagnostic => onError(createDiagnosticError(diagnostic, system)),
            () => {}
        );

        host.afterProgramCreate = () => this.#queue.request();
        host.onUnRecoverableConfigFileDiagnostic = diagnostic => {
            throw createDiagnosticError(diagnostic, system);
        };
        host.writeFile = () => {
            throw new Error("Watch host cannot write build outputs.");
        };

        if (host.setTimeout) {
            const schedule = host.setTimeout;
            host.setTimeout = (callback, delay, ...args) =>
                schedule(() => {
                    try {
                        callback(...args);
                    } catch (error) {
                        onError(error);
                    }
                }, delay);
        }

        try {
            this.#watcher = createWatchProgram(host);
        } catch (error) {
            void this.#queue.dispose();
            throw error;
        }
    }

    async dispose() {
        const watcher = this.#watcher;
        this.#watcher = undefined;

        try {
            watcher?.close();
        } finally {
            await this.#queue.dispose();
        }
    }
}

module.exports = {TypeScriptBuildWatcher};
