import assert from "node:assert/strict";
import {test} from "node:test";

import {JavaThrowsClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaThrowsClauseFinder";
import {JavaTypeReferenceRangeReader} from "@throwable-highlighter/decorations/highlighting/JavaTypeReferenceRangeReader";
import {JavaCodeMask} from "@throwable-highlighter/java/JavaCodeMask";

test("returns the throws reference instead of the same type in annotation arguments", () => {
    const source = `
        class ThrowsFixture {
            
            void execute() throws @Marker(IOException.class) IOException {
                IOException copy = null;
            }
        }
    `;

    const code = new JavaCodeMask().maskNonCode(source);
    const ranges = createFinder().findTypeReferenceRanges(code);
    const start = source.indexOf("IOException {");

    assert.deepEqual(ranges, [
        {
            start,
            end: start + "IOException".length
        }
    ]);
});

test("finds throws type names outside annotations and package qualifiers", () => {
    const source = `
        class ThrowsFixture {
            
            void execute()
                throws @Outer(@Inner({IOException.class})) CustomException,
                    java.lang.@Marker RuntimeException {
            }
        }
    `;

    const code = new JavaCodeMask().maskNonCode(source);
    const ranges = createFinder().findTypeReferenceRanges(code);

    assert.deepEqual(
        ranges.map(range => source.slice(range.start, range.end)),
        ["CustomException", "RuntimeException"]
    );
});

test("does not treat throws inside Java identifiers as a keyword", () => {
    const source = `
        class ThrowsFixture {
            
            Class<?> $throws = IOException.class;
            Class<?> _throws = IOException.class;
            Class<?> жthrows = IOException.class;
            Class<?> throwsЖ = IOException.class;
            
            void throws$(IOException value) {
            }
        }
    `;

    assert.deepEqual(findTypeLists(source), []);
});

test("preserves throws types after nested annotation arguments", () => {
    const source = `
        class ThrowsFixture {

            void execute()
                throws @Outer(@Inner({1, 2})) IOException,
                       IllegalArgumentException {
            }
        }
    `;

    assert.deepEqual(findTypeLists(source), [
        "@Outer(@Inner({1, 2})) IOException,\n" + "                       IllegalArgumentException"
    ]);
});

test("ignores throws-like text outside Java code", () => {
    const source = `
        class ThrowsFixture {
            
            // void ignored() throws IOException {
            // }
            
            String message = "throws IllegalArgumentException {";
            String textBlock = """
                void ignoreAgain() throws RuntimeException {
                }
            """;
            
            void execute() throws IOException {
            }
        }
    `;

    assert.deepEqual(findTypeLists(source), ["IOException"]);
});

test("does not include types inside the method body", () => {
    const source = `
        class ThrowsFixture {
            
            void execute() throws IOException {
                IOException copy = null;
            }
        }    
    `;

    assert.deepEqual(findTypeLists(source), ["IOException"]);
});

test("finds a type list in a semicolon-terminated method declaration", () => {
    const source = `
        abstract class ThrowsFixture {
            
            abstract void execute() throws IOException, IllegalArgumentException;
        }
    `;

    assert.deepEqual(findTypeLists(source), ["IOException, IllegalArgumentException"]);
});

test("finds type lists in constructor and method throws clauses", () => {
    const source = `
        class ThrowsFixture {
            
            ThrowsFixture() throws IOException {
            }
            
            void execute() throws IOException, IllegalArgumentException {
            }
        }
    `;

    assert.deepEqual(findTypeLists(source), ["IOException", "IOException, IllegalArgumentException"]);
});

function createFinder(): JavaThrowsClauseFinder {
    return new JavaThrowsClauseFinder(new JavaTypeReferenceRangeReader());
}

function findTypeLists(source: string): string[] {
    const code = new JavaCodeMask().maskNonCode(source);

    const ranges = createFinder().findTypeRanges(code);

    return ranges.map(range => source.slice(range.start, range.end).trim());
}
