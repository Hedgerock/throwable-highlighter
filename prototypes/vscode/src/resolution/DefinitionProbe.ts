import * as vscode from "vscode";

export const INSPECT_DEFINITION_COMMAND =
    "throwableHighlighter.prototype.inspectDefinition";

export class DefinitionProbe {

    private readonly outputChannel: vscode.OutputChannel;


    constructor(outputChannel: vscode.OutputChannel) {
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
        const symbol = this.getSymbolAtPosition(
            editor.document,
            position
        );

        this.outputChannel.show(true);
        this.writeLine("");
        this.writeLine(
            `Inspecting "${symbol}" at ${this.formatLocation(
                editor.document.uri,
                new vscode.Range(position, position)
            )}.`
        );

        try {
            const definitions = await vscode.commands.executeCommand<readonly (vscode.Location | vscode.LocationLink)[]>(
                "vscode.executeDefinitionProvider",
                editor.document.uri,
                position
            );

            if (definitions === undefined || definitions.length === 0) {
                this.writeLine("Definition provider returned no results.");
                return;
            }

            this.writeLine(`Definition provider returned ${definitions.length} result(s).`);

            for (const [index, definition] of definitions.entries()) {
                await this.inspectDefinition(index + 1, definition);
            }
        } catch (error) {
            this.writeLine(
                `Definition provider failed: ${this.getErrorMessage(error)}`
            );
        }
    }

    private async inspectDefinition(
        index: number,
        definition: vscode.Location | vscode.LocationLink
    ): Promise<void> {
        const location = this.toLocation(definition);

        this.writeLine(
            `${index}. ${this.formatLocation(
                location.uri,
                location.range
            )}`
        );

        try {
            const document = await vscode.workspace.openTextDocument(location.uri);

            this.writeLine(
                ` Document opened: ${document.languageId}, `
                + `${document.lineCount} line(s).`
            )
        } catch (error) {
            this.writeLine(
                ` Document could not be opened: `
                + this.getErrorMessage(error)
            )
        }
    }

    private getSymbolAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): string {
        const range = document.getWordRangeAtPosition(position);

        return range === undefined
            ? "<no symbol>"
            : document.getText(range);
    }

    private toLocation(
        definition: vscode.Location | vscode.LocationLink
    ): vscode.Location {
        if ("targetUri" in definition) {
            return new vscode.Location(
                definition.targetUri,
                definition.targetRange
            );
        }

        return definition;
    }

    private formatLocation(
        uri: vscode.Uri,
        range: vscode.Range
    ): string {
        return `${uri.toString()}:`
            + `${range.start.line + 1}:`
            + `${range.start.character + 1}`;
    }

    private getErrorMessage(error: unknown): string {
        return error instanceof Error
            ? error.message
            : String(error);
    }

    private writeLine(message: string): void {
        this.outputChannel.appendLine(message);
    }
}
