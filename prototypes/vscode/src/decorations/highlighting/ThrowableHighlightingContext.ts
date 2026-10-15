import vscode from "vscode";

export type HighlightingContext = typeof ThrowableHighlightingContext.HIGHLIGHT_CONTEXTS[number];

export type DecorationTypes = Record<HighlightingContext, vscode.TextEditorDecorationType>;

export class ThrowableHighlightingContext {
    public static CONFIGURATION_SECTION = "throwableHighlighter.prototype";

    public static HIGHLIGHT_CONTEXTS = [
        "class",
        "import",
        "catch",
        "throws"
    ] as const;

    public static CATCH_PARAMETER_PATTERN = /\bcatch\s*\(([\s\S]*?)\)/g;

    public createDecorationType(
        color: string | undefined
    ): vscode.TextEditorDecorationType {
        if (color === undefined) {
            return vscode.window.createTextEditorDecorationType({})
        }

        return vscode.window.createTextEditorDecorationType({
            color
        })
    }

    public isSupportedDocument(
        document: vscode.TextDocument
    ): boolean {
        return document.languageId === "java"
            && document.uri.scheme === "file";
    }
}
