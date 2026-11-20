import assert from "node:assert/strict";
import {test} from "node:test";

import * as vscode from "vscode";

import {JavaCodeMask} from "@throwable-highlighter/java/JavaCodeMask";
import {JavaClassDeclarationReader} from "@throwable-highlighter/resolution/JavaClassDeclarationReader";
import {JavaProviderRequestLimiter} from "@throwable-highlighter/resolution/JavaProviderRequestLimiter";
import {JavaTypeHierarchyResolver} from "@throwable-highlighter/resolution/JavaTypeHierarchyResolver";

test("rejects a hierarchy root in another document with the same class name and range", async context => {
    const document = {
        uri: {
            toString: () => "file:///First/Failure.java"
        }
    } as vscode.TextDocument;
    const range = {
        start: {line: 0, character: 6},
        end: {line: 0, character: 13},
        isEqual: (other: vscode.Range): boolean => other === range
    } as vscode.Range;

    const otherRoot: vscode.TypeHierarchyItem = {
        kind: vscode.SymbolKind.Class,
        name: "Failure",
        detail: "",
        uri: {
            toString: () => "file:///Second/Failure.java"
        } as vscode.Uri,
        range,
        selectionRange: range
    };
    const commands = context.mock.method(vscode.commands, "executeCommand", async () => [otherRoot]);

    const requests = new JavaProviderRequestLimiter(1);
    context.after(() => requests.dispose());

    const resolver = new JavaTypeHierarchyResolver(new JavaClassDeclarationReader(new JavaCodeMask()), requests);
    const result = await resolver.resolve(
        {
            declaration: {
                identity: "first-failure",
                nameReference: {
                    document,
                    name: "Failure",
                    range
                },
                qualifiedName: "first.Failure",
                directSuperclass: {
                    kind: "unavailable"
                }
            },
            visitedDeclarations: new Set(),
            remainingDepth: 3
        },
        () => true
    );

    assert.deepEqual(result, {kind: "unavailable"});
    assert.deepEqual(
        commands.mock.calls.map(call => call.arguments),
        [["vscode.prepareTypeHierarchy", document.uri, range.start]]
    );
});
