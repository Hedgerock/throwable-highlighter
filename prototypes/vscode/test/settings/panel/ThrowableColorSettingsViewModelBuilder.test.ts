import assert from "node:assert/strict";
import {test} from "node:test";

import {ThrowableColorSettingsViewModelBuilder} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsViewModelBuilder";
import type {
    ParsedThrowableColorSettings,
    RawThrowableColorSettings,
    ThrowableColorConfigurationSnapshot
} from "@throwable-highlighter/settings/ThrowableColorConfiguration";

test("selects User values regardless of Workspace availability", async context => {
    for (const workspaceAvailable of [false, true]) {
        await context.test(workspaceAvailable ? "workspace available" : "workspace unavailable", () => {
            const snapshot = createSnapshot();

            const model = new ThrowableColorSettingsViewModelBuilder().build(snapshot, "user", workspaceAvailable);

            assert.deepEqual(model, {
                target: "user",
                workspaceAvailable,
                scoped: snapshot.user,
                effective: snapshot.effective
            });
        });
    }
});

test("selects Workspace values when Workspace is available", () => {
    const snapshot = createSnapshot();

    const model = new ThrowableColorSettingsViewModelBuilder().build(snapshot, "workspace", true);

    assert.deepEqual(model, {
        target: "workspace",
        workspaceAvailable: true,
        scoped: snapshot.workspace,
        effective: snapshot.effective
    });
});

test("falls back to User when the requested Workspace is unavailable", () => {
    const snapshot = createSnapshot();

    const model = new ThrowableColorSettingsViewModelBuilder().build(snapshot, "workspace", false);

    assert.deepEqual(model, {
        target: "user",
        workspaceAvailable: false,
        scoped: snapshot.user,
        effective: snapshot.effective
    });
});

test("does not fill partial scope settings with effective values", () => {
    const snapshot = createSnapshot({
        effective: {
            class: {kind: "valid", setting: {source: "custom", color: "#123456"}}
        },
        user: {
            class: {source: undefined, color: "#123456"}
        },
        workspace: {
            class: {source: "custom", color: undefined}
        }
    });

    const model = new ThrowableColorSettingsViewModelBuilder().build(snapshot, "workspace", true);

    assert.deepEqual(model.scoped.class, {source: "custom", color: undefined});
    assert.deepEqual(model.effective.class, {
        kind: "valid",
        setting: {source: "custom", color: "#123456"}
    });
});

test("preserves missing, null, empty and invalid raw values", () => {
    const snapshot = createSnapshot({
        workspace: {
            class: {source: null, color: ""},
            import: {source: undefined, color: undefined},
            catch: {source: false, color: 42},
            throws: {source: "unknown", color: {value: "#123456"}}
        }
    });

    const expected = structuredClone(snapshot.workspace);

    const model = new ThrowableColorSettingsViewModelBuilder().build(snapshot, "workspace", true);

    assert.deepEqual(model.scoped, expected);
});

test("preserves effective configuration validation errors", () => {
    const snapshot = createSnapshot({
        effective: {
            class: {kind: "invalid", reason: "class-inheritance"},
            import: {kind: "invalid", reason: "invalid-source"},
            catch: {kind: "invalid", reason: "invalid-color"},
            throws: {kind: "invalid", reason: "invalid-color"}
        }
    });

    const expected = structuredClone(snapshot.effective);

    const model = new ThrowableColorSettingsViewModelBuilder().build(snapshot, "user", true);

    assert.deepEqual(model.effective, expected);
});

test("does not modify the configuration snapshot", () => {
    const snapshot = createSnapshot();
    const initial = structuredClone(snapshot);
    const builder = new ThrowableColorSettingsViewModelBuilder();

    builder.build(snapshot, "workspace", false);
    builder.build(snapshot, "workspace", true);
    builder.build(snapshot, "user", true);

    assert.deepEqual(snapshot, initial);
});

function createSnapshot(
    overrides: {
        effective?: Partial<ParsedThrowableColorSettings>;
        user?: Partial<RawThrowableColorSettings>;
        workspace?: Partial<RawThrowableColorSettings>;
    } = {}
): ThrowableColorConfigurationSnapshot {
    return {
        effective: {
            class: {kind: "valid", setting: {source: "custom", color: "#654321"}},
            import: {kind: "valid", setting: {color: undefined}},
            catch: {kind: "valid", setting: {color: undefined}},
            throws: {kind: "valid", setting: {color: undefined}},
            ...overrides.effective
        },
        defaults: createSettings(),
        user: createSettings({
            class: {source: "custom", color: "#123456"},
            ...overrides.user
        }),
        workspace: createSettings({
            class: {source: undefined, color: "#654321"},
            ...overrides.workspace
        })
    };
}

function createSettings(overrides: Partial<RawThrowableColorSettings> = {}): RawThrowableColorSettings {
    return {
        class: {source: undefined, color: undefined},
        import: {source: undefined, color: undefined},
        catch: {source: undefined, color: undefined},
        throws: {source: undefined, color: undefined},
        ...overrides
    };
}
