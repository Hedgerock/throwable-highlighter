import assert from "node:assert/strict";

import * as vscode from "vscode";

import {ThrowableHighlightingContext} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingContext";
import {ThrowableColorConfigurationReader} from "@throwable-highlighter/settings/ThrowableColorConfigurationReader";
import {ThrowableColorConfigurationWriter} from "@throwable-highlighter/settings/ThrowableColorConfigurationWriter";
import type {
    ColorSettingChange,
    ColorSettingsTarget
} from "@throwable-highlighter/settings/ThrowableColorSettingsDraft";

suite("Color configuration", () => {
    test("writes, reads and removes User settings", async () => {
        await assertConfigurationTrip("user");
    });

    test("writes, reads and removes Workspace settings", async () => {
        await assertConfigurationTrip("workspace");
    });

    test("merges Workspace overrides per key and falls back to User settings", async () => {
        const reader = new ThrowableColorConfigurationReader();
        const before = reader.read(getConfiguration());
        const unset = {source: undefined, color: undefined};
        const userSetting = {source: "custom", color: "#12345680"} as const;
        const workspaceSetting = {source: "native", color: "#ABCDEF40"} as const;
        const removals = [
            {context: "class", field: "source", value: undefined},
            {context: "class", field: "color", value: undefined}
        ] as const;

        assert.deepEqual(before.user.class, unset, "User class settings must be isolated.");
        assert.deepEqual(before.workspace.class, unset, "Workspace class settings must be isolated.");

        try {
            await writeChanges("user", [
                {context: "class", field: "source", value: userSetting.source},
                {context: "class", field: "color", value: userSetting.color}
            ]);
            await writeChanges("workspace", [
                {context: "class", field: "source", value: workspaceSetting.source},
                {context: "class", field: "color", value: workspaceSetting.color}
            ]);

            const overridden = reader.read(getConfiguration());

            assert.deepEqual(overridden.user.class, userSetting);
            assert.deepEqual(overridden.workspace.class, workspaceSetting);
            assert.deepEqual(overridden.effective.class, {kind: "valid", setting: workspaceSetting});

            await writeChanges("workspace", [
                {
                    context: "class",
                    field: "color",
                    value: undefined
                }
            ]);

            const partial = reader.read(getConfiguration());

            assert.deepEqual(partial.user.class, userSetting);
            assert.deepEqual(partial.workspace.class, {
                source: "native",
                color: undefined
            });
            assert.deepEqual(partial.effective.class, {
                kind: "valid",
                setting: {
                    source: "native",
                    color: userSetting.color
                }
            });

            await writeChanges("workspace", [
                {
                    context: "class",
                    field: "source",
                    value: undefined
                }
            ]);

            const fallback = reader.read(getConfiguration());

            assert.deepEqual(fallback.user.class, userSetting);
            assert.deepEqual(fallback.workspace.class, unset);
            assert.deepEqual(fallback.effective.class, {
                kind: "valid",
                setting: userSetting
            });
        } finally {
            try {
                await writeChanges("workspace", removals);
            } finally {
                await writeChanges("user", removals);
            }
        }
    });
});

async function assertConfigurationTrip(target: ColorSettingsTarget): Promise<void> {
    const reader = new ThrowableColorConfigurationReader();
    const before = reader.read(getConfiguration());
    const saved = before[target].class;
    const otherTarget = target === "user" ? "workspace" : "user";
    const unset = {source: undefined, color: undefined};

    assert.deepEqual(before.user.class, unset, "User class settings must be isolated.");
    assert.deepEqual(before.workspace.class, unset, "Workspace class settings must be isolated.");

    const changes = [
        {context: "class", field: "source", value: "custom"},
        {context: "class", field: "color", value: "#AbCdEf80"}
    ] as const;

    try {
        await writeChanges(target, changes);

        const written = reader.read(getConfiguration());

        assert.deepEqual(written[target].class, {
            source: "custom",
            color: "#AbCdEf80"
        });
        assert.deepEqual(written[otherTarget].class, before[otherTarget].class);
        assert.deepEqual(written.effective.class, {
            kind: "valid",
            setting: {
                source: "custom",
                color: "#AbCdEf80"
            }
        });

        await writeChanges(
            target,
            changes.map(change => ({
                ...change,
                value: undefined
            }))
        );

        const removed = reader.read(getConfiguration());

        assert.deepEqual(removed[target].class, unset);
        assert.deepEqual(removed[otherTarget].class, before[otherTarget].class);
        assert.deepEqual(removed.effective.class, before.effective.class);
    } finally {
        await writeChanges(target, [
            {context: "class", field: "source", value: saved.source},
            {context: "class", field: "color", value: saved.color}
        ]);
    }
}

async function writeChanges(target: ColorSettingsTarget, changes: readonly ColorSettingChange[]): Promise<void> {
    const result = await new ThrowableColorConfigurationWriter().write(getConfiguration(), target, changes);

    assert.deepEqual(result, {
        kind: "success",
        written: changes
    });
}

function getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(ThrowableHighlightingContext.CONFIGURATION_SECTION);
}
