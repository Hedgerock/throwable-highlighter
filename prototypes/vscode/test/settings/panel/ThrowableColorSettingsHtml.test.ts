import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {test} from "node:test";

import {ThrowableColorSettingsHtml} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsHtml";
import type {ThrowableColorSettingsTemplate} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsTemplate";
import type {ParsedThrowableColorSettings} from "@throwable-highlighter/settings/ThrowableColorConfiguration";

const WEBVIEW_RESOURCES = {
    cspSource: "test-webview:",
    stylesUri: "test-webview:/styles.css"
} as const;

test("renders all contexts with explicit and legacy source labels", () => {
    const html = renderTemplate(
        createSettings({
            class: {kind: "valid", setting: {source: "custom", color: "#123456"}},
            import: {kind: "valid", setting: {source: "inherit", color: "#ABCDEF"}},
            catch: {kind: "valid", setting: {source: "native", color: "red"}}
        })
    );

    for (const context of ["class", "import", "catch", "throws"]) {
        assert.ok(html.includes(`<th scope="row">Throwable ${context}</th>`));
    }

    for (const label of ["Custom color", "Inherit from CLASS", "Native Java highlighting", "Legacy rules"]) {
        assert.ok(html.includes(label));
    }

    assert.ok(html.includes("<code>#ABCDEF</code>"));
    assert.ok(html.includes("<code>red</code>"));
    assert.ok(html.includes(`type="button" disabled>Apply</button>`));
});

test("escapes configured strings instead of inserting markup or CSS", () => {
    const color = `<script>alert("x" & 'y')</script>`;
    const html = renderTemplate(
        createSettings({
            class: {
                kind: "valid",
                setting: {color}
            }
        })
    );

    assert.ok(html.includes("<code>&lt;script&gt;alert(&quot;x&quot; &amp; &#39;y&#39;)&lt;/script&gt;</code>"));
    assert.equal(html.includes(color), false);
    assert.equal(html.includes("<script"), false);
});

test("links the stylesheet without inline styles or scripts", () => {
    const html = renderTemplate(createSettings());

    assert.ok(html.includes(`href="test-webview:/styles.css"`));
    assert.ok(html.includes("style-src test-webview:;"));
    assert.ok(html.includes("default-src 'none';"));
    assert.ok(html.includes("base-uri 'none'; form-action 'none';"));
    assert.equal(html.includes("<style"), false);
    assert.equal(html.includes("<script"), false);
    assert.equal(html.includes("unsafe-inline"), false);
});

test("renders invalid configuration and missing own colors", () => {
    const html = renderTemplate(
        createSettings({
            import: {kind: "invalid", reason: "invalid-color"}
        })
    );

    assert.ok(html.includes('colspan="2" class="error">Invalid configuration: invalid-color</td>'));
    assert.ok(html.includes("<code>Not set</code>"));
});

test("does not interpret placeholders inside configured values", () => {
    const color = "{{rows}} {{context}} {{source}} {{cspSource}} $&";
    const html = renderTemplate(
        createSettings({
            class: {
                kind: "valid",
                setting: {color}
            }
        })
    );

    assert.ok(html.includes("<code>{{rows}} {{context}} {{source}} {{cspSource}} $&amp;</code>"));
});

test("rejects unknown and inherited template placeholders", () => {
    for (const key of ["unknown", "constructor", "__proto__"]) {
        assert.throws(() => renderTemplate(createSettings(), {contextRow: "{{" + key + "}}"}), {
            message: "Unknown color settings template placeholder: " + key
        });
    }
});

test("escapes webview resource values in HTML attributes", () => {
    const resources = {
        cspSource: 'test-webview:"<&',
        stylesUri: 'test-webview:/styles.css?value="<&'
    };

    const html = new ThrowableColorSettingsHtml().renderTemplate(createSettings(), readTemplates(), resources);

    assert.ok(html.includes("style-src test-webview:&quot;&lt;&amp;;"));
    assert.ok(html.includes('href="test-webview:/styles.css?value=&quot;&lt;&amp;"'));
});

function renderTemplate(
    settings: ParsedThrowableColorSettings,
    overrides: Partial<ThrowableColorSettingsTemplate> = {}
): string {
    return new ThrowableColorSettingsHtml().renderTemplate(settings, readTemplates(overrides), WEBVIEW_RESOURCES);
}

function readTemplates(overrides: Partial<ThrowableColorSettingsTemplate> = {}): ThrowableColorSettingsTemplate {
    const directory = resolve(__dirname, "../../../../webview/color-settings");

    return {
        document: readFileSync(resolve(directory, "index.html"), "utf-8"),
        contextRow: readFileSync(resolve(directory, "context-row.html"), "utf-8"),
        invalidContextRow: readFileSync(resolve(directory, "invalid-context-row.html"), "utf-8"),
        ...overrides
    };
}

function createSettings(overrides: Partial<ParsedThrowableColorSettings> = {}): ParsedThrowableColorSettings {
    return {
        class: {kind: "valid", setting: {color: undefined}},
        import: {kind: "valid", setting: {color: undefined}},
        catch: {kind: "valid", setting: {color: undefined}},
        throws: {kind: "valid", setting: {color: undefined}},
        ...overrides
    };
}
