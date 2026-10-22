import * as vscode from "vscode";

import type {JavaTypeDefinitionResolver} from "@throwable-highlighter/resolution/JavaTypeDefinitionResolver";

export const INSPECT_DEFINITION_COMMAND = "throwableHighlighter.prototype.inspectDefinition";

export class DefinitionProbe {
    private readonly outputChannel: vscode.OutputChannel;

    constructor(
        outputChannel: vscode.OutputChannel,
        private readonly definitionResolver: JavaTypeDefinitionResolver
    ) {
        this.outputChannel = outputChannel;
    }

    async inspectActiveSelection(): Promise<void> {
        const editor = vscode.window.activeTextEditor;

        if (editor === undefined) {
            this.writeLine("No active editor.");
            return;
        }

        if (editor.document.languageId !== "java") {
            this.writeLine("The active document is not a Java file.");
            return;
        }

        const position = editor.selection.active;
        const symbol = this.getSymbolAtPosition(editor.document, position);

        this.outputChannel.show(true);
        this.writeLine("");
        this.writeLine(
            `Inspecting "${symbol}" at ${this.formatLocation(
                editor.document.uri,
                new vscode.Range(position, position)
            )}.`
        );

        const isThrowableType = await this.definitionResolver.isThrowableType(editor.document, position);

        this.writeLine(`Resolved as Throwable type: ${isThrowableType}.`);

        try {
            const definitions = await vscode.commands.executeCommand<
                readonly (vscode.Location | vscode.LocationLink)[]
            >("vscode.executeDefinitionProvider", editor.document.uri, position);

            if (definitions === undefined || definitions.length === 0) {
                this.writeLine("Definition provider returned no results.");
                return;
            }

            this.writeLine(`Definition provider returned ${definitions.length} result(s).`);

            for (const [index, definition] of definitions.entries()) {
                await this.inspectDefinition(index + 1, definition);
            }
        } catch (error) {
            this.writeLine(`Definition provider failed: ${this.getErrorMessage(error)}`);
        }
    }

    private async inspectDefinition(index: number, definition: vscode.Location | vscode.LocationLink): Promise<void> {
        try {
            const location = this.toLocation(definition);

            this.writeLine(`${index}.${this.formatLocation(location.uri, location.range)}`);

            if ("targetUri" in definition) {
                this.writeLine(
                    ` Target range start: ${this.formatLocation(definition.targetUri, definition.targetRange)}`
                );

                this.writeLine(
                    definition.targetSelectionRange === undefined
                        ? " Target selection start: <not provided>"
                        : ` Target selection start: ${this.formatLocation(definition.targetUri, definition.targetSelectionRange)}`
                );
            }

            const document = await vscode.workspace.openTextDocument(location.uri);

            this.writeLine(` Document opened: ${document.languageId}, ${document.lineCount} line(s).`);
            this.writeLine(` Definition symbol: ${this.getSymbolAtPosition(document, location.range.start)}`);
            this.writeLine(` Definition line: ${document.lineAt(location.range.start.line).text.trim()}`);
            await this.inspectDocumentSymbols(document);
        } catch (error) {
            this.writeLine(` Definition could not be inspected: ${this.getErrorMessage(error)}`);
        }
    }

    private async inspectDocumentSymbols(document: vscode.TextDocument): Promise<void> {
        try {
            const symbols =
                (await vscode.commands.executeCommand<readonly (vscode.DocumentSymbol | vscode.SymbolInformation)[]>(
                    "vscode.executeDocumentSymbolProvider",
                    document.uri
                )) ?? [];

            if (symbols.length === 0) {
                this.writeLine(" Document symbol provider returned no results.");
                return;
            }

            this.writeLine(` Document symbol provider returned ${symbols.length} root symbol(s).`);

            const visit = (
                items: readonly (vscode.DocumentSymbol | vscode.SymbolInformation)[],
                depth: number
            ): void => {
                for (const symbol of items) {
                    const prefix = " ".repeat(depth * 2 + 1);
                    const kind = vscode.SymbolKind[symbol.kind];

                    if ("children" in symbol) {
                        this.writeLine(
                            `${prefix}${kind} "${symbol.name}" range=${this.formatRange(symbol.range)} ` +
                                `selection=${this.formatRange(symbol.selectionRange)} ` +
                                `word="${this.getSymbolAtPosition(document, symbol.selectionRange.start)}"`
                        );
                        visit(symbol.children, depth + 1);
                    } else {
                        this.writeLine(
                            `${prefix}${kind} "${symbol.name}" [flat] ` +
                                `container="${symbol.containerName}" range=${this.formatRange(symbol.location.range)}`
                        );
                    }
                }
            };
            visit(symbols, 0);
        } catch (error) {
            this.writeLine(` Document symbol provider failed: ${this.getErrorMessage(error)}`);
        }
    }

    private formatRange(range: vscode.Range): string {
        return `${range.start.line + 1}:${range.start.character + 1}-${range.end.line + 1}:${range.end.character + 1}`;
    }

    private getSymbolAtPosition(document: vscode.TextDocument, position: vscode.Position): string {
        const range = document.getWordRangeAtPosition(position);

        return range === undefined ? "<no symbol>" : document.getText(range);
    }

    private toLocation(definition: vscode.Location | vscode.LocationLink): vscode.Location {
        if ("targetUri" in definition) {
            return new vscode.Location(definition.targetUri, definition.targetSelectionRange ?? definition.targetRange);
        }

        return definition;
    }

    private formatLocation(uri: vscode.Uri, range: vscode.Range): string {
        return `${uri.toString()}:` + `${range.start.line + 1}:` + `${range.start.character + 1}`;
    }

    private getErrorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }

    private writeLine(message: string): void {
        this.outputChannel.appendLine(message);
    }
}
