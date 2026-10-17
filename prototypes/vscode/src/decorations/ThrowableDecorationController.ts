import vscode from "vscode";
import {
    DecorationTypes,
    HighlightingContext,
    ThrowableHighlightingContext
} from "./highlighting/ThrowableHighlightingContext";
import {ThrowableHighlightingCandidate, ThrowableHighlightingFinder} from "./highlighting/ThrowableHighlightingFinder";
import {JavaTypeDefinitionResolver} from "../resolution/JavaTypeDefinitionResolver";

export class ThrowableDecorationController implements vscode.Disposable {
    private decorationTypes: DecorationTypes;
    private isDisposed = false;
    private refreshGeneration = 0;

    constructor(
        private readonly throwableHighlightingFinder: ThrowableHighlightingFinder,
        private readonly definitionResolver: JavaTypeDefinitionResolver,
        private readonly throwableHighlightingContext: ThrowableHighlightingContext
    ) {
        this.decorationTypes = this.createDecorationTypes();
    }

    public refresh(): void {
        const refreshGeneration = ++this.refreshGeneration;

        for (const editor of vscode.window.visibleTextEditors) {
            void this.apply(editor, refreshGeneration);
        }
    }

    public refreshConfiguration(): void {
        this.disposeDecorationTypes();
        this.decorationTypes = this.createDecorationTypes();

        this.refresh();
    }

    public dispose(): void {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        this.disposeDecorationTypes();
    }

    private async apply(editor: vscode.TextEditor, refreshGeneration: number): Promise<void> {
        if (this.isDisposed) {
            return;
        }

        const document = editor.document;

        if (!this.throwableHighlightingContext.isSupportedDocument(document)) {
            this.clear(editor);
            return;
        }

        const documentVersion = document.version;
        const candidates = this.throwableHighlightingFinder.findCandidates(document);

        const resolvedCandidates = await Promise.all(
            candidates.map(async candidate => ({
                candidate,
                isThrowableType: await this.isThrowableCandidate(document, candidate)
            }))
        );

        if (
            this.isDisposed ||
            refreshGeneration !== this.refreshGeneration ||
            editor.document !== document ||
            document.version !== documentVersion ||
            !this.throwableHighlightingContext.isSupportedDocument(document)
        ) {
            return;
        }

        const highlights = this.createHighlights();

        for (const result of resolvedCandidates) {
            if (result.isThrowableType) {
                highlights[result.candidate.context].push(result.candidate.range);
            }
        }

        for (const context of ThrowableHighlightingContext.HIGHLIGHT_CONTEXTS) {
            editor.setDecorations(this.decorationTypes[context], highlights[context]);
        }
    }

    private async isThrowableCandidate(
        document: vscode.TextDocument,
        candidate: ThrowableHighlightingCandidate
    ): Promise<boolean> {
        try {
            return await this.definitionResolver.isThrowableType(document, candidate.range.start);
        } catch {
            return false;
        }
    }

    private createHighlights(): Record<HighlightingContext, vscode.Range[]> {
        return {
            class: [],
            import: [],
            catch: [],
            throws: []
        };
    }

    private clear(editor: vscode.TextEditor): void {
        for (const context of ThrowableHighlightingContext.HIGHLIGHT_CONTEXTS) {
            editor.setDecorations(this.decorationTypes[context], []);
        }
    }

    private createDecorationTypes(): DecorationTypes {
        const classColor = this.getConfiguredColor("classColor");
        const importColor = this.getConfiguredColor("importColor") ?? classColor;
        const catchColor = this.getConfiguredColor("catchColor") ?? classColor;
        const throwsColor = this.getConfiguredColor("throwsColor") ?? classColor;

        return {
            class: this.throwableHighlightingContext.createDecorationType(classColor),
            import: this.throwableHighlightingContext.createDecorationType(importColor),
            catch: this.throwableHighlightingContext.createDecorationType(catchColor),
            throws: this.throwableHighlightingContext.createDecorationType(throwsColor)
        };
    }

    private getConfiguredColor(
        setting: "classColor" | "importColor" | "catchColor" | "throwsColor"
    ): string | undefined {
        const value =
            vscode.workspace
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
