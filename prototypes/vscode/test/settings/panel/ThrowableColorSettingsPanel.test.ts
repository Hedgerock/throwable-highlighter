import assert from "node:assert/strict";
import {test} from "node:test";
import type {TestContext} from "node:test";

import * as vscode from "vscode";

import {ThrowableColorSettingsPanel} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsPanel";

test("opens a read-only panel with restricted resource access", context => {
    const fixture = createFixture(context);

    fixture.settingsPanel.show();

    assert.deepEqual(fixture.createPanel.mock.calls[0].arguments, [
        "throwableHighlighter.prototype.colorSettings",
        "Throwable Highlighter",
        vscode.ViewColumn.Beside,
        {enableScripts: false, enableForms: false, enableCommandUris: false, localResourceRoots: []}
    ]);
    assert.equal(fixture.getConfiguration.mock.calls[0].arguments[0], "throwableHighlighter.prototype");
    assert.ok(fixture.panels[0].webview.html.includes("<code>#123456</code>"));
});

test("reveals and refreshes the existing panel instead of opening a duplicate", context => {
    const fixture = createFixture(context);
    fixture.settingsPanel.show();

    fixture.values.classColor = "#654321";
    fixture.settingsPanel.show();

    assert.equal(fixture.createPanel.mock.callCount(), 1);

    assert.equal(fixture.panels[0].reveal.mock.callCount(), 1);
    assert.ok(fixture.panels[0].webview.html.includes("<code>#654321</code>"));
});

test("reopens after manual closure without letting an old callback release the new panel", context => {
    const fixture = createFixture(context);
    fixture.settingsPanel.show();
    const first = fixture.panels[0];

    first.close();
    assert.equal(first.unsubscribe.mock.callCount(), 1);
    assert.equal(first.dispose.mock.callCount(), 0);

    fixture.settingsPanel.show();
    first.close();
    fixture.settingsPanel.show();

    assert.equal(fixture.createPanel.mock.callCount(), 2);

    assert.equal(fixture.panels[1].reveal.mock.callCount(), 1);
});

test("refreshes effective values without writing configuration", context => {
    const fixture = createFixture(context);
    fixture.settingsPanel.show();

    fixture.values.classColor = "#654321";
    fixture.settingsPanel.refresh();

    assert.ok(fixture.panels[0].webview.html.includes("<code>#654321</code>"));

    assert.equal(fixture.panels[0].webview.html.includes("<code>#123456</code>"), false);
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("does not read configuration when no panel is open", context => {
    const fixture = createFixture(context);

    fixture.settingsPanel.refresh();

    assert.equal(fixture.getConfiguration.mock.callCount(), 0);

    fixture.settingsPanel.show();
    fixture.panels[0].close();
    fixture.getConfiguration.mock.resetCalls();
    fixture.settingsPanel.refresh();

    assert.equal(fixture.getConfiguration.mock.callCount(), 0);
});

test("disposes the panel and subscription once and does not reopen", context => {
    const fixture = createFixture(context);
    fixture.settingsPanel.show();

    fixture.settingsPanel.dispose();
    fixture.settingsPanel.dispose();
    fixture.settingsPanel.show();
    fixture.settingsPanel.refresh();

    assert.equal(fixture.panels[0].dispose.mock.callCount(), 1);
    assert.equal(fixture.panels[0].unsubscribe.mock.callCount(), 1);
    assert.equal(fixture.getConfiguration.mock.callCount(), 1);
    assert.equal(fixture.update.mock.callCount(), 0);
});

test("does not open a panel after disposal before its first use", context => {
    const fixture = createFixture(context);

    fixture.settingsPanel.dispose();
    fixture.settingsPanel.show();

    assert.equal(fixture.createPanel.mock.callCount(), 0);
    assert.equal(fixture.getConfiguration.mock.callCount(), 0);
});

function createFixture(context: TestContext) {
    const values: Record<string, unknown> = {classColor: "#123456"};
    const update = context.mock.fn(async () => {
        throw new Error("Configuration must not be changed.");
    });
    const configuration = {
        get<T>(key: string): T | undefined {
            return values[key] as T | undefined;
        },
        inspect: () => undefined,
        update
    } as unknown as vscode.WorkspaceConfiguration;
    const getConfiguration = context.mock.method(vscode.workspace, "getConfiguration", () => configuration);
    const panels: ReturnType<typeof createPanelFixture>[] = [];
    const createPanel = context.mock.method(vscode.window, "createWebviewPanel", () => {
        const panel = createPanelFixture(context);

        panels.push(panel);

        return panel as unknown as vscode.WebviewPanel;
    });
    const settingsPanel = new ThrowableColorSettingsPanel();

    context.after(() => settingsPanel.dispose());

    return {settingsPanel, panels, values, createPanel, getConfiguration, update};
}

function createPanelFixture(context: TestContext) {
    let onDispose: (() => void) | undefined;
    const unsubscribe = context.mock.fn();
    const close = (): void => onDispose?.();

    return {
        webview: {html: ""},
        reveal: context.mock.fn(),
        dispose: context.mock.fn(close),
        onDidDispose(listener: () => void) {
            onDispose = listener;

            return {dispose: unsubscribe};
        },
        close,
        unsubscribe
    };
}
