import process from "node:process";
import {fileURLToPath} from "node:url";

import {defineConfig} from "@vscode/test-cli";

const workspaceDirectory = process.env.THROWABLE_HIGHLIGHTER_TEST_WORKSPACE;
const userDataDirectory = process.env.THROWABLE_HIGHLIGHTER_TEST_USER_DATA;

if (workspaceDirectory === undefined || userDataDirectory === undefined) {
    throw new Error("Run these tests through npm run test:extension-host.");
}

export default defineConfig({
    label: "extension-host",
    version: "1.144.0",
    files: ".vscode-test/out/test/extension-host/**/*.test.js",
    extensionDevelopmentPath: fileURLToPath(new URL(".", import.meta.url)),
    workspaceFolder: workspaceDirectory,
    installExtensions: ["redhat.java@1.58.0"],
    launchArgs: ["--user-data-dir=" + userDataDirectory],
    useInstallation: {
        fromMachine: false
    },
    mocha: {
        ui: "tdd",
        timeout: 120_000,
        forbidOnly: true,
        failZero: true
    }
});
