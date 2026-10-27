import {randomBytes} from "node:crypto";

import * as vscode from "vscode";

import {ThrowableHighlightingContext} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingContext";
import {ThrowableColorSettingsHtml} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsHtml";
import {ThrowableColorSettingsMessageParser} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsMessageParser";
import {ThrowableColorSettingsViewModelBuilder} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsViewModelBuilder";
import {ThrowableColorConfigurationReader} from "@throwable-highlighter/settings/ThrowableColorConfigurationReader";
import {ThrowableColorSettingsDraft} from "@throwable-highlighter/settings/ThrowableColorSettingsDraft";
import type {
    ColorSettingsDraftStateMessage,
    ColorSettingsFieldRevertedMessage
} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsMessage";
import type {ThrowableColorSettingsResources} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsResources";
import type {
    RawColorSetting,
    RawThrowableColorSettings
} from "@throwable-highlighter/settings/ThrowableColorConfiguration";
import type {ColorSettingsTarget} from "@throwable-highlighter/settings/ThrowableColorSettingsDraft";

export const OPEN_COLOR_SETTINGS_COMMAND = "throwableHighlighter.prototype.openColorSettings";

export class ThrowableColorSettingsPanel implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private panelSubscriptions: readonly vscode.Disposable[] = [];
    private selectedTarget: ColorSettingsTarget = "user";
    private refreshVersion = 0;
    private isDisposed = false;
    private readonly drafts = new Map<ColorSettingsTarget, ThrowableColorSettingsDraft>();

    constructor(
        private readonly resources: Pick<
            ThrowableColorSettingsResources,
            "rootUri" | "stylesUri" | "scriptUri" | "load"
        >,
        private readonly configurationReader = new ThrowableColorConfigurationReader(),
        private readonly html = new ThrowableColorSettingsHtml(),
        private readonly viewModelBuilder = new ThrowableColorSettingsViewModelBuilder(),
        private readonly messageParser = new ThrowableColorSettingsMessageParser()
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
                enableScripts: true,
                enableForms: false,
                enableCommandUris: false,
                localResourceRoots: [this.resources.rootUri]
            }
        );

        this.panel = panel;
        this.panelSubscriptions = [
            panel.onDidDispose(() => {
                if (this.panel === panel) {
                    this.releasePanel();
                }
            }),
            panel.webview.onDidReceiveMessage((value: unknown) => this.handleMessage(panel, value))
        ];

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

            const model = this.viewModelBuilder.build(snapshot, this.selectedTarget, this.isWorkspaceAvailable());

            this.selectedTarget = model.target;

            if (!model.workspaceAvailable) {
                this.drafts.delete("workspace");
            }

            const draft = this.getDraft(model.target, model.scoped);

            panel.webview.html = this.html.renderTemplate({...model, scoped: draft.read()}, templates, {
                cspSource: panel.webview.cspSource,
                stylesUri: panel.webview.asWebviewUri(this.resources.stylesUri).toString(),
                scriptUri: panel.webview.asWebviewUri(this.resources.scriptUri).toString(),
                nonce: randomBytes(16).toString("base64")
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

    private async handleMessage(panel: vscode.WebviewPanel, value: unknown): Promise<void> {
        if (this.panel !== panel) {
            return;
        }

        const result = this.messageParser.parse(value, this.isWorkspaceAvailable());

        if (result.kind !== "valid") {
            return;
        }

        const message = result.message;

        if (message.type === "ready") {
            return this.publishDraftState(panel);
        }

        if (message.type === "apply") {
            return;
        }

        if (message.type === "selectTarget") {
            if (message.target === this.selectedTarget) {
                return;
            }

            this.selectedTarget = message.target;
            return this.refresh();
        }

        if (message.target !== this.selectedTarget) {
            return;
        }

        const draft = this.drafts.get(message.target);

        if (draft === undefined) {
            return;
        }

        switch (message.type) {
            case "setSource":
                draft.update(message.context, "source", message.source);
                break;

            case "setColor":
                draft.update(message.context, "color", message.color);
                break;

            case "resetField":
                draft.update(message.context, message.field, undefined);
                break;

            case "revertField":
                return this.revertField(panel, draft, message.context, message.field);

            case "discard":
                this.drafts.delete(message.target);
                return this.refresh();
        }

        return this.publishDraftState(panel);
    }

    private async revertField(
        panel: vscode.WebviewPanel,
        draft: ThrowableColorSettingsDraft,
        context: keyof RawThrowableColorSettings,
        field: keyof RawColorSetting
    ): Promise<void> {
        const configuration = vscode.workspace.getConfiguration(ThrowableHighlightingContext.CONFIGURATION_SECTION);
        const snapshot = this.configurationReader.read(configuration);
        const value = snapshot[draft.target][context][field];

        draft.revertField(context, field, value);

        const message: ColorSettingsFieldRevertedMessage = {
            type: "fieldReverted",
            target: draft.target,
            context,
            field,
            value,
            isDirty: draft.isDirty
        };

        await panel.webview.postMessage(message);
    }

    private async publishDraftState(panel: vscode.WebviewPanel): Promise<void> {
        const draft = this.drafts.get(this.selectedTarget);

        if (draft === undefined) {
            return;
        }

        const message: ColorSettingsDraftStateMessage = {
            type: "draftState",
            target: draft.target,
            isDirty: draft.isDirty
        };

        await panel.webview.postMessage(message);
    }

    private getDraft(target: ColorSettingsTarget, settings: RawThrowableColorSettings): ThrowableColorSettingsDraft {
        const draft = this.drafts.get(target);

        if (draft !== undefined && draft.isDirty) {
            return draft;
        }

        const current = new ThrowableColorSettingsDraft(target, settings);
        this.drafts.set(target, current);

        return current;
    }

    private isWorkspaceAvailable(): boolean {
        return vscode.workspace.workspaceFolders !== undefined;
    }

    private isCurrent(panel: vscode.WebviewPanel, version: number): boolean {
        return this.panel === panel && this.refreshVersion === version;
    }

    private releasePanel(): void {
        ++this.refreshVersion;
        this.panel = undefined;
        this.drafts.clear();

        const subscriptions = this.panelSubscriptions;
        this.panelSubscriptions = [];

        for (const subscription of subscriptions) {
            subscription.dispose();
        }
    }
}
