const assert = require("node:assert/strict");
const {test} = require("node:test");

const {CheckPlanBuilder} = require("../local-checks/CheckPlanBuilder.cjs");

const cases = [
    {
        name: "skips platform checks for declared documentation",
        changes: [
            {status: "M", path: "README.md"},
            {status: "M", path: "CHANGELOG.md"},
            {status: "A", path: "docs/decisions/0018-selective-local-checks.md"},
            {status: "M", path: "prototypes/vscode/README.md"}
        ],
        expected: {intellij: false, vscode: false, formatting: "none"}
    },
    {
        name: "checks only IntelliJ for plugin sources and Gradle configuration",
        changes: [
            {status: "M", path: "src/main/java/example/ThrowableAnnotator.java"},
            {status: "M", path: "src/main/resources/META-INF/plugin.xml"},
            {status: "M", path: "build.gradle.kts"},
            {status: "M", path: "gradle/wrapper/gradle-wrapper.properties"}
        ],
        expected: {intellij: true, vscode: false, formatting: "none"}
    },
    {
        name: "checks only VS Code for prototype sources",
        changes: [
            {status: "M", path: "prototypes/vscode/src/extension.ts"},
            {status: "A", path: "prototypes/vscode/test/NewFeature.test.ts"},
            {status: "M", path: "prototypes/vscode/webview/color-settings/styles.css"}
        ],
        expected: {intellij: false, vscode: true, formatting: "changed"}
    },
    {
        name: "combines checks for both platforms",
        changes: [
            {status: "M", path: "src/main/java/example/ThrowableAnnotator.java"},
            {status: "M", path: "prototypes/vscode/src/extension.ts"}
        ],
        expected: {intellij: true, vscode: true, formatting: "changed"}
    },
    {
        name: "checks both platforms for a deleted shared fixture",
        changes: [{status: "D", path: "docs/specification/fixtures/java/class-context.java"}],
        expected: {intellij: true, vscode: true, formatting: "all"}
    },
    {
        name: "does not exclude shared fixture documentation",
        changes: [{status: "M", path: "docs/specification/fixtures/java/expected-contexts.md"}],
        expected: {intellij: true, vscode: true, formatting: "all"}
    },
    {
        name: "checks both platforms for common infrastructure",
        changes: [
            {status: "M", path: "scripts/check-staged.cjs"},
            {status: "M", path: ".github/workflows/build.yml"}
        ],
        expected: {intellij: true, vscode: true, formatting: "all"}
    },
    {
        name: "checks both platforms for an unknown path",
        changes: [{status: "A", path: "future-platform/src/plugin.ts"}],
        expected: {intellij: true, vscode: true, formatting: "all"}
    },
    {
        name: "checks the original platform when code is renamed into documentation",
        changes: [
            {
                status: "R",
                previousPath: "prototypes/vscode/src/OldFeature.ts",
                path: "docs/old-feature.md"
            }
        ],
        expected: {intellij: false, vscode: true, formatting: "changed"}
    },
    {
        name: "checks both platforms for a rename between platforms",
        changes: [
            {
                status: "R",
                previousPath: "src/main/resources/example.txt",
                path: "prototypes/vscode/webview/example.txt"
            }
        ],
        expected: {intellij: true, vscode: true, formatting: "changed"}
    },
    {
        name: "checks a platform after deleting its source",
        changes: [{status: "D", path: "prototypes/vscode/src/OldFeature.ts"}],
        expected: {intellij: false, vscode: true, formatting: "changed"}
    },
    {
        name: "selects no platform checks for an empty change set",
        changes: [],
        expected: {intellij: false, vscode: false, formatting: "none"}
    },
    {
        name: "supports an explicit full check for an empty change set",
        changes: [],
        options: {full: true},
        expected: {intellij: true, vscode: true, formatting: "all"}
    }
];

for (const scenario of cases) {
    test(scenario.name, () => {
        // Arrange
        const builder = new CheckPlanBuilder();

        // Act
        const actual = builder.build(scenario.changes, scenario.options);

        // Assert
        assert.deepEqual(actual, scenario.expected);
    });
}

for (const path of [
    "prototypes/vscode/.prettierrc.json",
    "prototypes/vscode/.prettierignore",
    "prototypes/vscode/.editorconfig",
    "prototypes/vscode/prettier.config.cjs",
    "prototypes/vscode/package.json",
    "prototypes/vscode/package-lock.json"
]) {
    test("checks all prototype formatting after changing " + path, () => {
        // Arrange
        const builder = new CheckPlanBuilder();

        // Act
        const actual = builder.build([{status: "M", path}]);

        // Assert
        assert.deepEqual(actual, {intellij: false, vscode: true, formatting: "all"});
    });
}

test("retains full formatting when its configuration is renamed", () => {
    // Arrange
    const builder = new CheckPlanBuilder();

    // Act
    const actual = builder.build([
        {
            status: "R",
            previousPath: "prototypes/vscode/.prettierrc.json",
            path: "prototypes/vscode/old-config.json"
        }
    ]);

    // Assert
    assert.deepEqual(actual, {intellij: false, vscode: true, formatting: "all"});
});

test("rejects a malformed changed path", () => {
    // Arrange
    const builder = new CheckPlanBuilder();

    // Act
    const act = () => builder.build([{status: "M", path: ""}]);

    // Assert
    assert.throws(act, /non-empty string/);
});
