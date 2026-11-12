import assert from "node:assert/strict";
import {test} from "node:test";

import {ThrowableColorSettingParser} from "@throwable-highlighter/settings/ThrowableColorSettingParser";

test("accepts supported HEX formats for custom sources without rewriting values", () => {
    const colors = ["#123", "#1234", "#123456", "#12345678", "#aBcDeF", " #A1b2C3d4"];

    for (const color of colors) {
        for (const result of parseBoth("custom", color)) {
            assert.deepEqual(result, {kind: "valid", setting: {source: "custom", color}}, color);
        }
    }
});

test("rejects invalid custom colors", () => {
    const colors = [
        undefined,
        "",
        " ",
        "#12",
        "#12345",
        "#1234567",
        "#123456789",
        "#12GG56",
        "123456",
        "##123",
        "#123 #456",
        "red",
        "rgb(1, 2, 3)",
        "hsl(0, 100%, 50%)"
    ];

    for (const color of colors) {
        for (const result of parseBoth("custom", color)) {
            assert.deepEqual(result, {kind: "invalid", reason: "invalid-color"}, String(color));
        }
    }
});

test("rejects unknown or missing explicit sources", () => {
    const sources = [undefined, null, "", "auto", "CUSTOM", "unknown", 0, false, {}, []];

    for (const source of sources) {
        for (const result of parseBoth(source, "#123456")) {
            assert.deepEqual(result, {kind: "invalid", reason: "invalid-source"}, String(source));
        }
    }
});

test("rejects inheritance for the class context at runtime", () => {
    const parser = new ThrowableColorSettingParser();

    assert.deepEqual(parser.parseClass("inherit", "#123456"), {
        kind: "invalid",
        reason: "class-inheritance"
    });
});

test("preserves legacy strings without HEX validation", () => {
    const parser = new ThrowableColorSettingParser();
    const colors = [undefined, "", " ", "red", "rgb(1, 2, 3)", " #123456 "];

    for (const color of colors) {
        assert.deepEqual(parser.parseLegacy(color), {kind: "valid", setting: {color}}, String(color));
    }
});

test("preserves saved color values for native sources", () => {
    const colors = [undefined, " #123456 ", "red"];

    for (const color of colors) {
        for (const result of parseBoth("native", color)) {
            assert.deepEqual(result, {kind: "valid", setting: {source: "native", color}}, String(color));
        }
    }
});

test("preserves saved color values when inheriting the class color", () => {
    const parser = new ThrowableColorSettingParser();
    const colors = [undefined, " #123456 ", "red"];

    for (const color of colors) {
        assert.deepEqual(
            parser.parseDerived("inherit", color),
            {kind: "valid", setting: {source: "inherit", color}},
            String(color)
        );
    }
});

test("rejects non-string stored colors without coercing them", () => {
    const parser = new ThrowableColorSettingParser();

    for (const color of [null, 0, false, {}, []]) {
        const results = [parser.parseLegacy(color), ...parseBoth("native", color), ...parseBoth("custom", color)];

        for (const result of results) {
            assert.deepEqual(result, {kind: "invalid", reason: "invalid-color"}, String(color));
        }
    }
});

function parseBoth(source: unknown, color: unknown) {
    const parser = new ThrowableColorSettingParser();

    return [parser.parseClass(source, color), parser.parseDerived(source, color)];
}
