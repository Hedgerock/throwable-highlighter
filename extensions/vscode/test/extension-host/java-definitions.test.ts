import assert from "node:assert/strict";
import {setTimeout as delay} from "node:timers/promises";

import * as vscode from "vscode";

import {JavaCodeMask} from "@throwable-highlighter/java/JavaCodeMask";
import {JavaTypeDefinitionResolver} from "@throwable-highlighter/resolution/JavaTypeDefinitionResolver";

import {openJavaFixture, positionOf, waitForJavaSupport} from "./support/javaSupport";

type Definition = vscode.Location | vscode.LocationLink;

suite("Java definitions", () => {
    suiteSetup(async () => {
        await waitForJavaSupport();
    });

    test("does not resolve a method call as a same-named Throwable class", async () => {
        const document = await openJavaFixture("hierarchy", "AnnotatedFailure.java");
        const call = positionOf(document, "AnnotatedFailure();");
        const declaration = positionOf(document, "void AnnotatedFailure()");
        const definitions = await waitForDefinitions(document, call);
        const foundMethod = definitions.some(definition => {
            const location = toLocation(definition);
            return (
                location.uri.toString() === document.uri.toString() && location.range.start.line === declaration.line
            );
        });

        assert.ok(foundMethod, "Definition Provider did not return the AnnotatedFailure method declaration.");

        const resolver = new JavaTypeDefinitionResolver(new JavaCodeMask());

        try {
            assert.equal(await resolver.isThrowableType(document, call), false);
        } finally {
            resolver.dispose();
        }
    });

    test("resolves a cross-file reference to its class declaration", async () => {
        const document = await openJavaFixture("usage", "TransitiveContextFixture.java");
        const expectedDocument = await openJavaFixture("exception", "NestedException.java");
        const referencePosition = positionOf(document, "NestedException nestedException");
        const declarationPosition = positionOf(expectedDocument, "class NestedException");

        const definitions = await waitForDefinitions(document, referencePosition);
        const foundDeclaration = definitions.some(definition => {
            const location = toLocation(definition);

            return (
                location.uri.toString() === expectedDocument.uri.toString() &&
                location.range.start.line === declarationPosition.line
            );
        });

        assert.ok(foundDeclaration, "Definition Provider did not return the NestedException class declaration.");
    });
});

async function waitForDefinitions(
    document: vscode.TextDocument,
    position: vscode.Position
): Promise<readonly Definition[]> {
    const deadline = performance.now() + 30_000;

    while (performance.now() < deadline) {
        const definitions = await vscode.commands.executeCommand<readonly Definition[]>(
            "vscode.executeDefinitionProvider",
            document.uri,
            position
        );

        if (definitions !== undefined && definitions.length > 0) {
            return definitions;
        }

        await delay(100);
    }

    assert.fail(`Definition Provider returned no results for ${document.uri.toString()}`);
}

function toLocation(definition: Definition): vscode.Location {
    return "targetUri" in definition
        ? new vscode.Location(definition.targetUri, definition.targetSelectionRange ?? definition.targetRange)
        : definition;
}
