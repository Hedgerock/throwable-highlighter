import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {test} from "node:test";
import type {TestContext} from "node:test";

import * as vscode from "vscode";

import {ThrowableColorSettingsPanel} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsPanel";
import type {ThrowableColorSettingsControlState} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsControlState";
import type {
    ColorSettingPreview,
    ThrowableColorSettingsPreview
} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsPreview";
import type {ThrowableColorSettingsTemplate} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsTemplate";

test("opens a read-only panel with restricted resource access", async context => {
    const fixture = createFixture(context);

    await fixture.settingsPanel.show();

    assert.deepEqual(fixture.createPanel.mock.calls[0].arguments, [
        "throwableHighlighter.prototype.colorSettings",
        "Throwable Highlighter",
        vscode.ViewColumn.Beside,
        {enableScripts: true, enableForms: false, enableCommandUris: false, localResourceRoots: [fixture.rootUri]}
    ]);
    assert.equal(fixture.getConfiguration.mock.calls[0].arguments[0], "throwableHighlighter.prototype");
    assert.ok(fixture.panels[0].webview.html.includes("<code>#123456</code>"));
    assert.deepEqual(fixture.panels[0].webview.asWebviewUri.mock.calls[0].arguments, [fixture.stylesUri]);
});

test("reveals and refreshes the existing panel instead of opening a duplicate", async context => {
    const fixture = createFixture(context);
    await fixture.settingsPanel.show();

    fixture.values.classColor = "#654321";
    await fixture.settingsPanel.show();

    assert.equal(fixture.createPanel.mock.callCount(), 1);

    assert.equal(fixture.panels[0].reveal.mock.callCount(), 1);
    assert.ok(fixture.panels[0].webview.html.includes("<code>#654321</code>"));
});

test("reopens after manual closure without letting an old callback release the new panel", async context => {
    const fixture = createFixture(context);
    await fixture.settingsPanel.show();
    const first = fixture.panels[0];

    first.close();
    assert.equal(first.unsubscribe.mock.callCount(), 1);
    assert.equal(first.dispose.mock.callCount(), 0);

    await fixture.settingsPanel.show();
    first.close();
    await fixture.settingsPanel.show();

    assert.equal(fixture.createPanel.mock.callCount(), 2);

    assert.equal(fixture.panels[1].reveal.mock.callCount(), 1);
});

test("refreshes effective values without writing configuration", async context => {
    const fixture = createFixture(context);
    await fixture.settingsPanel.show();

    fixture.values.classColor = "#654321";
    await fixture.settingsPanel.refresh();

    assert.ok(fixture.panels[0].webview.html.includes("<code>#654321</code>"));

    assert.equal(fixture.panels[0].webview.html.includes("<code>#123456</code>"), false);
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("does not read configuration when no panel is open", async context => {
    const fixture = createFixture(context);

    await fixture.settingsPanel.refresh();

    assert.equal(fixture.getConfiguration.mock.callCount(), 0);

    await fixture.settingsPanel.show();
    fixture.panels[0].close();
    fixture.getConfiguration.mock.resetCalls();
    await fixture.settingsPanel.refresh();

    assert.equal(fixture.getConfiguration.mock.callCount(), 0);
});

test("disposes the panel and subscription once and does not reopen", async context => {
    const fixture = createFixture(context);
    await fixture.settingsPanel.show();

    fixture.settingsPanel.dispose();
    fixture.settingsPanel.dispose();
    await fixture.settingsPanel.show();
    await fixture.settingsPanel.refresh();

    assert.equal(fixture.panels[0].dispose.mock.callCount(), 1);
    assert.equal(fixture.panels[0].unsubscribe.mock.callCount(), 1);
    assert.equal(fixture.panels[0].messageUnsubscribe.mock.callCount(), 1);
    assert.equal(fixture.getConfiguration.mock.callCount(), 1);
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("does not open a panel after disposal before its first use", async context => {
    const fixture = createFixture(context);

    fixture.settingsPanel.dispose();
    await fixture.settingsPanel.show();

    assert.equal(fixture.createPanel.mock.callCount(), 0);
    assert.equal(fixture.getConfiguration.mock.callCount(), 0);
});

test("ignores loaded resources after closure or disposal", async context => {
    for (const action of ["close", "dispose"] as const) {
        await context.test(action, async current => {
            const fixture = createFixture(current);
            const pending = createDeferred<ThrowableColorSettingsTemplate>();
            fixture.load.mock.mockImplementationOnce(() => pending.promise);

            const opening = fixture.settingsPanel.show();
            const panel = fixture.panels[0];

            if (action === "close") {
                panel.close();
            } else {
                fixture.settingsPanel.dispose();
            }

            pending.resolve(readTemplates());
            await opening;

            assert.equal(panel.webview.html, "");

            assert.equal(fixture.getConfiguration.mock.callCount(), 0);
            assert.equal(fixture.showErrorMessage.mock.callCount(), 0);
            assert.equal(fixture.update.mock.callCount(), 0);
        });
    }
});

test("ignores obsolete refresh results and errors", async context => {
    for (const outcome of ["success", "failure"] as const) {
        await context.test(outcome, async current => {
            const fixture = createFixture(current);
            const obsolete = createDeferred<ThrowableColorSettingsTemplate>();
            fixture.load.mock.mockImplementationOnce(() => obsolete.promise);
            const opening = fixture.settingsPanel.show();

            fixture.values.classColor = "#654321";
            await fixture.settingsPanel.refresh();
            const activeHtml = fixture.panels[0].webview.html;

            if (outcome === "success") {
                obsolete.resolve({...readTemplates(), document: "<p>Obsolete content</p>"});
            } else {
                obsolete.reject(new Error("Obsolete load failed"));
            }

            await opening;

            assert.ok(activeHtml.includes("<code>#654321</code>"));
            assert.equal(fixture.panels[0].webview.html, activeHtml);

            assert.equal(fixture.getConfiguration.mock.callCount(), 1);
            assert.equal(fixture.showErrorMessage.mock.callCount(), 0);
            assert.equal(fixture.update.mock.callCount(), 0);
        });
    }
});

test("ignores results and errors from a load started before reopening", async context => {
    for (const outcome of ["success", "failure"] as const) {
        await context.test(outcome, async current => {
            const fixture = createFixture(current);
            const obsolete = createDeferred<ThrowableColorSettingsTemplate>();
            fixture.load.mock.mockImplementationOnce(() => obsolete.promise);
            const opening = fixture.settingsPanel.show();
            const first = fixture.panels[0];
            first.close();

            await fixture.settingsPanel.show();
            const second = fixture.panels[1];
            const activeHtml = second.webview.html;

            if (outcome === "success") {
                obsolete.resolve({...readTemplates(), document: "<p>Obsolete content</p>"});
            } else {
                obsolete.reject(new Error("Obsolete load failed"));
            }

            await opening;

            assert.equal(first.webview.html, "");
            assert.ok(activeHtml.includes("<code>#123456</code>"));
            assert.equal(second.webview.html, activeHtml);
            assert.equal(fixture.createPanel.mock.callCount(), 2);
            assert.equal(fixture.getConfiguration.mock.callCount(), 1);
            assert.equal(fixture.showErrorMessage.mock.callCount(), 0);
            assert.equal(fixture.update.mock.callCount(), 0);
        });
    }
});

test("reads the latest configuration after resource loading completes", async context => {
    const fixture = createFixture(context);
    const pending = createDeferred<ThrowableColorSettingsTemplate>();
    fixture.load.mock.mockImplementationOnce(() => pending.promise);

    const opening = fixture.settingsPanel.show();
    assert.equal(fixture.getConfiguration.mock.callCount(), 0);

    fixture.values.classColor = "#654321";
    pending.resolve(readTemplates());
    await opening;

    assert.ok(fixture.panels[0].webview.html.includes("<code>#654321</code>"));
    assert.equal(fixture.panels[0].webview.html.includes("<code>#123456</code>"), false);
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("reports a current resource failure and allows another attempt", async context => {
    const fixture = createFixture(context);
    fixture.load.mock.mockImplementationOnce(async () => {
        throw new Error("Missing stylesheet");
    });

    await fixture.settingsPanel.show();

    assert.deepEqual(
        fixture.showErrorMessage.mock.calls.map(call => call.arguments),
        [["Throwable Highlighter: Unable to display color settings: Missing stylesheet"]]
    );
    assert.equal(fixture.panels[0].webview.html, "");
    assert.equal(fixture.getConfiguration.mock.callCount(), 0);

    await fixture.settingsPanel.show();

    assert.ok(fixture.panels[0].webview.html.includes("<code>#123456</code>"));
    assert.equal(fixture.createPanel.mock.callCount(), 1);
    assert.equal(fixture.panels[0].reveal.mock.callCount(), 1);
    assert.equal(fixture.showErrorMessage.mock.callCount(), 1);
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("shows User values separately from effective configuration", async context => {
    const fixture = createFixture(context);

    await fixture.settingsPanel.show();

    const html = fixture.panels[0].webview.html;

    assert.ok(html.includes("Source in User"));
    assert.ok(html.includes("Color in User"));
    assert.ok(html.includes("<code>&quot;#ABCDEF&quot;</code>"));
    assert.ok(html.includes("<code>#123456</code>"));
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("switches scoped values between Workspace and User without writing settings", async context => {
    const fixture = createFixture(context);
    context.mock.getter(vscode.workspace, "workspaceFolders", () => []);
    await fixture.settingsPanel.show();
    const panel = fixture.panels[0];

    await panel.receive({type: "selectTarget", target: "workspace"});

    assert.ok(panel.webview.html.includes("Source in Workspace"));
    assert.ok(panel.webview.html.includes("<code>&quot;#FEDCBA&quot;</code>"));
    assert.ok(panel.webview.html.includes("<code>#123456</code>"));

    await panel.receive({type: "selectTarget", target: "user"});

    assert.ok(panel.webview.html.includes("Source in User"));
    assert.ok(panel.webview.html.includes("<code>&quot;#ABCDEF&quot;</code>"));
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("ignores unavailable targets, extra payloads and unsupported operations", async context => {
    const fixture = createFixture(context);
    await fixture.settingsPanel.show();
    const panel = fixture.panels[0];
    const previous = panel.webview.html;

    for (const message of [
        {type: "selectTarget", target: "workspace"},
        {type: "selectTarget", target: "user", color: "#FFFFFF"},
        {type: "apply", target: "user"}
    ]) {
        await panel.receive(message);
    }

    assert.equal(panel.webview.html, previous);

    assert.equal(fixture.getConfiguration.mock.callCount(), 1);
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("ignores messages from a panel that has been closed", async context => {
    const fixture = createFixture(context);
    context.mock.getter(vscode.workspace, "workspaceFolders", () => []);
    await fixture.settingsPanel.show();
    const first = fixture.panels[0];
    first.close();
    await fixture.settingsPanel.show();

    await first.receive({type: "selectTarget", target: "workspace"});

    assert.equal(first.messageUnsubscribe.mock.callCount(), 1);
    assert.ok(fixture.panels[1].webview.html.includes("Source in User"));

    assert.equal(fixture.getConfiguration.mock.callCount(), 2);
});

test("returns to User when the workspace becomes unavailable", async context => {
    const fixture = createFixture(context);
    let folders: readonly vscode.WorkspaceFolder[] | undefined = [];
    context.mock.getter(vscode.workspace, "workspaceFolders", () => folders);
    await fixture.settingsPanel.show();
    await fixture.panels[0].receive({type: "selectTarget", target: "workspace"});

    folders = undefined;
    await fixture.settingsPanel.refresh();

    assert.ok(fixture.panels[0].webview.html.includes("Source in User"));
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("keeps source changes and incomplete colors in the draft without changing effective values", async context => {
    const fixture = createFixture(context);
    await fixture.settingsPanel.show();
    const panel = fixture.panels[0];

    await panel.receive({type: "setSource", target: "user", context: "class", source: "native"});

    await fixture.settingsPanel.refresh();

    assert.ok(panel.webview.html.includes("<code>&quot;native&quot;</code>"));
    assert.ok(panel.webview.html.includes("<code>&quot;#ABCDEF&quot;</code>"));

    await panel.receive({type: "setColor", target: "user", context: "class", color: " #12 "});

    await fixture.settingsPanel.refresh();

    assert.ok(panel.webview.html.includes("<code>&quot; #12 &quot;</code>"));
    assert.ok(panel.webview.html.includes("<code>#123456</code>"));
    assert.equal(fixture.values.classColor, "#123456");
    assert.equal(fixture.userValues.classColor, "#ABCDEF");
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("resets draft fields without replacing them with effective values", async context => {
    const fixture = createFixture(context);
    fixture.userValues.classColorSource = "custom";
    await fixture.settingsPanel.show();
    const panel = fixture.panels[0];

    await panel.receive({type: "resetField", target: "user", context: "class", field: "source"});

    await fixture.settingsPanel.refresh();

    assert.equal(panel.webview.html.includes("<code>&quot;custom&quot;</code>"), false);
    assert.ok(panel.webview.html.includes("<code>&quot;#ABCDEF&quot;</code>"));

    await panel.receive({type: "resetField", target: "user", context: "class", field: "color"});

    await fixture.settingsPanel.refresh();

    assert.equal(panel.webview.html.includes("<code>&quot;#ABCDEF&quot;</code>"), false);
    assert.ok(panel.webview.html.includes("<code>#123456</code>"));

    await panel.receive({type: "discard", target: "user"});

    assert.ok(panel.webview.html.includes("<code>&quot;custom&quot;</code>"));
    assert.ok(panel.webview.html.includes("<code>&quot;#ABCDEF&quot;</code>"));
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("preserves independent drafts when switching settings scopes", async context => {
    const fixture = createFixture(context);
    context.mock.getter(vscode.workspace, "workspaceFolders", () => []);
    await fixture.settingsPanel.show();
    const panel = fixture.panels[0];

    await panel.receive({type: "setColor", target: "user", context: "class", color: "#111111"});
    await panel.receive({type: "selectTarget", target: "workspace"});
    await panel.receive({type: "setColor", target: "workspace", context: "class", color: "#222222"});
    await panel.receive({type: "selectTarget", target: "user"});

    assert.ok(panel.webview.html.includes("<code>&quot;#111111&quot;</code>"));
    assert.equal(panel.webview.html.includes("<code>&quot;#222222&quot;</code>"), false);

    await panel.receive({type: "discard", target: "user"});

    assert.ok(panel.webview.html.includes("<code>&quot;#ABCDEF&quot;</code>"));

    await panel.receive({type: "selectTarget", target: "workspace"});

    assert.ok(panel.webview.html.includes("<code>&quot;#222222&quot;</code>"));
    assert.ok(panel.webview.html.includes("<code>#123456</code>"));
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("preserves a dirty draft during refresh and discards it to the latest saved values", async context => {
    const fixture = createFixture(context);
    await fixture.settingsPanel.show();
    const panel = fixture.panels[0];

    await panel.receive({type: "setColor", target: "user", context: "class", color: "#111111"});
    fixture.userValues.classColor = "#654321";
    fixture.values.classColor = "#654321";
    await fixture.settingsPanel.refresh();

    assert.ok(panel.webview.html.includes("<code>&quot;#111111&quot;</code>"));
    assert.ok(panel.webview.html.includes("<code>#654321</code>"));

    await panel.receive({type: "discard", target: "user"});

    assert.ok(panel.webview.html.includes("<code>&quot;#654321&quot;</code>"));
    assert.equal(panel.webview.html.includes("<code>&quot;#111111&quot;</code>"), false);
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("refreshes an unchanged draft from the latest scoped configuration", async context => {
    const fixture = createFixture(context);
    await fixture.settingsPanel.show();

    fixture.userValues.classColor = "#654321";
    await fixture.settingsPanel.refresh();

    assert.ok(fixture.panels[0].webview.html.includes("<code>&quot;#654321&quot;</code>"));
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("drops all unapplied drafts when the panel is closed", async context => {
    const fixture = createFixture(context);
    context.mock.getter(vscode.workspace, "workspaceFolders", () => []);
    await fixture.settingsPanel.show();
    const first = fixture.panels[0];

    await first.receive({type: "setColor", target: "user", context: "class", color: "#111111"});
    await first.receive({type: "selectTarget", target: "workspace"});
    await first.receive({type: "setColor", target: "workspace", context: "class", color: "#222222"});
    first.close();

    await fixture.settingsPanel.show();
    const second = fixture.panels[1];

    await first.receive({type: "setColor", target: "workspace", context: "class", color: "#333333"});
    assert.ok(second.webview.html.includes("<code>&quot;#FEDCBA&quot;</code>"));

    await second.receive({type: "selectTarget", target: "user"});

    assert.ok(second.webview.html.includes("<code>&quot;#ABCDEF&quot;</code>"));
    assert.equal(second.webview.html.includes("<code>&quot;#111111&quot;</code>"), false);
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("ignores inactive scope edits and invalid draft messages", async context => {
    const fixture = createFixture(context);
    context.mock.getter(vscode.workspace, "workspaceFolders", () => []);
    await fixture.settingsPanel.show();
    const panel = fixture.panels[0];
    const previous = panel.webview.html;

    for (const message of [
        {type: "setColor", target: "workspace", context: "class", color: "#111111"},
        {type: "setSource", target: "user", context: "class", source: "inherit"},
        {type: "setColor", target: "user", context: "class", color: 42},
        {type: "setColor", target: "user", context: "class", color: "#111111", extra: true},
        {type: "ready"},
        {type: "apply", target: "user"}
    ]) {
        await panel.receive(message);
    }

    assert.equal(panel.webview.html, previous);
    assert.equal(fixture.getConfiguration.mock.callCount(), 1);

    await panel.receive({type: "selectTarget", target: "workspace"});

    assert.ok(panel.webview.html.includes("<code>&quot;#FEDCBA&quot;</code>"));
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("does not accept draft edits before the initial snapshot has loaded", async context => {
    const fixture = createFixture(context);
    const pending = createDeferred<ThrowableColorSettingsTemplate>();
    fixture.load.mock.mockImplementationOnce(() => pending.promise);

    const opening = fixture.settingsPanel.show();
    const panel = fixture.panels[0];

    await panel.receive({type: "setColor", target: "user", context: "class", color: "#111111"});
    pending.resolve(readTemplates());
    await opening;

    assert.ok(panel.webview.html.includes("<code>&quot;#ABCDEF&quot;</code>"));
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("drops the Workspace draft when the workspace becomes unavailable", async context => {
    const fixture = createFixture(context);
    let folders: readonly vscode.WorkspaceFolder[] | undefined = [];
    context.mock.getter(vscode.workspace, "workspaceFolders", () => folders);
    await fixture.settingsPanel.show();
    const panel = fixture.panels[0];

    await panel.receive({type: "selectTarget", target: "workspace"});
    await panel.receive({type: "setColor", target: "workspace", context: "class", color: "#111111"});

    folders = undefined;
    await fixture.settingsPanel.refresh();
    fixture.workspaceValues.classColor = "#654321";
    folders = [];
    await panel.receive({type: "selectTarget", target: "workspace"});

    assert.ok(panel.webview.html.includes("<code>&quot;#654321&quot;</code>"));
    assert.equal(panel.webview.html.includes("<code>&quot;#111111&quot;</code>"), false);
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("publishes the current draft state when the webview is ready", async context => {
    const fixture = createFixture(context);
    context.mock.getter(vscode.workspace, "workspaceFolders", () => []);
    await fixture.settingsPanel.show();
    const panel = fixture.panels[0];

    await panel.receive({type: "ready"});

    assert.deepEqual(panel.webview.postMessage.mock.calls[0].arguments, [
        {
            type: "draftState",
            target: "user",
            isDirty: false,
            controls: createControlState(),
            preview: createPreview("#FEDCBA")
        }
    ]);

    await panel.receive({type: "selectTarget", target: "workspace"});
    await panel.receive({type: "ready"});

    assert.deepEqual(panel.webview.postMessage.mock.calls[1].arguments, [
        {
            type: "draftState",
            target: "workspace",
            isDirty: false,
            controls: createControlState(),
            preview: createPreview("#FEDCBA")
        }
    ]);
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("publishes draft changes without reloading the document or reading configuration", async context => {
    const fixture = createFixture(context);
    await fixture.settingsPanel.show();
    const panel = fixture.panels[0];
    const previous = panel.webview.html;

    await panel.receive({type: "setColor", target: "user", context: "class", color: "#111111"});
    await panel.receive({type: "setColor", target: "user", context: "class", color: "#ABCDEF"});

    assert.deepEqual(
        panel.webview.postMessage.mock.calls.map(call => call.arguments),
        [
            [
                {
                    type: "draftState",
                    target: "user",
                    isDirty: true,
                    controls: createControlState({
                        class: {
                            color: {canRevert: true, canRemove: true}
                        }
                    }),
                    preview: createPreview("#111111")
                }
            ],
            [
                {
                    type: "draftState",
                    target: "user",
                    isDirty: false,
                    controls: createControlState(),
                    preview: createPreview("#ABCDEF")
                }
            ]
        ]
    );
    assert.equal(panel.webview.html, previous);
    assert.equal(fixture.load.mock.callCount(), 1);
    assert.equal(fixture.getConfiguration.mock.callCount(), 1);
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("publishes a clean state after discarding changes", async context => {
    const fixture = createFixture(context);
    await fixture.settingsPanel.show();
    const panel = fixture.panels[0];

    await panel.receive({type: "setColor", target: "user", context: "class", color: "#111111"});
    await panel.receive({type: "discard", target: "user"});
    await panel.receive({type: "ready"});

    assert.deepEqual(panel.webview.postMessage.mock.calls.at(-1)?.arguments, [
        {
            type: "draftState",
            target: "user",
            isDirty: false,
            controls: createControlState(),
            preview: createPreview("#ABCDEF")
        }
    ]);
    assert.ok(panel.webview.html.includes("<code>&quot;#ABCDEF&quot;</code>"));
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("reverts a field to the latest saved scope value without reloading the panel", async context => {
    const fixture = createFixture(context);
    await fixture.settingsPanel.show();
    const panel = fixture.panels[0];
    const html = panel.webview.html;

    await panel.receive({type: "setColor", target: "user", context: "class", color: "#111111"});
    await panel.receive({type: "setSource", target: "user", context: "catch", source: "native"});
    fixture.userValues.classColor = "#654321";

    await panel.receive({
        type: "revertField",
        target: "user",
        context: "class",
        field: "color"
    });

    assert.deepEqual(panel.webview.postMessage.mock.calls.at(-1)?.arguments, [
        {
            type: "fieldReverted",
            target: "user",
            context: "class",
            field: "color",
            value: "#654321",
            isDirty: true,
            controls: createControlState({
                catch: {
                    source: {canRevert: true, canRemove: true}
                }
            }),
            preview: createPreview("#654321", {catch: {kind: "native"}})
        }
    ]);
    assert.equal(panel.webview.html, html);
    assert.equal(fixture.load.mock.callCount(), 1);
    assert.equal(fixture.update.mock.callCount(), 0);

    await panel.receive({
        type: "revertField",
        target: "user",
        context: "catch",
        field: "source"
    });

    assert.deepEqual(panel.webview.postMessage.mock.calls.at(-1)?.arguments, [
        {
            type: "fieldReverted",
            target: "user",
            context: "catch",
            field: "source",
            value: undefined,
            isDirty: false,
            controls: createControlState(),
            preview: createPreview("#654321")
        }
    ]);
});

test("reverts Workspace fields without substituting User or effective values", async context => {
    const fixture = createFixture(context);
    context.mock.getter(vscode.workspace, "workspaceFolders", () => []);
    await fixture.settingsPanel.show();
    const panel = fixture.panels[0];

    await panel.receive({type: "selectTarget", target: "workspace"});
    await panel.receive({type: "setColor", target: "workspace", context: "class", color: "#111111"});
    await panel.receive({type: "revertField", target: "workspace", context: "class", field: "color"});

    assert.deepEqual(panel.webview.postMessage.mock.calls.at(-1)?.arguments, [
        {
            type: "fieldReverted",
            target: "workspace",
            context: "class",
            field: "color",
            value: "#FEDCBA",
            isDirty: false,
            controls: createControlState(),
            preview: createPreview("#FEDCBA")
        }
    ]);

    await panel.receive({type: "setColor", target: "workspace", context: "catch", color: "#111111"});
    await panel.receive({type: "revertField", target: "workspace", context: "catch", field: "color"});

    assert.deepEqual(panel.webview.postMessage.mock.calls.at(-1)?.arguments, [
        {
            type: "fieldReverted",
            target: "workspace",
            context: "catch",
            field: "color",
            value: undefined,
            isDirty: false,
            controls: createControlState(),
            preview: createPreview("#FEDCBA")
        }
    ]);
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("ignores revert requests from inactive scopes and closed panels", async context => {
    const fixture = createFixture(context);
    context.mock.getter(vscode.workspace, "workspaceFolders", () => []);
    await fixture.settingsPanel.show();
    const first = fixture.panels[0];

    await first.receive({type: "revertField", target: "workspace", context: "class", field: "color"});

    assert.equal(fixture.getConfiguration.mock.callCount(), 1);
    assert.equal(first.webview.postMessage.mock.callCount(), 0);

    first.close();
    await fixture.settingsPanel.show();
    await first.receive({type: "revertField", target: "user", context: "class", field: "color"});

    assert.equal(fixture.getConfiguration.mock.callCount(), 2);
    assert.equal(first.webview.postMessage.mock.callCount(), 0);
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("updates color action states for empty input, removal and reverting", async context => {
    const fixture = createFixture(context);
    await fixture.settingsPanel.show();
    const panel = fixture.panels[0];
    const html = panel.webview.html;

    await panel.receive({
        type: "setColor",
        target: "user",
        context: "class",
        color: ""
    });

    assert.deepEqual(panel.webview.postMessage.mock.calls.at(-1)?.arguments, [
        {
            type: "draftState",
            target: "user",
            isDirty: true,
            controls: createControlState({
                class: {color: {canRevert: true, canRemove: true}}
            }),
            preview: createPreview(undefined)
        }
    ]);

    await panel.receive({
        type: "resetField",
        target: "user",
        context: "class",
        field: "color"
    });

    assert.deepEqual(panel.webview.postMessage.mock.calls.at(-1)?.arguments, [
        {
            type: "draftState",
            target: "user",
            isDirty: true,
            controls: createControlState({
                class: {color: {canRevert: true, canRemove: false}}
            }),
            preview: createPreview(undefined)
        }
    ]);

    assert.equal(fixture.getConfiguration.mock.callCount(), 1);

    await panel.receive({type: "revertField", target: "user", context: "class", field: "color"});

    assert.deepEqual(panel.webview.postMessage.mock.calls.at(-1)?.arguments, [
        {
            type: "fieldReverted",
            target: "user",
            context: "class",
            field: "color",
            value: "#ABCDEF",
            isDirty: false,
            controls: createControlState(),
            preview: createPreview("#ABCDEF")
        }
    ]);
    assert.equal(panel.webview.html, html);
    assert.equal(fixture.load.mock.callCount(), 1);
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("publishes action states for values in the selected scope", async context => {
    const fixture = createFixture(context);
    context.mock.getter(vscode.workspace, "workspaceFolders", () => []);
    delete fixture.userValues.classColor;
    await fixture.settingsPanel.show();
    const panel = fixture.panels[0];

    await panel.receive({type: "ready"});

    assert.deepEqual(panel.webview.postMessage.mock.calls.at(-1)?.arguments, [
        {
            type: "draftState",
            target: "user",
            isDirty: false,
            controls: createControlState({
                class: {color: {canRevert: false, canRemove: false}}
            }),
            preview: createPreview("#FEDCBA")
        }
    ]);

    await panel.receive({type: "selectTarget", target: "workspace"});
    await panel.receive({type: "ready"});

    assert.deepEqual(panel.webview.postMessage.mock.calls.at(-1)?.arguments, [
        {
            type: "draftState",
            target: "workspace",
            isDirty: false,
            controls: createControlState(),
            preview: createPreview("#FEDCBA")
        }
    ]);
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("refreshes saved values for action states while preserving other draft changes", async context => {
    const fixture = createFixture(context);
    await fixture.settingsPanel.show();
    const panel = fixture.panels[0];

    await panel.receive({
        type: "setColor",
        target: "user",
        context: "class",
        color: "#111111"
    });

    fixture.userValues.catchColor = "#654321";
    await fixture.settingsPanel.refresh();
    await panel.receive({type: "ready"});

    assert.deepEqual(panel.webview.postMessage.mock.calls.at(-1)?.arguments, [
        {
            type: "draftState",
            target: "user",
            isDirty: true,
            controls: createControlState({
                class: {color: {canRevert: true, canRemove: true}},
                catch: {color: {canRevert: true, canRemove: false}}
            }),
            preview: createPreview("#111111", {catch: {kind: "color", color: "#654321"}})
        }
    ]);
    assert.ok(panel.webview.html.includes("<code>&quot;#111111&quot;</code>"));

    fixture.userValues.catchColor = "#FEDCBA";
    await panel.receive({type: "revertField", target: "user", context: "catch", field: "color"});

    assert.deepEqual(panel.webview.postMessage.mock.calls.at(-1)?.arguments, [
        {
            type: "fieldReverted",
            target: "user",
            context: "catch",
            field: "color",
            value: "#FEDCBA",
            isDirty: true,
            controls: createControlState({
                class: {color: {canRevert: true, canRemove: true}},
                catch: {color: {canRevert: false, canRemove: true}}
            }),
            preview: createPreview("#111111", {catch: {kind: "color", color: "#FEDCBA"}})
        }
    ]);

    await panel.receive({type: "ready"});

    assert.deepEqual(panel.webview.postMessage.mock.calls.at(-1)?.arguments, [
        {
            type: "draftState",
            target: "user",
            isDirty: true,
            controls: createControlState({
                class: {color: {canRevert: true, canRemove: true}},
                catch: {color: {canRevert: false, canRemove: true}}
            }),
            preview: createPreview("#111111", {catch: {kind: "color", color: "#FEDCBA"}})
        }
    ]);
    assert.equal(fixture.getConfiguration.mock.callCount(), 3);
    assert.equal(fixture.load.mock.callCount(), 2);
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("previews Workspace draft changes without replacing saved values", async context => {
    const fixture = createFixture(context);
    context.mock.getter(vscode.workspace, "workspaceFolders", () => []);
    await fixture.settingsPanel.show();
    const panel = fixture.panels[0];

    await panel.receive({type: "selectTarget", target: "workspace"});
    const html = panel.webview.html;
    await panel.receive({type: "setColor", target: "workspace", context: "class", color: "#111111"});

    assert.deepEqual(panel.webview.postMessage.mock.calls.at(-1)?.arguments, [
        {
            type: "draftState",
            target: "workspace",
            isDirty: true,
            controls: createControlState({
                class: {color: {canRevert: true, canRemove: true}}
            }),
            preview: createPreview("#111111")
        }
    ]);
    assert.equal(panel.webview.html, html);
    assert.equal(fixture.workspaceValues.classColor, "#FEDCBA");
    assert.equal(fixture.getConfiguration.mock.callCount(), 2);
    assert.equal(fixture.load.mock.callCount(), 2);
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("keeps Workspace priority when previewing User draft changes", async context => {
    const fixture = createFixture(context);
    context.mock.getter(vscode.workspace, "workspaceFolders", () => []);
    await fixture.settingsPanel.show();
    const panel = fixture.panels[0];

    await panel.receive({type: "setColor", target: "user", context: "class", color: "#111111"});

    assert.deepEqual(panel.webview.postMessage.mock.calls.at(-1)?.arguments, [
        {
            type: "draftState",
            target: "user",
            isDirty: true,
            controls: createControlState({
                class: {color: {canRevert: true, canRemove: true}}
            }),
            preview: createPreview("#FEDCBA")
        }
    ]);
    assert.equal(fixture.userValues.classColor, "#ABCDEF");
    assert.equal(fixture.getConfiguration.mock.callCount(), 1);
    assert.equal(fixture.update.mock.callCount(), 0);
});

function createFixture(context: TestContext) {
    const values: Record<string, unknown> = {classColor: "#123456"};
    const userValues: Record<string, unknown> = {classColor: "#ABCDEF"};
    const workspaceValues: Record<string, unknown> = {classColor: "#FEDCBA"};
    const update = context.mock.fn(async () => {
        throw new Error("Configuration must not be changed.");
    });
    const configuration = {
        get<T>(key: string): T | undefined {
            return values[key] as T | undefined;
        },
        inspect<T>(key: string) {
            return {
                key,
                globalValue: userValues[key] as T | undefined,
                workspaceValue: (vscode.workspace.workspaceFolders === undefined ? undefined : workspaceValues[key]) as
                    T | undefined
            };
        },
        update
    } as unknown as vscode.WorkspaceConfiguration;
    const getConfiguration = context.mock.method(vscode.workspace, "getConfiguration", () => configuration);
    const panels: ReturnType<typeof createPanelFixture>[] = [];
    const createPanel = context.mock.method(vscode.window, "createWebviewPanel", () => {
        const panel = createPanelFixture(context);

        panels.push(panel);

        return panel as unknown as vscode.WebviewPanel;
    });

    const rootUri = createUri("test-extension:/webview/color-settings");
    const stylesUri = createUri(rootUri.toString() + "/styles.css");
    const scriptUri = createUri(rootUri.toString() + "/app.js");
    const load = context.mock.fn(async () => readTemplates());
    const showErrorMessage = context.mock.method(vscode.window, "showErrorMessage", async () => undefined);

    const settingsPanel = new ThrowableColorSettingsPanel({rootUri, stylesUri, scriptUri, load});

    context.after(() => settingsPanel.dispose());

    return {
        settingsPanel,
        panels,
        values,
        userValues,
        workspaceValues,
        createPanel,
        getConfiguration,
        update,
        rootUri,
        stylesUri,
        load,
        showErrorMessage
    };
}

function createControlState(
    overrides: {
        readonly [TContext in keyof ThrowableColorSettingsControlState]?: Partial<
            ThrowableColorSettingsControlState[TContext]
        >;
    } = {}
): ThrowableColorSettingsControlState {
    const missing = {canRevert: false, canRemove: false};
    const present = {canRevert: false, canRemove: true};

    return {
        class: {source: missing, color: present, ...overrides.class},
        import: {source: missing, color: missing, ...overrides.import},
        catch: {source: missing, color: missing, ...overrides.catch},
        throws: {source: missing, color: missing, ...overrides.throws}
    };
}

function createUri(value: string): vscode.Uri {
    return {toString: () => value} as vscode.Uri;
}

function readTemplates(): ThrowableColorSettingsTemplate {
    const directory = resolve(__dirname, "../../../../webview/color-settings");

    return {
        document: readFileSync(resolve(directory, "index.html"), "utf-8"),
        contextRow: readFileSync(resolve(directory, "context-row.html"), "utf-8"),
        invalidContextRow: readFileSync(resolve(directory, "invalid-context-row.html"), "utf-8"),
        sourceOption: readFileSync(resolve(directory, "source-option.html"), "utf-8")
    };
}

function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason: unknown) => void;

    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return {promise, resolve, reject};
}

function createPreview(
    color: string | undefined,
    overrides: Partial<ThrowableColorSettingsPreview> = {}
): ThrowableColorSettingsPreview {
    const classPreview: ColorSettingPreview = color === undefined ? {kind: "native"} : {kind: "color", color};

    return {
        class: classPreview,
        import: classPreview,
        catch: classPreview,
        throws: classPreview,
        ...overrides
    };
}

function createPanelFixture(context: TestContext) {
    let onDispose: (() => void) | undefined;
    let onMessage: ((value: unknown) => unknown) | undefined;
    const unsubscribe = context.mock.fn();
    const messageUnsubscribe = context.mock.fn();
    const close = (): void => onDispose?.();

    return {
        webview: {
            html: "",
            cspSource: "test-webview:",
            onDidReceiveMessage(listener: (value: unknown) => unknown) {
                onMessage = listener;
                return {dispose: messageUnsubscribe};
            },
            postMessage: context.mock.fn(async (_message: unknown) => true),
            asWebviewUri: context.mock.fn((uri: vscode.Uri) => createUri("test-webview:" + uri.toString()))
        },
        reveal: context.mock.fn(),
        dispose: context.mock.fn(close),
        onDidDispose(listener: () => void) {
            onDispose = listener;

            return {dispose: unsubscribe};
        },
        close,
        async receive(value: unknown): Promise<void> {
            await onMessage?.(value);
        },
        messageUnsubscribe,
        unsubscribe
    };
}
