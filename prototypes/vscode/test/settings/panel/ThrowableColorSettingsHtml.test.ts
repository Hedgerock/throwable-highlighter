import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {test} from "node:test";

import {ThrowableColorSettingsHtml} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsHtml";
import type {ThrowableColorSettingsTemplate} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsTemplate";
import type {ThrowableColorSettingsViewModel} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsViewModel";
import type {
    ParsedThrowableColorSettings,
    RawThrowableColorSettings
} from "@throwable-highlighter/settings/ThrowableColorConfiguration";

const WEBVIEW_RESOURCES = {
    cspSource: "test-webview:",
    stylesUri: "test-webview:/styles.css",
    scriptUri: "test-webview:/app.js",
    nonce: "test-nonce"
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
    assert.equal((html.match(/<script\b/g) ?? []).length, 1);
});

test("links resources and permits only the script with its nonce", () => {
    const html = renderTemplate(createSettings());

    assert.ok(html.includes(`href="test-webview:/styles.css"`));
    assert.ok(html.includes("style-src test-webview:;"));
    assert.ok(html.includes("script-src 'nonce-test-nonce';"));
    assert.ok(html.includes('<script nonce="test-nonce" src="test-webview:/app.js"></script>'));
    assert.ok(html.includes("default-src 'none';"));
    assert.ok(html.includes("base-uri 'none'; form-action 'none';"));
    assert.equal(html.includes("<style"), false);
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
        ...WEBVIEW_RESOURCES,
        cspSource: 'test-webview:"<&',
        stylesUri: 'test-webview:/styles.css?value="<&'
    };

    const html = new ThrowableColorSettingsHtml().renderTemplate(createModel(), readTemplates(), resources);

    assert.ok(html.includes("style-src test-webview:&quot;&lt;&amp;;"));
    assert.ok(html.includes('href="test-webview:/styles.css?value=&quot;&lt;&amp;"'));
});

test("keeps scoped values separate from effective configuration", () => {
    const model = createModel({
        target: "workspace",
        workspaceAvailable: true,
        scoped: createRawSettings({class: {source: "custom", color: undefined}}),
        effective: createSettings({
            class: {kind: "valid", setting: {source: "custom", color: "#123456"}}
        })
    });

    const html = new ThrowableColorSettingsHtml().renderTemplate(model, readTemplates(), WEBVIEW_RESOURCES);

    assert.ok(html.includes("Source in Workspace"));
    assert.ok(html.includes("Color in Workspace"));
    assert.ok(html.includes("<code>&quot;custom&quot;</code>"));
    assert.ok(html.includes("<code>Not set in this scope</code>"));
    assert.ok(html.includes("<code>#123456</code>"));
});

test("distinguishes missing, null, empty and unsupported scoped values", () => {
    const model = createModel({
        scoped: createRawSettings({
            class: {source: null, color: ""},
            import: {source: undefined, color: undefined},
            catch: {source: false, color: 42},
            throws: {source: {}, color: []}
        })
    });

    const html = new ThrowableColorSettingsHtml().renderTemplate(model, readTemplates(), WEBVIEW_RESOURCES);

    for (const value of ["null", "&quot;&quot;", "Not set in this scope", "false", "42", "Unsupported value"]) {
        assert.ok(html.includes("<code>" + value + "</code>"));
    }
});

test("escapes scoped strings without interpreting placeholders", () => {
    const model = createModel({
        scoped: createRawSettings({
            class: {source: "{{rows}} <script>", color: "<img src=x onerror=alert(1)>"}
        })
    });

    const html = new ThrowableColorSettingsHtml().renderTemplate(model, readTemplates(), WEBVIEW_RESOURCES);

    assert.ok(html.includes("{{rows}} &lt;script&gt;"));
    assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
    assert.equal(html.includes("<img"), false);
    assert.equal((html.match(/<script\b/g) ?? []).length, 1);
});

test("keeps scoped values visible when effective configuration is invalid", () => {
    const model = createModel({
        scoped: createRawSettings({
            class: {source: "custom", color: "#123456"}
        }),
        effective: createSettings({
            class: {kind: "invalid", reason: "invalid-source"}
        })
    });

    const html = new ThrowableColorSettingsHtml().renderTemplate(model, readTemplates(), WEBVIEW_RESOURCES);

    assert.ok(html.includes("<code>&quot;custom&quot;</code>"));
    assert.ok(html.includes("<code>&quot;#123456&quot;</code>"));
    assert.ok(html.includes('colspan="2" class="error">Invalid configuration: invalid-source</td>'));
});

test("selects User and disables Workspace when no workspace is open", () => {
    const html = new ThrowableColorSettingsHtml().renderTemplate(createModel(), readTemplates(), WEBVIEW_RESOURCES);

    assert.match(html, /value="user"\s+selected/);
    assert.match(html, /value="workspace"\s+disabled/);
});

test("selects Workspace when it is available and requested", () => {
    const model = createModel({target: "workspace", workspaceAvailable: true});
    const html = new ThrowableColorSettingsHtml().renderTemplate(model, readTemplates(), WEBVIEW_RESOURCES);

    assert.match(html, /value="workspace"\s+selected/);
    assert.doesNotMatch(html, /value="workspace"[^>]*disabled/);
});

test("offers inheritance only for derived contexts and selects the scoped source", () => {
    const model = createModel({
        scoped: createRawSettings({
            class: {source: "custom", color: "#123456"},
            catch: {source: "inherit", color: undefined}
        })
    });

    const html = new ThrowableColorSettingsHtml().renderTemplate(model, readTemplates(), WEBVIEW_RESOURCES);
    const classRow = html.match(/<tr data-context="class">([\s\S]*?)<\/tr>/)?.[1];
    const catchRow = html.match(/<tr data-context="catch">([\s\S]*?)<\/tr>/)?.[1];

    assert.ok(classRow);
    assert.ok(catchRow);
    assert.doesNotMatch(classRow, /value="inherit"/);
    assert.match(classRow, /<option value="custom"\s+selected/);
    assert.match(catchRow, /<option value="inherit"\s+selected/);
});

test("keeps invalid and missing scoped values visible without replacing them in controls", () => {
    const model = createModel({
        scoped: createRawSettings({
            class: {source: "", color: false},
            catch: {source: null, color: ""},
            throws: {source: "inherit", color: "#123456"}
        })
    });

    const html = new ThrowableColorSettingsHtml().renderTemplate(model, readTemplates(), WEBVIEW_RESOURCES);

    assert.match(html, /<option value="stored"\s+selected\s+disabled/);
    assert.ok(html.includes("<code>false</code>"));
    assert.ok(html.includes("<code>null</code>"));
    assert.ok(html.includes("<code>&quot;&quot;</code>"));
    assert.match(html, /id="color-class"[\s\S]*?value=""/);
    assert.match(html, /id="color-throws"[\s\S]*?value="#123456"/);
});

test("escapes text input values in attributes", () => {
    const model = createModel({
        scoped: createRawSettings({
            class: {source: "custom", color: '"><img src=x onerror=alert(1)>'}
        })
    });

    const html = new ThrowableColorSettingsHtml().renderTemplate(model, readTemplates(), WEBVIEW_RESOURCES);

    assert.ok(html.includes('value="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"'));
    assert.equal(html.includes("<img"), false);
});

test("preserves invalid class inheritance as a stored value in an editable error row", () => {
    const model = createModel({
        scoped: createRawSettings({class: {source: "inherit", color: "#123456"}}),
        effective: createSettings({class: {kind: "invalid", reason: "class-inheritance"}})
    });

    const html = new ThrowableColorSettingsHtml().renderTemplate(model, readTemplates(), WEBVIEW_RESOURCES);
    const row = html.match(/<tr data-context="class">([\s\S]*?)<\/tr>/)?.[1];

    assert.ok(row);
    assert.doesNotMatch(row, /<option value="inherit"/);
    assert.match(row, /<option value="stored"\s+selected\s+disabled/);
    assert.ok(row.includes('data-setting="source"'));
    assert.ok(row.includes('data-setting="color"'));
    assert.ok(row.includes("<code>&quot;inherit&quot;</code>"));
});

test("limits new color input without truncating existing long values", () => {
    const color = "x".repeat(500);
    const model = createModel({
        scoped: createRawSettings({class: {source: "native", color}})
    });

    const html = new ThrowableColorSettingsHtml().renderTemplate(model, readTemplates(), WEBVIEW_RESOURCES);
    const input = html.match(/<input\s+id="color-class"[^>]*>/)?.[0];

    assert.ok(input);
    assert.ok(input.includes('maxlength="9"'));
    assert.ok(input.includes('value="' + color + '"'));
    assert.ok(html.includes('title="&quot;' + color + '&quot;"'));
});

test("binds revert and remove actions to the intended fields in normal and error rows", () => {
    const model = createModel({
        effective: createSettings({class: {kind: "invalid", reason: "invalid-color"}})
    });
    const html = new ThrowableColorSettingsHtml().renderTemplate(model, readTemplates(), WEBVIEW_RESOURCES);

    for (const context of ["class", "import", "catch", "throws"]) {
        const row = html.match(new RegExp('<tr data-context="' + context + '">([\\s\\S]*?)<\\/tr>'))?.[1];

        assert.ok(row);
        assert.deepEqual(
            [...row.matchAll(/data-revert-field="([^"]+)"/g)].map(match => match[1]),
            ["source", "color"]
        );
        assert.deepEqual(
            [...row.matchAll(/data-reset-field="([^"]+)"/g)].map(match => match[1]),
            ["color"]
        );
    }
});

function renderTemplate(
    settings: ParsedThrowableColorSettings,
    overrides: Partial<ThrowableColorSettingsTemplate> = {}
): string {
    return new ThrowableColorSettingsHtml().renderTemplate(
        createModel({effective: settings}),
        readTemplates(overrides),
        WEBVIEW_RESOURCES
    );
}

function createModel(overrides: Partial<ThrowableColorSettingsViewModel> = {}): ThrowableColorSettingsViewModel {
    return {
        target: "user",
        workspaceAvailable: false,
        scoped: createRawSettings(),
        effective: createSettings(),
        ...overrides
    };
}

function createRawSettings(overrides: Partial<RawThrowableColorSettings> = {}): RawThrowableColorSettings {
    return {
        class: {source: undefined, color: undefined},
        import: {source: undefined, color: undefined},
        catch: {source: undefined, color: undefined},
        throws: {source: undefined, color: undefined},
        ...overrides
    };
}

function readTemplates(overrides: Partial<ThrowableColorSettingsTemplate> = {}): ThrowableColorSettingsTemplate {
    const directory = resolve(__dirname, "../../../../webview/color-settings");

    return {
        document: readFileSync(resolve(directory, "index.html"), "utf-8"),
        contextRow: readFileSync(resolve(directory, "context-row.html"), "utf-8"),
        invalidContextRow: readFileSync(resolve(directory, "invalid-context-row.html"), "utf-8"),
        sourceOption: readFileSync(resolve(directory, "source-option.html"), "utf-8"),
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
