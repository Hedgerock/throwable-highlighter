import assert from "node:assert/strict";
import {test} from "node:test";

import {ThrowableColorSettingsHtml} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsHtml";
import type {ParsedThrowableColorSettings} from "@throwable-highlighter/settings/ThrowableColorConfiguration";

test("renders all contexts with explicit and legacy source labels", () => {
    const html = new ThrowableColorSettingsHtml().render(
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
    const html = new ThrowableColorSettingsHtml().render(
        createSettings({
            class: {kind: "valid", setting: {color}}
        })
    );

    assert.ok(html.includes("<code>&lt;script&gt;alert(&quot;x&quot; &amp; &#39;y&#39;)&lt;/script&gt;</code>"));
    assert.equal(html.includes(color), false);
    assert.equal(html.includes("<script"), false);
});

test("shows invalid configuration and missing own colors", () => {
    const html = new ThrowableColorSettingsHtml().render(
        createSettings({class: {kind: "invalid", reason: "invalid-color"}})
    );

    assert.ok(html.includes("Invalid configuration: invalid-color"));
    assert.equal((html.match(/<code>Not set<\/code>/g) ?? []).length, 3);
});

test("uses a fresh nonce and a restrictive content security policy", () => {
    const renderer = new ThrowableColorSettingsHtml();
    const first = renderer.render(createSettings());
    const second = renderer.render(createSettings());
    const nonce = first.match(/<style nonce="([a-f0-9]{32})">/)?.[1];

    assert.ok(nonce);
    assert.ok(first.includes("default-src 'none';"));
    assert.ok(first.includes("style-src 'nonce-" + nonce + "';"));
    assert.ok(first.includes("base-uri 'none'; form-action 'none';"));
    assert.equal(second.includes(nonce), false);
    assert.equal(first.includes("<script"), false);
    assert.equal(first.includes("unsafe-inline"), false);
});

function createSettings(overrides: Partial<ParsedThrowableColorSettings> = {}): ParsedThrowableColorSettings {
    return {
        class: {kind: "valid", setting: {color: undefined}},
        import: {kind: "valid", setting: {color: undefined}},
        catch: {kind: "valid", setting: {color: undefined}},
        throws: {kind: "valid", setting: {color: undefined}},
        ...overrides
    };
}
