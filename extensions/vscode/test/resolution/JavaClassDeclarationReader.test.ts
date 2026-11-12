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

test("reads Unicode and unconventional class and superclass names", async context => {
    const cases = [
        {name: "customException", parent: "baseException"},
        {name: "ОшибкаException", parent: "БазоваяОшибка"},
        {name: "$CustomException", parent: "$BaseException"},
        {name: "_CustomException", parent: "_BaseException"},
        {name: "CaféException", parent: "Base\u0301Exception"},
        {name: "\u{10400}Exception", parent: "\u{10401}BaseException"}
    ] as const;

    for (const scenario of cases) {
        await context.test(scenario.name, () => {
            const reader = new JavaClassDeclarationReader(new JavaCodeMask());
            const reference = createReference(
                "package example; class |" + scenario.name + " extends ошибки." + scenario.parent + " {}"
            );
            const declaration = reader.readClassDeclaration(reference);

            assert.equal(declaration?.qualifiedName, "example." + scenario.name);
            assert.ok(declaration?.directSuperclass.kind === "found");

            const parentReference = declaration.directSuperclass.reference;
            assert.equal(parentReference.name, scenario.parent);
            assert.equal(parentReference.document.getText(parentReference.range), scenario.parent);
        });
    }
});

test("does not read extends inside Unicode identifiers as a keyword", () => {
    const reader = new JavaClassDeclarationReader(new JavaCodeMask());

    for (const name of ["Ωextends", "extendsΩ", "\u{10400}extends", "extends\u{10400}"]) {
        const reference = createReference("class |Example implements " + name + " {}");

        assert.equal(reader.readClassDeclaration(reference)?.directSuperclass.kind, "none", name);
    }
});

test("does not read class inside a Unicode type name as a declaration keyword", () => {
    const reader = new JavaClassDeclarationReader(new JavaCodeMask());

    for (const name of ["Ωclass", "\u{10400}class"]) {
        const reference = createReference("class Outer { " + name + " |Example = new " + name + "() {}; }");

        assert.equal(reader.readClassDeclaration(reference), undefined, name);
    }
});

test("supplies Java identifier boundaries when reading a type reference", () => {
    const reader = new JavaClassDeclarationReader(new JavaCodeMask());
    const reference = createReference("class |$ОшибкаException {}");
    const document = {
        ...reference.document,
        getWordRangeAtPosition: (position: vscode.Position, pattern?: RegExp): vscode.Range | undefined => {
            assert.equal(position.character, reference.range.start.character);
            assert.ok(pattern);
            assert.equal(pattern.exec(reference.name)?.[0], reference.name);

            return reference.range;
        }
    } as vscode.TextDocument;

    assert.deepEqual(reader.readTypeReference(document, reference.range.start), {
        document,
        name: reference.name,
        range: reference.range
    });
});

function createReference(markedSource: string): VsCodeTypeReference {
    const offset = markedSource.indexOf("|");
    assert.notEqual(offset, -1);
    assert.doesNotMatch(markedSource, /[\r\n]/);

    const source = markedSource.slice(0, offset) + markedSource.slice(offset + 1);
    const match = /^[\p{L}\p{Nl}\p{Sc}\p{Pc}][\p{ID_Continue}\p{Sc}\p{Cf}]*/u.exec(source.slice(offset));
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
            for (const word of source.matchAll(/[\p{L}\p{Nl}\p{Sc}\p{Pc}][\p{ID_Continue}\p{Sc}\p{Cf}]*/gu)) {
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
