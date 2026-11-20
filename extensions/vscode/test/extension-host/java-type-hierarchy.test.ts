import assert from "node:assert/strict";
import {setTimeout as delay} from "node:timers/promises";

import * as vscode from "vscode";

import {openJavaFixture, positionOf, waitForJavaSupport} from "./support/javaSupport";

suite("Java type hierarchy", async () => {
    suiteSetup(async () => {
        await waitForJavaSupport();
    });

    test("provides a superclass chain from a workspace to Throwable", async () => {
        const document = await openJavaFixture("exception", "BaseException.java");
        const position = positionOf(document, "BaseException");
        const expected = ["BaseException", "RuntimeException", "Exception", "Throwable"];
        const deadline = performance.now() + 30_000;
        let lastPath: string[] = [];

        while (performance.now() < deadline) {
            lastPath = await readSuperclassNames(document, position);

            if (lastPath.join(" -> ") === expected.join(" -> ")) {
                return;
            }

            await delay(100);
        }

        assert.deepEqual(lastPath, expected, "Java type Hierarchy did not return the expected superclass chain.");
    });
});

async function readSuperclassNames(document: vscode.TextDocument, position: vscode.Position): Promise<string[]> {
    const roots = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
        "vscode.prepareTypeHierarchy",
        document.uri,
        position
    );

    let current = roots?.find(item => item.kind === vscode.SymbolKind.Class && item.name === "BaseException");

    const names: string[] = [];

    for (let depth = 0; current !== undefined && depth < 4; depth++) {
        names.push(current.name);

        if (current.name === "Throwable") {
            break;
        }

        const parents = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
            "vscode.provideSupertypes",
            current
        );

        current = parents?.find(item => item.kind === vscode.SymbolKind.Class);
    }

    return names;
}
