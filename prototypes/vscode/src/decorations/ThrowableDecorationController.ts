import vscode from "vscode";

import {
    DecorationTypes,
    HighlightingContext,
    ThrowableHighlightingContext
} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingContext";
import {
    ThrowableHighlightingCandidate,
    ThrowableHighlightingFinder
} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingFinder";
import {JavaTypeDefinitionResolver} from "@throwable-highlighter/resolution/JavaTypeDefinitionResolver";
import {ThrowableColorConfigurationReader} from "@throwable-highlighter/settings/ThrowableColorConfigurationReader";
import {ThrowableColorResolver} from "@throwable-highlighter/settings/ThrowableColorResolver";

export class ThrowableDecorationController implements vscode.Disposable {
    private decorationTypes: DecorationTypes;
    private isDisposed = false;
    private refreshGeneration = 0;

    constructor(
        private readonly throwableHighlightingFinder: ThrowableHighlightingFinder,
        private readonly definitionResolver: JavaTypeDefinitionResolver,
        private readonly throwableHighlightingContext: ThrowableHighlightingContext,
        private readonly colorConfigurationReader = new ThrowableColorConfigurationReader(),
        private readonly colorResolver = new ThrowableColorResolver()
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
        if (this.isDisposed) {
            return;
        }

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
        const {effective} = this.colorConfigurationReader.read(
            vscode.workspace.getConfiguration(ThrowableHighlightingContext.CONFIGURATION_SECTION)
        );

        const colors = this.colorResolver.resolve({
            class: effective.class.kind === "valid" ? effective.class.setting : {source: "native"},
            import: effective.import.kind === "valid" ? effective.import.setting : {source: "native"},
            catch: effective.catch.kind === "valid" ? effective.catch.setting : {source: "native"},
            throws: effective.throws.kind === "valid" ? effective.throws.setting : {source: "native"}
        });

        return {
            class: this.throwableHighlightingContext.createDecorationType(colors.class),
            import: this.throwableHighlightingContext.createDecorationType(colors.import),
            catch: this.throwableHighlightingContext.createDecorationType(colors.catch),
            throws: this.throwableHighlightingContext.createDecorationType(colors.throws)
        };
    }

    private disposeDecorationTypes(): void {
        for (const context of ThrowableHighlightingContext.HIGHLIGHT_CONTEXTS) {
            this.decorationTypes[context].dispose();
        }
    }
}
