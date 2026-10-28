import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {test} from "node:test";
import {Script} from "node:vm";
import type {TestContext} from "node:test";

import * as vscode from "vscode";

import {ThrowableColorSettingsResources} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsResources";

test("resolves resource paths relative to the supplied extension URI", context => {
    const fixture = createFixture(context);

    assert.equal(fixture.resources.rootUri.toString(), fixture.root);
    assert.equal(fixture.resources.stylesUri.toString(), fixture.root + "/styles.css");
    assert.equal(fixture.resources.scriptUri.toString(), fixture.root + "/app.js");

    assert.deepEqual(fixture.joinPath.mock.calls[0].arguments, [fixture.extensionUri, "webview", "color-settings"]);
    assert.deepEqual(fixture.joinPath.mock.calls[1].arguments, [fixture.resources.rootUri, "styles.css"]);
    assert.deepEqual(fixture.joinPath.mock.calls[2].arguments, [fixture.resources.rootUri, "app.js"]);
    assert.equal(fixture.resources.iconPath.light.toString(), fixture.root + "/icon-light.svg");
    assert.equal(fixture.resources.iconPath.dark.toString(), fixture.root + "/icon-dark.svg");
});

test("loads all templates as UTF-8 and checks the stylesheet", async context => {
    const fixture = createFixture(context);
    const document = "<html>Цвета Throwable 🟡</html>";
    fixture.files.set(fixture.root + "/index.html", document);

    const templates = await fixture.resources.load();

    assert.deepEqual(templates, {
        document,
        contextRow: "<tr>context</tr>",
        invalidContextRow: "<tr>invalid</tr>",
        sourceOption: "<option>source</option>"
    });
    assert.deepEqual(
        fixture.readFile.mock.calls.map(call => call.arguments[0].toString()),
        ["index.html", "context-row.html", "invalid-context-row.html", "source-option.html"].map(
            fileName => fixture.root + "/" + fileName
        )
    );
    assert.deepEqual(
        fixture.stat.mock.calls.map(call => call.arguments),
        [[fixture.resources.stylesUri], [fixture.resources.scriptUri]]
    );
});

test("propagates failures when reading any template", async context => {
    for (const fileName of ["index.html", "context-row.html", "invalid-context-row.html", "source-option.html"]) {
        await context.test(fileName, async current => {
            const fixture = createFixture(current);
            const error = new Error("Cannot read " + fileName);
            fixture.failures.set(fixture.root + "/" + fileName, error);

            await assert.rejects(fixture.resources.load(), caught => caught === error);
        });
    }
});

test("propagates stylesheet availability failures", async context => {
    const fixture = createFixture(context);
    const error = new Error("Cannot access stylesheet");
    fixture.stat.mock.mockImplementation(async () => {
        throw error;
    });

    await assert.rejects(fixture.resources.load(), caught => caught === error);
});

test("can load resources again after a failed attempt", async context => {
    const fixture = createFixture(context);
    const file = fixture.root + "/index.html";
    fixture.failures.set(file, new Error("Temporarily unavailable"));

    await assert.rejects(fixture.resources.load());

    fixture.failures.delete(file);

    const templates = await fixture.resources.load();

    assert.equal(templates.document, "<html>settings</html>");
});

test("includes the templates and stylesheet in the extension resources", async () => {
    const directory = resolve(__dirname, "../../../../webview/color-settings");

    for (const fileName of [
        "index.html",
        "context-row.html",
        "invalid-context-row.html",
        "source-option.html",
        "styles.css",
        "app.js",
        "icon-light.svg",
        "icon-dark.svg"
    ]) {
        const content = await readFile(resolve(directory, fileName), "utf-8");

        assert.notEqual(content.trim(), "", fileName + " must not be empty.");
    }
});

test("loads the webview script as a classic browser script", async () => {
    const file = resolve(__dirname, "../../../../webview/color-settings/app.js");
    const source = await readFile(file, "utf-8");

    assert.doesNotThrow(() => new Script(source, {filename: file}));
});

function createFixture(context: TestContext) {
    const extensionUri = createUri("test-extension:/installed");
    const root = extensionUri.toString() + "/webview/color-settings";
    const files = new Map([
        [root + "/index.html", "<html>settings</html>"],
        [root + "/context-row.html", "<tr>context</tr>"],
        [root + "/invalid-context-row.html", "<tr>invalid</tr>"],
        [root + "/source-option.html", "<option>source</option>"]
    ]);

    const failures = new Map<string, Error>();
    const joinPath = context.mock.method(vscode.Uri, "joinPath", (base: vscode.Uri, ...segments: string[]) =>
        createUri([base.toString(), ...segments].join("/"))
    );
    const readFile = context.mock.method(vscode.workspace.fs, "readFile", async (uri: vscode.Uri) => {
        const failure = failures.get(uri.toString());

        if (failure !== undefined) {
            throw failure;
        }

        const content = files.get(uri.toString());

        if (content === undefined) {
            throw new Error("Missing test resource: " + uri.toString());
        }

        return Buffer.from(content, "utf-8");
    });

    const stat = context.mock.method(vscode.workspace.fs, "stat", async (_uri: vscode.Uri) => ({
        type: vscode.FileType.File,
        ctime: 0,
        mtime: 0,
        size: 1
    }));

    const resources = new ThrowableColorSettingsResources(extensionUri);

    return {resources, extensionUri, root, files, failures, joinPath, readFile, stat};
}

function createUri(value: string): vscode.Uri {
    return {toString: () => value} as vscode.Uri;
}
