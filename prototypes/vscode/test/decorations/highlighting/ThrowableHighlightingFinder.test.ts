import assert from "node:assert/strict";
import {test} from "node:test";

import type * as vscode from "vscode";

import {JavaCatchClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaCatchClauseFinder";
import {JavaImportClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaImportClauseFinder";
import {JavaThrowsClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaThrowsClauseFinder";
import {JavaTypeReferenceRangeReader} from "@throwable-highlighter/decorations/highlighting/JavaTypeReferenceRangeReader";
import {ThrowableHighlightingFinder} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingFinder";
import {JavaCodeMask} from "@throwable-highlighter/java/JavaCodeMask";
import type {ThrowableHighlightingCandidate} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingFinder";

test("assigns all four contexts within one document", () => {
    const source =
        "import java.io.IOException; class Example " +
        "{ void run() throws IOException { " +
        "try {} catch (IOException error) " +
        "{ IOException copy = null; } } }";

    assert.deepEqual(findContexts(source), [
        ["IOException", "import"],
        ["Example", "class"],
        ["IOException", "throws"],
        ["IOException", "catch"],
        ["IOException", "class"]
    ]);
});

test("excludes import qualifiers and excluded imports from class candidates", () => {
    const source =
        "import Throwable.Outer.CustomException; import example.Throwable.*; " +
        "import static example.Throwable.NestedException; import static example.Throwable.*; " +
        "class Example { CustomException value; }";

    assert.deepEqual(findContexts(source), [
        ["CustomException", "import"],
        ["Example", "class"],
        ["CustomException", "class"]
    ]);
});

test("keeps annotations and parameter names outside catch and throws contexts", () => {
    const source =
        "void run() throws @Marker(IOException.class) java.io.IOException, IllegalStateException { " +
        "try {} catch (@Marker(RuntimeException.class) final java.io.IOException | " +
        "IllegalArgumentException RuntimeException) { IOException copy = null; } }";

    assert.deepEqual(findContexts(source), [
        ["Marker", "class"],
        ["IOException", "class"],
        ["IOException", "throws"],
        ["IllegalStateException", "throws"],
        ["Marker", "class"],
        ["RuntimeException", "class"],
        ["IOException", "catch"],
        ["IllegalArgumentException", "catch"],
        ["RuntimeException", "class"],
        ["IOException", "class"]
    ]);
});

test("ignores comments and literals without removing surrounding candidates", () => {
    const source = [
        "// IOException",
        "/* RuntimeException */",
        `String message = "Throwable";`,
        "char delimiter = 'E';",
        `String block = """`,
        "IllegalStateException",
        `""";`,
        "IOException value;"
    ].join("\n");

    assert.deepEqual(findContexts(source), [
        ["String", "class"],
        ["String", "class"],
        ["IOException", "class"]
    ]);
});

test("preserves UTF-16 positions across line endings", async context => {
    const cases = [
        {name: "LF", lineEnding: "\n"},
        {name: "CRLF", lineEnding: "\r\n"},
        {name: "CR", lineEnding: "\r"}
    ] as const;

    for (const scenario of cases) {
        await context.test(scenario.name, () => {
            const source =
                "/* 😀 */ import java.io.IOException;" +
                scenario.lineEnding +
                "class Sample { void run() throws IOException { " +
                "try {} catch (IOException error) { IOException copy = null; } } }";

            const candidates = findCandidates(source);

            assert.deepEqual(
                candidates.map(candidate => ({
                    typeName: candidate.typeName,
                    context: candidate.context,
                    start: [candidate.range.start.line, candidate.range.start.character],
                    end: [candidate.range.end.line, candidate.range.end.character]
                })),
                [
                    {typeName: "IOException", context: "import", start: [0, 24], end: [0, 35]},
                    {typeName: "Sample", context: "class", start: [1, 6], end: [1, 12]},
                    {typeName: "IOException", context: "throws", start: [1, 33], end: [1, 44]},
                    {typeName: "IOException", context: "catch", start: [1, 61], end: [1, 72]},
                    {typeName: "IOException", context: "class", start: [1, 82], end: [1, 93]}
                ]
            );
        });
    }
});

function findContexts(source: string) {
    return findCandidates(source).map(candidate => [candidate.typeName, candidate.context]);
}

function findCandidates(source: string): ThrowableHighlightingCandidate[] {
    const document = {
        getText: () => source,
        positionAt: (offset: number): vscode.Position => {
            const lines = source.slice(0, offset).split(/\r\n|\r|\n/);
            return {
                line: lines.length - 1,
                character: lines[lines.length - 1].length
            } as vscode.Position;
        }
    } as vscode.TextDocument;

    const rangeReader = new JavaTypeReferenceRangeReader();
    const finder = new ThrowableHighlightingFinder(
        new JavaCodeMask(),
        new JavaImportClauseFinder(),
        new JavaCatchClauseFinder(rangeReader),
        new JavaThrowsClauseFinder(rangeReader)
    );

    return finder.findCandidates(document);
}
