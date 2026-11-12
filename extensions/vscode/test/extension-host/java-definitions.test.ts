import assert from "node:assert/strict";
import {setTimeout as delay} from "node:timers/promises";

import * as vscode from "vscode";

import {openJavaFixture, positionOf, waitForJavaSupport} from "./support/javaSupport";

type Definition = vscode.Location | vscode.LocationLink;

suite("Java definitions", () => {
    suiteSetup(async () => {
        await waitForJavaSupport();
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
