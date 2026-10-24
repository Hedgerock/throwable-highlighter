import * as vscode from "vscode";

import {ThrowableHighlightingContext} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingContext";
import {ThrowableColorSettingsHtml} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsHtml";
import {ThrowableColorSettingsViewModelBuilder} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsViewModelBuilder";
import {ThrowableColorConfigurationReader} from "@throwable-highlighter/settings/ThrowableColorConfigurationReader";
import type {ThrowableColorSettingsResources} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsResources";

export const OPEN_COLOR_SETTINGS_COMMAND = "throwableHighlighter.prototype.openColorSettings";

export class ThrowableColorSettingsPanel implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private panelSubscription: vscode.Disposable | undefined;
    private refreshVersion = 0;
    private isDisposed = false;

    constructor(
        private readonly resources: Pick<ThrowableColorSettingsResources, "rootUri" | "stylesUri" | "load">,
        private readonly configurationReader = new ThrowableColorConfigurationReader(),
        private readonly html = new ThrowableColorSettingsHtml(),
        private readonly viewModelBuilder = new ThrowableColorSettingsViewModelBuilder()
    ) {}

    public async show(): Promise<void> {
        if (this.isDisposed) {
            return;
        }

        if (this.panel !== undefined) {
            this.panel.reveal();
            return this.refresh();
        }

        const panel = vscode.window.createWebviewPanel(
            "throwableHighlighter.prototype.colorSettings",
            "Throwable Highlighter",
            vscode.ViewColumn.Beside,
            {
                enableScripts: false,
                enableForms: false,
                enableCommandUris: false,
                localResourceRoots: [this.resources.rootUri]
            }
        );

        this.panel = panel;
        this.panelSubscription = panel.onDidDispose(() => {
            if (this.panel === panel) {
                this.releasePanel();
            }
        });

        return this.refresh();
    }

    public async refresh(): Promise<void> {
        const panel = this.panel;

        if (panel === undefined) {
            return;
        }

        const version = ++this.refreshVersion;

        try {
            const templates = await this.resources.load();

            if (!this.isCurrent(panel, version)) {
                return;
            }

            const configuration = vscode.workspace.getConfiguration(ThrowableHighlightingContext.CONFIGURATION_SECTION);
            const snapshot = this.configurationReader.read(configuration);

            const model = this.viewModelBuilder.build(
                snapshot,
                "user",
                vscode.workspace.workspaceFolders !== undefined
            );

            panel.webview.html = this.html.renderTemplate(model, templates, {
                cspSource: panel.webview.cspSource,
                stylesUri: panel.webview.asWebviewUri(this.resources.stylesUri).toString()
            });
        } catch (error) {
            if (!this.isCurrent(panel, version)) {
                return;
            }

            const reason = error instanceof Error ? error.message : String(error);

            void vscode.window.showErrorMessage("Throwable Highlighter: Unable to display color settings: " + reason);
        }
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

    private isCurrent(panel: vscode.WebviewPanel, version: number): boolean {
        return this.panel === panel && this.refreshVersion === version;
    }

    private releasePanel(): void {
        ++this.refreshVersion;
        this.panel = undefined;
        const subscription = this.panelSubscription;
        this.panelSubscription = undefined;

        subscription?.dispose();
    }
}
