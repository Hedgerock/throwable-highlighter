import assert from "node:assert/strict";
import {setTimeout as delay} from "node:timers/promises";

import * as vscode from "vscode";

import {JavaCodeMask} from "@throwable-highlighter/java/JavaCodeMask";
import {JavaClassDeclarationReader} from "@throwable-highlighter/resolution/JavaClassDeclarationReader";

import {openJavaFixture, positionOf, waitForJavaSupport} from "./support/javaSupport";

suite("Java type hierarchy", () => {
    suiteSetup(async () => {
        await waitForJavaSupport();
    });

    test("finds Throwable through AssertionError from the JDK", async () => {
        const document = await openJavaFixture("hierarchy", "AnnotatedAssertionFailure.java");
        const [, assertionError, , throwable] = await waitForSuperclassChain(document, [
            "AnnotatedAssertionFailure",
            "AssertionError",
            "Error",
            "Throwable"
        ]);
        assert.ok(assertionError);
        assert.ok(throwable);

        const reader = new JavaClassDeclarationReader(new JavaCodeMask());
        assert.equal(await readQualifiedName(reader, assertionError), "java.lang.AssertionError");
        assert.equal(await readQualifiedName(reader, throwable), "java.lang.Throwable");
    });

    test("distinguishes a project class named Throwable from java.lang.Throwable", async () => {
        const document = await openJavaFixture("hierarchy", "AnnotatedOrdinary.java");
        const [, projectThrowable, object] = await waitForSuperclassChain(document, [
            "AnnotatedOrdinary",
            "Throwable",
            "Object"
        ]);
        assert.ok(projectThrowable);
        assert.ok(object);

        const reader = new JavaClassDeclarationReader(new JavaCodeMask());
        assert.equal(
            await readQualifiedName(reader, projectThrowable),
            "throwablehighlighter.fixture.hierarchy.Throwable"
        );
        assert.equal(await readQualifiedName(reader, object), "java.lang.Object");
    });

    test("provides a superclass chain from a workspace class to Throwable", async () => {
        const document = await openJavaFixture("exception", "BaseException.java");
        await waitForSuperclassChain(document, ["BaseException", "RuntimeException", "Exception", "Throwable"]);
    });

    test("finds Throwable through an annotated superclass", async () => {
        const document = await openJavaFixture("hierarchy", "AnnotatedFailure.java");
        const expected = ["AnnotatedFailure", "RuntimeException", "Exception", "Throwable"];
        const reader = new JavaClassDeclarationReader(new JavaCodeMask());

        const reference = reader.readTypeReference(document, positionOf(document, expected[0]));
        assert.ok(reference);
        assert.equal(reader.readClassDeclaration(reference)?.directSuperclass.kind, "unavailable");

        const chain = await waitForSuperclassChain(document, expected);
        const throwable = chain.at(-1);
        assert.ok(throwable);
        assert.equal(await readQualifiedName(reader, throwable), "java.lang.Throwable");
    });
});

async function waitForSuperclassChain(
    document: vscode.TextDocument,
    expected: readonly string[]
): Promise<readonly vscode.TypeHierarchyItem[]> {
    const name = expected[0];
    const position = positionOf(document, name);
    const deadline = performance.now() + 30_000;
    let lastNames: string[] = [];

    while (performance.now() < deadline) {
        const roots = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
            "vscode.prepareTypeHierarchy",
            document.uri,
            position
        );
        const root = roots?.find(
            item =>
                item.kind === vscode.SymbolKind.Class &&
                item.name === name &&
                item.uri.toString() === document.uri.toString() &&
                item.selectionRange.contains(position)
        );
        const chain = await readSuperclassChain(root, expected.length);
        lastNames = chain.map(item => item.name);

        if (lastNames.length === expected.length && lastNames.every((item, index) => item === expected[index])) {
            return chain;
        }

        await delay(100);
    }

    return assert.fail(`Expected superclass chain ${expected.join(" -> ")}, received ${lastNames.join(" -> ")}.`);
}

async function readQualifiedName(reader: JavaClassDeclarationReader, item: vscode.TypeHierarchyItem): Promise<string> {
    const source = await vscode.workspace.openTextDocument(item.uri);
    const position = reader.findTopLevelClassNamePosition(source, item.name);
    assert.ok(position, `The declaration of ${item.name} could not be found.`);

    const reference = reader.readTypeReference(source, position);
    assert.ok(reference);
    const qualifiedName = reader.readClassDeclaration(reference)?.qualifiedName;
    assert.ok(qualifiedName, `The qualified name of ${item.name} could not be read.`);
    return qualifiedName;
}

async function readSuperclassChain(
    root: vscode.TypeHierarchyItem | undefined,
    limit: number
): Promise<readonly vscode.TypeHierarchyItem[]> {
    const chain: vscode.TypeHierarchyItem[] = [];
    let current = root;

    while (current !== undefined) {
        chain.push(current);
        if (chain.length === limit) {
            break;
        }

        const parents = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(
            "vscode.provideSupertypes",
            current
        );
        const classes = parents?.filter(item => item.kind === vscode.SymbolKind.Class) ?? [];
        current = classes.length === 1 ? classes[0] : undefined;
    }

    return chain;
}
