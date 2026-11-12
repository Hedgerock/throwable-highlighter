import assert from "node:assert/strict";
import {test} from "node:test";
import type {TestContext} from "node:test";

import vscode from "vscode";

import {ThrowableHighlightingContext} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingContext";
import {ThrowableHighlightingStatus} from "@throwable-highlighter/diagnostics/ThrowableHighlightingStatus";

test("reports a slow refresh while keeping Java readiness visible", context => {
    const fixture = createFixture(context);

    fixture.status.onRefreshActivity({
        kind: "requested",
        generation: 1
    });
    context.mock.timers.tick(1999);
    assert.deepEqual(fixture.outcomes, []);

    context.mock.timers.tick(1);
    assert.equal(fixture.item.text, "Waiting for Java");
    assert.deepEqual(fixture.outcomes, ["slow"]);

    fixture.status.setJavaReadiness("ready");
    assert.equal(fixture.item.text, "Updating highlighting");
    assert.equal(fixture.item.busy, true);

    fixture.status.onRefreshActivity({
        kind: "applied",
        generation: 1,
        editor: fixture.editor
    });

    assert.equal(fixture.item.text, "Ready");
    assert.equal(fixture.item.busy, false);
    assert.deepEqual(fixture.outcomes, ["slow", "applied"]);
});

test("finishes a fast refresh without recording a diagnostic", context => {
    const fixture = createFixture(context);
    fixture.status.setJavaReadiness("ready");

    fixture.status.onRefreshActivity({
        kind: "requested",
        generation: 1
    });

    context.mock.timers.tick(1999);
    fixture.status.onRefreshActivity({kind: "applied", generation: 1, editor: fixture.editor});
    context.mock.timers.tick(1);

    assert.equal(fixture.item.text, "Ready");
    assert.deepEqual(fixture.outcomes, []);
});

test("restarts the timer after switching editors and ignores obsolete completion", context => {
    const fixture = createFixture(context);
    fixture.status.setJavaReadiness("ready");

    fixture.status.onRefreshActivity({
        kind: "requested",
        generation: 1
    });

    const nextEditor = {...fixture.editor};
    fixture.active.editor = nextEditor;
    fixture.status.onRefreshActivity({
        kind: "requested",
        generation: 2
    });
    fixture.status.onRefreshActivity({
        kind: "applied",
        generation: 1,
        editor: nextEditor
    });
    fixture.status.onRefreshActivity({
        kind: "applied",
        generation: 2,
        editor: fixture.editor
    });

    context.mock.timers.tick(1999);
    assert.equal(fixture.item.text, "Ready");
    assert.deepEqual(fixture.outcomes, []);

    context.mock.timers.tick(1);
    assert.equal(fixture.item.text, "Updating highlighting");
    assert.deepEqual(fixture.outcomes, ["slow"]);
});

test("ignores the timer for an obsolete document version", context => {
    const fixture = createFixture(context);
    fixture.status.setJavaReadiness("ready");

    fixture.status.onRefreshActivity({
        kind: "requested",
        generation: 1
    });

    fixture.documentState.version++;
    context.mock.timers.tick(2000);

    assert.equal(fixture.item.text, "Ready");
    assert.deepEqual(fixture.outcomes, []);
});

test("cancels the pending timer when disposed", context => {
    const fixture = createFixture(context);

    fixture.status.onRefreshActivity({
        kind: "requested",
        generation: 1
    });
    fixture.status.dispose();
    context.mock.timers.tick(2000);

    assert.equal(fixture.disposeItem.mock.callCount(), 1);
    assert.deepEqual(fixture.outcomes, []);
});

test("gives a refresh failure priority over Java readiness and resets it on the next request", context => {
    const fixture = createFixture(context);

    fixture.status.onRefreshActivity({kind: "requested", generation: 1});
    fixture.status.onRefreshActivity({
        kind: "failed",
        generation: 1,
        editor: fixture.editor,
        stage: "prepare"
    });
    context.mock.timers.tick(2000);

    assert.equal(fixture.item.text, "Highlighting update failed");
    assert.equal(fixture.item.severity, vscode.LanguageStatusSeverity.Error);
    assert.equal(fixture.item.busy, false);
    assert.deepEqual(fixture.outcomes, ["failed"]);

    fixture.status.setJavaReadiness("ready");
    assert.equal(fixture.item.text, "Highlighting update failed");

    fixture.status.onRefreshActivity({kind: "requested", generation: 2});
    assert.equal(fixture.item.text, "Ready");
    assert.equal(fixture.item.severity, vscode.LanguageStatusSeverity.Information);
});

test("ignores failures from a previous generation or another editor", context => {
    const fixture = createFixture(context);
    fixture.status.setJavaReadiness("ready");

    fixture.status.onRefreshActivity({
        kind: "requested",
        generation: 1
    });

    fixture.status.onRefreshActivity({
        kind: "requested",
        generation: 2
    });

    fixture.status.onRefreshActivity({
        kind: "failed",
        generation: 1,
        editor: fixture.editor,
        stage: "apply"
    });

    assert.deepEqual(fixture.outcomes, []);
    context.mock.timers.tick(2000);
    assert.equal(fixture.item.text, "Updating highlighting");

    fixture.status.onRefreshActivity({
        kind: "failed",
        generation: 2,
        editor: fixture.editor,
        stage: "apply"
    });

    assert.equal(fixture.item.text, "Highlighting update failed");
    assert.deepEqual(fixture.outcomes, ["slow", "failed"]);
});

function createFixture(context: TestContext) {
    context.mock.timers.enable({apis: ["setTimeout"]});

    const documentState = {
        languageId: "java",
        uri: {
            scheme: "file"
        },
        version: 1
    };
    const document = documentState as vscode.TextDocument;
    const editor = {document} as vscode.TextEditor;
    const active = {editor};
    const disposeItem = context.mock.fn();
    const item: vscode.LanguageStatusItem = {
        id: "test-highlighting-status",
        name: undefined,
        selector: [],
        severity: 0,
        text: "",
        busy: false,
        command: undefined,
        dispose: disposeItem
    };
    const outcomes: string[] = [];
    context.mock.getter(vscode.window, "activeTextEditor", () => active.editor);
    context.mock.method(vscode.languages, "createLanguageStatusItem", () => item);

    const status = new ThrowableHighlightingStatus(new ThrowableHighlightingContext(), diagnostic => {
        outcomes.push(diagnostic.outcome);
    });

    context.after(() => status.dispose());

    return {status, item, editor, active, documentState, disposeItem, outcomes};
}
