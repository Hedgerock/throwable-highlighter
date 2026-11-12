import assert from "node:assert/strict";

import * as vscode from "vscode";

const EXTENSION_ID = "hedgerock.throwable-highlighter";

const COMMAND_IDS = ["throwableHighlighter.openColorSettings", "throwableHighlighter.openDiagnostics"] as const;

suite("Extension activation", () => {
    test("activates the extension and registers its commands", async () => {
        const extension = vscode.extensions.getExtension<unknown>(EXTENSION_ID);

        assert.ok(extension, `Extension ${EXTENSION_ID} is not available.`);

        await extension.activate();

        assert.equal(extension.isActive, true);

        const registeredCommands = new Set(await vscode.commands.getCommands(true));

        for (const commandId of COMMAND_IDS) {
            assert.ok(registeredCommands.has(commandId), `Command ${commandId} is not registered.`);
        }

        assert.equal(registeredCommands.has("throwableHighlighter.inspectDefinition"), false);
    });
});
