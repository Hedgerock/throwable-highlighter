const process = require("node:process");

const {TypeScriptBuildWatcher} = require("./TypeScriptBuildWatcher.cjs");

async function main() {
    if (process.argv.length !== 3) {
        throw new Error("Usage: node tooling/build/watch.cjs <tsconfig>");
    }

    const watcher = new TypeScriptBuildWatcher(process.argv[2]);
    let closing;

    const stop = () => {
        if (closing !== undefined) {
            return;
        }

        closing = watcher
            .dispose()
            .catch(error => {
                console.error(error);
                process.exitCode = 1;
            })
            .finally(() => {
                process.off("SIGINT", stop);
                process.off("SIGTERM", stop);
            });
    };

    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
}

if (require.main === module) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
