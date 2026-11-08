import {performance} from "node:perf_hooks";
import {mock} from "node:test";
import {setTimeout as delay, setImmediate as nextTurn} from "node:timers/promises";

import * as vscode from "vscode";

import {JavaCatchClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaCatchClauseFinder";
import {JavaImportClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaImportClauseFinder";
import {JavaThrowsClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaThrowsClauseFinder";
import {JavaTypeReferenceRangeReader} from "@throwable-highlighter/decorations/highlighting/JavaTypeReferenceRangeReader";
import {ThrowableHighlightingContext} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingContext";
import {ThrowableHighlightingFinder} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingFinder";
import {ThrowableDecorationController} from "@throwable-highlighter/decorations/ThrowableDecorationController";
import {JavaCodeMask} from "@throwable-highlighter/java/JavaCodeMask";
import {JavaTypeDefinitionResolver} from "@throwable-highlighter/resolution/JavaTypeDefinitionResolver";
import type {ThrowableHighlightingCandidate} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingFinder";

export type RefreshBenchmarkOptions = {
    readonly candidateCount: number;
    readonly refreshCount: number;
    readonly intervalMs: number;
    readonly resolverDelayMs: number;
    readonly maximumConcurrentResolutions: number;
    readonly editorCount: number;
    readonly disposeAfterMs: number | null;
};

export type RefreshBenchmarkResult = RefreshBenchmarkOptions & {
    readonly resolverCalls: number;
    readonly peakPendingResolutions: number;
    readonly appliedUpdates: number;
    readonly latestUpdateMs: number | null;
    readonly pendingAtDispose: number | null;
    readonly drainAfterDisposeMs: number | null;
    readonly totalMs: number;
};

type CandidateRequest = {
    readonly number: number;
    readonly document: vscode.TextDocument;
};

const BENCHMARK_TIMEOUT_MARGIN_MS = 10_000;

export async function measureRefresh(options: RefreshBenchmarkOptions): Promise<RefreshBenchmarkResult> {
    let controller: ThrowableDecorationController | undefined;
    let resolverCalls = 0;
    let pendingResolutions = 0;
    let peakPendingResolutions = 0;
    let appliedUpdates = 0;
    let isFinished = false;
    const candidateRequests = new WeakMap<vscode.Range, CandidateRequest>();
    const updateEditors = new Set<number>();
    let issuedRefreshes = 0;
    let startedAt = 0;
    let disposedAt: number | null = null;
    let pendingAtDispose: number | null = null;
    let disposedDecorationTypes = 0;
    let lastRequestedAt = 0;
    let lastAppliedAt = 0;
    let lastResolvedAt = 0;
    let complete!: () => void;
    let fail!: (error: Error) => void;
    const completed = new Promise<void>((resolve, reject) => {
        complete = resolve;
        fail = reject;
    });
    const refreshWindowsMs = (options.refreshCount - 1) * options.intervalMs;
    const resolutionBatches = Math.ceil(
        (options.candidateCount * options.editorCount) / options.maximumConcurrentResolutions
    );
    const timeoutMs =
        Math.max(refreshWindowsMs, options.disposeAfterMs ?? 0) +
        (resolutionBatches + 1) * options.resolverDelayMs +
        BENCHMARK_TIMEOUT_MARGIN_MS;

    const timeout = setTimeout(
        () => fail(new Error("Refresh benchmark did not finish within " + timeoutMs + " ms.")),
        timeoutMs
    );

    function finishIfReady(): void {
        if (issuedRefreshes !== options.refreshCount || pendingResolutions !== 0) {
            return;
        }

        if (options.disposeAfterMs !== null) {
            if (disposedAt !== null) {
                void nextTurn().then(complete, fail);
            }

            return;
        }

        if (updateEditors.size === options.editorCount && lastAppliedAt >= lastRequestedAt && lastAppliedAt > 0) {
            complete();
        }
    }

    try {
        const candidates: ThrowableHighlightingCandidate[] = Array.from(
            {length: options.candidateCount},
            (_, index) => ({
                typeName: "SyntheticException",
                context: "class",
                range: new vscode.Range(
                    {line: index, character: 0} as vscode.Position,
                    {line: index, character: 18} as vscode.Position
                )
            })
        );
        const editors = Array.from({length: options.editorCount}, (_, editorIndex) => {
            const document = {languageId: "java", uri: {scheme: "file"}, version: 1} as vscode.TextDocument;
            let decorationWrites = 0;
            let appliedRequest = 0;

            return {
                document,
                setDecorations(type: vscode.TextEditorDecorationType, ranges: readonly unknown[]): void {
                    if (disposedAt !== null) {
                        fail(new Error("Benchmark applied highlights after disposal."));
                        return;
                    }

                    if (type.key === "benchmark-class") {
                        if (ranges.length !== options.candidateCount) {
                            fail(new Error("Benchmark did not receive the expected class highlights."));
                            return;
                        }

                        const request = candidateRequests.get(ranges[0] as vscode.Range);
                        appliedRequest = request?.number ?? 0;

                        if (request?.document !== document || appliedRequest !== issuedRefreshes) {
                            fail(new Error("Benchmark received a result for an outdated request or another document."));
                            return;
                        }
                    }

                    decorationWrites++;

                    if (decorationWrites % ThrowableHighlightingContext.HIGHLIGHT_CONTEXTS.length === 0) {
                        appliedUpdates++;

                        if (appliedRequest === options.refreshCount) {
                            updateEditors.add(editorIndex);
                            lastAppliedAt = performance.now();
                        }

                        finishIfReady();
                    }
                }
            } as vscode.TextEditor;
        });
        const colors: Record<string, unknown> = {
            classColorSource: "custom",
            classColor: "#ABCDEF"
        };
        const configuration = {
            get<T>(key: string): T | undefined {
                return colors[key] as T | undefined;
            },
            inspect(key: string) {
                return {key, globalValue: colors[key]};
            }
        } as vscode.WorkspaceConfiguration;
        let decorationIndex = 0;

        mock.getter(vscode.window, "visibleTextEditors", () => editors);
        mock.method(vscode.workspace, "getConfiguration", () => configuration);
        mock.method(vscode.window, "createTextEditorDecorationType", () => ({
            key: "benchmark-" + ThrowableHighlightingContext.HIGHLIGHT_CONTEXTS[decorationIndex++],
            dispose(): void {
                disposedDecorationTypes++;
            }
        }));

        const codeMask = new JavaCodeMask();
        const rangeReader = new JavaTypeReferenceRangeReader();
        const finder = new ThrowableHighlightingFinder(
            codeMask,
            new JavaImportClauseFinder(),
            new JavaCatchClauseFinder(rangeReader),
            new JavaThrowsClauseFinder(rangeReader)
        );
        const resolver = new JavaTypeDefinitionResolver(codeMask);

        finder.findCandidates = document => {
            const first = candidates[0];
            const range = new vscode.Range(first.range.start, first.range.end);

            candidateRequests.set(range, {number: issuedRefreshes, document});

            return [{...first, range}, ...candidates.slice(1)];
        };
        resolver.isThrowableType = async () => {
            if (disposedAt !== null) {
                fail(new Error("Benchmark started a resolution after disposal."));
                return false;
            }

            resolverCalls++;
            pendingResolutions++;
            peakPendingResolutions = Math.max(peakPendingResolutions, pendingResolutions);

            try {
                await delay(options.resolverDelayMs);
                return true;
            } finally {
                pendingResolutions--;
                lastResolvedAt = performance.now();
                finishIfReady();
            }
        };

        const currentController = new ThrowableDecorationController(
            finder,
            resolver,
            new ThrowableHighlightingContext(),
            undefined,
            undefined,
            undefined,
            options.maximumConcurrentResolutions
        );

        controller = currentController;
        startedAt = performance.now();

        const issueRefreshes = async (): Promise<void> => {
            for (let index = 0; index < options.refreshCount; index++) {
                if (index > 0) {
                    await delay(options.intervalMs);
                }

                if (isFinished) {
                    return;
                }

                lastRequestedAt = performance.now();
                issuedRefreshes++;
                currentController.refresh(options.refreshCount > 1 ? "deferred" : "urgent");
            }
        };

        const disposeDuringRefresh = async (): Promise<void> => {
            const disposeAfterMs = options.disposeAfterMs;

            if (disposeAfterMs === null) {
                return;
            }

            await delay(disposeAfterMs);

            if (isFinished) {
                return;
            }

            if (pendingResolutions === 0) {
                throw new Error("Benchmark did not reach disposal with pending resolutions.");
            }

            pendingAtDispose = pendingResolutions;
            disposedAt = performance.now();
            currentController.dispose();

            if (disposedDecorationTypes !== ThrowableHighlightingContext.HIGHLIGHT_CONTEXTS.length) {
                throw new Error("Benchmark did not dispose all decoration types.");
            }

            finishIfReady();
        };

        await Promise.all([issueRefreshes(), disposeDuringRefresh(), completed]);

        return {
            ...options,
            resolverCalls,
            peakPendingResolutions,
            appliedUpdates,
            latestUpdateMs: disposedAt === null ? lastAppliedAt - lastRequestedAt : null,
            pendingAtDispose,
            drainAfterDisposeMs: disposedAt === null ? null : lastResolvedAt - disposedAt,
            totalMs: Math.max(lastAppliedAt, lastResolvedAt) - startedAt
        };
    } finally {
        isFinished = true;
        clearTimeout(timeout);
        controller?.dispose();
        mock.reset();
    }
}
