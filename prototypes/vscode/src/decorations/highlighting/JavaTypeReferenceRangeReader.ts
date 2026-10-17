export interface OffsetRange {
    start: number;
    end: number;
}

export class JavaTypeReferenceRangeReader {
    private static readonly TYPE_REFERENCE_TOKEN_PATTERN =
        /@\s*[\p{ID_Continue}\p{Sc}\p{Cf}]+(?:\s*\.\s*[\p{ID_Continue}\p{Sc}\p{Cf}]+)*|[()]|[\p{ID_Continue}\p{Sc}\p{Cf}]+/gu;

    public read(source: string, range: OffsetRange) {
        const ranges: OffsetRange[] = [];
        const fragment = source.slice(range.start, range.end);
        let parenthesisDepth = 0;

        for (const match of fragment.matchAll(JavaTypeReferenceRangeReader.TYPE_REFERENCE_TOKEN_PATTERN)) {
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

            const suffix = fragment.slice(match.index + token.length);

            if (/^\s*\./.test(suffix)) {
                continue;
            }

            const start = range.start + match.index;

            ranges.push({
                start,
                end: start + token.length
            });
        }

        return ranges;
    }
}
