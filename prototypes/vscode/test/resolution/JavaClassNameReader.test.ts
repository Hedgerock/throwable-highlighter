import assert from "node:assert/strict";
import {test} from "node:test";
import {JavaCodeMask} from "@throwable-highlighter/java/JavaCodeMask";
import {JavaClassNameReader} from "@throwable-highlighter/resolution/JavaClassNameReader";

test("reads a top-level class name with its package", () => {
    assert.equal(readName("package java.lang; class |RuntimeException {}"), "java.lang.RuntimeException");
});

test("reads a class name without a package", () => {
    assert.equal(readName("class |RuntimeException {}"), "RuntimeException");
});

test("includes all enclosing type names", () => {
    assert.equal(
        readName("package example; class Outer { static class Middle { class |IOException {} } }"),
        "example.Outer.Middle.IOException"
    );
});

test("does not include closed sibling types", () => {
    assert.equal(
        readName("package example; class First {} class Outer { class Previous {} class |IOException {} }"),
        "example.Outer.IOException"
    );
});

test("reads member classes inside other named type declarations", () => {
    for (const header of ["interface Outer", "enum Outer", "record Outer(int value)", "@interface Outer"]) {
        const separator = header === "enum Outer" ? ";" : "";

        assert.equal(
            readName("package example; " + header + " {" + separator + " class |IOException {} }"),
            "example.Outer.IOException",
            header
        );
    }
});

test("preserves positions after masking comments and literals", () => {
    assert.equal(
        readName(
            "// 😀 package wrong;\r\npackage java /* comment */ . io;\r\n" +
                'class Outer { String text = "class Fake {"; /* } */ class |IOException {} }'
        ),
        "java.io.Outer.IOException"
    );
});

test("does not treat class literals as enclosing declarations", () => {
    assert.equal(
        readName("package example; class Outer { Class<?>type = Throwable.class; class |IOException {} }"),
        "example.Outer.IOException"
    );
});

test("skips braces and class literals inside header annotation arguments", () => {
    assert.equal(
        readName(
            "package example; class Outer<T extends @Marker({Throwable.class}) Object> { " +
                "@Marker({RuntimeException.class}) class |IOException {} }"
        ),
        "example.Outer.IOException"
    );
});

test("does not infer a qualified class name for local or anonymous scopes", () => {
    const sources = [
        "package java.lang; class Outer { void run() { class |Throwable {} } }",
        "package java.lang; class Outer { { class |Throwable {} } }",
        "package java.lang; class Outer { Object value = new Object() { class |Throwable {} }; }"
    ];

    for (const source of sources) {
        assert.equal(readName(source), undefined, source);
    }
});

test("does not infer a class name from references or constructor declarations", () => {
    for (const source of [
        "package java.lang; class Outer { |RuntimeException value; }",
        "package java.lang; class Outer { Object value = new |RuntimeException(); }",
        "package java.lang; class RuntimeException { |RuntimeException() {} }"
    ]) {
        assert.equal(readName(source), undefined);
    }
});

test("does not treat other named types as target classes", () => {
    for (const header of ["interface", "enum", "record"]) {
        const suffix = header === "record" ? "()" : "";

        assert.equal(readName(header + " |IOException" + suffix + " {}"), undefined);
    }
});

test("returns unavailable for incomplete package or class declarations", () => {
    for (const source of [
        "package java.lang class |Throwable {}",
        "package java.; class |Throwable {}",
        "class |Throwable",
        "class |Throwable;",
        "class |Throwable class Other {}",
        "class Outer { void run() { class |Throwable"
    ]) {
        assert.equal(readName(source), undefined);
    }
});

test("does not infer names from undecoded Unicode escapes", () => {
    assert.equal(readName(String.raw`package java.\u006cang; class |Throwable {}`), undefined);
});

function readName(markedSource: string): string | undefined {
    const offset = markedSource.indexOf("|");
    assert.notEqual(offset, -1);

    const source = markedSource.slice(0, offset) + markedSource.slice(offset + 1);
    const masked = new JavaCodeMask().maskNonCode(source);

    return new JavaClassNameReader().readQualifiedName(masked, offset);
}
