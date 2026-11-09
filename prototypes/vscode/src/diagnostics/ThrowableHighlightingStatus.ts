import * as vscode from "vscode";

import type {ThrowableHighlightingContext} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingContext";
import type {RefreshActivity} from "@throwable-highlighter/decorations/ThrowableDecorationController";

export const OPEN_DIAGNOSTICS_COMMAND = "throwableHighlighter.prototype.openDiagnostics";

const SLOW_REFRESH_THRESHOLD_MS = 2_000;

const STATUS_TEXT = {
    "waiting-for-java": "Waiting for Java",
    "java-readiness-unconfirmed": "Java readiness unconfirmed",
    "updating-highlighting": "Updating highlighting",
    ready: "Ready"
} as const;

type JavaReadinessState = "waiting-for-java" | "java-readiness-unconfirmed" | "ready";

type ObservedRefresh = {
    readonly generation: number;
    readonly editor: vscode.TextEditor;
    readonly document: vscode.TextDocument;
    readonly documentVersion: number;
    readonly requestedAt: number;
    isSlow: boolean;
};

type RefreshDiagnostic = {
    readonly generation: number;
    readonly outcome: "slow" | "applied";
    readonly elapsedMs: number;
};

export class ThrowableHighlightingStatus implements vscode.Disposable {
    private readonly item: vscode.LanguageStatusItem;
    private javaReadiness: JavaReadinessState = "waiting-for-java";
    private refresh: ObservedRefresh | undefined;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private isDisposed = false;

    constructor(
        private readonly highlightingContext: ThrowableHighlightingContext,
        private readonly onDiagnostic: (diagnostic: RefreshDiagnostic) => void
    ) {
        this.item = vscode.languages.createLanguageStatusItem("throwableHighlighter.prototype.highlightingStatus", {
            language: "java",
            scheme: "file"
        });
        this.item.name = "Throwable Highlighter";
        this.item.command = {
            command: OPEN_DIAGNOSTICS_COMMAND,
            title: "Open Diagnostics"
        };
        this.render();
    }

    public setJavaReadiness(state: JavaReadinessState): void {
        if (this.isDisposed) {
            return;
        }

        this.javaReadiness = state;
        this.render();
    }

    public onRefreshActivity(activity: RefreshActivity): void {
        if (this.isDisposed) {
            return;
        }

        if (activity.kind === "requested") {
            this.startRefresh(activity.generation);
            return;
        }

        const refresh = this.refresh;

        if (
            refresh === undefined ||
            refresh.generation !== activity.generation ||
            refresh.editor !== activity.editor ||
            !this.isCurrentTarget(refresh)
        ) {
            return;
        }

        this.clearRefresh();
        this.render();

        if (refresh.isSlow) {
            this.report(refresh, "applied");
        }
    }

    public dispose(): void {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        this.clearRefresh();
        this.item.dispose();
    }

    private startRefresh(generation: number): void {
        this.clearRefresh();

        const editor = vscode.window.activeTextEditor;
        if (editor !== undefined && this.highlightingContext.isSupportedDocument(editor.document)) {
            const document = editor.document;
            const refresh: ObservedRefresh = {
                generation,
                editor,
                document,
                documentVersion: document.version,
                requestedAt: performance.now(),
                isSlow: false
            };

            this.refresh = refresh;
            this.timer = setTimeout(() => this.markSlow(refresh), SLOW_REFRESH_THRESHOLD_MS);
        }

        this.render();
    }

    private markSlow(refresh: ObservedRefresh): void {
        if (this.refresh !== refresh) {
            return;
        }

        this.timer = undefined;
        if (!this.isCurrentTarget(refresh)) {
            this.refresh = undefined;
            return;
        }

        refresh.isSlow = true;
        this.render();
        this.report(refresh, "slow");
    }

    private isCurrentTarget(refresh: ObservedRefresh): boolean {
        return (
            vscode.window.activeTextEditor === refresh.editor &&
            refresh.editor.document === refresh.document &&
            refresh.document.version === refresh.documentVersion
        );
    }

    private clearRefresh(): void {
        clearTimeout(this.timer);
        this.timer = undefined;
        this.refresh = undefined;
    }

    private render(): void {
        const state =
            this.javaReadiness !== "waiting-for-java" && this.refresh?.isSlow
                ? "updating-highlighting"
                : this.javaReadiness;

        const text = STATUS_TEXT[state];

        if (this.item.text === text) {
            return;
        }

        this.item.text = text;
        this.item.busy = state === "waiting-for-java" || state === "updating-highlighting";
    }

    private report(refresh: ObservedRefresh, outcome: RefreshDiagnostic["outcome"]): void {
        this.onDiagnostic({
            generation: refresh.generation,
            outcome,
            elapsedMs: performance.now() - refresh.requestedAt
        });
    }
}
