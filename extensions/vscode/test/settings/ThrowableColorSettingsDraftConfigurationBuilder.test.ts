import assert from "node:assert/strict";
import {test} from "node:test";

import {ThrowableColorSettingsPreviewBuilder} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsPreviewBuilder";
import {ThrowableColorSettingsDraft} from "@throwable-highlighter/settings/ThrowableColorSettingsDraft";
import {ThrowableColorSettingsDraftConfigurationBuilder} from "@throwable-highlighter/settings/ThrowableColorSettingsDraftConfigurationBuilder";
import type {
    RawThrowableColorSettings,
    ThrowableColorConfigurationSnapshot
} from "@throwable-highlighter/settings/ThrowableColorConfiguration";

test("merges source and color independently across configuration layers", () => {
    const snapshot = createSnapshot({
        defaults: {
            class: {source: "custom", color: "#111111"},
            throws: {source: undefined, color: "#AAAAAA"}
        },
        user: {
            class: {source: undefined, color: "#222222"},
            throws: {source: "custom", color: undefined}
        },
        workspace: {
            class: {source: "native", color: undefined},
            throws: {source: undefined, color: "#BBBBBB"}
        }
    });

    const settings = new ThrowableColorSettingsDraftConfigurationBuilder().build(snapshot, "user", []);

    assert.deepEqual(settings.class, {kind: "valid", setting: {source: "native", color: "#222222"}});
    assert.deepEqual(settings.throws, {kind: "valid", setting: {source: "custom", color: "#BBBBBB"}});
});

test("keeps Workspace overrides when editing User settings", () => {
    const snapshot = createSnapshot({
        user: {class: {source: "custom", color: "#111111"}},
        workspace: {class: {source: undefined, color: "#222222"}}
    });

    const settings = new ThrowableColorSettingsDraftConfigurationBuilder().build(snapshot, "user", [
        {context: "class", field: "color", value: "#333333"}
    ]);

    assert.deepEqual(settings.class, {kind: "valid", setting: {source: "custom", color: "#222222"}});
});

test("falls back to User and defaults when Workspace fields are removed", () => {
    const snapshot = createSnapshot({
        defaults: {class: {source: "custom", color: "#111111"}},
        user: {class: {source: undefined, color: "#222222"}},
        workspace: {class: {source: "native", color: "#333333"}}
    });

    const settings = new ThrowableColorSettingsDraftConfigurationBuilder().build(snapshot, "workspace", [
        {context: "class", field: "source", value: undefined},
        {context: "class", field: "color", value: undefined}
    ]);

    assert.deepEqual(settings.class, {kind: "valid", setting: {source: "custom", color: "#222222"}});
});

test("falls back to defaults when a User field is removed", () => {
    const snapshot = createSnapshot({
        defaults: {class: {source: "custom", color: "#111111"}},
        user: {class: {source: undefined, color: "#222222"}}
    });

    const settings = new ThrowableColorSettingsDraftConfigurationBuilder().build(snapshot, "user", [
        {context: "class", field: "color", value: undefined}
    ]);

    assert.deepEqual(settings.class, {kind: "valid", setting: {source: "custom", color: "#111111"}});
});

test("preserves explicit null and empty strings as overrides", () => {
    const snapshot = createSnapshot({
        user: {class: {source: "custom", color: "#123456"}}
    });

    const settings = new ThrowableColorSettingsDraftConfigurationBuilder().build(snapshot, "workspace", [
        {context: "class", field: "source", value: null},
        {context: "class", field: "color", value: ""}
    ]);

    assert.deepEqual(settings.class, {kind: "valid", setting: {color: ""}});

    const invalid = new ThrowableColorSettingsDraftConfigurationBuilder().build(snapshot, "workspace", [
        {context: "class", field: "color", value: null}
    ]);

    assert.deepEqual(invalid.class, {kind: "invalid", reason: "invalid-color"});
});

test("returns parsing errors for invalid draft values", () => {
    const snapshot = createSnapshot({
        user: {class: {source: "custom", color: "#123456"}}
    });

    const settings = new ThrowableColorSettingsDraftConfigurationBuilder().build(snapshot, "workspace", [
        {context: "class", field: "source", value: "inherit"},
        {context: "import", field: "source", value: "custom"},
        {context: "import", field: "color", value: "#12"},
        {context: "catch", field: "source", value: false}
    ]);

    assert.deepEqual(settings.class, {kind: "invalid", reason: "class-inheritance"});
    assert.deepEqual(settings.import, {kind: "invalid", reason: "invalid-color"});
    assert.deepEqual(settings.catch, {kind: "invalid", reason: "invalid-source"});
});

test("preserves current saved fields and inputs when applying draft changes", () => {
    const draft = new ThrowableColorSettingsDraft(
        "workspace",
        createSettings({catch: {source: "inherit", color: "#456789"}})
    );
    draft.update("class", "color", "#789ABC");

    const snapshot = createSnapshot({
        user: {class: {source: "custom", color: "#123456"}},
        workspace: {catch: {source: "inherit", color: "#ABCDEF"}}
    });
    const changes = draft.getChanges();
    const before = structuredClone({snapshot, changes, draft: draft.read()});

    const settings = new ThrowableColorSettingsDraftConfigurationBuilder().build(snapshot, draft.target, changes);
    const preview = new ThrowableColorSettingsPreviewBuilder().build(settings);

    assert.deepEqual(settings.catch, {kind: "valid", setting: {source: "inherit", color: "#ABCDEF"}});
    assert.deepEqual(preview.catch, {kind: "color", color: "#789ABC"});
    assert.deepEqual({snapshot, changes, draft: draft.read()}, before);
});

test("exposes invalid User changes hidden by Workspace overrides", () => {
    const builder = new ThrowableColorSettingsDraftConfigurationBuilder();
    const snapshot = createSnapshot({
        user: {class: {source: "custom", color: "#111111"}},
        workspace: {class: {source: "native", color: "#222222"}}
    });

    for (const change of [
        {context: "class", field: "color", value: "#12"},
        {context: "class", field: "source", value: "inherit"}
    ] as const) {
        const changes = [change];
        const effective = builder.build(snapshot, "user", changes);
        const scoped = builder.buildForTarget(snapshot, "user", changes);

        assert.deepEqual(effective.class, {
            kind: "valid",
            setting: {source: "native", color: "#222222"}
        });
        assert.deepEqual(scoped.class, {
            kind: "invalid",
            reason: change.field === "color" ? "invalid-color" : "class-inheritance"
        });
    }
});

test("falls back to defaults without Workspace values when removing a User setting", () => {
    const builder = new ThrowableColorSettingsDraftConfigurationBuilder();
    const snapshot = createSnapshot({
        defaults: {class: {source: "custom", color: "#111111"}},
        user: {class: {source: undefined, color: "#222222"}},
        workspace: {class: {source: "native", color: "#333333"}}
    });
    const changes = [{context: "class", field: "color", value: undefined}] as const;
    const before = structuredClone({snapshot, changes});

    const settings = builder.buildForTarget(snapshot, "user", changes);

    assert.deepEqual(settings.class, {kind: "valid", setting: {source: "custom", color: "#111111"}});
    assert.deepEqual({snapshot, changes}, before);
});

test("includes User values and removes Workspace overrides for target validation", () => {
    const builder = new ThrowableColorSettingsDraftConfigurationBuilder();
    const snapshot = createSnapshot({
        defaults: {class: {source: "native", color: "#111111"}},
        user: {class: {source: "custom", color: "#222222"}},
        workspace: {class: {source: "native", color: "#333333"}}
    });
    const changes = [
        {context: "class", field: "source", value: undefined},
        {context: "class", field: "color", value: undefined}
    ] as const;
    const before = structuredClone({snapshot, changes});

    const settings = builder.buildForTarget(snapshot, "workspace", changes);

    assert.deepEqual(settings.class, {kind: "valid", setting: {source: "custom", color: "#222222"}});
    assert.deepEqual(settings, builder.build(snapshot, "workspace", changes));
    assert.deepEqual({snapshot, changes}, before);
});

function createSnapshot(
    overrides: {
        defaults?: Partial<RawThrowableColorSettings>;
        user?: Partial<RawThrowableColorSettings>;
        workspace?: Partial<RawThrowableColorSettings>;
    } = {}
): ThrowableColorConfigurationSnapshot {
    return {
        effective: {
            class: {kind: "valid", setting: {color: undefined}},
            import: {kind: "valid", setting: {color: undefined}},
            catch: {kind: "valid", setting: {color: undefined}},
            throws: {kind: "valid", setting: {color: undefined}}
        },
        defaults: createSettings(overrides.defaults),
        user: createSettings(overrides.user),
        workspace: createSettings(overrides.workspace)
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
