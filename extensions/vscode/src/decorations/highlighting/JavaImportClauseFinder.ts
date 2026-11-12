import type {OffsetRange} from "@throwable-highlighter/decorations/highlighting/JavaTypeReferenceRangeReader";

export interface JavaImportClause {
    range: OffsetRange;
    typeRange?: OffsetRange;
}

export class JavaImportClauseFinder {
    private static readonly IMPORT_KEYWORD_PATTERN =
        /(?<![\p{ID_Continue}\p{Sc}\p{Cf}])import(?![\p{ID_Continue}\p{Sc}\p{Cf}])/gu;

    private static readonly IDENTIFIER_PATTERN = /[\p{L}\p{Nl}\p{Sc}\p{Pc}][\p{ID_Continue}\p{Sc}\p{Cf}]*/uy;

    private static readonly NON_IDENTIFIERS_WORDS = new Set(
        (
            "abstract assert boolean break byte case catch char class const continue default do double else enum " +
            "extends final finally float for goto if implements import instanceof int interface long native new package " +
            "private protected public return short static strictfp super switch synchronized this throw throws transient " +
            "try void volatile while _ true false null"
        ).split(" ")
    );

    public findClauses(source: string): JavaImportClause[] {
        const clauses: JavaImportClause[] = [];

        for (const match of source.matchAll(JavaImportClauseFinder.IMPORT_KEYWORD_PATTERN)) {
            clauses.push(this.readClause(source, match.index, match.index + match[0].length));
        }

        return clauses;
    }

    private readClause(source: string, start: number, keywordEnd: number): JavaImportClause {
        let end = keywordEnd;
        let offset = this.skipWhitespace(source, end);
        let isStatic = false;
        let isWildcard = false;

        const modifier = this.readIdentifier(source, offset);

        if (modifier !== undefined && source.slice(modifier.start, modifier.end) === "static") {
            isStatic = true;
            end = modifier.end;
            offset = this.skipWhitespace(source, end);
        }

        let typeRange: OffsetRange;

        while (true) {
            const identifier = this.readIdentifier(source, offset);

            if (
                identifier === undefined ||
                JavaImportClauseFinder.NON_IDENTIFIERS_WORDS.has(source.slice(identifier.start, identifier.end))
            ) {
                return {
                    range: {
                        start,
                        end
                    }
                };
            }

            typeRange = identifier;
            end = identifier.end;
            offset = this.skipWhitespace(source, end);

            if (source[offset] !== ".") {
                break;
            }

            end = offset + 1;
            offset = this.skipWhitespace(source, end);

            if (source[offset] === "*") {
                isWildcard = true;
                end = offset + 1;
                offset = this.skipWhitespace(source, end);
                break;
            }
        }

        if (source[offset] !== ";") {
            return {
                range: {
                    start,
                    end
                }
            };
        }

        const range = {start, end: offset + 1};

        if (isStatic || isWildcard) {
            return {range};
        }

        return {
            range,
            typeRange
        };
    }

    private readIdentifier(source: string, offset: number): OffsetRange | undefined {
        const pattern = JavaImportClauseFinder.IDENTIFIER_PATTERN;
        pattern.lastIndex = offset;

        const match = pattern.exec(source);

        if (match === null) {
            return undefined;
        }

        return {
            start: offset,
            end: offset + match[0].length
        };
    }

    private skipWhitespace(source: string, offset: number): number {
        while (offset < source.length && /\s/.test(source[offset])) {
            offset++;
        }

        return offset;
    }
}
