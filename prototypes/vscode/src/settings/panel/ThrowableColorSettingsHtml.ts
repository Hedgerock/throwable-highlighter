import {randomBytes} from "node:crypto";

import type {ParsedThrowableColorSettings} from "@throwable-highlighter/settings/ThrowableColorConfiguration";
import type {ColorSettingParseResult} from "@throwable-highlighter/settings/ThrowableColorSettingParser";

const CONTEXTS = ["class", "import", "catch", "throws"] as const;

export class ThrowableColorSettingsHtml {
    public render(settings: ParsedThrowableColorSettings): string {
        const nonce = randomBytes(16).toString("hex");
        const rows = CONTEXTS.map(context => this.renderRow(context, settings[context])).join("\n");

        return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy"
              content="default-src 'none'; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none';">
        <title>Throwable Highlighter</title>
        <style nonce="${nonce}">
            body {
                padding: 24px;
                color: var(--vscode-foreground);
                background: var(--vscode-editor-background);
                font-family: var(--vscode-font-family);
                font-size: var(--vscode-font-size);
            }
            main { max-width: 900px; }
            h1 { font-size: 1.5em; }
            table { width: 100%; border-collapse: collapse; }
            caption { text-align: left; padding: 12px 0; font-weight: bold; }
            th, td {
                padding: 12px;
                text-align: left;
                vertical-align: top;
                border: 1px solid var(--vscode-panel-border, var(--vscode-contrastBorder, currentColor));
            }
            code {
                font-family: var(--vscode-editor-font-family);
                white-space: pre-wrap;
                overflow-wrap: anywhere;
            }
            .error { color: var(--vscode-errorForeground); }
            button {
                padding: 6px 16px;
                color: var(--vscode-button-foreground);
                background: var(--vscode-button-background);
                border: 1px solid var(--vscode-contrastBorder, transparent);
            }
            button:disabled { opacity: 0.5; }
        </style>
    </head>
    <body>
        <main>
            <h1>Throwable Highlighter</h1>
            <p>This panel is read-only. Editing and applying changes are not available yet.</p>
            <table>
                <caption>Effective color configuration</caption>
                <thead>
                    <tr><th scope="col">Context</th><th scope="col">Source</th><th scope="col">Stored own color</th></tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
            <p>Values include configuration priorities. A stored own color can be inactive for the selected source.</p>
            <p>Legacy rules use the existing color settings when no explicit source is configured.</p>
            <button type="button" disabled>Apply</button>
        </main>
    </body>
    </html>`;
    }

    private renderRow(context: (typeof CONTEXTS)[number], result: ColorSettingParseResult): string {
        const heading = `<th scope="row">Throwable ${context}</th>`;

        if (result.kind === "invalid") {
            return `<tr>${heading}<td colspan="2" class="error">Invalid configuration: ${result.reason}</td></tr>`;
        }

        const sources = {
            custom: "Custom color",
            inherit: "Inherit from CLASS",
            native: "Native Java highlighting",
            legacy: "Legacy rules"
        };

        const source = sources[result.setting.source ?? "legacy"];
        const color = result.setting.color || "Not set";

        return `<tr>${heading}<td>${source}</td><td><code>${this.escapeHtml(color)}</code></td></tr>`;
    }

    private escapeHtml(value: string): string {
        return value
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll(`"`, "&quot;")
            .replaceAll("'", "&#39;");
    }
}
