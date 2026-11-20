import {spawnSync} from "node:child_process";
import {cp, mkdir, mkdtemp, writeFile} from "node:fs/promises";
import {join} from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";

import {cleanupRunDirectory} from "./cleanupRunDirectory.mjs";

async function main() {
    const npmCli = process.env.npm_execpath;

    if (npmCli === undefined) {
        throw new Error("Run this script through npm run test:extension-host.");
    }

    const extensionDirectory = fileURLToPath(new URL("../../", import.meta.url));
    const fixtureDirectory = fileURLToPath(
        new URL("../../../../docs/specification/fixtures/java/transitive/", import.meta.url)
    );
    const throwsFixture = fileURLToPath(
        new URL("../../../../docs/specification/fixtures/java/throws-context.java", import.meta.url)
    );
    const cacheDirectory = join(extensionDirectory, ".vscode-test");

    await mkdir(cacheDirectory, {recursive: true});

    const runDirectory = await mkdtemp(join(cacheDirectory, "run-"));
    const workspaceDirectory = join(runDirectory, "workspace");
    const userDataDirectory = join(runDirectory, "user-data");
    let succeeded = false;

    try {
        await cp(fixtureDirectory, workspaceDirectory, {recursive: true});
        await cp(throwsFixture, join(workspaceDirectory, "src", "ThrowsContextFixture.java"));
        await prepareFixtureLibrary(runDirectory, workspaceDirectory);
        await mkdir(join(workspaceDirectory, ".vscode"), {recursive: true});
        await writeFile(
            join(workspaceDirectory, ".vscode", "settings.json"),
            JSON.stringify(
                {
                    "java.server.launchMode": "Standard",
                    "java.project.sourcePaths": ["src"],
                    "java.project.referencedLibraries": ["lib/fixture-library.jar"]
                },
                null,
                2
            ) + "\n",
            "utf8"
        );

        await mkdir(join(userDataDirectory, "User"), {recursive: true});
        await writeFile(
            join(userDataDirectory, "User", "settings.json"),
            JSON.stringify(
                {
                    "extensions.autoUpdate": false,
                    "extensions.autoCheckUpdates": false
                },
                null,
                2
            ) + "\n",
            "utf8"
        );

        console.log("[extension-host] Workspace: " + workspaceDirectory);

        const result = spawnSync(
            process.execPath,
            [npmCli, "exec", "--no", "--", "vscode-test", ...process.argv.slice(2)],
            {
                cwd: extensionDirectory,
                stdio: "inherit",
                env: {
                    ...process.env,
                    THROWABLE_HIGHLIGHTER_TEST_WORKSPACE: workspaceDirectory,
                    THROWABLE_HIGHLIGHTER_TEST_USER_DATA: userDataDirectory
                }
            }
        );

        if (result.error !== undefined) {
            throw result.error;
        }

        succeeded = result.status === 0;
        process.exitCode = result.status ?? 1;
    } finally {
        if (succeeded) {
            await cleanupRunDirectory(runDirectory);
        } else {
            console.error("[extension-host] Test data retained: " + runDirectory);
        }
    }
}

async function prepareFixtureLibrary(runDirectory, workspaceDirectory) {
    const sources = fileURLToPath(
        new URL("../../../../docs/specification/fixtures/java/library/src/", import.meta.url)
    );
    const source = join(sources, "throwablehighlighter", "fixture", "library", "LibraryException.java");
    const classes = join(runDirectory, "library-classes");
    const libraries = join(workspaceDirectory, "lib");

    await mkdir(classes);
    await mkdir(libraries);

    runJdkTool("javac", ["--release", "21", "-d", classes, source]);
    runJdkTool("jar", ["--create", "--file", join(libraries, "fixture-library.jar"), "-C", classes, "."]);
    runJdkTool("jar", ["--create", "--file", join(libraries, "fixture-library-sources.jar"), "-C", sources, "."]);
}

function runJdkTool(tool, args) {
    const javaHome = process.env.JAVA_HOME;
    const executable = process.platform === "win32" ? tool + ".exe" : tool;
    const command = javaHome ? join(javaHome, "bin", executable) : executable;
    const result = spawnSync(command, args, {stdio: "inherit", windowsHide: true});

    if (result.error !== undefined) {
        throw new Error("Unable to start " + tool + ": " + result.error.message, {cause: result.error});
    }
    if (result.status !== 0) {
        throw new Error(tool + " failed: " + (result.signal ?? "exit code " + result.status));
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
