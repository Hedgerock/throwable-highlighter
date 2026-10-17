import {JavaTypeReferenceRangeReader} from "./JavaTypeReferenceRangeReader";
import type {OffsetRange} from "./JavaTypeReferenceRangeReader";

export class JavaThrowsClauseFinder {
    private static readonly THROWS_CLAUSE_PATTERN =
        /(?<![\p{ID_Continue}\p{Sc}\p{Cf}])throws(?![\p{ID_Continue}\p{Sc}\p{Cf}])/gu;

    constructor(private readonly typeReferenceRangeReader: JavaTypeReferenceRangeReader) {}

    public findTypeReferenceRanges(source: string): OffsetRange[] {
        return this.findTypeRanges(source).flatMap(range => this.typeReferenceRangeReader.read(source, range));
    }

    public findTypeRanges(source: string): OffsetRange[] {
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

    private findTypeListEnd(source: string, start: number): number | undefined {
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
