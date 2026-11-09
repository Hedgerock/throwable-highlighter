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
import {ThrowableRefreshScheduler} from "@throwable-highlighter/decorations/scheduling/ThrowableRefreshScheduler";
import {JavaTypeDefinitionResolver} from "@throwable-highlighter/resolution/JavaTypeDefinitionResolver";
import {ThrowableColorConfigurationReader} from "@throwable-highlighter/settings/ThrowableColorConfigurationReader";
import {ThrowableColorResolver} from "@throwable-highlighter/settings/ThrowableColorResolver";
import type {RefreshMode} from "@throwable-highlighter/decorations/scheduling/ThrowableRefreshScheduler";

export type RefreshReason =
    | "activation"
    | "java-ready"
    | "active-editor"
    | "visible-editors"
    | "document-change"
    | "workspace-change"
    | "configuration"
    | "manual";

export type RefreshMeasurement = {
    readonly generation: number;
    readonly reason: RefreshReason;
    readonly mode: RefreshMode;
    readonly editorNumber: number;
    readonly waitMs: number;
    readonly processingMs: number;
    readonly totalMs: number;
};

export type RefreshActivity =
    | {readonly kind: "requested"; readonly generation: number}
    | {readonly kind: "applied"; readonly generation: number; readonly editor: vscode.TextEditor};

type RefreshRequest = {
    readonly reason: RefreshReason;
    readonly requestedAt: number;
};

type RefreshTiming = RefreshRequest & {
    readonly mode: RefreshMode;
    readonly startedAt: number;
};

type EditorResolution = {
    readonly editor: vscode.TextEditor;
    readonly document: vscode.TextDocument;
    readonly documentVersion: number;
    readonly candidates: readonly ThrowableHighlightingCandidate[];
    readonly confirmed: boolean[];
    remaining: number;
};

type CandidateResolution = {
    readonly editorNumber: number;
    readonly document: vscode.TextDocument;
    readonly candidate: ThrowableHighlightingCandidate;
    readonly candidateIndex: number;
};

type RefreshResolution = {
    readonly generation: number;
    readonly timing: RefreshTiming | undefined;
    readonly editors: Map<number, EditorResolution>;
    readonly candidates: Iterator<CandidateResolution>;
};

const DEBOUNCE_IN_MS = 120;
const MAXIMUM_WAIT_IN_MS = 500;

const MAXIMUM_CONCURRENT_RESOLUTION = 64;

export class ThrowableDecorationController implements vscode.Disposable {
    private decorationTypes: DecorationTypes;
    private isDisposed = false;
    private refreshGeneration = 0;
    private activeResolutionCount = 0;
    private resolution: RefreshResolution | undefined;
    private readonly scheduler: ThrowableRefreshScheduler;
    private pendingRequest: RefreshRequest | undefined;

    constructor(
        private readonly throwableHighlightingFinder: ThrowableHighlightingFinder,
        private readonly definitionResolver: JavaTypeDefinitionResolver,
        private readonly throwableHighlightingContext: ThrowableHighlightingContext,
        private readonly colorConfigurationReader = new ThrowableColorConfigurationReader(),
        private readonly colorResolver = new ThrowableColorResolver(),
        private readonly onMeasurement?: (measurement: RefreshMeasurement) => void,
        private readonly maximumConcurrentResolution = MAXIMUM_CONCURRENT_RESOLUTION,
        private readonly onRefreshActivity?: (activity: RefreshActivity) => void
    ) {
        if (!Number.isSafeInteger(maximumConcurrentResolution) || maximumConcurrentResolution <= 0) {
            throw new RangeError("Maximum concurrent resolution must be a positive integer");
        }

        this.decorationTypes = this.createDecorationTypes();
        this.scheduler = new ThrowableRefreshScheduler(mode => this.runRefresh(mode), {
            debounceMs: DEBOUNCE_IN_MS,
            maximumWaitMs: MAXIMUM_WAIT_IN_MS
        });
    }

    public refresh(mode: RefreshMode = "urgent", reason: RefreshReason = "manual", requestedAt?: number): void {
        if (this.isDisposed) {
            return;
        }

        this.refreshGeneration++;
        this.resolution = undefined;

        if (this.onMeasurement !== undefined) {
            this.pendingRequest = {reason, requestedAt: requestedAt ?? performance.now()};
        }

        this.onRefreshActivity?.({kind: "requested", generation: this.refreshGeneration});

        if (mode === "deferred") {
            this.scheduler.request();
            return;
        }

        this.scheduler.requestUrgent();
    }

    public refreshConfiguration(): void {
        if (this.isDisposed) {
            return;
        }

        this.disposeDecorationTypes();
        this.decorationTypes = this.createDecorationTypes();

        this.refresh("urgent", "configuration");
    }

    public dispose(): void {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        this.scheduler.dispose();
        this.resolution = undefined;
        this.pendingRequest = undefined;
        this.disposeDecorationTypes();
    }

    private apply(
        target: EditorResolution,
        refreshGeneration: number,
        editorNumber: number,
        timing?: RefreshTiming
    ): void {
        if (this.isDisposed || refreshGeneration !== this.refreshGeneration || !this.isCurrentEditor(target)) {
            return;
        }

        const highlights = this.createHighlights();

        for (const [index, candidate] of target.candidates.entries()) {
            if (target.confirmed[index]) {
                highlights[candidate.context].push(candidate.range);
            }
        }

        for (const context of ThrowableHighlightingContext.HIGHLIGHT_CONTEXTS) {
            target.editor.setDecorations(this.decorationTypes[context], highlights[context]);
        }

        if (timing !== undefined) {
            const finishedAt = performance.now();

            this.onMeasurement?.({
                generation: refreshGeneration,
                reason: timing.reason,
                mode: timing.mode,
                editorNumber,
                waitMs: timing.startedAt - timing.requestedAt,
                processingMs: finishedAt - timing.startedAt,
                totalMs: finishedAt - timing.requestedAt
            });
        }

        this.onRefreshActivity?.({kind: "applied", generation: refreshGeneration, editor: target.editor});
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

    private runRefresh(mode: RefreshMode): void {
        const generation = this.refreshGeneration;
        const request = this.pendingRequest;
        this.pendingRequest = undefined;

        const timing = request === undefined ? undefined : {...request, mode, startedAt: performance.now()};
        const editors = new Map<number, EditorResolution>();

        for (const [index, editor] of vscode.window.visibleTextEditors.entries()) {
            const document = editor.document;

            if (!this.throwableHighlightingContext.isSupportedDocument(document)) {
                this.clear(editor);
                continue;
            }

            const documentVersion = document.version;
            const candidates = this.throwableHighlightingFinder.findCandidates(document);
            const target: EditorResolution = {
                editor,
                document,
                documentVersion,
                candidates,
                confirmed: [],
                remaining: candidates.length
            };

            const editorNumber = index + 1;

            if (candidates.length === 0) {
                this.apply(target, generation, editorNumber, timing);
            } else {
                editors.set(editorNumber, target);
            }
        }

        if (!this.isDisposed && generation === this.refreshGeneration) {
            this.resolution = {generation, timing, editors, candidates: this.iterateCandidates(editors)};
            this.fillResolutionSlots();
        }
    }

    private *iterateCandidates(editors: Map<number, EditorResolution>): Generator<CandidateResolution> {
        for (const [editorNumber, target] of editors) {
            for (const [candidateIndex, candidate] of target.candidates.entries()) {
                if (!this.isCurrentEditor(target)) {
                    editors.delete(editorNumber);
                    break;
                }

                yield {editorNumber, document: target.document, candidate, candidateIndex};
            }
        }
    }

    private fillResolutionSlots(): void {
        while (this.activeResolutionCount < this.maximumConcurrentResolution) {
            const resolution = this.resolution;

            if (resolution === undefined) {
                return;
            }

            const next = resolution.candidates.next();

            if (next.done) {
                return;
            }

            this.activeResolutionCount++;
            void this.resolveCandidate(resolution.generation, next.value);
        }
    }

    private async resolveCandidate(generation: number, work: CandidateResolution): Promise<void> {
        try {
            const confirmed = await this.isThrowableCandidate(work.document, work.candidate);
            const resolution = this.resolution;

            if (resolution?.generation !== generation) {
                return;
            }

            const target = resolution.editors.get(work.editorNumber);

            if (target === undefined) {
                return;
            }

            target.confirmed[work.candidateIndex] = confirmed;
            target.remaining--;

            if (target.remaining == 0) {
                resolution.editors.delete(work.editorNumber);
                this.apply(target, generation, work.editorNumber, resolution.timing);
            }
        } finally {
            this.activeResolutionCount--;
            this.fillResolutionSlots();
        }
    }

    private isCurrentEditor(target: EditorResolution): boolean {
        return (
            target.editor.document === target.document &&
            target.document.version === target.documentVersion &&
            this.throwableHighlightingContext.isSupportedDocument(target.document)
        );
    }
}
