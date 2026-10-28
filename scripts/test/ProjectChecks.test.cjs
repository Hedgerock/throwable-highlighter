const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const {join, resolve} = require("node:path");
const process = require("node:process");
const {test} = require("node:test");

const {runProjectChecks} = require("../check-staged.cjs");

function createChecks(context, plan, result = () => ({status: 0, stdout: null})) {
    const commands = [];

    context.mock.method(childProcess, "spawnSync", (command, args, options) => {
        commands.push({command, args, cwd: options.cwd, env: options.env});
        return result(commands.length - 1);
    });

    const snapshot = resolve("snapshot with spaces");
    const selectionFile = resolve("selection with spaces.json");
    const env = {...process.env};

    return {commands, snapshot, env, options: {plan, selectionFile}};
}

function describeCommand({command, args}) {
    if (command === process.execPath) {
        return args[0] === "--test" ? "runner" : "format";
    }

    const text = process.platform === "win32" ? args.at(-1) : [command, ...args].join(" ");
    return text.includes("gradlew") ? "gradle" : text;
}

for (const [name, plan, expected] of [
    ["documentation", {intellij: false, vscode: false, formatting: "none"}, ["runner"]],
    ["IntelliJ", {intellij: true, vscode: false, formatting: "none"}, ["runner", "gradle"]],
    [
        "VS Code",
        {intellij: false, vscode: true, formatting: "changed"},
        ["runner", "npm ci", "format", "npm run compile", "npm test"]
    ],
    [
        "both platforms",
        {intellij: true, vscode: true, formatting: "all"},
        ["runner", "gradle", "npm ci", "format", "npm run compile", "npm test"]
    ]
]) {
    test("runs the selected checks for " + name, context => {
        // Arrange
        const {commands, snapshot, env, options} = createChecks(context, plan);

        // Act
        runProjectChecks(snapshot, env, options);

        // Assert
        assert.deepEqual(commands.map(describeCommand), expected);
        assert.deepEqual(commands[0].args, ["--test", "scripts/test/*.test.cjs"]);
        assert.equal(commands[0].cwd, snapshot);
        assert.ok(commands.every(command => command.env === env));

        if (plan.intellij) {
            const gradle = commands[1];
            assert.equal(gradle.cwd, snapshot);
            assert.deepEqual(
                gradle.args,
                process.platform === "win32"
                    ? ["/d", "/s", "/c", "gradlew.bat test verifyPlugin buildPlugin --no-daemon"]
                    : ["./gradlew", "test", "verifyPlugin", "buildPlugin", "--no-daemon"]
            );
        }

        if (plan.vscode) {
            const format = commands.find(command => describeCommand(command) === "format");
            assert.deepEqual(format.args, [
                join(snapshot, "scripts", "check-format.cjs"),
                "--selection",
                options.selectionFile
            ]);
            assert.ok(
                commands
                    .slice(plan.intellij ? 2 : 1)
                    .every(command => command.cwd === join(snapshot, "prototypes", "vscode"))
            );
        }
    });
}

for (const [failedAt, name] of [
    "runner tests",
    "IntelliJ checks",
    "dependency installation",
    "formatting",
    "compilation",
    "VS Code tests"
].entries()) {
    test("stops after failed " + name, context => {
        // Arrange
        const plan = {intellij: true, vscode: true, formatting: "all"};
        const {commands, snapshot, env, options} = createChecks(context, plan, index => ({
            status: index === failedAt ? 1 : 0,
            stdout: null
        }));

        // Act
        const act = () => runProjectChecks(snapshot, env, options);

        // Assert
        assert.throws(act, /exit code 1/);
        assert.equal(commands.length, failedAt + 1);
    });
}

test("rejects a command terminated by a signal", context => {
    // Arrange
    const plan = {intellij: true, vscode: true, formatting: "all"};
    const {commands, snapshot, env, options} = createChecks(context, plan, () => ({
        status: null,
        signal: "SIGTERM",
        stdout: null
    }));

    // Act
    const act = () => runProjectChecks(snapshot, env, options);

    // Assert
    assert.throws(act, /signal SIGTERM/);
    assert.equal(commands.length, 1);
});
