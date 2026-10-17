import {JavaTypeReferenceRangeReader} from "./JavaTypeReferenceRangeReader";
import type {OffsetRange} from "./JavaTypeReferenceRangeReader";

export class JavaCatchClauseFinder {
    private static readonly CATCH_PARAMETER_PATTERN =
        /(?<![\p{ID_Continue}\p{Sc}\p{Cf}])catch(?![\p{ID_Continue}\p{Sc}\p{Cf}])\s*\(/gu;

    private static readonly PARAMETER_NAME_PATTERN = /[\p{ID_Continue}\p{Sc}\p{Cf}]+\s*$/u;

    constructor(private readonly typeReferenceRangeReader: JavaTypeReferenceRangeReader) {}

    public findTypeReferenceRanges(source: string): OffsetRange[] {
        const ranges: OffsetRange[] = [];

        for (const match of source.matchAll(JavaCatchClauseFinder.CATCH_PARAMETER_PATTERN)) {
            const start = match.index + match[0].length;
            const end = this.findParameterEnd(source, start);

            if (end === undefined) {
                continue;
            }

            const parameter = source.slice(start, end);
            const parameterName = JavaCatchClauseFinder.PARAMETER_NAME_PATTERN.exec(parameter);

            if (parameterName === null) {
                continue;
            }

            const typeEnd = start + parameterName.index;
            const typeSource = source.slice(start, typeEnd).trimEnd();

            if (typeSource.endsWith("|")) {
                continue;
            }

            const typeRanges = this.typeReferenceRangeReader.read(source, {
                start,
                end: typeEnd
            });

            for (const range of typeRanges) {
                if (source.slice(range.start, range.end) !== "final") {
                    ranges.push(range);
                }
            }
        }

        return ranges;
    }

    private findParameterEnd(source: string, start: number): number | undefined {
        let parenthesisDepth = 0;

        for (let index = start; index < source.length; index++) {
            const character = source[index];

            if (character === "(") {
                parenthesisDepth++;
                continue;
            }

            if (character === ")") {
                if (parenthesisDepth === 0) {
                    return index;
                }

                parenthesisDepth--;
                continue;
            }

            if (parenthesisDepth === 0 && (character === "{" || character === "}" || character === ";")) {
                return undefined;
            }
        }

        return undefined;
    }
}
