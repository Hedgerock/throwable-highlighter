export interface OffsetRange {
    start: number;
    end: number;
}

export class JavaThrowsClauseFinder {
    private static readonly THROWS_CLAUSE_PATTERN =
        /(?<![\p{ID_Continue}\p{Sc}\p{Cf}])throws(?![\p{ID_Continue}\p{Sc}\p{Cf}])/gu;

    private static readonly TYPE_REFERENCE_TOKEN_PATTERN =
        /@\s*[\p{ID_Continue}\p{Sc}\p{Cf}]+(?:\s*\.\s*[\p{ID_Continue}\p{Sc}\p{Cf}]+)*|[()]|[\p{ID_Continue}\p{Sc}\p{Cf}]+/gu;

    public findTypeReferenceRanges(
        source: string
    ): OffsetRange[] {
        const ranges: OffsetRange[] = [];

        for (const clause of this.findTypeRanges(source)) {
            const typeList = source.slice(clause.start, clause.end);
            let parenthesisDepth = 0;

            for (const match of typeList.matchAll(JavaThrowsClauseFinder.TYPE_REFERENCE_TOKEN_PATTERN)) {
                const token = match[0];

                if (token === "(") {
                    parenthesisDepth++;
                    continue;
                }

                if (token === ")") {
                    parenthesisDepth--;
                    continue;
                }

                if (parenthesisDepth > 0 || token.startsWith("@")) {
                    continue;
                }

                const suffix = typeList.slice(match.index + token.length);

                if (/^\s*\./.test(suffix)) {
                    continue;
                }

                const start = clause.start + match.index;

                ranges.push({
                    start,
                    end: start + token.length
                });
            }
        }

        return ranges;
    }

    public findTypeRanges(
        source: string
    ): OffsetRange[] {
        const ranges: OffsetRange[] = [];

        for (const match of source.matchAll(JavaThrowsClauseFinder.THROWS_CLAUSE_PATTERN)) {
            const start = match.index + match[0].length;
            const end = this.findTypeListEnd(source, start);

            if (end === undefined || source.slice(start, end).trim() === "") {
                continue;
            }

            ranges.push({
                start,
                end
            });
        }

        return ranges;
    }

    private findTypeListEnd(
        source: string,
        start: number
    ): number | undefined {
        let parenthesisDepth = 0;

        for (let index = start; index < source.length; index++) {
            const character = source[index];

            if (character === "(") {
                parenthesisDepth++;
                continue;
            }

            if (character === ")") {
                if (parenthesisDepth === 0) {
                    return undefined;
                }

                parenthesisDepth--;
                continue;
            }

            if (parenthesisDepth > 0) {
                continue;
            }

            if (character === "{" || character === ";") {
                return index;
            }

            if (character === "}") {
                return undefined;
            }
        }

        return undefined;
    }
}
