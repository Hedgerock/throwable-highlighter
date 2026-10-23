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

function createSettings(overrides: Partial<RawThrowableColorSettings> = {}): RawThrowableColorSettings {
    return {
        class: {source: undefined, color: undefined},
        import: {source: undefined, color: undefined},
        catch: {source: undefined, color: undefined},
        throws: {source: undefined, color: undefined},
        ...overrides
    };
}
