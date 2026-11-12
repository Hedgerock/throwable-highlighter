import assert from "node:assert/strict";
import {test} from "node:test";

import * as vscode from "vscode";

import {ThrowableColorConfigurationWriter} from "@throwable-highlighter/settings/ThrowableColorConfigurationWriter";
import type {ColorSettingChange} from "@throwable-highlighter/settings/ThrowableColorSettingsDraft";

test("does not write configuration when there are no changes", async () => {
    const fixture = createConfiguration();

    const result = await new ThrowableColorConfigurationWriter().write(fixture.configuration, "user", []);

    assert.deepEqual(result, {kind: "success", written: []});
    assert.deepEqual(fixture.calls, []);
});

test("writes all context keys to the selected target without language overrides", async () => {
    const changes = [
        {context: "class", field: "source", value: "native"},
        {context: "class", field: "color", value: "#123"},
        {context: "import", field: "source", value: "inherit"},
        {context: "import", field: "color", value: "#1234"},
        {context: "catch", field: "source", value: "custom"},
        {context: "catch", field: "color", value: "#123456"},
        {context: "throws", field: "source", value: "custom"},
        {context: "throws", field: "color", value: "#12345678"}
    ] as const;

    for (const [target, configurationTarget] of [
        ["user", vscode.ConfigurationTarget.Global],
        ["workspace", vscode.ConfigurationTarget.Workspace]
    ] as const) {
        const fixture = createConfiguration();

        const result = await new ThrowableColorConfigurationWriter().write(fixture.configuration, target, changes);

        assert.deepEqual(result, {kind: "success", written: changes});
        assert.deepEqual(
            fixture.calls,
            [
                ["classColorSource", "native", configurationTarget, false],
                ["classColor", "#123", configurationTarget, false],
                ["importColorSource", "inherit", configurationTarget, false],
                ["importColor", "#1234", configurationTarget, false],
                ["catchColorSource", "custom", configurationTarget, false],
                ["catchColor", "#123456", configurationTarget, false],
                ["throwsColorSource", "custom", configurationTarget, false],
                ["throwsColor", "#12345678", configurationTarget, false]
            ],
            target
        );
    }
});

test("preserves removal, empty strings and the exact color representation", async () => {
    const fixture = createConfiguration();
    const changes = [
        {context: "class", field: "source", value: undefined},
        {context: "import", field: "color", value: undefined},
        {context: "catch", field: "color", value: ""},
        {context: "throws", field: "color", value: " #AbCdEf80 "}
    ] as const;
    const before = structuredClone(changes);

    const result = await new ThrowableColorConfigurationWriter().write(fixture.configuration, "user", changes);

    assert.deepEqual(result, {kind: "success", written: changes});
    assert.deepEqual(fixture.calls, [
        ["classColorSource", undefined, vscode.ConfigurationTarget.Global, false],
        ["importColor", undefined, vscode.ConfigurationTarget.Global, false],
        ["catchColor", "", vscode.ConfigurationTarget.Global, false],
        ["throwsColor", " #AbCdEf80 ", vscode.ConfigurationTarget.Global, false]
    ]);
    assert.deepEqual(changes, before);
});

test("waits for each write and keeps the captured changes across asynchronous calls", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
        release = resolve;
    });
    const fixture = createConfiguration(index => (index === 0 ? gate : undefined));
    const changes = [
        {context: "class", field: "color", value: "#111111"},
        {context: "catch", field: "color", value: "#222222"}
    ] satisfies ColorSettingChange[];
    const expected = structuredClone(changes);

    const writing = new ThrowableColorConfigurationWriter().write(fixture.configuration, "workspace", changes);
    const callsBeforeRelease = fixture.calls.length;

    changes[0].value = "#ABCDEF";
    changes.splice(1, 1);
    release();

    const result = await writing;

    assert.equal(callsBeforeRelease, 1);
    assert.deepEqual(result, {kind: "success", written: expected});
    assert.deepEqual(fixture.calls, [
        ["classColor", "#111111", vscode.ConfigurationTarget.Workspace, false],
        ["catchColor", "#222222", vscode.ConfigurationTarget.Workspace, false]
    ]);
});

test("reports partial writes and stops after the first rejected update", async () => {
    const error = new Error("Unable to update settings.");
    const fixture = createConfiguration(index => {
        if (index === 1) {
            throw error;
        }
    });
    const changes = [
        {context: "class", field: "color", value: "#111111"},
        {context: "catch", field: "color", value: "#222222"},
        {context: "throws", field: "color", value: "#333333"}
    ] as const;

    const result = await new ThrowableColorConfigurationWriter().write(fixture.configuration, "workspace", changes);

    assert.deepEqual(result, {
        kind: "failed",
        written: [changes[0]],
        failed: changes[1],
        pending: [changes[2]],
        error
    });
    assert.deepEqual(fixture.calls, [
        ["classColor", "#111111", vscode.ConfigurationTarget.Workspace, false],
        ["catchColor", "#222222", vscode.ConfigurationTarget.Workspace, false]
    ]);
});

test("reports synchronous errors before any successful write", async () => {
    const error = "Configuration is unavailable.";
    const configuration: Pick<vscode.WorkspaceConfiguration, "update"> = {
        update() {
            throw error;
        }
    };
    const changes = [
        {context: "class", field: "color", value: "#111111"},
        {context: "catch", field: "color", value: "#222222"}
    ] as const;

    const result = await new ThrowableColorConfigurationWriter().write(configuration, "user", changes);

    assert.deepEqual(result, {
        kind: "failed",
        written: [],
        failed: changes[0],
        pending: [changes[1]],
        error
    });
});

function createConfiguration(onUpdate: (index: number) => Promise<void> | void = () => {}) {
    const calls: Parameters<vscode.WorkspaceConfiguration["update"]>[] = [];
    const configuration: Pick<vscode.WorkspaceConfiguration, "update"> = {
        async update(...args) {
            calls.push(args);
            await onUpdate(calls.length - 1);
        }
    };

    return {configuration, calls};
}
