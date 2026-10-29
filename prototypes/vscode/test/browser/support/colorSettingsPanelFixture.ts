import {readFile} from "node:fs/promises";
import {resolve} from "node:path";

import {test as base} from "@playwright/test";

import {ThrowableColorSettingsHtml} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsHtml";
import type {
    ColorSettingsDraftStateMessage,
    ColorSettingsFieldRevertedMessage
} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsMessage";

import {createColorSettingsScenario} from "./colorSettingsScenario";
import type {ColorSettingsScenario} from "./colorSettingsScenario";

const ORIGIN = "http://throwable-highlighter.test";

type BrowserAsset = {
    readonly contentType: string;
    readonly body: string;
    readonly status?: number;
};

declare global {
    interface Window {
        __recordColorSettingsMessage: (message: unknown) => Promise<void>;
    }
}

type ColorSettingsPanelFixture = {
    readonly messages: readonly unknown[];
    readonly errors: readonly string[];
    readonly open: (scenario?: ColorSettingsScenario) => Promise<void>;
    readonly send: (message: ColorSettingsDraftStateMessage | ColorSettingsFieldRevertedMessage) => Promise<void>;
};

export const test = base.extend<{colorSettingsPanel: ColorSettingsPanelFixture}>({
    colorSettingsPanel: async ({page}, use) => {
        const messages: unknown[] = [];
        const errors: string[] = [];
        const directory = resolve(__dirname, "../../../webview/color-settings");
        const readResource = (name: string) => readFile(resolve(directory, name), "utf8");
        const [document, contextRow, invalidContextRow, sourceOption, styles, script, theme] = await Promise.all([
            readResource("index.html"),
            readResource("context-row.html"),
            readResource("invalid-context-row.html"),
            readResource("source-option.html"),
            readResource("styles.css"),
            readResource("app.js"),
            readFile(resolve(__dirname, "themes/dark.css"), "utf8")
        ]);
        const templates = {
            document: document
                .replace("</head>", '<link rel="stylesheet" href="' + ORIGIN + '/theme.css" /></head>')
                .replace("<body>", '<body class="vscode-dark">'),
            contextRow,
            invalidContextRow,
            sourceOption
        };
        const assets = new Map<string, BrowserAsset>([
            [ORIGIN + "/styles.css", {contentType: "text/css", body: styles}],
            [ORIGIN + "/app.js", {contentType: "application/javascript", body: script}],
            [ORIGIN + "/theme.css", {contentType: "text/css", body: theme}],
            [ORIGIN + "/favicon.ico", {contentType: "image/x-icon", body: "", status: 204}]
        ]);

        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => {
            if (message.type() === "error") {
                errors.push(message.text());
            }
        });

        await page.exposeFunction("__recordColorSettingsMessage", (message: unknown) => {
            messages.push(message);
        });
        await page.addInitScript(() => {
            Object.defineProperty(window, "acquireVsCodeApi", {
                value: () => ({
                    postMessage: (message: unknown) => {
                        void window.__recordColorSettingsMessage(message);
                    }
                })
            });
        });
        await page.route("**/*", async route => {
            const asset = assets.get(route.request().url());

            if (asset === undefined) {
                await route.abort("blockedbyclient");
                return;
            }

            await route.fulfill(asset);
        });

        await use({
            messages,
            errors,
            open: async (scenario = createColorSettingsScenario()) => {
                const html = new ThrowableColorSettingsHtml().renderTemplate(scenario.model, templates, {
                    cspSource: ORIGIN,
                    stylesUri: ORIGIN + "/styles.css",
                    scriptUri: ORIGIN + "/app.js",
                    nonce: "browser-test-nonce"
                });
                assets.set(ORIGIN + "/", {contentType: "text/html", body: html});

                await page.goto(ORIGIN + "/");
            },
            send: async message => {
                await page.evaluate(message => {
                    window.postMessage(message, "*");
                }, message);
            }
        });
    }
});

export {expect} from "@playwright/test";
