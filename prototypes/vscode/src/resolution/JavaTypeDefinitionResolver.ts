import * as vscode from "vscode";

import {MAXIMUM_INHERITANCE_DEPTH} from "@throwable-highlighter/resolution/hierarchy/index";
import {ThrowableHierarchyResolver} from "@throwable-highlighter/resolution/hierarchy/ThrowableHierarchyResolver";
import {
    JavaClassDeclarationReader,
    VsCodeTypeReference
} from "@throwable-highlighter/resolution/JavaClassDeclarationReader";
import {JavaDefinitionClassLocator} from "@throwable-highlighter/resolution/JavaDefinitionClassLocator";
import {JavaProviderRequestCounter} from "@throwable-highlighter/resolution/JavaProviderRequestCounter";
import {JavaProviderRequestLimiter} from "@throwable-highlighter/resolution/JavaProviderRequestLimiter";
import {JavaTypeResolutionCache} from "@throwable-highlighter/resolution/JavaTypeResolutionCache";
import {ThrowableTypeCatalog} from "@throwable-highlighter/resolution/ThrowableTypeCatalog";
import type {JavaCodeMask} from "@throwable-highlighter/java/JavaCodeMask";
import type {
    ClassDeclaration,
    ClassDeclarationResolution,
    HierarchyResolutionContext,
    ThrowableTypeResolution
} from "@throwable-highlighter/resolution/hierarchy/index";
import type {JavaDefinitionSymbol} from "@throwable-highlighter/resolution/JavaDefinitionClassLocator";
import type {JavaProviderRequestSnapshot} from "@throwable-highlighter/resolution/JavaProviderRequestCounter";
import type {JavaProviderRequestLimiterSnapshot} from "@throwable-highlighter/resolution/JavaProviderRequestLimiter";

const DEFAULT_MAXIMUM_CONCURRENT_REQUESTS = 32;
const DEFAULT_MAXIMUM_CACHED_RESOLUTIONS = 512;

type JavaTypeResolutionContext = HierarchyResolutionContext & {
    readonly isCurrent: () => boolean;
};

export type JavaTypeDefinitionResolverResourceSnapshot = {
    readonly cacheGeneration: number;
    readonly cachedResolutionCount: number;
    readonly pendingResolutionCount: number;
    readonly definitionRequests: JavaProviderRequestSnapshot;
    readonly documentSymbolRequests: JavaProviderRequestSnapshot;
    readonly providerRequests: JavaProviderRequestLimiterSnapshot;
};

export class JavaTypeDefinitionResolver {
    private readonly classDeclarationReader: JavaClassDeclarationReader;
    private readonly hierarchyResolver = new ThrowableHierarchyResolver<VsCodeTypeReference>(typeName =>
        ThrowableTypeCatalog.isKnownThrowableType(typeName)
    );
    private readonly cacheResolutions: JavaTypeResolutionCache;
    private readonly pendingResolutions = new Map<string, Promise<ThrowableTypeResolution>>();
    private cacheGeneration = 0;
    private readonly definitionClassLocator = new JavaDefinitionClassLocator();
    private readonly definitionRequests = new JavaProviderRequestCounter();
    private readonly documentSymbolRequests = new JavaProviderRequestCounter();

    private readonly providerRequestLimiter: JavaProviderRequestLimiter;
    private isDisposed = false;

    constructor(
        codeMask: JavaCodeMask,
        maximumConcurrentRequests = DEFAULT_MAXIMUM_CONCURRENT_REQUESTS,
        maximumCachedResolutions = DEFAULT_MAXIMUM_CACHED_RESOLUTIONS
    ) {
        this.classDeclarationReader = new JavaClassDeclarationReader(codeMask);
        this.providerRequestLimiter = new JavaProviderRequestLimiter(maximumConcurrentRequests);
        this.cacheResolutions = new JavaTypeResolutionCache(maximumCachedResolutions);
    }

    public clearCache(): void {
        if (this.isDisposed) {
            return;
        }

        this.invalidateCache();
        this.providerRequestLimiter.cancelPending();
    }

    public dispose(): void {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        this.invalidateCache();
        this.providerRequestLimiter.dispose();
    }

    public getResourceSnapshot(): JavaTypeDefinitionResolverResourceSnapshot {
        return {
            cacheGeneration: this.cacheGeneration,
            cachedResolutionCount: this.cacheResolutions.size,
            pendingResolutionCount: this.pendingResolutions.size,
            definitionRequests: this.definitionRequests.getSnapshot(),
            documentSymbolRequests: this.documentSymbolRequests.getSnapshot(),
            providerRequests: this.providerRequestLimiter.getSnapshot()
        };
    }

    public async isThrowableType(document: vscode.TextDocument, position: vscode.Position): Promise<boolean> {
        if (this.isDisposed) {
            return false;
        }

        const generation = this.cacheGeneration;
        const context: JavaTypeResolutionContext = {
            visitedDeclarations: new Set(),
            remainingDepth: MAXIMUM_INHERITANCE_DEPTH,
            isCurrent: () => !this.isDisposed && generation === this.cacheGeneration
        };

        const resolution = await this.resolveType(document, position, context);

        return context.isCurrent() && resolution.kind === "confirmed" && resolution.isThrowable;
    }

    private async resolveType(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: JavaTypeResolutionContext
    ): Promise<ThrowableTypeResolution> {
        const reference = this.classDeclarationReader.readTypeReference(document, position);

        if (reference === undefined) {
            return {
                kind: "unavailable"
            };
        }

        return this.resolveReference(reference, context);
    }

    private async resolveReference(
        reference: VsCodeTypeReference,
        context: JavaTypeResolutionContext
    ): Promise<ThrowableTypeResolution> {
        if (!context.isCurrent()) {
            return {kind: "unavailable"};
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
        context: JavaTypeResolutionContext
    ): Promise<ThrowableTypeResolution> {
        const isTopLevelRequest = context.visitedDeclarations.size === 0;
        const pendingResolution = isTopLevelRequest ? this.pendingResolutions.get(cacheKey) : undefined;

        if (pendingResolution !== undefined) {
            return pendingResolution;
        }

        const resolutionPromise = this.resolveHierarchy(reference, context);

        if (isTopLevelRequest) {
            this.pendingResolutions.set(cacheKey, resolutionPromise);
        }

        try {
            const resolution = await resolutionPromise;

            if (!context.isCurrent()) {
                return {kind: "unavailable"};
            }

            if (resolution.kind === "confirmed") {
                this.cacheResolutions.set(cacheKey, resolution.isThrowable);
            }

            return resolution;
        } finally {
            if (isTopLevelRequest && this.pendingResolutions.get(cacheKey) === resolutionPromise) {
                this.pendingResolutions.delete(cacheKey);
            }
        }
    }

    private async resolveHierarchy(
        reference: VsCodeTypeReference,
        context: JavaTypeResolutionContext
    ): Promise<ThrowableTypeResolution> {
        const resolution = await this.hierarchyResolver.resolve(
            reference,
            context,
            candidate => this.resolveDeclarations(candidate, context),
            (parentReference, parentContext) =>
                this.resolveReference(parentReference, {...parentContext, isCurrent: context.isCurrent})
        );

        return context.isCurrent() ? resolution : {kind: "unavailable"};
    }

    private async resolveDeclarations(
        reference: VsCodeTypeReference,
        context: JavaTypeResolutionContext
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
            const definitions = await this.runProviderRequest(
                this.definitionRequests,
                () =>
                    vscode.commands.executeCommand<readonly (vscode.Location | vscode.LocationLink)[]>(
                        "vscode.executeDefinitionProvider",
                        reference.document.uri,
                        reference.range.start
                    ),
                context
            );

            if (definitions === undefined || definitions.length === 0) {
                return {
                    kind: "unavailable"
                };
            }

            for (const definition of definitions) {
                if (!context.isCurrent()) {
                    return {kind: "unavailable"};
                }

                try {
                    const location = this.toLocation(definition);
                    const definitionDocument = await vscode.workspace.openTextDocument(location.uri);

                    if (!context.isCurrent()) {
                        return {kind: "unavailable"};
                    }

                    const declaration = await this.readDefinitionClass(
                        definitionDocument,
                        location.range,
                        reference,
                        context
                    );

                    if (!context.isCurrent()) {
                        return {kind: "unavailable"};
                    }

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
        sourceReference: VsCodeTypeReference,
        context: JavaTypeResolutionContext
    ): Promise<ClassDeclaration<VsCodeTypeReference> | undefined> {
        const directReference = this.classDeclarationReader.readTypeReference(document, definitionRange.start);

        if (directReference?.name === sourceReference.name) {
            const declaration = this.classDeclarationReader.readClassDeclaration(directReference);

            if (declaration !== undefined) {
                return declaration;
            }
        }

        const symbols = await this.runProviderRequest(
            this.documentSymbolRequests,
            () =>
                vscode.commands.executeCommand<readonly (vscode.DocumentSymbol | vscode.SymbolInformation)[]>(
                    "vscode.executeDocumentSymbolProvider",
                    document.uri
                ),
            context
        );

        if (!context.isCurrent()) {
            return undefined;
        }

        const sourceOffset =
            document.uri.toString() === sourceReference.document.uri.toString()
                ? document.offsetAt(sourceReference.range.start)
                : undefined;

        const classNameRange = this.definitionClassLocator.findClassNameRange(
            this.toDefinitionSymbols(document, symbols ?? []),
            document.offsetAt(definitionRange.start),
            sourceOffset
        );

        const classNamePosition =
            classNameRange === undefined
                ? this.findFullJdtTypeNamePosition(document, definitionRange, sourceReference, symbols ?? [], context)
                : document.positionAt(classNameRange.start);

        if (classNamePosition === undefined) {
            return undefined;
        }

        const classReference = this.classDeclarationReader.readTypeReference(document, classNamePosition);

        if (classReference?.name !== sourceReference.name) {
            return undefined;
        }

        return this.classDeclarationReader.readClassDeclaration(classReference);
    }

    private runProviderRequest<T>(
        counter: JavaProviderRequestCounter,
        operation: () => PromiseLike<T>,
        context: JavaTypeResolutionContext
    ): Promise<T> {
        return this.providerRequestLimiter.run(() => counter.track(operation), context.isCurrent);
    }

    private invalidateCache(): void {
        this.cacheGeneration++;
        this.cacheResolutions.clear();
        this.pendingResolutions.clear();
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

    private findFullJdtTypeNamePosition(
        document: vscode.TextDocument,
        definitionRange: vscode.Range,
        sourceReference: VsCodeTypeReference,
        symbols: readonly (vscode.DocumentSymbol | vscode.SymbolInformation)[],
        context: JavaTypeResolutionContext
    ): vscode.Position | undefined {
        if (
            document.uri.scheme !== "jdt" ||
            definitionRange.start.line !== 0 ||
            definitionRange.start.character !== 0
        ) {
            return undefined;
        }

        const documentEnd = document.positionAt(document.getText().length);

        if (definitionRange.end.line !== documentEnd.line || definitionRange.end.character !== documentEnd.character) {
            return undefined;
        }

        if (
            context.visitedDeclarations.size === 0 &&
            !this.classDeclarationReader.isExplicitTypeReference(sourceReference)
        ) {
            return undefined;
        }

        const matches = symbols.filter(
            (symbol): symbol is vscode.DocumentSymbol =>
                "children" in symbol && symbol.kind === vscode.SymbolKind.Class && symbol.name === sourceReference.name
        );

        return matches.length === 1 ? matches[0].selectionRange.start : undefined;
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
