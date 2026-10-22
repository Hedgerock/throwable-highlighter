import assert from "node:assert/strict";
import {test} from "node:test";

import * as vscode from "vscode";

import {JavaCodeMask} from "@throwable-highlighter/java/JavaCodeMask";
import {JavaClassDeclarationReader} from "@throwable-highlighter/resolution/JavaClassDeclarationReader";
import type {VsCodeTypeReference} from "@throwable-highlighter/resolution/JavaClassDeclarationReader";

test("includes the package in a class declaration", () => {
    const reader = new JavaClassDeclarationReader(new JavaCodeMask());
    const declaration = reader.readClassDeclaration(createReference("package java.lang; class |RuntimeException {}"));

    assert.equal(declaration?.qualifiedName, "java.lang.RuntimeException");
});

test("preserves a class name without a package", () => {
    const reader = new JavaClassDeclarationReader(new JavaCodeMask());
    const declaration = reader.readClassDeclaration(createReference("class |RuntimeException {}"));

    assert.equal(declaration?.qualifiedName, "RuntimeException");
});

test("includes enclosing types in a class declaration", () => {
    const reader = new JavaClassDeclarationReader(new JavaCodeMask());
    const declaration = reader.readClassDeclaration(
        createReference("package java.lang; class Outer { class |Throwable {} }")
    );

    assert.equal(declaration?.qualifiedName, "java.lang.Outer.Throwable");
});

test("preserves a superclass when the qualified name is unavailable", () => {
    const reader = new JavaClassDeclarationReader(new JavaCodeMask());
    const declaration = reader.readClassDeclaration(
        createReference("class Outer { void run() { class |LocalException extends RuntimeException {} } }")
    );

    assert.ok(declaration?.directSuperclass.kind === "found");
    assert.equal(declaration.qualifiedName, undefined);

    assert.equal(declaration.directSuperclass.reference.name, "RuntimeException");
});

test("does not read references or constructors as class declarations", () => {
    const reader = new JavaClassDeclarationReader(new JavaCodeMask());

    for (const source of [
        "class Outer { |RuntimeException value; }",
        "class Outer { Object value = new |RuntimeException(); }",
        "class RuntimeException { |RuntimeException() {} }"
    ]) {
        assert.equal(reader.readClassDeclaration(createReference(source)), undefined, source);
    }
});

function createReference(markedSource: string): VsCodeTypeReference {
    const offset = markedSource.indexOf("|");
    assert.notEqual(offset, -1);
    assert.doesNotMatch(markedSource, /[\r\n]/);

    const source = markedSource.slice(0, offset) + markedSource.slice(offset + 1);
    const match = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(source.slice(offset));
    assert.ok(match);

    const positionAt = (character: number): vscode.Position => ({line: 0, character}) as vscode.Position;
    const rangeAt = (start: number, end: number): vscode.Range =>
        ({
            start: positionAt(start),
            end: positionAt(end)
        }) as vscode.Range;

    const document = {
        uri: {
            toString: () => "file:///ClassDeclarationFixture.java"
        },
        getText: (range?: vscode.Range): string =>
            range === undefined ? source : source.slice(range.start.character, range.end.character),
        offsetAt: (position: vscode.Position): number => position.character,
        positionAt,
        getWordRangeAtPosition: (position: vscode.Position): vscode.Range | undefined => {
            for (const word of source.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) {
                const start = word.index;
                const end = start + word[0].length;

                if (start <= position.character && position.character < end) {
                    return rangeAt(start, end);
                }
            }

            return undefined;
        }
    } as vscode.TextDocument;

    return {
        name: match[0],
        document,
        range: rangeAt(offset, offset + match[0].length)
    };
}
