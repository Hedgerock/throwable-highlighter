type JavaToken = {
    text: string;
    offset: number;
};

export class JavaClassNameReader {
    private static readonly TOKEN_PATTERN = /[\p{L}\p{Nl}\p{Sc}\p{Pc}][\p{ID_Continue}\p{Sc}\p{Cf}]*|\S/gu;

    private static readonly IDENTIFIER_PATTERN = /^[\p{L}\p{Nl}\p{Sc}\p{Pc}][\p{ID_Continue}\p{Sc}\p{Cf}]*$/u;

    private static readonly TYPE_KEYWORDS = new Set(["class", "record", "interface", "enum"]);

    public readQualifiedName(source: string, classNameOffset: number): string | undefined {
        if (source.includes("\\")) {
            return undefined;
        }

        const tokens = [...source.matchAll(JavaClassNameReader.TOKEN_PATTERN)].map(match => ({
            text: match[0],
            offset: match.index
        }));

        const scopes: (string | undefined)[] = [];
        let packageName = "";
        let packageWasRead = false;
        let hasTopLevelType = false;

        for (let index = 0; index < tokens.length; index++) {
            const token = tokens[index];

            if (token.offset > classNameOffset) {
                return undefined;
            }

            if (token.text === "package") {
                if (packageWasRead || hasTopLevelType || scopes.length !== 0) {
                    return undefined;
                }

                const declaration = this.readPackage(tokens, index + 1);

                if (declaration === undefined) {
                    return undefined;
                }

                packageName = declaration.name;
                packageWasRead = true;
                index = declaration.endIndex;
                continue;
            }

            if (
                JavaClassNameReader.TYPE_KEYWORDS.has(token.text) &&
                tokens[index - 1]?.text !== "." &&
                this.isIdentifier(tokens[index + 1]?.text)
            ) {
                const name = tokens[index + 1];
                const bodyIndex = this.findTypeBody(tokens, index + 2);

                if (bodyIndex === undefined) {
                    return undefined;
                }

                if (name.offset === classNameOffset) {
                    if (token.text !== "class") {
                        return undefined;
                    }

                    const names = packageName === "" ? [] : [packageName];

                    for (const scope of scopes) {
                        if (scope === undefined) {
                            return undefined;
                        }

                        names.push(scope);
                    }

                    names.push(name.text);
                    return names.join(".");
                }

                hasTopLevelType ||= scopes.length === 0;
                scopes.push(name.text);
                index = bodyIndex;

                continue;
            }

            if (token.offset === classNameOffset) {
                return undefined;
            }

            if (token.text === "{") {
                scopes.push(undefined);
            } else if (token.text === "}") {
                if (scopes.length === 0) {
                    return undefined;
                }

                scopes.pop();
            }
        }

        return undefined;
    }

    private readPackage(
        tokens: readonly JavaToken[],
        startIndex: number
    ): {name: string; endIndex: number} | undefined {
        const names: string[] = [];
        let expectsIdentifier = true;

        for (let index = startIndex; index < tokens.length; index++) {
            const text = tokens[index].text;

            if (expectsIdentifier) {
                if (!this.isIdentifier(text)) {
                    return undefined;
                }

                names.push(text);
                expectsIdentifier = false;
            } else if (text === ".") {
                expectsIdentifier = true;
            } else if (text === ";") {
                return {
                    name: names.join("."),
                    endIndex: index
                };
            } else {
                return undefined;
            }
        }

        return undefined;
    }

    private findTypeBody(tokens: readonly JavaToken[], startIndex: number) {
        let parenthesisDepth = 0;
        let bracketDepth = 0;

        for (let index = startIndex; index < tokens.length; index++) {
            const text = tokens[index].text;

            if (text === "(") {
                parenthesisDepth++;
                continue;
            }

            if (text === ")") {
                if (parenthesisDepth === 0) {
                    return undefined;
                }

                parenthesisDepth--;
                continue;
            }

            if (text === "[") {
                bracketDepth++;
                continue;
            }

            if (text === "]") {
                if (bracketDepth === 0) {
                    return undefined;
                }

                bracketDepth--;
                continue;
            }

            if (parenthesisDepth !== 0 || bracketDepth !== 0) {
                continue;
            }

            if (text === "{") {
                return index;
            }

            if (
                text === ";" ||
                text === "}" ||
                (JavaClassNameReader.TYPE_KEYWORDS.has(text) && tokens[index - 1]?.text !== ".")
            ) {
                return undefined;
            }
        }

        return undefined;
    }

    private isIdentifier(text: string | undefined): boolean {
        return text !== undefined && JavaClassNameReader.IDENTIFIER_PATTERN.test(text);
    }
}
