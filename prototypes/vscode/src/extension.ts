import * as vscode from "vscode";

import {JavaCatchClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaCatchClauseFinder";
import {JavaImportClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaImportClauseFinder";
import {JavaThrowsClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaThrowsClauseFinder";
import {JavaTypeReferenceRangeReader} from "@throwable-highlighter/decorations/highlighting/JavaTypeReferenceRangeReader";
import {ThrowableHighlightingContext} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingContext";
import {ThrowableHighlightingFinder} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingFinder";
import {ThrowableDecorationController} from "@throwable-highlighter/decorations/ThrowableDecorationController";
import {JavaSupportReadiness} from "@throwable-highlighter/integration/JavaSupportReadiness";
import {JavaCodeMask} from "@throwable-highlighter/java/JavaCodeMask";
import {DefinitionProbe, INSPECT_DEFINITION_COMMAND} from "@throwable-highlighter/resolution/DefinitionProbe";
import {JavaTypeDefinitionResolver} from "@throwable-highlighter/resolution/JavaTypeDefinitionResolver";
import {
    OPEN_COLOR_SETTINGS_COMMAND,
    ThrowableColorSettingsPanel
} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsPanel";
import {ThrowableColorSettingsResources} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsResources";
import type {RefreshMode} from "@throwable-highlighter/decorations/scheduling/ThrowableRefreshScheduler";
import type {RefreshMeasurement, RefreshReason} from "@throwable-highlighter/decorations/ThrowableDecorationController";

export function activate(context: vscode.ExtensionContext): void {
    const throwableHighlightingContext = new ThrowableHighlightingContext();

    const javaCodeMask = new JavaCodeMask();
    const typeReferenceRangeReader = new JavaTypeReferenceRangeReader();
    const definitionResolver = new JavaTypeDefinitionResolver(javaCodeMask);
    const outputChannel = vscode.window.createOutputChannel("Throwable Highlighter Prototype");

    const onMeasurement =
        process.env.THROWABLE_HIGHLIGHTER_MEASURE_REFRESH === "1"
            ? (measurement: RefreshMeasurement): void => {
                  outputChannel.appendLine("[refresh-measurement] " + JSON.stringify(measurement));
              }
            : undefined;

    const controller = new ThrowableDecorationController(
        new ThrowableHighlightingFinder(
            javaCodeMask,
            new JavaImportClauseFinder(),
            new JavaCatchClauseFinder(typeReferenceRangeReader),
            new JavaThrowsClauseFinder(typeReferenceRangeReader)
        ),
        definitionResolver,
        throwableHighlightingContext,
        undefined,
        undefined,
        onMeasurement
    );

    outputChannel.appendLine("Decoration controller activated.");

    const definitionProbe = new DefinitionProbe(outputChannel, definitionResolver);
    const colorSettingsPanel = new ThrowableColorSettingsPanel(
        new ThrowableColorSettingsResources(context.extensionUri)
    );

    const invalidateTypeResolutionCache = (mode: RefreshMode, reason: RefreshReason): void => {
        const requestedAt = onMeasurement === undefined ? undefined : performance.now();

        definitionResolver.clearCache();
        controller.refresh(mode, reason, requestedAt);
    };

    const javaSupportReadiness = new JavaSupportReadiness(
        () => vscode.extensions.getExtension<unknown>("redhat.java"),
        () => invalidateTypeResolutionCache("urgent", "java-ready"),
        outputChannel
    );

    context.subscriptions.push(
        javaSupportReadiness,
        controller,
        colorSettingsPanel,
        outputChannel,
        vscode.window.onDidChangeActiveTextEditor(() => controller.refresh("urgent", "active-editor")),
        vscode.window.onDidChangeVisibleTextEditors(() => controller.refresh("urgent", "visible-editors")),
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.uri.scheme === "output" || event.contentChanges.length === 0) {
                return;
            }

            invalidateTypeResolutionCache("deferred", "document-change");
        }),
        vscode.workspace.onDidCreateFiles(() => invalidateTypeResolutionCache("deferred", "workspace-change")),
        vscode.workspace.onDidDeleteFiles(() => invalidateTypeResolutionCache("deferred", "workspace-change")),
        vscode.workspace.onDidRenameFiles(() => invalidateTypeResolutionCache("deferred", "workspace-change")),
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            invalidateTypeResolutionCache("deferred", "workspace-change");
            void colorSettingsPanel.refresh();
        }),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration(ThrowableHighlightingContext.CONFIGURATION_SECTION)) {
                controller.refreshConfiguration();
                void colorSettingsPanel.refresh();
            }
        }),
        vscode.commands.registerCommand(INSPECT_DEFINITION_COMMAND, () => definitionProbe.inspectActiveSelection()),
        vscode.commands.registerCommand(OPEN_COLOR_SETTINGS_COMMAND, () => colorSettingsPanel.show())
    );

    controller.refresh("urgent", "activation");
    javaSupportReadiness.start();
}

export function deactivate(): void {}
