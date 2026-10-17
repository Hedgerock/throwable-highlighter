import vscode from "vscode";
import type {HighlightingContext} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingContext";
import {JavaCatchClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaCatchClauseFinder";
import {JavaThrowsClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaThrowsClauseFinder";
import {JavaCodeMask} from "@throwable-highlighter/java/JavaCodeMask";
import type {OffsetRange} from "@throwable-highlighter/decorations/highlighting/JavaTypeReferenceRangeReader";

export interface ThrowableHighlightingCandidate {
    typeName: string;
    range: vscode.Range;
    context: HighlightingContext;
}

export class ThrowableHighlightingFinder {
    private static readonly TYPE_CANDIDATE_PATTERN = /\b[A-Z][A-Za-z0-9_]*\b/g;

    private readonly codeMask: JavaCodeMask;

    constructor(
        codeMask: JavaCodeMask,
        private readonly catchClauseFinder: JavaCatchClauseFinder,
        private readonly throwsClauseFinder: JavaThrowsClauseFinder
    ) {
        this.codeMask = codeMask;
    }

    public findCandidates(document: vscode.TextDocument): ThrowableHighlightingCandidate[] {
        const candidates: ThrowableHighlightingCandidate[] = [];
        const source = document.getText();
        const code = this.codeMask.maskNonCode(source);
        const catchTypeRanges = this.catchClauseFinder.findTypeReferenceRanges(code);
        const throwsTypeRanges = this.throwsClauseFinder.findTypeReferenceRanges(code);

        for (const match of code.matchAll(ThrowableHighlightingFinder.TYPE_CANDIDATE_PATTERN)) {
            const start = match.index;

            if (start === undefined) {
                continue;
            }

            const context = this.getHighlightingContext(code, start, catchTypeRanges, throwsTypeRanges);

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
        source: string,
        offset: number,
        catchTypeRanges: readonly OffsetRange[],
        throwsTypeRanges: readonly OffsetRange[]
    ): HighlightingContext | undefined {
        const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
        const linePrefix = source.slice(lineStart, offset);
        const importMatch = /^\s*import\s+(static\s+)?/.exec(linePrefix);

        if (importMatch != null) {
            return importMatch[1] === undefined ? "import" : undefined;
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
