import assert from "node:assert/strict";
import {test} from "node:test";

import type vscode from "vscode";

import {ThrowableColorConfigurationReader} from "@throwable-highlighter/settings/ThrowableColorConfigurationReader";

type Values = Readonly<Record<string, unknown>>;

test("reads missing settings without inventing explicit sources", () => {
    const snapshot = new ThrowableColorConfigurationReader().read(createConfiguration());

    for (const context of ["class", "import", "catch", "throws"] as const) {
        assert.deepEqual(snapshot.effective[context], {
            kind: "valid",
            setting: {color: undefined}
        });
        assert.deepEqual(snapshot.user[context], {
            source: undefined,
            color: undefined
        });
        assert.deepEqual(snapshot.workspace[context], {
            source: undefined,
            color: undefined
        });
    }
});

test("reads all explicit sources and preserves inactive stored colors", () => {
    const configuration = createConfiguration({
        effective: {
            classColorSource: "native",
            classColor: "red",
            importColorSource: "inherit",
            importColor: "rgb(1, 2, 3)",
            catchColorSource: "native",
            catchColor: "#123456",
            throwsColorSource: "custom",
            throwsColor: " #1234 "
        }
    });

    const snapshot = new ThrowableColorConfigurationReader().read(configuration);

    assert.deepEqual(snapshot.effective, {
        class: {kind: "valid", setting: {source: "native", color: "red"}},
        import: {kind: "valid", setting: {source: "inherit", color: "rgb(1, 2, 3)"}},
        catch: {kind: "valid", setting: {source: "native", color: "#123456"}},
        throws: {kind: "valid", setting: {source: "custom", color: " #1234 "}}
    });
});

test("treats missing and null configuration sources as legacy settings", () => {
    for (const source of [undefined, null]) {
        const values = Object.fromEntries(
            ["class", "import", "catch", "throws"].flatMap(context => [
                [context + "ColorSource", source],
                [context + "Color", "red"]
            ])
        );

        const snapshot = new ThrowableColorConfigurationReader().read(
            createConfiguration({
                effective: values
            })
        );

        for (const setting of Object.values(snapshot.effective)) {
            assert.deepEqual(setting, {kind: "valid", setting: {color: "red"}});
        }
    }
});

test("uses effective values from get instead of rebuilding configuration priorities", () => {
    const snapshot = new ThrowableColorConfigurationReader().read(
        createConfiguration({
            effective: {
                classColorSource: "custom",
                classColor: "#123456"
            },
            user: {classColorSource: "native", classColor: "red"},
            workspace: {classColor: "#654321"}
        })
    );

    assert.deepEqual(snapshot.effective.class, {
        kind: "valid",
        setting: {source: "custom", color: "#123456"}
    });
    assert.deepEqual(snapshot.user.class, {
        source: "native",
        color: "red"
    });
    assert.deepEqual(snapshot.workspace.class, {source: undefined, color: "#654321"});
});

test("keeps a User source when only the effective color changes in Workspace", () => {
    const snapshot = new ThrowableColorConfigurationReader().read(
        createConfiguration({
            effective: {catchColorSource: "native", catchColor: "#654321"},
            user: {catchColorSource: "native", catchColor: "#123456"},
            workspace: {catchColor: "#654321"}
        })
    );

    assert.deepEqual(snapshot.effective.catch, {
        kind: "valid",
        setting: {source: "native", color: "#654321"}
    });
    assert.deepEqual(snapshot.user.catch, {source: "native", color: "#123456"});
    assert.deepEqual(snapshot.workspace.catch, {source: undefined, color: "#654321"});
});

test("preserves partial target values without validating them as complete settings", () => {
    const snapshot = new ThrowableColorConfigurationReader().read(
        createConfiguration({
            effective: {importColorSource: "custom", importColor: "#123456"},
            user: {importColor: "#123456"},
            workspace: {importColorSource: "custom"}
        })
    );

    assert.deepEqual(snapshot.effective.import, {
        kind: "valid",
        setting: {source: "custom", color: "#123456"}
    });

    assert.deepEqual(snapshot.user.import, {source: undefined, color: "#123456"});
    assert.deepEqual(snapshot.workspace.import, {source: "custom", color: undefined});
});

test("returns effective parsing failures without falling back to legacy values", () => {
    const snapshot = new ThrowableColorConfigurationReader().read(
        createConfiguration({
            effective: {
                classColorSource: "inherit",
                importColorSource: "unknown",
                importColor: "#123456",
                catchColorSource: "custom",
                catchColor: "red",
                throwsColor: false
            }
        })
    );

    assert.deepEqual(snapshot.effective, {
        class: {kind: "invalid", reason: "class-inheritance"},
        import: {kind: "invalid", reason: "invalid-source"},
        catch: {kind: "invalid", reason: "invalid-color"},
        throws: {kind: "invalid", reason: "invalid-color"}
    });
});

test("does not copy effective defaults into target values when inspection is unavailable", () => {
    const configuration = createConfiguration({
        effective: {classColor: "#123456"}
    });

    configuration.inspect = () => undefined;

    const snapshot = new ThrowableColorConfigurationReader().read(configuration);

    assert.deepEqual(snapshot.effective.class, {
        kind: "valid",
        setting: {color: "#123456"}
    });
    assert.deepEqual(snapshot.user.class, {source: undefined, color: undefined});
    assert.deepEqual(snapshot.workspace.class, {source: undefined, color: undefined});
});

function createConfiguration(
    values: {effective?: Values; user?: Values; workspace?: Values} = {}
): Pick<vscode.WorkspaceConfiguration, "get" | "inspect"> {
    return {
        get<T>(key: string, defaultValue?: T): T {
            const value = values.effective?.[key];

            return (value === undefined ? defaultValue : value) as T;
        },
        inspect<T>(key: string) {
            return {
                key,
                globalValue: values.user?.[key] as T | undefined,
                workspaceValue: values.workspace?.[key] as T | undefined
            };
        }
    };
}
