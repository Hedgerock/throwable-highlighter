import assert from "node:assert/strict";

import * as vscode from "vscode";

import {JavaCodeMask} from "@throwable-highlighter/java/JavaCodeMask";
import {JavaClassDeclarationReader} from "@throwable-highlighter/resolution/JavaClassDeclarationReader";
import {JavaTypeDefinitionResolver} from "@throwable-highlighter/resolution/JavaTypeDefinitionResolver";

import {openJavaFixture, positionOf, waitForJavaSupport} from "./support/javaSupport";
import {waitForThrowableType} from "./support/throwableResolution";

const THROWABLE_SCENARIOS = [
    {
        name: "recognizes a standard Throwable type",
        path: ["exception", "BaseException.java"],
        reference: "RuntimeException"
    },
    {
        name: "recognizes a direct subclass declared in another file",
        path: ["exception", "NestedException.java"],
        reference: "BaseException"
    },
    {
        name: "recognizes a transitive subclass declared in another file",
        path: ["usage", "TransitiveContextFixture.java"],
        reference: "NestedException nestedException"
    }
] as const;

suite("Java type resolution", () => {
    suiteSetup(async () => {
        await waitForJavaSupport();
    });

    for (const scenario of THROWABLE_SCENARIOS) {
        test(scenario.name, async () => {
            const document = await openJavaFixture(...scenario.path);
            const position = positionOf(document, scenario.reference);
            const resolver = new JavaTypeDefinitionResolver(new JavaCodeMask());

            await waitForThrowableType(resolver, document, position);
        });
    }

    test("rejects a class declaration outside the Throwable hierarchy", async () => {
        const document = await openJavaFixture("usage", "TransitiveContextFixture.java");
        const position = positionOf(document, "TransitiveContextFixture");
        const resolver = new JavaTypeDefinitionResolver(new JavaCodeMask());

        assert.equal(await resolver.isThrowableType(document, position), false);
    });

    if (process.env.THROWABLE_HIGHLIGHTER_MEASURE_JAVA === "1") {
        test("measures Type Hierarchy fallback with real Java support", async () => {
            const usage = await openJavaFixture("usage", "HierarchyResolutionUsage.java");
            const scenarios = [
                {
                    path: "definition",
                    declaration: ["exception", "BaseException.java"],
                    name: "BaseException",
                    reference: "BaseException directFailure",
                    superclassKind: "found"
                },
                {
                    path: "type-hierarchy",
                    declaration: ["hierarchy", "AnnotatedFailure.java"],
                    name: "AnnotatedFailure",
                    reference: "AnnotatedFailure annotatedFailure",
                    superclassKind: "unavailable"
                }
            ] as const;

            const codeMask = new JavaCodeMask();
            const reader = new JavaClassDeclarationReader(codeMask);
            const targets = await Promise.all(
                scenarios.map(async scenario => {
                    const document = await openJavaFixture(...scenario.declaration);
                    const reference = reader.readTypeReference(document, positionOf(document, scenario.name));
                    assert.ok(reference);
                    assert.equal(
                        reader.readClassDeclaration(reference)?.directSuperclass.kind,
                        scenario.superclassKind
                    );
                    return {path: scenario.path, position: positionOf(usage, scenario.reference)};
                })
            );

            const resolver = new JavaTypeDefinitionResolver(codeMask);
            const measure = async (position: vscode.Position): Promise<number> => {
                const startedAt = performance.now();
                const confirmed = await resolver.isThrowableType(usage, position);
                const elapsedMs = performance.now() - startedAt;
                assert.equal(confirmed, true);
                return Number(elapsedMs.toFixed(3));
            };

            const repetitions = 10;
            const measurements = [];

            try {
                for (const {position} of targets) {
                    await waitForThrowableType(resolver, usage, position);
                }

                for (let repetition = 1; repetition <= repetitions; repetition++) {
                    const order = repetition % 2 === 1 ? targets : [...targets].reverse();
                    for (const {path, position} of order) {
                        resolver.clearCache();
                        const coldCacheMs = await measure(position);
                        const warmCacheMs = await measure(position);
                        measurements.push({repetition, path, coldCacheMs, warmCacheMs});
                    }
                }

                console.log(
                    "[java-type-hierarchy-benchmark] " +
                        JSON.stringify({vscodeVersion: vscode.version, repetitions, measurements})
                );
            } finally {
                resolver.dispose();
            }
        });

        test("measures transitive Throwable resolution with real Java support", async () => {
            const document = await openJavaFixture("usage", "TransitiveContextFixture.java");
            const position = positionOf(document, "NestedException nestedException");
            const resolver = new JavaTypeDefinitionResolver(new JavaCodeMask());

            await waitForThrowableType(resolver, document, position);

            const measure = async (): Promise<number> => {
                const startedAt = performance.now();
                const confirmed = await resolver.isThrowableType(document, position);
                const elapsedMs = performance.now() - startedAt;

                assert.equal(confirmed, true);

                return Number(elapsedMs.toFixed(3));
            };

            const measurements = [];

            for (let repetition = 1; repetition <= 10; repetition++) {
                resolver.clearCache();
                const coldCacheMs = await measure();
                const warmCacheMs = await measure();

                measurements.push({coldCacheMs, warmCacheMs});
            }

            console.log("[java-resolution-benchmark] " + JSON.stringify(measurements));
        });
    }
});
