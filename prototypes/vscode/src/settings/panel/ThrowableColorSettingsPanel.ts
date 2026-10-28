import {randomBytes} from "node:crypto";

import * as vscode from "vscode";

import {ThrowableHighlightingContext} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingContext";
import {ThrowableColorSettingsControlStateBuilder} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsControlStateBuilder";
import {ThrowableColorSettingsHtml} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsHtml";
import {ThrowableColorSettingsMessageParser} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsMessageParser";
import {ThrowableColorSettingsPreviewBuilder} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsPreviewBuilder";
import {ThrowableColorSettingsViewModelBuilder} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsViewModelBuilder";
import {ThrowableColorConfigurationReader} from "@throwable-highlighter/settings/ThrowableColorConfigurationReader";
import {ThrowableColorSettingsApplier} from "@throwable-highlighter/settings/ThrowableColorSettingsApplier";
import {ThrowableColorSettingsDraft} from "@throwable-highlighter/settings/ThrowableColorSettingsDraft";
import {ThrowableColorSettingsDraftConfigurationBuilder} from "@throwable-highlighter/settings/ThrowableColorSettingsDraftConfigurationBuilder";
import type {
    ColorSettingsDraftState,
    ColorSettingsDraftStateMessage,
    ColorSettingsFieldRevertedMessage
} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsMessage";
import type {ThrowableColorSettingsResources} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsResources";
import type {
    RawColorSetting,
    RawThrowableColorSettings,
    ThrowableColorConfigurationSnapshot
} from "@throwable-highlighter/settings/ThrowableColorConfiguration";
import type {ColorSettingsWriteResult} from "@throwable-highlighter/settings/ThrowableColorConfigurationWriter";
import type {ColorSettingsApplyResult} from "@throwable-highlighter/settings/ThrowableColorSettingsApplier";
import type {ColorSettingsTarget} from "@throwable-highlighter/settings/ThrowableColorSettingsDraft";

export const OPEN_COLOR_SETTINGS_COMMAND = "throwableHighlighter.prototype.openColorSettings";

export class ThrowableColorSettingsPanel implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private panelSubscriptions: readonly vscode.Disposable[] = [];
    private selectedTarget: ColorSettingsTarget = "user";
    private refreshVersion = 0;
    private applyOperation: object | undefined;
    private isDisposed = false;
    private readonly drafts = new Map<ColorSettingsTarget, ThrowableColorSettingsDraft>();
    private configurationSnapshot: ThrowableColorConfigurationSnapshot | undefined;

    constructor(
        private readonly resources: Pick<
            ThrowableColorSettingsResources,
            "rootUri" | "stylesUri" | "scriptUri" | "iconPath" | "load"
        >,
        private readonly configurationReader = new ThrowableColorConfigurationReader(),
        private readonly html = new ThrowableColorSettingsHtml(),
        private readonly viewModelBuilder = new ThrowableColorSettingsViewModelBuilder(),
        private readonly messageParser = new ThrowableColorSettingsMessageParser(),
        private readonly controlsStateBuilder = new ThrowableColorSettingsControlStateBuilder(),
        private readonly draftConfigurationBuilder = new ThrowableColorSettingsDraftConfigurationBuilder(),
        private readonly previewBuilder = new ThrowableColorSettingsPreviewBuilder(),
        private readonly applier = new ThrowableColorSettingsApplier()
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

        panel.iconPath = this.resources.iconPath;
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

        if (panel === undefined || this.applyOperation !== undefined) {
            return;
        }

        const version = ++this.refreshVersion;

        try {
            const templates = await this.resources.load();

            if (!this.isCurrent(panel, version)) {
                return;
            }

            const snapshot = this.readConfiguration();

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

        if (this.applyOperation !== undefined) {
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

            case "apply":
                return this.applyDraft(panel, draft);

            case "revertField":
                return this.revertField(panel, draft, message.context, message.field);

            case "discard":
                this.drafts.delete(message.target);
                return this.refresh();
        }

        return this.publishDraftState(panel);
    }

    private async applyDraft(panel: vscode.WebviewPanel, draft: ThrowableColorSettingsDraft): Promise<void> {
        if (!draft.isDirty || this.applyOperation !== undefined) {
            return;
        }

        const operation = {};
        const changes = draft.getChanges();
        this.applyOperation = operation;
        ++this.refreshVersion;

        try {
            await this.publishDraftState(panel);

            const result = await this.applier.apply(
                () => vscode.workspace.getConfiguration(ThrowableHighlightingContext.CONFIGURATION_SECTION),
                draft.target,
                changes
            );

            if (this.panel !== panel || this.applyOperation !== operation) {
                return;
            }

            if (result.kind !== "read-failed") {
                this.configurationSnapshot = result.snapshot;
                const retained =
                    result.kind === "success"
                        ? []
                        : result.kind === "invalid"
                          ? changes
                          : [result.writeResult.failed, ...result.writeResult.pending];

                draft.rebase(result.snapshot[draft.target], retained);
            }

            if (result.kind !== "success") {
                void vscode.window.showErrorMessage("Throwable Highlighter: " + this.formatApplyError(result));
            }
        } catch (error) {
            if (this.panel === panel && this.applyOperation === operation) {
                void vscode.window.showErrorMessage(
                    "Throwable Highlighter: Unable to apply color settings " + this.describeError(error)
                );
            }
        } finally {
            if (this.applyOperation === operation) {
                this.applyOperation = undefined;

                try {
                    if (this.panel === panel) {
                        await this.publishDraftState(panel);
                    }
                } catch (error) {
                    if (this.panel === panel) {
                        void vscode.window.showErrorMessage(
                            "Throwable Highlighter: Unable to update the settings panel: " + this.describeError(error)
                        );
                    }
                }

                await this.refresh();
            }
        }
    }

    private formatApplyError(result: Exclude<ColorSettingsApplyResult, {kind: "success"}>): string {
        if (result.kind === "invalid") {
            const reasons = {
                "invalid-source": "Choose a valid color source.",
                "invalid-color": "Enter a complete HEX color or choose a different source.",
                "class-inheritance": "CLASS cannot inherit from itself."
            };

            return (
                "Unable to apply color settings. " +
                result.issues.map(issue => issue.context.toUpperCase() + ": " + reasons[issue.reason]).join(" ")
            );
        }

        if (result.kind === "write-failed") {
            return this.formatWriteError(result.writeResult);
        }

        if (result.stage === "before-write") {
            return "Unable to read color settings before applying changes: " + this.describeError(result.error);
        }

        const written =
            result.writeResult.kind === "success"
                ? "Settings were written."
                : this.formatWriteError(result.writeResult);

        return `${written} Unable to read saved color settings: ${this.describeError(result.error)}`;
    }

    private formatWriteError(result: Extract<ColorSettingsWriteResult, {kind: "failed"}>): string {
        const field = result.failed.field === "source" ? "color source" : "color";
        const partial = result.written.length > 0 ? " Some changes have already been saved." : "";

        return `Unable to save ${result.failed.context.toUpperCase()} ${field}: ${this.describeError(result.error)}${partial}`;
    }

    private describeError(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }

    private async revertField(
        panel: vscode.WebviewPanel,
        draft: ThrowableColorSettingsDraft,
        context: keyof RawThrowableColorSettings,
        field: keyof RawColorSetting
    ): Promise<void> {
        const snapshot = this.readConfiguration();
        const value = snapshot[draft.target][context][field];

        draft.revertField(context, field, value);

        const message: ColorSettingsFieldRevertedMessage = {
            type: "fieldReverted",
            target: draft.target,
            context,
            field,
            value,
            ...this.buildDraftState(snapshot, draft)
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

    private async publishDraftState(panel: vscode.WebviewPanel): Promise<void> {
        const draft = this.drafts.get(this.selectedTarget);
        const snapshot = this.configurationSnapshot;

        if (draft === undefined || snapshot === undefined) {
            return;
        }

        const message: ColorSettingsDraftStateMessage = {
            type: "draftState",
            target: draft.target,
            ...this.buildDraftState(snapshot, draft)
        };

        await panel.webview.postMessage(message);
    }

    private buildDraftState(
        snapshot: ThrowableColorConfigurationSnapshot,
        draft: ThrowableColorSettingsDraft
    ): ColorSettingsDraftState {
        const settings = this.draftConfigurationBuilder.build(snapshot, draft.target, draft.getChanges());

        return {
            isDirty: draft.isDirty,
            isApplying: this.applyOperation !== undefined,
            controls: this.controlsStateBuilder.build(draft.read(), snapshot[draft.target]),
            preview: this.previewBuilder.build(settings)
        };
    }

    private readConfiguration(): ThrowableColorConfigurationSnapshot {
        const configuration = vscode.workspace.getConfiguration(ThrowableHighlightingContext.CONFIGURATION_SECTION);
        const snapshot = this.configurationReader.read(configuration);

        this.configurationSnapshot = snapshot;

        return snapshot;
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

        this.configurationSnapshot = undefined;
    }
}
