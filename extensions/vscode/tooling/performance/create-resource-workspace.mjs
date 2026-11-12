import {mkdir, mkdtemp, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const prototypeRoot = fileURLToPath(new URL("../../", import.meta.url));
const workspacesRoot = path.join(prototypeRoot, ".vscode-test", "resource-workspaces");
const exceptionCount = 100;
const usageTypeCounts = [10, 50, 100];
const exceptionPackage = "throwablehighlighter.performance.exception";
const usagePackage = "throwablehighlighter.performance.usage";

await mkdir(workspacesRoot, {recursive: true});

const workspaceRoot = await mkdtemp(path.join(workspacesRoot, "workspace-"));
const settingsRoot = path.join(workspaceRoot, ".vscode");
const exceptionsRoot = path.join(workspaceRoot, "src", ...exceptionPackage.split("."));
const usagesRoot = path.join(workspaceRoot, "src", ...usagePackage.split("."));

for (const directory of [settingsRoot, exceptionsRoot, usagesRoot]) {
    await mkdir(directory, {recursive: true});
}

const exceptionNames = Array.from(
    {length: exceptionCount},
    (_, index) => "ProbeException" + String(index + 1).padStart(4, "0")
);

for (const name of exceptionNames) {
    const source = [
        "package " + exceptionPackage + ";",
        "",
        "public final class " + name + " extends RuntimeException {",
        "    private static final long serialVersionUID = 1L;",
        "}",
        ""
    ].join("\n");

    await writeFile(path.join(exceptionsRoot, name + ".java"), source, "utf8");
}

const usageFiles = [];

for (const typeCount of usageTypeCounts) {
    const name = "Usage" + String(typeCount).padStart(3, "0");
    const types = exceptionNames.slice(0, typeCount);
    const source = [
        "package " + usagePackage + ";",
        "",
        ...types.map(type => "import " + exceptionPackage + "." + type + ";"),
        "",
        "public final class " + name + " {",
        ...types.map((type, index) => "    private " + type + " exception" + String(index + 1).padStart(4, "0") + ";"),
        "}",
        ""
    ].join("\n");

    await writeFile(path.join(usagesRoot, name + ".java"), source, "utf8");
    usageFiles.push(["src", ...usagePackage.split("."), name + ".java"].join("/"));
}

const settings = {
    "java.server.launchMode": "Standard",
    "java.project.sourcePaths": ["src"]
};

const manifest = {
    formatVersion: 1,
    exceptionCount,
    usageTypeCounts,
    usageFiles
};

await writeFile(path.join(settingsRoot, "settings.json"), JSON.stringify(settings, null, 2) + "\n", "utf8");
await writeFile(path.join(workspaceRoot, "resource-workspace.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log("Resource workspace: " + workspaceRoot);
console.log("Java files: " + (exceptionCount + usageFiles.length));
