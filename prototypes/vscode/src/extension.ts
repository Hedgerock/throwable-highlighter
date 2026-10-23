import * as vscode from "vscode";

import {JavaCatchClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaCatchClauseFinder";
import {JavaImportClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaImportClauseFinder";
import {JavaThrowsClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaThrowsClauseFinder";
import {JavaTypeReferenceRangeReader} from "@throwable-highlighter/decorations/highlighting/JavaTypeReferenceRangeReader";
import {ThrowableHighlightingContext} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingContext";
import {ThrowableHighlightingFinder} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingFinder";
import {ThrowableDecorationController} from "@throwable-highlighter/decorations/ThrowableDecorationController";
import {JavaCodeMask} from "@throwable-highlighter/java/JavaCodeMask";
import {DefinitionProbe, INSPECT_DEFINITION_COMMAND} from "@throwable-highlighter/resolution/DefinitionProbe";
import {JavaTypeDefinitionResolver} from "@throwable-highlighter/resolution/JavaTypeDefinitionResolver";
import {
    OPEN_COLOR_SETTINGS_COMMAND,
    ThrowableColorSettingsPanel
} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsPanel";
import {ThrowableColorSettingsResources} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsResources";

const INITIAL_REFRESH_DELAYS = [1_000, 3_000, 8_000] as const;

function scheduleInitialRefreshes(controller: ThrowableDecorationController): vscode.Disposable {
    const timers = INITIAL_REFRESH_DELAYS.map(delay => setTimeout(() => controller.refresh(), delay));

    return {
        dispose(): void {
            for (const timer of timers) {
                clearTimeout(timer);
            }
        }
    };
}

export function activate(context: vscode.ExtensionContext): void {
    const throwableHighlightingContext = new ThrowableHighlightingContext();

    const javaCodeMask = new JavaCodeMask();
    const typeReferenceRangeReader = new JavaTypeReferenceRangeReader();
    const definitionResolver = new JavaTypeDefinitionResolver(javaCodeMask);

    const controller = new ThrowableDecorationController(
        new ThrowableHighlightingFinder(
            javaCodeMask,
            new JavaImportClauseFinder(),
            new JavaCatchClauseFinder(typeReferenceRangeReader),
            new JavaThrowsClauseFinder(typeReferenceRangeReader)
        ),
        definitionResolver,
        throwableHighlightingContext
    );

    const outputChannel = vscode.window.createOutputChannel("Throwable Highlighter Prototype");

    outputChannel.appendLine("Decoration controller activated.");

    const definitionProbe = new DefinitionProbe(outputChannel, definitionResolver);
    const colorSettingsPanel = new ThrowableColorSettingsPanel(
        new ThrowableColorSettingsResources(context.extensionUri)
    );

    const invalidateTypeResolutionCache = (): void => {
        definitionResolver.clearCache();
        controller.refresh();
    };

    context.subscriptions.push(
        controller,
        colorSettingsPanel,
        scheduleInitialRefreshes(controller),
        outputChannel,
        vscode.window.onDidChangeActiveTextEditor(() => controller.refresh()),
        vscode.window.onDidChangeVisibleTextEditors(() => controller.refresh()),
        vscode.workspace.onDidChangeTextDocument(invalidateTypeResolutionCache),
        vscode.workspace.onDidCreateFiles(invalidateTypeResolutionCache),
        vscode.workspace.onDidDeleteFiles(invalidateTypeResolutionCache),
        vscode.workspace.onDidRenameFiles(invalidateTypeResolutionCache),
        vscode.workspace.onDidChangeWorkspaceFolders(invalidateTypeResolutionCache),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration(ThrowableHighlightingContext.CONFIGURATION_SECTION)) {
                controller.refreshConfiguration();
                void colorSettingsPanel.refresh();
            }
        }),
        vscode.commands.registerCommand(INSPECT_DEFINITION_COMMAND, () => definitionProbe.inspectActiveSelection()),
        vscode.commands.registerCommand(OPEN_COLOR_SETTINGS_COMMAND, () => colorSettingsPanel.show())
    );

    controller.refresh();
}

export function deactivate(): void {}
