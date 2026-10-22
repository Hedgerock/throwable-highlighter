import assert from "node:assert/strict";
import {test} from "node:test";

import {JavaDefinitionClassLocator} from "@throwable-highlighter/resolution/JavaDefinitionClassLocator";
import type {JavaDefinitionSymbol} from "@throwable-highlighter/resolution/JavaDefinitionClassLocator";

test("locates a class by its declaration start or name", () => {
    const locator = new JavaDefinitionClassLocator();
    const symbol = classSymbol();

    for (const offset of [0, 6, 10]) {
        assert.deepEqual(locator.findClassNameRange([symbol], offset), symbol.nameRange);
    }

    assert.deepEqual(locator.findClassNameRange([symbol], 6, 6), symbol.nameRange);
});

test("maps constructor positions to the containing class", () => {
    const locator = new JavaDefinitionClassLocator();
    const symbol = classSymbol([constructorSymbol()]);

    for (const offset of [20, 27, 30]) {
        assert.deepEqual(locator.findClassNameRange([symbol], offset), symbol.nameRange);
    }
});

test("does not map ordinary methods to their containing class", () => {
    const locator = new JavaDefinitionClassLocator();
    const symbol = classSymbol([
        {
            kind: "other",
            range: {start: 60, end: 90},
            nameRange: {start: 67, end: 76},
            children: []
        }
    ]);

    for (const offset of [60, 67, 70]) {
        assert.equal(locator.findClassNameRange([symbol], offset), undefined);
    }
});

test("does not map location inside a constructor body", () => {
    const locator = new JavaDefinitionClassLocator();

    assert.equal(locator.findClassNameRange([classSymbol([constructorSymbol()])], 40), undefined);
});

test("uses the immediate class containing a nested constructor", () => {
    const locator = new JavaDefinitionClassLocator();
    const nested: JavaDefinitionSymbol = {
        kind: "class",
        range: {start: 20, end: 150},
        nameRange: {start: 26, end: 35},
        children: [
            {
                kind: "constructor",
                range: {start: 40, end: 100},
                nameRange: {start: 47, end: 56},
                children: []
            }
        ]
    };

    assert.deepEqual(locator.findClassNameRange([classSymbol([nested])], 40), nested.nameRange);
});

test("requires a class as the immediate constructor parent", () => {
    const locator = new JavaDefinitionClassLocator();
    const other: JavaDefinitionSymbol = {
        kind: "other",
        range: {start: 10, end: 100},
        nameRange: {start: 15, end: 19},
        children: [constructorSymbol()]
    };

    for (const symbols of [[constructorSymbol()], [other], [classSymbol([other])]]) {
        assert.equal(locator.findClassNameRange(symbols, 20), undefined);
    }
});

test("does not treat the constructor declaration itself as a type reference", () => {
    const locator = new JavaDefinitionClassLocator();
    const symbol = classSymbol([constructorSymbol()]);

    for (const sourceOffset of [27, 30]) {
        assert.equal(locator.findClassNameRange([symbol], 20, sourceOffset), undefined);
    }
});

test("allows a constructor reference elsewhere in the same document", () => {
    const locator = new JavaDefinitionClassLocator();
    const symbol = classSymbol([constructorSymbol()]);

    assert.deepEqual(locator.findClassNameRange([symbol], 20, 120), symbol.nameRange);
});

test("returns no result for missing or multiple matches", () => {
    const locator = new JavaDefinitionClassLocator();
    const symbol = classSymbol([constructorSymbol()]);

    assert.equal(locator.findClassNameRange([], 20), undefined);
    assert.equal(locator.findClassNameRange([symbol], 190), undefined);
    assert.equal(locator.findClassNameRange([symbol, symbol], 20), undefined);
});

function classSymbol(children: readonly JavaDefinitionSymbol[] = []): JavaDefinitionSymbol {
    return {
        kind: "class",
        range: {start: 0, end: 200},
        nameRange: {start: 6, end: 15},
        children
    };
}

function constructorSymbol(): JavaDefinitionSymbol {
    return {
        kind: "constructor",
        range: {start: 20, end: 55},
        nameRange: {start: 27, end: 36},
        children: []
    };
}
