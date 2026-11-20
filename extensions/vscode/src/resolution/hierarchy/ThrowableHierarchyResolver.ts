import type {
    ClassDeclaration,
    ClassDeclarationResolver,
    HierarchyResolutionContext,
    ParentTypeResolver,
    ThrowableTypeResolution,
    TypeReference
} from "@throwable-highlighter/resolution/hierarchy/index";

export class ThrowableHierarchyResolver<TReference extends TypeReference> {
    constructor(private readonly isKnownThrowableType: (qualifiedName: string) => boolean) {}

    public async resolve(
        reference: TReference,
        context: HierarchyResolutionContext,
        resolveDeclarations: ClassDeclarationResolver<TReference>,
        resolveParent: ParentTypeResolver<TReference>
    ): Promise<ThrowableTypeResolution<TReference>> {
        const declarationResolution = await resolveDeclarations(reference);

        if (declarationResolution.kind === "unavailable" || declarationResolution.declarations.length === 0) {
            return {
                kind: "unavailable"
            };
        }

        let hasUnavailable = declarationResolution.hasUnavailable;
        const canUseFallback = !hasUnavailable && declarationResolution.declarations.length === 1;

        for (const declaration of declarationResolution.declarations) {
            const resolution = await this.resolveDeclaration(declaration, context, resolveParent);

            if (resolution.kind === "unavailable") {
                if (canUseFallback) {
                    return resolution;
                }

                hasUnavailable = true;
                continue;
            }

            if (resolution.isThrowable) {
                return resolution;
            }
        }

        return hasUnavailable ? {kind: "unavailable"} : {kind: "confirmed", isThrowable: false};
    }

    private async resolveDeclaration(
        declaration: ClassDeclaration<TReference>,
        context: HierarchyResolutionContext,
        resolveParent: ParentTypeResolver<TReference>
    ): Promise<ThrowableTypeResolution<TReference>> {
        if (context.visitedDeclarations.has(declaration.identity)) {
            return {
                kind: "unavailable"
            };
        }

        if (declaration.qualifiedName !== undefined && this.isKnownThrowableType(declaration.qualifiedName)) {
            return {
                kind: "confirmed",
                isThrowable: true
            };
        }

        if (declaration.directSuperclass.kind === "none") {
            return {kind: "confirmed", isThrowable: false};
        }

        if (context.remainingDepth === 0) {
            return {kind: "unavailable"};
        }

        if (declaration.directSuperclass.kind === "unavailable") {
            return {
                kind: "unavailable",
                fallback: {
                    declaration,
                    visitedDeclarations: context.visitedDeclarations,
                    remainingDepth: context.remainingDepth
                }
            };
        }

        const visitedDeclarations = new Set(context.visitedDeclarations);
        visitedDeclarations.add(declaration.identity);

        return resolveParent(declaration.directSuperclass.reference, {
            visitedDeclarations,
            remainingDepth: context.remainingDepth - 1
        });
    }
}
