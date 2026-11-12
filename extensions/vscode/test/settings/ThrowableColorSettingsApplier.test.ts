import assert from "node:assert/strict";
import {test} from "node:test";

import * as vscode from "vscode";

import {ThrowableColorSettingsApplier} from "@throwable-highlighter/settings/ThrowableColorSettingsApplier";

type Values = Record<string, unknown>;

test("writes the requested target and reads a fresh snapshot after saving", async () => {
    const fixture = createConfiguration({
        user: {classColorSource: "custom", classColor: "#111111"},
        workspace: {classColorSource: "native", classColor: "#333333"}
    });
    const changes = [
        {context: "class", field: "color", value: "#222222"},
        {context: "catch", field: "source", value: "inherit"}
    ] as const;
    const before = structuredClone(fixture.workspace);

    const result = await new ThrowableColorSettingsApplier().apply(fixture.getConfiguration, "user", changes);

    assert.ok(result.kind === "success");
    assert.deepEqual(result.written, changes);
    assert.deepEqual(result.snapshot.user.class, {source: "custom", color: "#222222"});
    assert.deepEqual(result.snapshot.user.catch, {source: "inherit", color: undefined});
    assert.deepEqual(result.snapshot.effective.class, {
        kind: "valid",
        setting: {source: "native", color: "#333333"}
    });
    assert.deepEqual(fixture.workspace, before);
    assert.deepEqual(fixture.reads, [0, 2]);
});

test("skips values already stored in the selected target rather than comparing effective values", async () => {
    const fixture = createConfiguration({
        user: {classColor: "#111111"},
        workspace: {classColor: "#222222"}
    });

    const result = await new ThrowableColorSettingsApplier().apply(fixture.getConfiguration, "user", [
        {context: "class", field: "color", value: "#111111"},
        {context: "catch", field: "color", value: undefined}
    ]);

    assert.ok(result.kind === "success");
    assert.deepEqual(result.written, []);
    assert.deepEqual(result.snapshot.effective.class, {kind: "valid", setting: {color: "#222222"}});
    assert.deepEqual(fixture.calls, []);
    assert.deepEqual(fixture.reads, [0]);
});

test("validates all requested changes before writing any value", async () => {
    const fixture = createConfiguration({
        user: {classColorSource: "custom", classColor: "#111111"},
        workspace: {catchColorSource: "native", catchColor: "#333333"}
    });

    const result = await new ThrowableColorSettingsApplier().apply(fixture.getConfiguration, "user", [
        {context: "class", field: "color", value: "#222222"},
        {context: "catch", field: "color", value: "#12"}
    ]);

    assert.ok(result.kind === "invalid");
    assert.deepEqual(result.issues, [{context: "catch", field: "color", reason: "invalid-color"}]);
    assert.equal(fixture.user.classColor, "#111111");
    assert.deepEqual(fixture.calls, []);
    assert.deepEqual(fixture.reads, [0]);
});

test("validates requested values even when they already match saved invalid settings", async () => {
    const fixture = createConfiguration({user: {classColor: "#12"}});

    const result = await new ThrowableColorSettingsApplier().apply(fixture.getConfiguration, "user", [
        {context: "class", field: "color", value: "#12"}
    ]);

    assert.ok(result.kind === "invalid");
    assert.deepEqual(result.issues, [{context: "class", field: "color", reason: "invalid-color"}]);
    assert.deepEqual(fixture.calls, []);
});

test("uses current lower-level values when enabling a Workspace custom source", async () => {
    const fixture = createConfiguration({user: {catchColor: "#111111"}});
    const previous = fixture.getConfiguration();
    fixture.user.catchColor = "#ABCDEF";

    const result = await new ThrowableColorSettingsApplier().apply(fixture.getConfiguration, "workspace", [
        {context: "catch", field: "source", value: "custom"}
    ]);

    assert.equal(previous.get("catchColor"), "#111111");
    assert.ok(result.kind === "success");
    assert.deepEqual(result.snapshot.workspace.catch, {source: "custom", color: undefined});
    assert.deepEqual(result.snapshot.effective.catch, {
        kind: "valid",
        setting: {source: "custom", color: "#ABCDEF"}
    });
    assert.equal(fixture.user.catchColor, "#ABCDEF");
});

test("returns the actual snapshot after a partial write failure", async () => {
    const error = new Error("Unable to update catch color.");
    const fixture = createConfiguration({user: {catchColor: "#555555"}}, index => {
        if (index === 1) {
            throw error;
        }
    });
    const changes = [
        {context: "class", field: "color", value: "#111111"},
        {context: "catch", field: "color", value: "#222222"},
        {context: "throws", field: "color", value: "#333333"}
    ] as const;

    const result = await new ThrowableColorSettingsApplier().apply(fixture.getConfiguration, "user", changes);

    assert.ok(result.kind === "write-failed");
    assert.deepEqual(result.writeResult, {
        kind: "failed",
        written: [changes[0]],
        failed: changes[1],
        pending: [changes[2]],
        error
    });
    assert.deepEqual(result.snapshot.user.class, {source: undefined, color: "#111111"});
    assert.deepEqual(result.snapshot.user.catch, {source: undefined, color: "#555555"});
    assert.deepEqual(result.snapshot.user.throws, {source: undefined, color: undefined});
    assert.deepEqual(fixture.reads, [0, 2]);
});

test("reports a configuration read failure before writing", async () => {
    const error = new Error("Configuration is unavailable.");

    const result = await new ThrowableColorSettingsApplier().apply(
        () => {
            throw error;
        },
        "user",
        [{context: "class", field: "color", value: "#111111"}]
    );

    assert.deepEqual(result, {kind: "read-failed", stage: "before-write", error});
});

test("preserves a successful write result when reading the saved configuration fails", async () => {
    const fixture = createConfiguration();
    const error = new Error("Unable to read saved settings.");
    let reads = 0;
    const getConfiguration = () => {
        if (reads++ > 0) {
            throw error;
        }
        return fixture.getConfiguration();
    };
    const changes = [{context: "class", field: "color", value: "#111111"}] as const;

    const result = await new ThrowableColorSettingsApplier().apply(getConfiguration, "user", changes);

    assert.deepEqual(result, {
        kind: "read-failed",
        stage: "after-write",
        writeResult: {kind: "success", written: changes},
        error
    });
    assert.equal(fixture.user.classColor, "#111111");
});

test("preserves both errors when a write and the following read fail", async () => {
    const writeError = new Error("Unable to write settings.");
    const readError = new Error("Unable to read settings.");
    const fixture = createConfiguration({}, () => {
        throw writeError;
    });
    let reads = 0;
    const getConfiguration = () => {
        if (reads++ > 0) {
            throw readError;
        }
        return fixture.getConfiguration();
    };
    const changes = [
        {context: "class", field: "color", value: "#111111"},
        {context: "catch", field: "color", value: "#222222"}
    ] as const;

    const result = await new ThrowableColorSettingsApplier().apply(getConfiguration, "user", changes);

    assert.deepEqual(result, {
        kind: "read-failed",
        stage: "after-write",
        writeResult: {
            kind: "failed",
            written: [],
            failed: changes[0],
            pending: [changes[1]],
            error: writeError
        },
        error: readError
    });
});

function createConfiguration(
    values: {defaults?: Values; user?: Values; workspace?: Values} = {},
    onUpdate: (index: number) => Promise<void> | void = () => {}
) {
    const defaults = {classColor: "", importColor: "", catchColor: "", throwsColor: "", ...values.defaults};
    const user = {...values.user};
    const workspace = {...values.workspace};
    const calls: Parameters<vscode.WorkspaceConfiguration["update"]>[] = [];
    const reads: number[] = [];

    const getConfiguration = (): Pick<vscode.WorkspaceConfiguration, "get" | "inspect" | "update"> => {
        reads.push(calls.length);
        const capturedDefaults: Values = {...defaults};
        const capturedUser = {...user};
        const capturedWorkspace = {...workspace};

        return {
            get<T>(key: string, defaultValue?: T): T {
                const value =
                    capturedWorkspace[key] !== undefined
                        ? capturedWorkspace[key]
                        : capturedUser[key] !== undefined
                          ? capturedUser[key]
                          : capturedDefaults[key];

                return (value === undefined ? defaultValue : value) as T;
            },
            inspect<T>(key: string) {
                return {
                    key,
                    defaultValue: capturedDefaults[key] as T | undefined,
                    globalValue: capturedUser[key] as T | undefined,
                    workspaceValue: capturedWorkspace[key] as T | undefined
                };
            },
            async update(...args) {
                calls.push(args);
                await onUpdate(calls.length - 1);
                const [key, value, target] = args;
                assert.ok(
                    target === vscode.ConfigurationTarget.Global || target === vscode.ConfigurationTarget.Workspace
                );
                const layer = target === vscode.ConfigurationTarget.Global ? user : workspace;

                if (value === undefined) {
                    delete layer[key];
                } else {
                    layer[key] = value;
                }
            }
        };
    };

    return {getConfiguration, calls, reads, user, workspace};
}
