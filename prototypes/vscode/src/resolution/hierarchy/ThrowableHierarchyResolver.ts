import type {
    ClassDeclaration,
    ClassDeclarationResolver,
    HierarchyResolutionContext,
    ParentTypeResolver,
    ThrowableTypeResolution,
    TypeReference
} from "./index";

export class ThrowableHierarchyResolver<TReference extends TypeReference> {
    constructor(private readonly isFallbackThrowableType: (typeName: string) => boolean) {}

    public async resolve(
        reference: TReference,
        context: HierarchyResolutionContext,
        resolveDeclarations: ClassDeclarationResolver<TReference>,
        resolveParent: ParentTypeResolver<TReference>
    ): Promise<ThrowableTypeResolution> {
        if (this.isFallbackThrowableType(reference.name)) {
            return {
                kind: "confirmed",
                isThrowable: true
            };
        }

        const declarationResolution = await resolveDeclarations(reference);

        if (declarationResolution.kind === "unavailable") {
            return {
                kind: "unavailable"
            };
        }

        let hasUnavailable = declarationResolution.hasUnavailable;

        for (const declaration of declarationResolution.declarations) {
            const resolution = await this.resolveDeclaration(declaration, context, resolveParent);

            if (resolution.kind === "unavailable") {
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
    ): Promise<ThrowableTypeResolution> {
        if (context.visitedDeclarations.has(declaration.identity)) {
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

        if (this.isFallbackThrowableType(directSuperclass.name)) {
            return {
                kind: "confirmed",
                isThrowable: true
            };
        }

        if (context.remainingDepth === 0) {
            return {
                kind: "unavailable"
            };
        }

        const visitedDeclarations = new Set(context.visitedDeclarations);
        visitedDeclarations.add(declaration.identity);

        return resolveParent(directSuperclass, {
            visitedDeclarations,
            remainingDepth: context.remainingDepth - 1
        });
    }
}
