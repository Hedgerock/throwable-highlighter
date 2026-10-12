import * as vscode from "vscode";
import {ThrowableDecorationController} from "./decorations/ThrowableDecorationController";
import {ThrowableHighlightingContext} from "./decorations/highlighting/ThrowableHighlightingContext";
import {ThrowableHighlightingFinder} from "./decorations/highlighting/ThrowableHighlightingFinder";
import {JavaCodeMask} from "./java/JavaCodeMask";
import {DefinitionProbe, INSPECT_DEFINITION_COMMAND} from "./resolution/DefinitionProbe";
import {JavaTypeDefinitionResolver} from "./resolution/JavaTypeDefinitionResolver";

export function activate(context: vscode.ExtensionContext): void {
    const throwableHighlightingContext = new ThrowableHighlightingContext();

    const javaCodeMask = new JavaCodeMask();
    const definitionResolver = new JavaTypeDefinitionResolver(
        javaCodeMask
    );

    const controller = new ThrowableDecorationController(
        new ThrowableHighlightingFinder(javaCodeMask),
        throwableHighlightingContext
    );
    const outputChannel = vscode.window.createOutputChannel(
        "Throwable Highlighter Prototype"
    );

    outputChannel.appendLine("Decoration controller activated.");

    const definitionProbe = new DefinitionProbe(
        outputChannel,
        definitionResolver
    );

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
        ),
        vscode.commands.registerCommand(
            INSPECT_DEFINITION_COMMAND,
            () => definitionProbe.inspectActiveSelection()
        )
    );

    controller.refresh();
}

export function deactivate(): void {
}