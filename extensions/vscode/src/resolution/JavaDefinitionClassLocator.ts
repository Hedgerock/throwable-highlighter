export type JavaDefinitionRange = {
    start: number;
    end: number;
};

export type JavaDefinitionSymbol = {
    kind: "class" | "constructor" | "other";
    range: JavaDefinitionRange;
    nameRange: JavaDefinitionRange;
    children: readonly JavaDefinitionSymbol[];
};

export class JavaDefinitionClassLocator {
    public findClassNameRange(
        symbols: readonly JavaDefinitionSymbol[],
        definitionOffset: number,
        sourceOffset?: number
    ): JavaDefinitionRange | undefined {
        const matches: JavaDefinitionRange[] = [];

        const visit = (items: readonly JavaDefinitionSymbol[], parent?: JavaDefinitionSymbol): void => {
            for (const symbol of items) {
                const matchesDefinition =
                    symbol.range.start === definitionOffset || this.contains(symbol.nameRange, definitionOffset);

                if (matchesDefinition) {
                    if (symbol.kind === "class") {
                        matches.push(symbol.nameRange);
                    } else if (
                        symbol.kind === "constructor" &&
                        parent?.kind === "class" &&
                        (sourceOffset === undefined || !this.contains(symbol.nameRange, sourceOffset))
                    ) {
                        matches.push(parent.nameRange);
                    }
                }
                visit(symbol.children, symbol);
            }
        };

        visit(symbols);

        return matches.length === 1 ? matches[0] : undefined;
    }

    private contains(range: JavaDefinitionRange, offset: number): boolean {
        return range.start <= offset && offset < range.end;
    }
}
