import * as vscode from "vscode";

import type {ThrowableColorSettingsTemplate} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsTemplate";

export class ThrowableColorSettingsResources {
    public readonly rootUri: vscode.Uri;
    public readonly stylesUri: vscode.Uri;
    public readonly scriptUri: vscode.Uri;

    constructor(extensionUri: vscode.Uri) {
        this.rootUri = vscode.Uri.joinPath(extensionUri, "webview", "color-settings");
        this.stylesUri = vscode.Uri.joinPath(this.rootUri, "styles.css");
        this.scriptUri = vscode.Uri.joinPath(this.rootUri, "app.js");
    }

    public async load(): Promise<ThrowableColorSettingsTemplate> {
        const [document, contextRow, invalidContextRow] = await Promise.all([
            this.readText("index.html"),
            this.readText("context-row.html"),
            this.readText("invalid-context-row.html"),
            vscode.workspace.fs.stat(this.stylesUri),
            vscode.workspace.fs.stat(this.scriptUri)
        ]);

        return {document, contextRow, invalidContextRow};
    }

    private async readText(fileName: string): Promise<string> {
        const uri = vscode.Uri.joinPath(this.rootUri, fileName);
        const content = await vscode.workspace.fs.readFile(uri);

        return Buffer.from(content).toString("utf-8");
    }
}
