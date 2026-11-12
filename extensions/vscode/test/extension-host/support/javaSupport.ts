import assert from "node:assert/strict";

import * as vscode from "vscode";

type JavaExtensionApi = {
    serverReady(): Promise<boolean>;
};

export async function openJavaFixture(...segments: string[]): Promise<vscode.TextDocument> {
    return openJavaSource("throwablehighlighter", "fixture", ...segments);
}

export async function openJavaSource(...segments: string[]): Promise<vscode.TextDocument> {
    const workspace = vscode.workspace.workspaceFolders?.[0];

    assert.ok(workspace, "Test workspace is not available.");

    const document = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(workspace.uri, "src", ...segments));

    assert.equal(document.languageId, "java");

    return document;
}

export async function waitForJavaSupport(): Promise<void> {
    const document = await openJavaFixture("exception", "BaseException.java");

    await vscode.window.showTextDocument(document);

    const extension = vscode.extensions.getExtension<JavaExtensionApi>("redhat.java");

    assert.ok(extension, "Red Hat Java extension is not available.");
    assert.equal(extension.packageJSON.version, "1.58.0");

    const api = await extension.activate();

    assert.ok(typeof api?.serverReady === "function", "Red Hat Java API does not provide serverReady().");
    assert.equal(await api.serverReady(), true, "Standard Java server did not become ready.");
}

export function positionOf(document: vscode.TextDocument, text: string): vscode.Position {
    const offset = document.getText().indexOf(text);

    assert.notEqual(offset, -1, `Text "${text}" is not present in ${document.uri.toString()}.`);

    return document.positionAt(offset);
}
