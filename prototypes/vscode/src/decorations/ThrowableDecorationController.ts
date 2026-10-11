import vscode from "vscode";
import {DecorationTypes, ThrowableHighlightingContext} from "./highlighting/ThrowableHighlightingContext";
import {ThrowableHighlightingFinder} from "./highlighting/ThrowableHighlightingFinder";

export class ThrowableDecorationController implements vscode.Disposable {
    private throwableHighlightingFinder: ThrowableHighlightingFinder;
    private throwableHighlightingContext: ThrowableHighlightingContext;
    private decorationTypes: DecorationTypes;

    constructor(
        throwableHighlightingFinder: ThrowableHighlightingFinder,
        throwableHighlightingContext: ThrowableHighlightingContext,
    ) {
        this.throwableHighlightingFinder = throwableHighlightingFinder;
        this.throwableHighlightingContext = throwableHighlightingContext;
        this.decorationTypes = this.createDecorationTypes();
    }

    refresh(): void {
        for (const editor of vscode.window.visibleTextEditors) {
            this.apply(editor);
        }
    }

    refreshDocument(document: vscode.TextDocument): void {
        for (const editor of vscode.window.visibleTextEditors) {
            if (editor.document === document) {
                this.apply(editor);
            }
        }
    }

    refreshConfiguration(): void {
        this.disposeDecorationTypes();
        this.decorationTypes = this.createDecorationTypes();

        this.refresh();
    }

    dispose(): void {
        this.disposeDecorationTypes();
    }

    private apply(editor: vscode.TextEditor): void {
        if (!this.throwableHighlightingContext.isSupportedDocument(editor.document)) {
            this.clear(editor);
            return;
        }

        const highlights = this.throwableHighlightingFinder.findHighlights(editor.document);

        for (const context of ThrowableHighlightingContext.HIGHLIGHT_CONTEXTS) {
            editor.setDecorations(
                this.decorationTypes[context],
                highlights[context]
            );
        }
    }

    private clear(editor: vscode.TextEditor): void {
        for (const context of ThrowableHighlightingContext.HIGHLIGHT_CONTEXTS) {
            editor.setDecorations(
                this.decorationTypes[context],
                []
            );
        }
    }

    private createDecorationTypes(): DecorationTypes {
        const classColor = this.getConfiguredColor("classColor");
        const importColor = this.getConfiguredColor("importColor") ?? classColor;
        const catchColor = this.getConfiguredColor("catchColor") ?? classColor;

        return {
            class: this.throwableHighlightingContext.createDecorationType(classColor),
            import: this.throwableHighlightingContext.createDecorationType(importColor),
            catch: this.throwableHighlightingContext.createDecorationType(catchColor)
        }
    }

    private getConfiguredColor(
        setting: "classColor" | "importColor" | "catchColor"
    ): string | undefined {
        const value = vscode.workspace
            .getConfiguration(ThrowableHighlightingContext.CONFIGURATION_SECTION)
            .get<string>(setting) ?? "";

        const color = value.trim();

        return color === "" ? undefined : color;
    }

    private disposeDecorationTypes(): void {
        for (const context of ThrowableHighlightingContext.HIGHLIGHT_CONTEXTS) {
            this.decorationTypes[context].dispose();
        }
    }
}
