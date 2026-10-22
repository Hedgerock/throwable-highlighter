import assert from "node:assert/strict";
import {test} from "node:test";

import {ThrowableTypeCatalog} from "@throwable-highlighter/resolution/ThrowableTypeCatalog";

test("recognizes known Throwable types by fully qualified name", () => {
    const names = [
        "java.lang.Throwable",
        "java.lang.Exception",
        "java.lang.RuntimeException",
        "java.io.IOException",
        "java.lang.IllegalArgumentException",
        "java.lang.IllegalStateException"
    ];

    assert.equal(ThrowableTypeCatalog.KNOWN_TYPES.length, names.length);

    for (const name of names) {
        assert.equal(ThrowableTypeCatalog.isKnownThrowableType(name), true, name);
    }
});

test("does not recognize known types by simple name", () => {
    const names = [
        "Throwable",
        "Exception",
        "RuntimeException",
        "IOException",
        "IllegalArgumentException",
        "IllegalStateException"
    ];

    for (const name of names) {
        assert.equal(ThrowableTypeCatalog.isKnownThrowableType(name), false, name);
    }
});

test("does not recognize matching names of nested types", () => {
    const names = [
        "java.lang.Outer.Throwable",
        "java.io.Outer.IOException",
        "example.Outer.RuntimeException",
        "java.lang.Throwable.NestedException"
    ];

    for (const name of names) {
        assert.equal(ThrowableTypeCatalog.isKnownThrowableType(name), false, name);
    }
});

test("does not recognize matching names from other packages", () => {
    const names = [
        "example.Throwable",
        "example.RuntimeException",
        "example.IOException",
        "java.lang.IOException",
        "java.io.RuntimeException"
    ];

    for (const name of names) {
        assert.equal(ThrowableTypeCatalog.isKnownThrowableType(name), false, name);
    }
});

test("does not recognize types outside the existing catalog", () => {
    for (const name of ["java.lang.Object", "example.CustomException", ""]) {
        assert.equal(ThrowableTypeCatalog.isKnownThrowableType(name), false, name);
    }
});
