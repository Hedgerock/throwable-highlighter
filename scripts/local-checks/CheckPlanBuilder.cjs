const VSCODE_DIRECTORY = "prototypes/vscode/";
const SHARED_FIXTURES_DIRECTORY = "docs/specification/fixtures/";

const INTELLIJ_FILES = new Set([
    "build.gradle.kts",
    "settings.gradle.kts",
    "gradle.properties",
    "gradlew",
    "gradlew.bat"
]);

function isDocumentation(path) {
    if (path.startsWith(SHARED_FIXTURES_DIRECTORY)) {
        return false;
    }

    return (
        path === "README.md" ||
        path === "CHANGELOG.md" ||
        path === VSCODE_DIRECTORY + "README.md" ||
        (path.startsWith("docs/") && path.endsWith(".md"))
    );
}

function affectsAllFormatting(path) {
    const name = path.slice(path.lastIndexOf("/") + 1);

    return (
        name === "package.json" ||
        name === "package-lock.json" ||
        name === ".prettierignore" ||
        name === ".editorconfig" ||
        /^\.prettierrc(?:\.[^/]+)?$/.test(name) ||
        /^prettier\.config\.[^/]+$/.test(name)
    );
}

class CheckPlanBuilder {
    build(changes, {full = false} = {}) {
        let intellij = full;
        let vscode = full;
        let allFormatting = full;

        for (const change of changes) {
            const paths = change.previousPath === undefined ? [change.path] : [change.previousPath, change.path];

            for (const path of paths) {
                if (typeof path !== "string" || path.length === 0) {
                    throw new TypeError("A changed path must be a non-empty string.");
                }

                if (isDocumentation(path)) {
                    continue;
                }

                if (path.startsWith("src/") || path.startsWith("gradle/") || INTELLIJ_FILES.has(path)) {
                    intellij = true;
                } else if (path.startsWith(VSCODE_DIRECTORY)) {
                    vscode = true;
                    allFormatting ||= affectsAllFormatting(path);
                } else {
                    intellij = true;
                    vscode = true;
                    allFormatting = true;
                }
            }
        }

        return {
            intellij,
            vscode,
            formatting: vscode ? (allFormatting ? "all" : "changed") : "none"
        };
    }
}

module.exports = {CheckPlanBuilder};
