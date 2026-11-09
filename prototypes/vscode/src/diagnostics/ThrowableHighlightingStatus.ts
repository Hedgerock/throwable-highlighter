import * as vscode from "vscode";

export const OPEN_DIAGNOSTICS_COMMAND = "throwableHighlighter.prototype.openDiagnostics";

const STATUS_TEXT = {
    "waiting-for-java": "Waiting for Java",
    "java-readiness-unconfirmed": "Java readiness unconfirmed",
    ready: "Ready"
} as const;

type HighlightingStatusState = keyof typeof STATUS_TEXT;

export class ThrowableHighlightingStatus implements vscode.Disposable {
    private readonly item: vscode.LanguageStatusItem;

    constructor() {
        this.item = vscode.languages.createLanguageStatusItem("throwableHighlighter.prototype.highlightingStatus", {
            language: "java",
            scheme: "file"
        });
        this.item.name = "Throwable Highlighter";
        this.item.command = {
            command: OPEN_DIAGNOSTICS_COMMAND,
            title: "Open Diagnostics"
        };
        this.setState("waiting-for-java");
    }

    public setState(state: HighlightingStatusState): void {
        this.item.text = STATUS_TEXT[state];
        this.item.busy = state === "waiting-for-java";
    }

    public dispose(): void {
        this.item.dispose();
    }
}
