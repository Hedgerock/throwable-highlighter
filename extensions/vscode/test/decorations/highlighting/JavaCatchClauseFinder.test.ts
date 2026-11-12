import assert from "node:assert/strict";
import {test} from "node:test";

import {JavaCatchClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaCatchClauseFinder";
import {JavaTypeReferenceRangeReader} from "@throwable-highlighter/decorations/highlighting/JavaTypeReferenceRangeReader";
import {JavaCodeMask} from "@throwable-highlighter/java/JavaCodeMask";

test("skips nested annotation arguments and qualified type prefixes", () => {
    const source =
        "try {} catch (@Outer(@Inner({IOException.class})) " +
        "java.io.@Marker IOException | java.lang.RuntimeException error) {}";

    assert.deepEqual(findTypeNames(source), ["IOException", "RuntimeException"]);
});

test("excludes the parameter name and references in the catch body", () => {
    const source = "try {} catch (IOException RuntimeException) { IOException copy = null; }";

    assert.deepEqual(findTypeNames(source), ["IOException"]);
});

test("finds all multi-catch types with a final modifier", () => {
    const source = "try {} catch (final IOException | IllegalArgumentException | IllegalStateException error) {}";

    assert.deepEqual(findTypeNames(source), ["IOException", "IllegalArgumentException", "IllegalStateException"]);
});

test("preserves the position of the type after annotation arguments", () => {
    const source = "try {} catch (@Marker(IOException.class) IOException error) {}";
    const code = new JavaCodeMask().maskNonCode(source);
    const start = source.indexOf("IOException error");

    const ranges = createFinder().findTypeReferenceRanges(code);

    assert.deepEqual(ranges, [{start, end: start + "IOException".length}]);
});

test("does not treat catch inside identifiers as a keyword", () => {
    const source =
        "void $catch(IOException value) {} void catch$(IOException value) {} " +
        "void жcatch(IOException value) {} void catchЖ(IOException value) {}";

    assert.deepEqual(findTypeNames(source), []);
});

test("handles marker annotations before a final modifier", () => {
    const source = "try {} catch (@Marker final IOException error) {}";

    assert.deepEqual(findTypeNames(source), ["IOException"]);
});

test("ignores catch-like text outside Java code", () => {
    const source = [
        "// catch (IOException error) {}",
        "/* catch (IllegalStateException error) {} */",
        'String message = "catch (RuntimeException error) {}";',
        'String text = """',
        "catch (Throwable error) {}",
        '""";',
        "try {} catch (IOException error) {}"
    ].join("\n");

    assert.deepEqual(findTypeNames(source), ["IOException"]);
});

test("does not extend an unfinished parameter into a block", () => {
    const source =
        "try {} catch (IOException error { consume(RuntimeException.class); }" +
        "try {} catch (IllegalStateException error) {}";

    assert.deepEqual(findTypeNames(source), ["IllegalStateException"]);
});

test("does not infer a type from incomplete catch parameters", () => {
    const sources = [
        "catch () {}",
        "catch (IOException) {}",
        "catch (final IOException) {}",
        "catch (IOException | RuntimeException) {})",
        "catch (IOException error"
    ];

    for (const source of sources) {
        assert.deepEqual(findTypeNames(source), []);
    }
});

test("handles separate catch clauses without including either block body", () => {
    const source =
        "try {} catch (IOException first) { RuntimeException copy = null; } " +
        "catch (IllegalStateException second) {}";

    assert.deepEqual(findTypeNames(source), ["IOException", "IllegalStateException"]);
});

function findTypeNames(source: string): string[] {
    const code = new JavaCodeMask().maskNonCode(source);
    const ranges = createFinder().findTypeReferenceRanges(code);

    return ranges.map(range => source.slice(range.start, range.end));
}

function createFinder(): JavaCatchClauseFinder {
    return new JavaCatchClauseFinder(new JavaTypeReferenceRangeReader());
}
