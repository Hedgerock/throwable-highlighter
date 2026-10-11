import vscode from "vscode";
import {HighlightingContext, ThrowableHighlightingContext} from "./ThrowableHighlightingContext";
import {JavaCodeMask} from "./JavaCodeMask";

export interface OffsetRange {
    start: number;
    end: number;
}

export class ThrowableHighlightingFinder {
    private codeMask: JavaCodeMask;

    constructor(
        codeMask: JavaCodeMask
    ) {
        this.codeMask = codeMask;
    }

    public findHighlights(
        document: vscode.TextDocument
    ): Record<HighlightingContext, vscode.Range[]> {
        const highlights: Record<HighlightingContext, vscode.Range[]> = {
            class: [],
            import: [],
            catch: []
        }

        const source = document.getText();
        const code = this.codeMask.maskNonCode(source);
        const catchParameterRanges = this.findCatchParameterRanges(code);

        for (const match of code.matchAll(ThrowableHighlightingContext.TYPE_REFERENCE_PATTERN)) {
            const start = match.index;

            if (start === undefined) {
                continue;
            }

            const context = this.getHighlightingContext(
                code,
                start,
                catchParameterRanges
            );

            if (context === undefined) {
                continue;
            }

            const end = start + match[0].length;

            highlights[context].push(
                new vscode.Range(
                    document.positionAt(start),
                    document.positionAt(end)
                )
            );
        }

        return highlights;
    }

    private getHighlightingContext(
        source: string,
        offset: number,
        catchParameterRanges: readonly OffsetRange[]
    ): HighlightingContext | undefined {
        const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
        const linePrefix = source.slice(lineStart, offset);
        const importMatch = /^\s*import\s+(static\s+)?/.exec(linePrefix);

        if (importMatch != null) {
            return importMatch[1] === undefined
                ? "import"
                : undefined;
        }

        if (
            catchParameterRanges.some(
                range => range.start <= offset && offset < range.end
            )
        ) {
            return "catch";
        }

        return "class";
    }

    private findCatchParameterRanges(
        source: string
    ): OffsetRange[] {
        const ranges: OffsetRange[] = [];

        for (const match of source.matchAll(ThrowableHighlightingContext.CATCH_PARAMETER_PATTERN)) {
            const start = match.index;

            if (start === undefined) {
                continue;
            }

            const openingParenthesis = source.indexOf("(", start);
            const parameterStart = openingParenthesis + 1;
            const parameterEnd = parameterStart + match[1].length;

            ranges.push({
                start: parameterStart,
                end: parameterEnd
            })
        }

        return ranges;
    }
}
