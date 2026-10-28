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
        ["run", "class"],
        ["IOException", "throws"],
        ["IOException", "catch"],
        ["error", "class"],
        ["IOException", "class"],
        ["copy", "class"]
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
        ["CustomException", "class"],
        ["value", "class"]
    ]);
});

test("keeps annotations and parameter names outside catch and throws contexts", () => {
    const source =
        "void run() throws @Marker(IOException.class) java.io.IOException, IllegalStateException { " +
        "try {} catch (@Marker(RuntimeException.class) final java.io.IOException | " +
        "IllegalArgumentException RuntimeException) { IOException copy = null; } }";

    assert.deepEqual(findContexts(source), [
        ["run", "class"],
        ["Marker", "class"],
        ["IOException", "class"],
        ["java", "class"],
        ["io", "class"],
        ["IOException", "throws"],
        ["IllegalStateException", "throws"],
        ["Marker", "class"],
        ["RuntimeException", "class"],
        ["java", "class"],
        ["io", "class"],
        ["IOException", "catch"],
        ["IllegalArgumentException", "catch"],
        ["RuntimeException", "class"],
        ["IOException", "class"],
        ["copy", "class"]
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
        ["message", "class"],
        ["delimiter", "class"],
        ["String", "class"],
        ["block", "class"],
        ["IOException", "class"],
        ["value", "class"]
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
                    {typeName: "run", context: "class", start: [1, 20], end: [1, 23]},
                    {typeName: "IOException", context: "throws", start: [1, 33], end: [1, 44]},
                    {typeName: "IOException", context: "catch", start: [1, 61], end: [1, 72]},
                    {typeName: "error", context: "class", start: [1, 73], end: [1, 78]},
                    {typeName: "IOException", context: "class", start: [1, 82], end: [1, 93]},
                    {typeName: "copy", context: "class", start: [1, 94], end: [1, 98]}
                ]
            );
        });
    }
});

test("preserves complete Java identifiers in declarations and all four contexts", async context => {
    const names = [
        "customException",
        "ОшибкаException",
        "$CustomException",
        "_CustomException",
        "CaféException",
        "E\u0301Exception",
        "\u{10400}Exception"
    ] as const;

    for (const name of names) {
        await context.test(name, () => {
            assert.deepEqual(findContexts("class " + name + " extends RuntimeException {}"), [
                [name, "class"],
                ["RuntimeException", "class"]
            ]);

            const source =
                "import example." +
                name +
                "; class Sample { " +
                name +
                " value; void run() throws " +
                name +
                " { try {} catch (" +
                name +
                " error) {} } }";
            const candidates = findCandidates(source).filter(candidate => candidate.typeName === name);

            assert.deepEqual(
                candidates.map(candidate => candidate.context),
                ["import", "class", "throws", "catch"]
            );

            for (const candidate of candidates) {
                assert.equal(candidate.range.start.line, 0);
                assert.equal(candidate.range.end.line, 0);
                assert.equal(source.slice(candidate.range.start.character, candidate.range.end.character), name);
            }
        });
    }
});

test("skips keywords, literals and numeric fragments", () => {
    const source = "public class Example { int value = 0xCAFE; boolean enabled = true; Object reference = null; }";

    assert.deepEqual(findContexts(source), [
        ["Example", "class"],
        ["value", "class"],
        ["enabled", "class"],
        ["Object", "class"],
        ["reference", "class"]
    ]);
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
