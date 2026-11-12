const process = require("node:process");

const {TypeScriptBuildRunner} = require("./TypeScriptBuildRunner.cjs");

async function main() {
    if (process.argv.length !== 3) {
        throw new Error("Usage: node tooling/build/compile.cjs <tsconfig>");
    }

    await new TypeScriptBuildRunner().build(process.argv[2]);
}

if (require.main === module) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
