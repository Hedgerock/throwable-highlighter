import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {test} from "node:test";
import type {TestContext} from "node:test";

import * as vscode from "vscode";

import {ThrowableColorSettingsPanel} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsPanel";
import type {ThrowableColorSettingsTemplate} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsTemplate";

test("opens a read-only panel with restricted resource access", async context => {
    const fixture = createFixture(context);

    await fixture.settingsPanel.show();

    assert.deepEqual(fixture.createPanel.mock.calls[0].arguments, [
        "throwableHighlighter.prototype.colorSettings",
        "Throwable Highlighter",
        vscode.ViewColumn.Beside,
        {enableScripts: false, enableForms: false, enableCommandUris: false, localResourceRoots: [fixture.rootUri]}
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

    const rootUri = createUri("test-extension:/webview/color-settings");
    const stylesUri = createUri(rootUri.toString() + "/styles.css");
    const load = context.mock.fn(async () => readTemplates());
    const showErrorMessage = context.mock.method(vscode.window, "showErrorMessage", async () => undefined);

    const settingsPanel = new ThrowableColorSettingsPanel({rootUri, stylesUri, load});

    context.after(() => settingsPanel.dispose());

    return {
        settingsPanel,
        panels,
        values,
        createPanel,
        getConfiguration,
        update,
        rootUri,
        stylesUri,
        load,
        showErrorMessage
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
        invalidContextRow: readFileSync(resolve(directory, "invalid-context-row.html"), "utf-8")
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

function createPanelFixture(context: TestContext) {
    let onDispose: (() => void) | undefined;
    const unsubscribe = context.mock.fn();
    const close = (): void => onDispose?.();

    return {
        webview: {
            html: "",
            cspSource: "test-webview:",
            asWebviewUri: context.mock.fn((uri: vscode.Uri) => createUri("test-webview:" + uri.toString()))
        },
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
