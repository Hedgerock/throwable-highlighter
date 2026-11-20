export const MAXIMUM_INHERITANCE_DEPTH = 16;

export type ThrowableTypeResolution<TReference extends TypeReference = TypeReference> =
    | {kind: "confirmed"; isThrowable: boolean}
    | {kind: "unavailable"; fallback?: TypeHierarchyFallbackStart<TReference>};

export type TypeHierarchyFallbackStart<TReference extends TypeReference> = HierarchyResolutionContext & {
    declaration: ClassDeclaration<TReference>;
};

export type TypeReference = {
    name: string;
};

export type DirectSuperclassResolution<TReference extends TypeReference> =
    {kind: "found"; reference: TReference} | {kind: "none"} | {kind: "unavailable"};

export type ClassDeclaration<TReference extends TypeReference> = {
    identity: string;
    nameReference: TReference;
    qualifiedName: string | undefined;
    directSuperclass: DirectSuperclassResolution<TReference>;
};

export type ClassDeclarationResolution<TReference extends TypeReference> =
    | {kind: "found"; declarations: readonly ClassDeclaration<TReference>[]; hasUnavailable: boolean}
    | {kind: "unavailable"};

export type HierarchyResolutionContext = {
    visitedDeclarations: ReadonlySet<string>;
    remainingDepth: number;
};

export type ClassDeclarationResolver<TReference extends TypeReference> = (
    reference: TReference
) => Promise<ClassDeclarationResolution<TReference>>;

export type ParentTypeResolver<TReference extends TypeReference> = (
    reference: TReference,
    context: HierarchyResolutionContext
) => Promise<ThrowableTypeResolution<TReference>>;
