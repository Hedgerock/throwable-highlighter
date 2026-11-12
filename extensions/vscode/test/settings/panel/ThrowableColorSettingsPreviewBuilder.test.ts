import assert from "node:assert/strict";
import {test} from "node:test";

import {ThrowableColorSettingsPreviewBuilder} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsPreviewBuilder";
import type {ParsedThrowableColorSettings} from "@throwable-highlighter/settings/ThrowableColorConfiguration";

test("uses native highlighting when no colors are configured", () => {
    const preview = new ThrowableColorSettingsPreviewBuilder().build(createSettings());

    assert.deepEqual(preview, {
        class: {kind: "native"},
        import: {kind: "native"},
        catch: {kind: "native"},
        throws: {kind: "native"}
    });
});

test("inherits the CLASS result without changing inactive own colors", () => {
    for (const source of ["custom", "native"] as const) {
        const settings = createSettings({
            class: {kind: "valid", setting: {source, color: " #123456 "}},
            import: {kind: "valid", setting: {source: "inherit", color: "#ABCDEF"}},
            catch: {kind: "valid", setting: {source: "inherit", color: "#654321"}},
            throws: {kind: "valid", setting: {source: "inherit", color: "#FEDCBA"}}
        });
        const before = structuredClone(settings);

        const preview = new ThrowableColorSettingsPreviewBuilder().build(settings);
        const expected = source === "native" ? {kind: "native"} : {kind: "color", color: "#123456"};

        assert.deepEqual(preview, {
            class: expected,
            import: expected,
            catch: expected,
            throws: expected
        });
        assert.deepEqual(settings, before);
    }
});

test("keeps own and native colors independent of CLASS", () => {
    const settings = createSettings({
        class: {kind: "valid", setting: {source: "custom", color: "#123456"}},
        import: {kind: "valid", setting: {source: "custom", color: " #abcd "}},
        catch: {kind: "valid", setting: {source: "native", color: "#654321"}},
        throws: {kind: "valid", setting: {color: " red "}}
    });

    assert.deepEqual(new ThrowableColorSettingsPreviewBuilder().build(settings), {
        class: {kind: "color", color: "#123456"},
        import: {kind: "color", color: "#abcd"},
        catch: {kind: "native"},
        throws: {kind: "color", color: "red"}
    });
});

test("preserves legacy inheritance for missing and empty colors", () => {
    const settings = createSettings({
        class: {kind: "valid", setting: {color: " #123456 "}},
        catch: {kind: "valid", setting: {color: ""}},
        throws: {kind: "valid", setting: {color: " \t "}}
    });

    assert.deepEqual(new ThrowableColorSettingsPreviewBuilder().build(settings), {
        class: {kind: "color", color: "#123456"},
        import: {kind: "color", color: "#123456"},
        catch: {kind: "color", color: "#123456"},
        throws: {kind: "color", color: "#123456"}
    });
});

test("propagates an invalid CLASS only to contexts that inherit it", () => {
    const settings = createSettings({
        class: {kind: "invalid", reason: "invalid-color"},
        import: {kind: "valid", setting: {source: "inherit", color: "#ABCDEF"}},
        catch: {kind: "valid", setting: {color: ""}},
        throws: {kind: "valid", setting: {source: "native", color: "#654321"}}
    });
    const builder = new ThrowableColorSettingsPreviewBuilder();
    const invalid = {kind: "invalid", context: "class", reason: "invalid-color"};

    assert.deepEqual(builder.build(settings), {
        class: invalid,
        import: invalid,
        catch: invalid,
        throws: {kind: "native"}
    });

    assert.deepEqual(
        builder.build({
            ...settings,
            throws: {kind: "valid", setting: {source: "custom", color: "#123456"}}
        }).throws,
        {kind: "color", color: "#123456"}
    );
});

test("keeps derived parsing errors local to their contexts", () => {
    const settings = createSettings({
        class: {kind: "valid", setting: {source: "custom", color: "#123456"}},
        import: {kind: "invalid", reason: "invalid-source"},
        catch: {kind: "invalid", reason: "invalid-color"}
    });

    assert.deepEqual(new ThrowableColorSettingsPreviewBuilder().build(settings), {
        class: {kind: "color", color: "#123456"},
        import: {kind: "invalid", context: "import", reason: "invalid-source"},
        catch: {kind: "invalid", context: "catch", reason: "invalid-color"},
        throws: {kind: "color", color: "#123456"}
    });
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
