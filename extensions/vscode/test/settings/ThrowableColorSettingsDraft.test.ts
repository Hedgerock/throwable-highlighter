import assert from "node:assert/strict";
import {test} from "node:test";

import {ThrowableColorSettingsDraft} from "@throwable-highlighter/settings/ThrowableColorSettingsDraft";
import type {RawThrowableColorSettings} from "@throwable-highlighter/settings/ThrowableColorConfiguration";

test("starts with an unchanged draft for the selected target", () => {
    const settings = createSettings();
    const draft = new ThrowableColorSettingsDraft("user", settings);

    assert.equal(draft.target, "user");
    assert.equal(draft.isDirty, false);
    assert.deepEqual(draft.read(), settings);
    assert.deepEqual(draft.getChanges(), []);
});

test("tracks only changed fields without filling partial target settings", () => {
    const draft = new ThrowableColorSettingsDraft("workspace", createSettings());

    draft.update("catch", "source", "custom");

    assert.equal(draft.isDirty, true);
    assert.deepEqual(draft.getChanges(), [{context: "catch", field: "source", value: "custom"}]);
    assert.deepEqual(draft.read(), {
        ...createSettings(),
        catch: {source: "custom", color: undefined}
    });
});

test("preserves the own color when switching sources and removes reverted changes", () => {
    const draft = new ThrowableColorSettingsDraft(
        "user",
        createSettings({
            catch: {source: "custom", color: " #123456 "}
        })
    );

    for (const source of ["native", "inherit"]) {
        draft.update("catch", "source", source);

        assert.deepEqual(draft.read().catch, {source, color: " #123456 "});
        assert.deepEqual(draft.getChanges(), [{context: "catch", field: "source", value: source}]);
    }

    draft.update("catch", "source", "custom");

    assert.equal(draft.isDirty, false);
    assert.deepEqual(draft.getChanges(), []);
});

test("does not mark an unchanged value as dirty", () => {
    const draft = new ThrowableColorSettingsDraft(
        "user",
        createSettings({class: {source: "custom", color: "#123456"}})
    );

    draft.update("class", "source", "custom");
    draft.update("class", "color", "#123456");

    assert.equal(draft.isDirty, false);
    assert.deepEqual(draft.getChanges(), []);
});

test("keeps incomplete color input without normalizing or validating it", () => {
    const draft = new ThrowableColorSettingsDraft("user", createSettings());

    draft.update("class", "color", " #12 ");

    assert.deepEqual(draft.read().class, {source: undefined, color: " #12 "});
    assert.deepEqual(draft.getChanges(), [{context: "class", field: "color", value: " #12 "}]);
});

test("distinguishes removing a setting from an explicit null source", () => {
    const draft = new ThrowableColorSettingsDraft(
        "workspace",
        createSettings({
            catch: {source: null, color: "#123456"}
        })
    );

    draft.update("catch", "source", undefined);
    draft.update("catch", "color", undefined);

    assert.deepEqual(draft.getChanges(), [
        {context: "catch", field: "source", value: undefined},
        {context: "catch", field: "color", value: undefined}
    ]);

    draft.update("catch", "source", null);

    assert.deepEqual(draft.getChanges(), [
        {
            context: "catch",
            field: "color",
            value: undefined
        }
    ]);
});

test("discards changes and returns to the initial target values", () => {
    const settings = createSettings({import: {source: null, color: "red"}});
    const draft = new ThrowableColorSettingsDraft("user", settings);

    draft.update("import", "source", "native");
    draft.update("throws", "color", "#123456");
    draft.discard();
    draft.discard();

    assert.equal(draft.isDirty, false);
    assert.deepEqual(draft.read(), settings);
    assert.deepEqual(draft.getChanges(), []);
    assert.deepEqual(settings, createSettings({import: {source: null, color: "red"}}));
});

test("copies setting containers when accepting and returning snapshots", () => {
    const settings = {
        ...createSettings(),
        class: {source: "custom", color: "#123456"}
    };
    const draft = new ThrowableColorSettingsDraft("user", settings);
    settings.class.color = "#654321";

    const snapshot = draft.read();

    Object.assign(snapshot.class, {source: "native", color: "red"});
    Object.assign(snapshot, {catch: {source: "custom", color: "#ABCDEF"}});

    assert.deepEqual(draft.read().class, {source: "custom", color: "#123456"});
    assert.deepEqual(draft.read().catch, {source: undefined, color: undefined});
    assert.equal(draft.isDirty, false);
});

test("keeps User and Workspace drafts independent", () => {
    const userSettings = createSettings({
        class: {source: "native", color: "#123456"}
    });
    const workspaceSettings = createSettings();
    const userDraft = new ThrowableColorSettingsDraft("user", userSettings);
    const workspaceDraft = new ThrowableColorSettingsDraft("workspace", workspaceSettings);

    workspaceDraft.update("class", "source", "custom");

    assert.equal(userDraft.target, "user");
    assert.equal(workspaceDraft.target, "workspace");
    assert.equal(userDraft.isDirty, false);
    assert.deepEqual(userDraft.read(), userSettings);
    assert.deepEqual(workspaceDraft.read().class, {source: "custom", color: undefined});
    assert.deepEqual(workspaceSettings, createSettings());
});

test("reverts one field to its saved value while preserving other edits", () => {
    const settings = createSettings({class: {source: "custom", color: "#123456"}});
    const draft = new ThrowableColorSettingsDraft("user", settings);

    draft.update("class", "color", "#ABCDEF");
    draft.update("catch", "source", "native");
    draft.revertField("class", "color", "#123456");

    assert.deepEqual(draft.read().class, settings.class);
    assert.deepEqual(draft.getChanges(), [{context: "catch", field: "source", value: "native"}]);
    assert.deepEqual(settings.class, {source: "custom", color: "#123456"});
});

test("uses the latest saved field value as its baseline", () => {
    const draft = new ThrowableColorSettingsDraft(
        "user",
        createSettings({class: {source: "custom", color: "#123456"}})
    );

    draft.update("class", "color", "#ABCDEF");
    draft.revertField("class", "color", "#654321");

    assert.equal(draft.isDirty, false);
    assert.deepEqual(draft.read().class, {source: "custom", color: "#654321"});

    draft.update("class", "color", "#123456");

    assert.deepEqual(draft.getChanges(), [{context: "class", field: "color", value: "#123456"}]);

    draft.discard();

    assert.deepEqual(draft.read().class, {source: "custom", color: "#654321"});
});

test("preserves absent, null and invalid saved values when reverting a field", () => {
    for (const value of [undefined, null, false, 42, "", {value: "unknown"}]) {
        const draft = new ThrowableColorSettingsDraft("user", createSettings());

        draft.update("catch", "source", "custom");
        draft.revertField("catch", "source", value);

        assert.equal(draft.isDirty, false);
        assert.equal(draft.read().catch.source, value);
    }
});

test("uses saved settings as the clean baseline after a successful apply", () => {
    const draft = new ThrowableColorSettingsDraft(
        "user",
        createSettings({class: {source: "custom", color: "#111111"}})
    );
    draft.update("class", "color", "#222222");
    const saved = createSettings({class: {source: "custom", color: "#222222"}});

    draft.rebase(saved, []);

    assert.equal(draft.isDirty, false);
    assert.deepEqual(draft.getChanges(), []);
    assert.deepEqual(draft.read(), saved);

    draft.update("class", "color", "#333333");
    draft.discard();

    assert.deepEqual(draft.read(), saved);
});

test("retains only unapplied changes over the latest saved settings", () => {
    const draft = new ThrowableColorSettingsDraft(
        "user",
        createSettings({
            class: {source: "custom", color: "#111111"},
            catch: {source: "custom", color: "#111111"}
        })
    );
    draft.update("class", "color", "#222222");
    draft.update("catch", "color", "#333333");
    const saved = createSettings({
        class: {source: "custom", color: "#444444"},
        import: {source: "native", color: "#666666"},
        catch: {source: "custom", color: "#555555"}
    });
    const retained = [{context: "catch", field: "color", value: "#333333"}] as const;

    draft.rebase(saved, retained);

    assert.equal(draft.isDirty, true);
    assert.deepEqual(draft.getChanges(), retained);
    assert.deepEqual(draft.read(), {...saved, catch: {source: "custom", color: "#333333"}});

    draft.discard();

    assert.equal(draft.isDirty, false);
    assert.deepEqual(draft.read(), saved);
});

test("preserves incomplete text, removals and empty strings when rebasing", () => {
    const draft = new ThrowableColorSettingsDraft("workspace", createSettings());
    const saved = createSettings({
        class: {source: "custom", color: "#111111"},
        import: {source: "custom", color: "#222222"},
        catch: {source: null, color: "#333333"},
        throws: {source: "native", color: "#444444"}
    });
    const retained = [
        {context: "class", field: "color", value: " #12 "},
        {context: "import", field: "color", value: undefined},
        {context: "catch", field: "color", value: ""},
        {context: "throws", field: "source", value: undefined}
    ] as const;

    draft.rebase(saved, retained);

    assert.equal(draft.target, "workspace");
    assert.deepEqual(draft.getChanges(), retained);
    assert.deepEqual(draft.read(), {
        class: {source: "custom", color: " #12 "},
        import: {source: "custom", color: undefined},
        catch: {source: null, color: ""},
        throws: {source: undefined, color: "#444444"}
    });

    draft.discard();

    assert.deepEqual(draft.read(), saved);
});

test("does not keep changes that already match the new baseline", () => {
    const draft = new ThrowableColorSettingsDraft("user", createSettings());
    const saved = createSettings({catch: {source: "custom", color: "#333333"}});

    draft.rebase(saved, [{context: "catch", field: "color", value: "#333333"}]);

    assert.equal(draft.isDirty, false);
    assert.deepEqual(draft.getChanges(), []);
    assert.deepEqual(draft.read(), saved);
});

test("copies rebase inputs without sharing their setting containers", () => {
    const draft = new ThrowableColorSettingsDraft("user", createSettings());
    const saved = {...createSettings(), class: {source: "custom", color: "#111111"}};
    const retained = [{context: "catch", field: "color", value: "#333333"}] as const;

    draft.rebase(saved, retained);

    saved.class.color = "#222222";
    Object.assign(retained[0], {value: "#444444"});
    const current = draft.read();
    Object.assign(current.class, {color: "#555555"});
    Object.assign(current.catch, {color: "#666666"});

    assert.deepEqual(draft.read().class, {source: "custom", color: "#111111"});
    assert.deepEqual(draft.read().catch, {source: undefined, color: "#333333"});

    draft.discard();

    assert.deepEqual(draft.read().class, {source: "custom", color: "#111111"});
    assert.deepEqual(draft.read().catch, {source: undefined, color: undefined});
});

function createSettings(overrides: Partial<RawThrowableColorSettings> = {}): RawThrowableColorSettings {
    return {
        class: {source: undefined, color: undefined},
        import: {source: undefined, color: undefined},
        catch: {source: undefined, color: undefined},
        throws: {source: undefined, color: undefined},
        ...overrides
    };
}
