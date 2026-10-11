import * as vscode from "vscode";
import {ThrowableDecorationController} from "./decorations/ThrowableDecorationController";
import {ThrowableHighlightingContext} from "./decorations/highlighting/ThrowableHighlightingContext";
import {ThrowableHighlightingFinder} from "./decorations/highlighting/ThrowableHighlightingFinder";
import {JavaCodeMask} from "./decorations/highlighting/JavaCodeMask";

export function activate(context: vscode.ExtensionContext): void {
    const throwableHighlightingContext = new ThrowableHighlightingContext();

    const controller = new ThrowableDecorationController(
        new ThrowableHighlightingFinder(
            new JavaCodeMask()
        ),
        throwableHighlightingContext
    );
    const outputChannel = vscode.window.createOutputChannel(
        "Throwable Highlighter Prototype"
    );

    outputChannel.appendLine("Decoration controller activated.");

    context.subscriptions.push(
        controller,
        outputChannel,
        vscode.window.onDidChangeActiveTextEditor(
            () => controller.refresh()
        ),
        vscode.window.onDidChangeVisibleTextEditors(
            () => controller.refresh()
        ),
        vscode.workspace.onDidChangeTextDocument(
            event => controller.refreshDocument(event.document)
        ),
        vscode.workspace.onDidChangeConfiguration(
            event => {
                if (event.affectsConfiguration(ThrowableHighlightingContext.CONFIGURATION_SECTION)) {
                    controller.refreshConfiguration();
                }
            }
        )
    );

    controller.refresh();
}

export function deactivate(): void {
}