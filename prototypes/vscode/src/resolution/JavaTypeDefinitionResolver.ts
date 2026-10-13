import {JavaCodeMask} from "../java/JavaCodeMask";
import * as vscode from "vscode";
import {ThrowableTypeCatalog} from "./ThrowableTypeCatalog";

const MAXIMUM_INHERITANCE_DEPTH = 16;

type ThrowableTypeResolution =
    | {
        kind: "confirmed";
        isThrowable: boolean;
    }
    | {
        kind: "unavailable";
    };

type TypeReference = {
    name: string;
    range: vscode.Range;
};

type DirectSuperclassResolution =
    | {
        kind: "found";
        reference: TypeReference;
    }
    | {
        kind: "none";
    }
    | {
        kind: "unavailable";
    };

type ClassDeclaration = {
    identity: string;
    directSuperclass: DirectSuperclassResolution;
};

export class JavaTypeDefinitionResolver {
    private readonly codeMask: JavaCodeMask;
    private readonly cacheResolutions = new Map<string, boolean>();
    private readonly pendingResolutions = new Map<string, Promise<ThrowableTypeResolution>>();
    private cacheGeneration = 0;

    constructor(codeMask: JavaCodeMask) {
        this.codeMask = codeMask;
    }

    public clearCache(): void {
        this.cacheGeneration++;
        this.cacheResolutions.clear();
        this.pendingResolutions.clear();
    }

    public async isThrowableType(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<boolean> {
        const resolution = await this.resolveType(document, position);

        return resolution.kind === "confirmed"
            && resolution.isThrowable;
    }

    private async resolveType(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<ThrowableTypeResolution> {
        const reference = this.readTypeReference(document, position);

        if (reference === undefined) {
            return {
                kind: "unavailable"
            };
        }

        return this.resolveReference(
            document,
            reference,
            new Set(),
            MAXIMUM_INHERITANCE_DEPTH
        );
    }

    private async resolveReference(
        document: vscode.TextDocument,
        reference: TypeReference,
        visitedDeclarations: ReadonlySet<string>,
        remainingDepth: number
    ): Promise<ThrowableTypeResolution> {
        if (ThrowableTypeCatalog.isFallbackThrowableType(reference.name)) {
            return {
                kind: "confirmed",
                isThrowable: true
            };
        }

        const declaration = this.findClassDeclaration(document, reference);

        if (declaration !== undefined) {
            return this.resolveClassDeclaration(
                document,
                declaration,
                visitedDeclarations,
                remainingDepth
            );
        }

        const cacheKey = this.createCacheKey(document, reference.range);
        const cacheResolution = this.cacheResolutions.get(cacheKey);

        if (cacheResolution !== undefined) {
            return {
                kind: "confirmed",
                isThrowable: cacheResolution
            };
        }

        return this.resolveDefinitionWithCache(
            cacheKey,
            document,
            reference,
            visitedDeclarations,
            remainingDepth
        );
    }

    private async resolveDefinitionWithCache(
        cacheKey: string,
        document: vscode.TextDocument,
        reference: TypeReference,
        visitedDeclarations: ReadonlySet<string>,
        remainingDepth: number
    ): Promise<ThrowableTypeResolution> {
        const pendingResolution =
            this.pendingResolutions.get(cacheKey);

        if (pendingResolution !== undefined) {
            return pendingResolution;
        }

        const cacheGeneration = this.cacheGeneration;
        const resolutionPromise = this.resolveFromDefinitionProvider(
            document,
            reference,
            new Set(visitedDeclarations),
            remainingDepth
        );

        this.pendingResolutions.set(cacheKey, resolutionPromise);

        try {
            const resolution = await resolutionPromise;

            if (
                resolution.kind === "confirmed"
                && cacheGeneration === this.cacheGeneration
            ) {
                this.cacheResolutions.set(
                    cacheKey,
                    resolution.isThrowable
                );
            }

            return resolution;
        } finally {
            if (this.pendingResolutions.get(cacheKey) === resolutionPromise) {
                this.pendingResolutions.delete(cacheKey);
            }
        }
    }

    private async resolveClassDeclaration(
        document: vscode.TextDocument,
        declaration: ClassDeclaration,
        visitedDeclarations: ReadonlySet<string>,
        remainingDepth: number
    ): Promise<ThrowableTypeResolution> {
        if (visitedDeclarations.has(declaration.identity)) {
            return {
                kind: "unavailable"
            };
        }

        if (declaration.directSuperclass.kind === "unavailable") {
            return {
                kind: "unavailable"
            };
        }

        if (declaration.directSuperclass.kind === "none") {
            return {
                kind: "confirmed",
                isThrowable: false
            };
        }

        const directSuperclass = declaration.directSuperclass.reference;

        if (ThrowableTypeCatalog.isFallbackThrowableType(directSuperclass.name)) {
            return {
                kind: "confirmed",
                isThrowable: true
            };
        }

        if (remainingDepth === 0) {
            return {
                kind: "unavailable"
            };
        }

        const nextVisitedDeclarations = new Set(visitedDeclarations);
        nextVisitedDeclarations.add(declaration.identity);

        return this.resolveReference(
            document,
            directSuperclass,
            nextVisitedDeclarations,
            remainingDepth - 1
        );
    }

    private async resolveFromDefinitionProvider(
        document: vscode.TextDocument,
        reference: TypeReference,
        visitedDeclarations: ReadonlySet<string>,
        remainingDepth: number
    ): Promise<ThrowableTypeResolution> {
        let hasUnavailableDefinition = false;

        try {
            const definitions = await vscode.commands.executeCommand<readonly (vscode.Location | vscode.LocationLink)[]>(
                "vscode.executeDefinitionProvider",
                document.uri,
                reference.range.start
            );

            if (definitions === undefined || definitions.length === 0) {
                return {
                    kind: "unavailable"
                };
            }

            for (const definition of definitions) {
                try {
                    const location = this.toLocation(definition);
                    const definitionDocument = await vscode.workspace.openTextDocument(location.uri);
                    const definitionReference = this.readTypeReference(
                        definitionDocument,
                        location.range.start
                    );

                    if (
                        definitionReference === undefined
                        || definitionReference.name !== reference.name
                    ) {
                        hasUnavailableDefinition = true;
                        continue;
                    }

                    const declaration = this.findClassDeclaration(
                        definitionDocument,
                        definitionReference
                    );

                    if (declaration === undefined) {
                        hasUnavailableDefinition = true;
                        continue;
                    }

                    const resolution = await this.resolveClassDeclaration(
                        definitionDocument,
                        declaration,
                        new Set(visitedDeclarations),
                        remainingDepth
                    );

                    if (resolution.kind === "unavailable") {
                        hasUnavailableDefinition = true;
                        continue;
                    }

                    if (resolution.isThrowable) {
                        return resolution;
                    }
                } catch {
                    hasUnavailableDefinition = true;
                }
             }
        } catch {
            return {
                kind: "unavailable"
            };
        }

        return hasUnavailableDefinition
            ? {
                kind: "unavailable"
            }
            : {
                kind: "confirmed",
                isThrowable: false
            };
    }

    private findClassDeclaration(
        document: vscode.TextDocument,
        reference: TypeReference
    ): ClassDeclaration | undefined {
        const source = this.codeMask.maskNonCode(document.getText());
        const typeNameOffset = document.offsetAt(reference.range.start);
        const classOffset = source.lastIndexOf("class", typeNameOffset);

        if (
            classOffset === -1
            || !this.isClassName(source, classOffset, typeNameOffset)
        ) {
            return undefined;
        }

        const headerStart = typeNameOffset + reference.name.length;
        const openingBrace = source.indexOf("{", headerStart);

        if (openingBrace === -1) {
            return undefined;
        }

        return {
            identity: this.createDeclarationIdentity(document, reference.range),
            directSuperclass: this.findDirectSuperclass(
                document,
                source,
                headerStart,
                openingBrace
            )
        };
    }

    private findDirectSuperclass(
        document: vscode.TextDocument,
        source: string,
        headerStart: number,
        openingBrace: number
    ): DirectSuperclassResolution {
        let genericDepth = 0;

        for (let index = headerStart; index < openingBrace; index++) {
            const character = source[index];

            if (character === "<") {
                genericDepth++;
                continue;
            }

            if (character === ">") {
                genericDepth = Math.max(0, genericDepth - 1);
                continue;
            }

            if (genericDepth === 0
                && this.hasKeywordAt(source, index, "extends")
            ) {
                const reference =
                    this.readSimpleTypeReference(
                        document,
                        source,
                        index + "extends".length
                    );

                return reference === undefined
                    ? {
                        kind: "unavailable"
                    }
                    : {
                        kind: "found",
                        reference
                    };
            }
        }

        return {
            kind: "none"
        };
    }

    private readTypeReference(
        document: vscode.TextDocument,
        position: vscode.Position
    ): TypeReference | undefined {
        const range = document.getWordRangeAtPosition(position);

        if (range === undefined) {
            return undefined;
        }

        return {
            name: document.getText(range),
            range
        }
    }

    private readSimpleTypeReference(
        document: vscode.TextDocument,
        source: string,
        offset: number
    ): TypeReference | undefined {
        const match =
            /^\s*(?:[A-Za-z_$][A-Za-z0-9_$]*\s*\.\s*)*([A-Za-z_$][A-Za-z0-9_$]*)/.exec(
                source.slice(offset)
            );

        if (match === null) {
            return undefined;
        }

        const typeName = match[1];
        const typeNameOffset = offset + match[0].lastIndexOf(typeName);

        return this.readTypeReference(
            document,
            document.positionAt(typeNameOffset)
        );
    }

    private isClassName(
        source: string,
        classOffset: number,
        typeNameOffset: number
    ): boolean {
        const beforeClass = source[classOffset - 1];
        const between = source.slice(
            classOffset + "class".length,
            typeNameOffset
        );

        return !this.isIdentifierPart(beforeClass)
            && /^\s+$/.test(between);
    }

    private hasKeywordAt(
        source: string,
        index: number,
        keyword: string
    ): boolean {
        const before = source[index - 1];
        const after = source[index + keyword.length];

        return source.slice(index, index + keyword.length) === keyword
            && !this.isIdentifierPart(before)
            && !this.isIdentifierPart(after);
    }

    private toLocation(
        definition: vscode.Location | vscode.LocationLink
    ): vscode.Location {
        if ("targetUri" in definition) {
            if (!definition.targetUri || !definition.targetSelectionRange) {
                throw new Error("Invalid location link");
            }

            return new vscode.Location(
                definition.targetUri,
                definition.targetSelectionRange
            );
        }

        return definition;
    }

    private isIdentifierPart(
        character: string | undefined
    ): boolean {
        return character !== undefined
            && /[A-Za-z0-9_$]/.test(character);
    }

    private createDeclarationIdentity(
        document: vscode.TextDocument,
        range: vscode.Range
    ): string {
        return JSON.stringify({
            uri: document.uri.toString(),
            start: {
                line: range.start.line,
                character: range.start.character
            },
            end: {
                line: range.end.line,
                character: range.end.character
            }
        });
    }

    private createCacheKey(
        document: vscode.TextDocument,
        range: vscode.Range
    ): string {
        return JSON.stringify({
            uri: document.uri.toString(),
            version: document.version,
            line: range.start.line,
            character: range.start.character
        });
    }
}
