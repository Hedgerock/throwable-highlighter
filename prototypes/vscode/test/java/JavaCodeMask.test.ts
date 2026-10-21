import assert from "node:assert/strict";
import {test} from "node:test";
import {JavaCodeMask} from "@throwable-highlighter/java/JavaCodeMask";

test("masks a text block without changing surrounding Java code", () => {
    const source = String.raw`String message = """
    IOException
    // catch (RuntimeException error) {}
    /* throws Throwable */
    """;
    RuntimeException visible = null;
   `;

    assertTextBlockMasked(source);
});

test("does not close a text block after an odd number of backslashes", () => {
    for (const count of [1, 3, 5]) {
        const source = [
            'String message = """',
            "    " + "\\".repeat(count) + '"""',
            "    IOException hidden = null;",
            '    """;',
            "RuntimeException visible = null;"
        ].join("\n");

        assertTextBlockMasked(source);
    }
});

test("closes a text block after an even number of backslashes", () => {
    for (const count of [0, 2, 4, 6]) {
        const source = [
            'String message = """',
            "   content",
            "    " + "\\".repeat(count) + '""";',
            "RuntimeException visible = null;"
        ].join("\n");

        assertTextBlockMasked(source);
    }
});

test("recognizes a closing delimiter after an escaped quote", () => {
    const source = String.raw`String message = """
        \"""";
    RuntimeException visible = null;`;

    assertTextBlockMasked(source);
});

test("preserves line endings and UTF-16 offsets across escaped text block content", () => {
    const lines = [
        'String message = """',
        "   " + "\\" + '"""',
        "    😀 IOException",
        "    continued" + "\\",
        "    RuntimeException",
        '    """;',
        "Throwable visible = null;"
    ];

    for (const lineEnding of ["\n", "\r\n", "\r"]) {
        const source = lines.join(lineEnding);

        assertTextBlockMasked(source);
    }
});

test("masks an unfinished text block through a trailing backslash", () => {
    const source = ['String message = """', "    " + "\\" + '"""', "   IOException hidden = null;", "\\"].join("\n");

    assertMaskedRange(source, source.indexOf('"""'), source.length);
});

test("preserves escaped quote handling in ordinary string literals", () => {
    const source = String.raw`String message = "escaped \" IOException"; RuntimeException visible = null;`;

    assertMaskedRange(source, source.indexOf('"'), source.lastIndexOf('"') + 1);
});

test("preserves escaped character handling in character literals", () => {
    for (const literal of [String.raw`'\''`, String.raw`'\\'`, String.raw`'\"'`]) {
        const source = "char marker = " + literal + ";RuntimeException visible = null;";
        const start = source.indexOf("'");

        assertMaskedRange(source, start, start + literal.length);
    }
});

function assertTextBlockMasked(source: string): void {
    assertMaskedRange(source, source.indexOf('"""'), source.lastIndexOf('"""') + 3);
}

function assertMaskedRange(source: string, start: number, end: number): void {
    const expected = source.slice(0, start) + source.slice(start, end).replace(/[^\r\n]/g, " ") + source.slice(end);

    assert.equal(new JavaCodeMask().maskNonCode(source), expected);
}
