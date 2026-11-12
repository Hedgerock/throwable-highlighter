import assert from "node:assert/strict";

import type * as vscode from "vscode";

import {JavaCatchClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaCatchClauseFinder";
import {JavaImportClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaImportClauseFinder";
import {JavaThrowsClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaThrowsClauseFinder";
import {JavaTypeReferenceRangeReader} from "@throwable-highlighter/decorations/highlighting/JavaTypeReferenceRangeReader";
import {ThrowableHighlightingFinder} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingFinder";
import {JavaCodeMask} from "@throwable-highlighter/java/JavaCodeMask";
import {JavaTypeDefinitionResolver} from "@throwable-highlighter/resolution/JavaTypeDefinitionResolver";
import type {HighlightingContext} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingContext";
import type {ThrowableHighlightingCandidate} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingFinder";

import {openJavaFixture, openJavaSource, positionOf, waitForJavaSupport} from "./support/javaSupport";
import {waitForThrowableType} from "./support/throwableResolution";

type HighlightingResult = {
    typeName: string;
    context: HighlightingContext;
    start: number;
    end: number;
};

suite("Throwable highlighting", () => {
    suiteSetup(async () => {
        await waitForJavaSupport();
    });

    test("finds class, import and catch ranges for a transitive Throwable type", async () => {
        const document = await openJavaFixture("usage", "TransitiveContextFixture.java");
        const expected = [
            expectedHighlight(document, "NestedException", "NestedException;", "import"),
            expectedHighlight(document, "NestedException", "NestedException nestedException", "class"),
            expectedHighlight(document, "NestedException", "NestedException exception", "catch"),
            expectedHighlight(document, "NestedException", "NestedException copy", "class")
        ];

        await assertHighlighting(document, expected);
    });

    test("finds throws ranges in constructor and method declarations", async () => {
        const document = await openJavaSource("ThrowsContextFixture.java");
        const expected = [
            expectedHighlight(document, "IOException", "IOException;", "import"),
            expectedHighlight(document, "IOException", "IOException {", "throws"),
            expectedHighlight(document, "IOException", "IOException, IllegalArgumentException", "throws"),
            expectedHighlight(document, "IllegalArgumentException", "IllegalArgumentException {", "throws"),
            expectedHighlight(document, "IOException", "IOException copy", "class")
        ];

        await assertHighlighting(document, expected);
    });
});

async function assertHighlighting(
    document: vscode.TextDocument,
    expected: readonly HighlightingResult[]
): Promise<void> {
    const codeMask = new JavaCodeMask();
    const finder = createFinder(codeMask);
    const resolver = new JavaTypeDefinitionResolver(codeMask);

    for (const highlight of expected) {
        await waitForThrowableType(resolver, document, document.positionAt(highlight.start));
    }

    const actual: HighlightingResult[] = [];

    for (const candidate of finder.findCandidates(document)) {
        if (await resolver.isThrowableType(document, candidate.range.start)) {
            actual.push(toResult(document, candidate));
        }
    }

    assert.deepEqual(actual, expected);
}

function createFinder(codeMask: JavaCodeMask): ThrowableHighlightingFinder {
    const rangeReader = new JavaTypeReferenceRangeReader();

    return new ThrowableHighlightingFinder(
        codeMask,
        new JavaImportClauseFinder(),
        new JavaCatchClauseFinder(rangeReader),
        new JavaThrowsClauseFinder(rangeReader)
    );
}

function expectedHighlight(
    document: vscode.TextDocument,
    typeName: string,
    reference: string,
    context: HighlightingContext
): HighlightingResult {
    const start = document.offsetAt(positionOf(document, reference));

    return {typeName, context, start, end: start + typeName.length};
}

function toResult(document: vscode.TextDocument, candidate: ThrowableHighlightingCandidate): HighlightingResult {
    return {
        typeName: candidate.typeName,
        context: candidate.context,
        start: document.offsetAt(candidate.range.start),
        end: document.offsetAt(candidate.range.end)
    };
}
