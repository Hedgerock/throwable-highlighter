import assert from "node:assert/strict";
import {test} from "node:test";

import type {
    TypeReference,
    ClassDeclaration,
    ClassDeclarationResolution,
    HierarchyResolutionContext,
    ThrowableTypeResolution
} from "../../src/resolution/hierarchy";

import {ThrowableHierarchyResolver} from "../../src/resolution/hierarchy/ThrowableHierarchyResolver";

type Reference = TypeReference;

test("returns unavailable when the direct superclass cannot be read", async () => {
    const resolver = createResolver();
    let parentWasResolved = false;

    const result = await resolver.resolve(
        reference("UnreadableException"),
        context(),
        async () => declarationsOf([
            {
                identity: "UnreadableException",
                directSuperclass: {
                    kind: "unavailable"
                }
            }
        ]),
        async () => {
            parentWasResolved = true;
            return confirmed(true);
        }
    );

    assert.deepEqual(result, unavailable());
    assert.equal(parentWasResolved, false);
});

test("returns unavailable when declarations cannot be resolved", async () => {
    const resolver = createResolver();
    let parentWasResolved = false;

    const result = await resolver.resolve(
        reference("UnknownException"),
        context(),
        async () => unavailableDeclarations(),
        async () => {
            parentWasResolved = true;
            return confirmed(true);
        }
    );

    assert.deepEqual(result, unavailable());
    assert.equal(parentWasResolved, false);
});

test("preserves an unavailable result when no declaration confirms Throwable", async () => {
    const resolver = createResolver();

    const result = await resolver.resolve(
        reference("AmbiguousType"),
        context(),
        async () => declarationsOf(
            [declarationWithoutSuperclass("AmbiguousType")],
            true
        ),
        async () => unavailable()
    );

    assert.deepEqual(result, unavailable());
});

test("returns unavailable for a cycle in the inheritance graph", async () => {
    const resolver = createResolver();

    const declarations = new Map<string, ClassDeclaration<Reference>>([
        [
            "FirstException",
            declarationWithSuperclass(
                "FirstException",
                "SecondException"
            )
        ],
        [
            "SecondException",
            declarationWithSuperclass(
                "SecondException",
                "FirstException"
            )
        ]
    ]);

    const resolvedDeclarations = async (
        currentReference: Reference
    ): Promise<ClassDeclarationResolution<Reference>> => {
        const declaration = declarations.get(currentReference.name);

        return declaration === undefined
            ? { kind: "unavailable" }
            : declarationsOf([declaration]);
    };

    const resolveReference = async (
        currentReference: Reference,
        currentContext: HierarchyResolutionContext
    ): Promise<ThrowableTypeResolution> => resolver.resolve(
        currentReference,
        currentContext,
        resolvedDeclarations,
        resolveReference
    );

    const result = await resolveReference(
        reference("FirstException"),
        context()
    );

    assert.deepEqual(result, unavailable());
});

test("returns unavailable when the depth limit is reached", async () => {
    const resolver = createResolver();
    let parentWasResolved = false;

    const result = await resolver.resolve(
        reference("NestedException"),
        context(0),
        async () => declarationsOf([
            declarationWithSuperclass(
                "NestedException",
                "BaseException"
            )
        ]),
        async () => {
            parentWasResolved = true;
            return confirmed(true);
        }
    );

    assert.deepEqual(result, unavailable());
    assert.equal(parentWasResolved, false);
});

test("confirms a class without a superclass as non-Throwable", async () => {
    const resolver = createResolver();

    const result = await resolver.resolve(
        reference("PlainClass"),
        context(),
        async () => declarationsOf([
            declarationWithoutSuperclass("PlainClass")
        ]),
        async () => unavailable()
    );

    assert.deepEqual(result, confirmed(false));
});

test("passes traversal context to a transitive parent", async () => {
    const resolver = createResolver();

    const result = await resolver.resolve(
        reference("NestedException"),
        context(),
        async () => declarationsOf([
            declarationWithSuperclass(
                "NestedException",
                "BaseException"
            )
        ]),
        async (parentReference, parentContext) => {
            assert.equal(parentReference.name, "BaseException");
            assert.deepEqual(
                [...parentContext.visitedDeclarations],
                ["NestedException"]
            );
            assert.equal(parentContext.remainingDepth, 15);

            return confirmed(true);
        }
    );

    assert.deepEqual(result, confirmed(true));
});

test("confirms a direct subclass of a fallback type", async () => {
    const resolver = createResolver();
    let parentWasResolved = false;

    const result = await resolver.resolve(
        reference("CustomException"),
        context(),
        async () => declarationsOf([
            declarationWithSuperclass(
                "CustomException",
                "RuntimeException"
            )
        ]),
        async () => {
            parentWasResolved = true;
            return unavailable();
        }
    );

    assert.deepEqual(result, confirmed(true));
    assert.equal(parentWasResolved, false);
});

test("confirms a fallback type without resolving declarations", async () => {
    const resolver = createResolver();
    let wasResolved = false;

    const result = await resolver.resolve(
        reference("RuntimeException"),
        context(),
        async () => {
            wasResolved = true;
            return unavailableDeclarations();
        },
        async () => unavailable()
    );

    assert.deepEqual(result, confirmed(true));
    assert.equal(wasResolved, false);
});

function reference(name: string): Reference {
    return { name };
}

function context(
    remainingDepth = 16
): HierarchyResolutionContext {
    return {
        visitedDeclarations: new Set(),
        remainingDepth
    };
}

function confirmed(
    isThrowable: boolean
): ThrowableTypeResolution {
    return {
        kind: "confirmed",
        isThrowable
    };
}

function unavailable(): ThrowableTypeResolution {
    return {
        kind: "unavailable"
    };
}

function unavailableDeclarations(): ClassDeclarationResolution<Reference> {
    return {
        kind: "unavailable"
    };
}

function declarationWithoutSuperclass(
    identity: string
): ClassDeclaration<Reference> {
    return {
        identity,
        directSuperclass: {
            kind: "none"
        }
    };
}

function declarationWithSuperclass(
    identity: string,
    parentName: string
): ClassDeclaration<Reference> {
    return {
        identity,
        directSuperclass: {
            kind: "found",
            reference: reference(parentName)
        }
    };
}

function declarationsOf(
    declarations: readonly ClassDeclaration<Reference>[],
    hasUnavailable = false
): ClassDeclarationResolution<Reference> {
    return {
        kind: "found",
        declarations,
        hasUnavailable
    };
}

function createResolver(): ThrowableHierarchyResolver<Reference> {
    return new ThrowableHierarchyResolver(
        typeName => typeName === "Throwable" || typeName === "RuntimeException"
    );
}
