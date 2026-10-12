import {JavaCodeMask} from "../java/JavaCodeMask";
import * as vscode from "vscode";
import {ThrowableTypeCatalog} from "./ThrowableTypeCatalog";

type ThrowableTypeResolution =
    | {
        kind: "confirmed";
        isThrowable: boolean;
    }
    | {
        kind: "unavailable";
    }

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
        const range = document.getWordRangeAtPosition(position);

        if (range === undefined) {
            return {
                kind: "unavailable"
            };
        }

        const typeName = document.getText(range);

        if (ThrowableTypeCatalog.isKnownThrowableType(typeName)) {

            return {
                kind: "confirmed",
                isThrowable: true
            };
        }

        const locationResolution = this.resolveDirectSuperclass(
            document,
            range.start,
            typeName
        );

        if (locationResolution.kind === "confirmed") {
            return locationResolution;
        }

        const cacheKey = this.createCacheKey(document, range);
        const cachedResolution = this.cacheResolutions.get(cacheKey);

        if (cachedResolution !== undefined) {
            return {
                kind: "confirmed",
                isThrowable: cachedResolution
            };
        }

        return this.resolveDefinitionWithCache(
            cacheKey,
            document,
            position,
            typeName
        );
    }

    private async resolveDefinitionWithCache(
        cacheKey: string,
        document: vscode.TextDocument,
        position: vscode.Position,
        typeName: string
    ): Promise<ThrowableTypeResolution> {
        const pendingResolution =
            this.pendingResolutions.get(cacheKey);

        if (pendingResolution !== undefined) {
            return pendingResolution;
        }

        const cacheGeneration = this.cacheGeneration;
        const resolutionPromise = this.resolveFromDefinitionProvider(
            document,
            position,
            typeName
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

    private async resolveFromDefinitionProvider(
        document:  vscode.TextDocument,
        position: vscode.Position,
        typeName: string
    ): Promise<ThrowableTypeResolution> {
        let hasUnavailableDefinition = false;

        try {
            const definitions = await vscode.commands.executeCommand<readonly (vscode.Location | vscode.LocationLink)[]>(
                "vscode.executeDefinitionProvider",
                document.uri,
                position
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
                    const resolution = this.resolveDirectSuperclass(
                        definitionDocument,
                        location.range.start,
                        typeName
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

    private resolveDirectSuperclass(
        document: vscode.TextDocument,
        position: vscode.Position,
        typeName: string
    ): ThrowableTypeResolution {
        const range = document.getWordRangeAtPosition(position);

        if (range === undefined || document.getText(range) !== typeName) {
            return {
                kind: "unavailable"
            };
        }

        const source = this.codeMask.maskNonCode(document.getText());
        const typeNameOffset = document.offsetAt(range.start);
        const classOffset = source.lastIndexOf("class", typeNameOffset);

        if (
            classOffset === -1
            || !this.isClassName(source, classOffset, typeNameOffset)
        ) {
            return {
                kind: "unavailable"
            };
        }

        const headerStart = typeNameOffset + typeName.length;
        const openingBrace = source.indexOf("{", headerStart);

        if (openingBrace === -1) {
            return {
                kind: "unavailable"
            };
        }

        const header = source.slice(headerStart, openingBrace);
        const directSuperclass = this.findDirectSuperclass(header);

        return {
            kind: "confirmed",
            isThrowable: directSuperclass !== undefined
                && ThrowableTypeCatalog.isKnownThrowableType(
                    directSuperclass
                )
        };
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

    private findDirectSuperclass(
        header: string
    ): string | undefined {
        let genericDepth = 0;

        for (let index = 0; index < header.length; index++) {
            const character = header[index];

            if (character === "<" ) {
                genericDepth++;
                continue;
            }

            if (character === ">") {
                genericDepth = Math.max(0, genericDepth - 1);
                continue;
            }

            if (genericDepth === 0
                && this.hasKeywordAt(header, index, "extends")
            ) {
                return this.readSimpleTypeName(header, index + "extends".length);
            }
        }

        return undefined;
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

    private readSimpleTypeName(
        source: string,
        offset: number
    ): string | undefined {
        const match =
            /^\s*(?:[A-Za-z_$][A-Za-z0-9_$]*\s*\.\s*)*([A-Za-z_$][A-Za-z0-9_$]*)/.exec(
                source.slice(offset)
            );

        return match?.[1];
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
