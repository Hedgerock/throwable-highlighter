import * as vscode from "vscode";
import {
    JavaClassDeclarationReader,
    VsCodeTypeReference
} from "@throwable-highlighter/resolution/JavaClassDeclarationReader";
import {ThrowableHierarchyResolver} from "@throwable-highlighter/resolution/hierarchy/ThrowableHierarchyResolver";
import {ThrowableTypeCatalog} from "@throwable-highlighter/resolution/ThrowableTypeCatalog";
import {
    type ClassDeclaration,
    type ClassDeclarationResolution,
    type HierarchyResolutionContext,
    MAXIMUM_INHERITANCE_DEPTH,
    type ThrowableTypeResolution
} from "@throwable-highlighter/resolution/hierarchy/index";
import type {JavaCodeMask} from "@throwable-highlighter/java/JavaCodeMask";
import {JavaDefinitionClassLocator} from "@throwable-highlighter/resolution/JavaDefinitionClassLocator";
import type {JavaDefinitionSymbol} from "@throwable-highlighter/resolution/JavaDefinitionClassLocator";

export class JavaTypeDefinitionResolver {
    private readonly classDeclarationReader: JavaClassDeclarationReader;
    private readonly hierarchyResolver = new ThrowableHierarchyResolver<VsCodeTypeReference>(typeName =>
        ThrowableTypeCatalog.isKnownThrowableType(typeName)
    );
    private readonly cacheResolutions = new Map<string, boolean>();
    private readonly pendingResolutions = new Map<string, Promise<ThrowableTypeResolution>>();
    private cacheGeneration = 0;
    private readonly definitionClassLocator = new JavaDefinitionClassLocator();

    constructor(codeMask: JavaCodeMask) {
        this.classDeclarationReader = new JavaClassDeclarationReader(codeMask);
    }

    public clearCache(): void {
        this.cacheGeneration++;
        this.cacheResolutions.clear();
        this.pendingResolutions.clear();
    }

    public async isThrowableType(document: vscode.TextDocument, position: vscode.Position): Promise<boolean> {
        const resolution = await this.resolveType(document, position);

        return resolution.kind === "confirmed" && resolution.isThrowable;
    }

    private async resolveType(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<ThrowableTypeResolution> {
        const reference = this.classDeclarationReader.readTypeReference(document, position);

        if (reference === undefined) {
            return {
                kind: "unavailable"
            };
        }

        return this.resolveReference(reference, {
            visitedDeclarations: new Set(),
            remainingDepth: MAXIMUM_INHERITANCE_DEPTH
        });
    }

    private async resolveReference(
        reference: VsCodeTypeReference,
        context: HierarchyResolutionContext
    ): Promise<ThrowableTypeResolution> {
        if (this.classDeclarationReader.readClassDeclaration(reference) !== undefined) {
            return this.resolveHierarchy(reference, context);
        }

        const cacheKey = this.createCacheKey(reference.document, reference.range);

        const cacheResolution = this.cacheResolutions.get(cacheKey);

        if (cacheResolution !== undefined) {
            return {
                kind: "confirmed",
                isThrowable: cacheResolution
            };
        }

        return this.resolveHierarchyWithCache(cacheKey, reference, context);
    }

    private async resolveHierarchyWithCache(
        cacheKey: string,
        reference: VsCodeTypeReference,
        context: HierarchyResolutionContext
    ): Promise<ThrowableTypeResolution> {
        const pendingResolution = this.pendingResolutions.get(cacheKey);

        if (pendingResolution !== undefined) {
            return pendingResolution;
        }

        const cacheGeneration = this.cacheGeneration;
        const resolutionPromise = this.resolveHierarchy(reference, context);

        this.pendingResolutions.set(cacheKey, resolutionPromise);

        try {
            const resolution = await resolutionPromise;

            if (resolution.kind === "confirmed" && cacheGeneration === this.cacheGeneration) {
                this.cacheResolutions.set(cacheKey, resolution.isThrowable);
            }

            return resolution;
        } finally {
            if (this.pendingResolutions.get(cacheKey) === resolutionPromise) {
                this.pendingResolutions.delete(cacheKey);
            }
        }
    }

    private async resolveHierarchy(
        reference: VsCodeTypeReference,
        context: HierarchyResolutionContext
    ): Promise<ThrowableTypeResolution> {
        return this.hierarchyResolver.resolve(
            reference,
            context,
            candidate => this.resolveDeclarations(candidate),
            (parentReference, parentContext) => this.resolveReference(parentReference, parentContext)
        );
    }

    private async resolveDeclarations(
        reference: VsCodeTypeReference
    ): Promise<ClassDeclarationResolution<VsCodeTypeReference>> {
        const localDeclaration = this.classDeclarationReader.readClassDeclaration(reference);

        if (localDeclaration !== undefined) {
            return {
                kind: "found",
                declarations: [localDeclaration],
                hasUnavailable: false
            };
        }

        let hasUnavailableDefinition = false;
        const declarations: ClassDeclaration<VsCodeTypeReference>[] = [];

        try {
            const definitions = await vscode.commands.executeCommand<
                readonly (vscode.Location | vscode.LocationLink)[]
            >("vscode.executeDefinitionProvider", reference.document.uri, reference.range.start);

            if (definitions === undefined || definitions.length === 0) {
                return {
                    kind: "unavailable"
                };
            }

            for (const definition of definitions) {
                try {
                    const location = this.toLocation(definition);
                    const definitionDocument = await vscode.workspace.openTextDocument(location.uri);
                    const declaration = await this.readDefinitionClass(definitionDocument, location.range, reference);

                    if (declaration === undefined) {
                        hasUnavailableDefinition = true;
                        continue;
                    }

                    declarations.push(declaration);
                } catch {
                    hasUnavailableDefinition = true;
                }
            }
        } catch {
            return {
                kind: "unavailable"
            };
        }

        if (declarations.length === 0) {
            return {
                kind: "unavailable"
            };
        }

        return {
            kind: "found",
            declarations,
            hasUnavailable: hasUnavailableDefinition
        };
    }

    private async readDefinitionClass(
        document: vscode.TextDocument,
        definitionRange: vscode.Range,
        sourceReference: VsCodeTypeReference
    ): Promise<ClassDeclaration<VsCodeTypeReference> | undefined> {
        const directReference = this.classDeclarationReader.readTypeReference(document, definitionRange.start);

        if (directReference?.name === sourceReference.name) {
            const declaration = this.classDeclarationReader.readClassDeclaration(directReference);

            if (declaration !== undefined) {
                return declaration;
            }
        }

        const symbols = await vscode.commands.executeCommand<
            readonly (vscode.DocumentSymbol | vscode.SymbolInformation)[]
        >("vscode.executeDocumentSymbolProvider", document.uri);

        const sourceOffset =
            document.uri.toString() === sourceReference.document.uri.toString()
                ? document.offsetAt(sourceReference.range.start)
                : undefined;

        const classNameRange = this.definitionClassLocator.findClassNameRange(
            this.toDefinitionSymbols(document, symbols ?? []),
            document.offsetAt(definitionRange.start),
            sourceOffset
        );

        if (classNameRange === undefined) {
            return undefined;
        }

        const classReference = this.classDeclarationReader.readTypeReference(
            document,
            document.positionAt(classNameRange.start)
        );

        if (classReference?.name !== sourceReference.name) {
            return undefined;
        }

        return this.classDeclarationReader.readClassDeclaration(classReference);
    }

    private toDefinitionSymbols(
        document: vscode.TextDocument,
        symbols: readonly (vscode.DocumentSymbol | vscode.SymbolInformation)[]
    ): JavaDefinitionSymbol[] {
        const result: JavaDefinitionSymbol[] = [];

        for (const symbol of symbols) {
            if (!("children" in symbol)) {
                continue;
            }

            result.push({
                kind:
                    symbol.kind === vscode.SymbolKind.Class
                        ? "class"
                        : symbol.kind === vscode.SymbolKind.Constructor
                          ? "constructor"
                          : "other",
                range: {
                    start: document.offsetAt(symbol.range.start),
                    end: document.offsetAt(symbol.range.end)
                },
                nameRange: {
                    start: document.offsetAt(symbol.selectionRange.start),
                    end: document.offsetAt(symbol.selectionRange.end)
                },
                children: this.toDefinitionSymbols(document, symbol.children)
            });
        }

        return result;
    }

    private toLocation(definition: vscode.Location | vscode.LocationLink): vscode.Location {
        if ("targetUri" in definition) {
            return new vscode.Location(definition.targetUri, definition.targetSelectionRange ?? definition.targetRange);
        }

        return definition;
    }

    private createCacheKey(document: vscode.TextDocument, range: vscode.Range): string {
        return JSON.stringify({
            uri: document.uri.toString(),
            version: document.version,
            line: range.start.line,
            character: range.start.character
        });
    }
}
