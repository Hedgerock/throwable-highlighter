import * as vscode from "vscode";

import {ThrowableHighlightingContext} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingContext";
import {ThrowableColorSettingsHtml} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsHtml";
import {ThrowableColorConfigurationReader} from "@throwable-highlighter/settings/ThrowableColorConfigurationReader";

export const OPEN_COLOR_SETTINGS_COMMAND = "throwableHighlighter.prototype.openColorSettings";

export class ThrowableColorSettingsPanel implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private panelSubscription: vscode.Disposable | undefined;
    private isDisposed = false;

    constructor(
        private readonly configurationReader = new ThrowableColorConfigurationReader(),
        private readonly html = new ThrowableColorSettingsHtml()
    ) {}

    public show(): void {
        if (this.isDisposed) {
            return;
        }

        if (this.panel !== undefined) {
            this.panel.reveal();
            this.refresh();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            "throwableHighlighter.prototype.colorSettings",
            "Throwable Highlighter",
            vscode.ViewColumn.Beside,
            {
                enableScripts: false,
                enableForms: false,
                enableCommandUris: false,
                localResourceRoots: []
            }
        );

        this.panel = panel;
        this.panelSubscription = panel.onDidDispose(() => {
            if (this.panel === panel) {
                this.releasePanel();
            }
        });

        this.refresh();
    }

    public refresh(): void {
        if (this.panel === undefined) {
            return;
        }

        const configuration = vscode.workspace.getConfiguration(ThrowableHighlightingContext.CONFIGURATION_SECTION);
        const snapshot = this.configurationReader.read(configuration);

        this.panel.webview.html = this.html.render(snapshot.effective);
    }

    public dispose(): void {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        const panel = this.panel;

        this.releasePanel();
        panel?.dispose();
    }

    private releasePanel(): void {
        this.panel = undefined;
        const subscription = this.panelSubscription;
        this.panelSubscription = undefined;

        subscription?.dispose();
    }
}
