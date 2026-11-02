import assert from "node:assert/strict";

import {JavaCodeMask} from "@throwable-highlighter/java/JavaCodeMask";
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
});
