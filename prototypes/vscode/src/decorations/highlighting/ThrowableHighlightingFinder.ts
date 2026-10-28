import vscode from "vscode";

import {JavaCatchClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaCatchClauseFinder";
import {JavaThrowsClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaThrowsClauseFinder";
import {JavaCodeMask} from "@throwable-highlighter/java/JavaCodeMask";
import type {
    JavaImportClause,
    JavaImportClauseFinder
} from "@throwable-highlighter/decorations/highlighting/JavaImportClauseFinder";
import type {OffsetRange} from "@throwable-highlighter/decorations/highlighting/JavaTypeReferenceRangeReader";
import type {HighlightingContext} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingContext";

export interface ThrowableHighlightingCandidate {
    typeName: string;
    range: vscode.Range;
    context: HighlightingContext;
}

export class ThrowableHighlightingFinder {
    private static readonly TYPE_CANDIDATE_PATTERN =
        /(?<![\p{ID_Continue}\p{Sc}\p{Cf}])[\p{L}\p{Nl}\p{Sc}\p{Pc}][\p{ID_Continue}\p{Sc}\p{Cf}]*/gu;

    private static readonly NON_IDENTIFIER_WORDS = new Set(
        (
            "abstract assert boolean break byte case catch char class const continue default do double else enum " +
            "extends final finally float for goto if implements import instanceof int interface long native new package " +
            "private protected public return short static strictfp super switch synchronized this throw throws transient " +
            "try void volatile while _ true false null"
        ).split(" ")
    );

    private readonly codeMask: JavaCodeMask;

    constructor(
        codeMask: JavaCodeMask,
        private readonly importClauseFinder: JavaImportClauseFinder,
        private readonly catchClauseFinder: JavaCatchClauseFinder,
        private readonly throwsClauseFinder: JavaThrowsClauseFinder
    ) {
        this.codeMask = codeMask;
    }

    public findCandidates(document: vscode.TextDocument): ThrowableHighlightingCandidate[] {
        const candidates: ThrowableHighlightingCandidate[] = [];
        const source = document.getText();
        const code = this.codeMask.maskNonCode(source);
        const importClauses = this.importClauseFinder.findClauses(code);
        const catchTypeRanges = this.catchClauseFinder.findTypeReferenceRanges(code);
        const throwsTypeRanges = this.throwsClauseFinder.findTypeReferenceRanges(code);

        for (const match of code.matchAll(ThrowableHighlightingFinder.TYPE_CANDIDATE_PATTERN)) {
            const start = match.index;

            if (start === undefined || ThrowableHighlightingFinder.NON_IDENTIFIER_WORDS.has(match[0])) {
                continue;
            }

            const context = this.getHighlightingContext(start, importClauses, catchTypeRanges, throwsTypeRanges);

            if (context === undefined) {
                continue;
            }

            const end = start + match[0].length;

            candidates.push({
                typeName: match[0],
                range: new vscode.Range(document.positionAt(start), document.positionAt(end)),
                context
            });
        }

        return candidates;
    }

    private getHighlightingContext(
        offset: number,
        importClauses: readonly JavaImportClause[],
        catchTypeRanges: readonly OffsetRange[],
        throwsTypeRanges: readonly OffsetRange[]
    ): HighlightingContext | undefined {
        const importClause = importClauses.find(clause => clause.range.start <= offset && offset < clause.range.end);

        if (importClause !== undefined) {
            const typeRange = importClause.typeRange;

            return typeRange !== undefined && typeRange.start <= offset && offset < typeRange.end
                ? "import"
                : undefined;
        }

        if (catchTypeRanges.some(range => range.start <= offset && offset < range.end)) {
            return "catch";
        }

        if (throwsTypeRanges.some(range => range.start <= offset && offset < range.end)) {
            return "throws";
        }

        return "class";
    }
}
