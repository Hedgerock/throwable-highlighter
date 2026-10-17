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

export class JavaTypeDefinitionResolver {
    private readonly classDeclarationReader: JavaClassDeclarationReader;
    private readonly hierarchyResolver = new ThrowableHierarchyResolver<VsCodeTypeReference>(typeName =>
        ThrowableTypeCatalog.isFallbackThrowableType(typeName)
    );
    private readonly cacheResolutions = new Map<string, boolean>();
    private readonly pendingResolutions = new Map<string, Promise<ThrowableTypeResolution>>();
    private cacheGeneration = 0;

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
        if (ThrowableTypeCatalog.isFallbackThrowableType(reference.name)) {
            return {
                kind: "confirmed",
                isThrowable: true
            };
        }

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
                    const definitionReference = this.classDeclarationReader.readTypeReference(
                        definitionDocument,
                        location.range.start
                    );

                    if (definitionReference === undefined || definitionReference.name !== reference.name) {
                        hasUnavailableDefinition = true;
                        continue;
                    }

                    const declaration = this.classDeclarationReader.readClassDeclaration(definitionReference);

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

    private toLocation(definition: vscode.Location | vscode.LocationLink): vscode.Location {
        if ("targetUri" in definition) {
            if (!definition.targetUri || !definition.targetSelectionRange) {
                throw new Error("Invalid location link");
            }

            return new vscode.Location(definition.targetUri, definition.targetSelectionRange);
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
