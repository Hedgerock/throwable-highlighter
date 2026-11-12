import assert from "node:assert/strict";
import {setTimeout as delay} from "node:timers/promises";

import type * as vscode from "vscode";

import type {JavaTypeDefinitionResolver} from "@throwable-highlighter/resolution/JavaTypeDefinitionResolver";

export async function waitForThrowableType(
    resolver: JavaTypeDefinitionResolver,
    document: vscode.TextDocument,
    position: vscode.Position
): Promise<void> {
    const deadline = performance.now() + 30_000;

    while (performance.now() < deadline) {
        if (await resolver.isThrowableType(document, position)) {
            return;
        }

        await delay(100);
    }

    assert.fail(
        `Throwable type was not confirmed at ${document.uri.toString()}:${position.line + 1}:${position.character + 1}.`
    );
}
