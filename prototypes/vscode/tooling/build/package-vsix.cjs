const {copyFile, cp, mkdir, mkdtemp, rename, rm, writeFile} = require("node:fs/promises");
const {dirname, join, resolve} = require("node:path");
const process = require("node:process");

const {createVSIX} = require("@vscode/vsce");

const {BuildOutputRegistryStore} = require("./BuildOutputRegistryStore.cjs");

async function main() {
    const extensionDirectory = resolve(__dirname, "../..");
    const outputDirectory = join(extensionDirectory, "out");
    const distributionDirectory = join(extensionDirectory, "build", "distributions");
    const manifest = require(join(extensionDirectory, "package.json"));
    const archiveName = manifest.name + "-" + manifest.version + ".vsix";
    const archivePath = join(distributionDirectory, archiveName);

    await mkdir(distributionDirectory, {recursive: true});
    const stagingDirectory = await mkdtemp(join(distributionDirectory, ".vsix-"));

    try {
        const packageDirectory = join(stagingDirectory, "extension");
        await mkdir(packageDirectory);

        const packageManifest = {...manifest};
        delete packageManifest["web-types"];
        packageManifest.files = ["out/**", "webview/**", "LICENSE", "icon.png"];

        await writeFile(join(packageDirectory, "package.json"), JSON.stringify(packageManifest, null, 2) + "\n");

        const outputFiles = new BuildOutputRegistryStore(outputDirectory).load().getFiles();

        for (const file of outputFiles) {
            const destination = join(packageDirectory, "out", file);
            await mkdir(dirname(destination), {recursive: true});
            await copyFile(join(outputDirectory, file), destination);
        }

        await cp(join(extensionDirectory, "webview"), join(packageDirectory, "webview"), {recursive: true});
        await copyFile(join(extensionDirectory, "../../LICENSE"), join(packageDirectory, "LICENSE"));
        await copyFile(join(extensionDirectory, "packaging", "README.md"), join(packageDirectory, "README.md"));
        await copyFile(join(extensionDirectory, "icon.png"), join(packageDirectory, "icon.png"));

        const stagedArchive = join(stagingDirectory, archiveName);
        await createVSIX({
            cwd: packageDirectory,
            packagePath: stagedArchive,
            dependencies: false
        });
        await rename(stagedArchive, archivePath);
        console.log("VSIX written to " + archivePath);
    } finally {
        await rm(stagingDirectory, {recursive: true, force: true});
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
