import assert from "node:assert/strict";
import {test} from "node:test";
import type {JavaImportClause} from "@throwable-highlighter/decorations/highlighting/JavaImportClauseFinder";
import {JavaCodeMask} from "@throwable-highlighter/java/JavaCodeMask";
import {JavaImportClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaImportClauseFinder";

test("returns the declaration range and the final type name", () => {
    const source = "  import java.io.IOException;  ";
    const start = source.indexOf("import");
    const typeStart = source.indexOf("IOException");

    assert.deepEqual(findClauses(source), [
        {
            range: {
                start,
                end: source.indexOf(";") + 1
            },
            typeRange: {
                start: typeStart,
                end: typeStart + "IOException".length
            }
        }
    ]);
});

test("handles comments between qualified name components", () => {
    const source = "import/* keyword */java/* package */.io.//type\nIOException;";

    assert.deepEqual(findTypeNames(source), ["IOException"]);
});

test("excludes package names and enclosing types from the target range", () => {
    const source = "import Throwable.Outer.CustomException;";

    assert.deepEqual(findTypeNames(source), ["CustomException"]);
});

test("excludes package and nested-type wildcard imports", () => {
    for (const source of ["import java.io.*;", "import example.Throwable.*;"]) {
        assert.deepEqual(findClauses(source), [
            {
                range: {
                    start: 0,
                    end: source.length
                }
            }
        ]);
    }
});

test("excludes single and wildcard static imports", () => {
    for (const source of [
        "import static example.Throwable.VALUE;",
        "import static example.Throwable.NestedException;",
        "import static example.Throwable.*;"
    ]) {
        assert.deepEqual(findClauses(source), [
            {
                range: {
                    start: 0,
                    end: source.length
                }
            }
        ]);
    }
});

test("keeps imports on the same line separate from following code", () => {
    const source = "import java.io.IOException; import java.lang.RuntimeException; class Example extends Throwable {}";
    const clauses = findClauses(source);
    const lastSemicolon = source.lastIndexOf(";");

    assert.deepEqual(findTypeNames(source), ["IOException", "RuntimeException"]);
    assert.equal(clauses.length, 2);
    assert.equal(clauses[1].range.end, lastSemicolon + 1);
    assert.equal(source.slice(clauses[1].range.end), " class Example extends Throwable {}");
});

test("preserves UTF-16 offsets and CRLF after masking comments", () => {
    const source = "/* 😀 */\r\nimport java./* note */io. \r\nIOException;";
    const start = source.indexOf("import");
    const typeStart = source.indexOf("IOException");

    assert.deepEqual(findClauses(source), [
        {
            range: {
                start,
                end: source.length
            },
            typeRange: {
                start: typeStart,
                end: typeStart + "IOException".length
            }
        }
    ]);
});

test("ignores import-like text outside Java code", () => {
    const source = [
        "// import java.lang.Throwable;",
        "/* import java.lang.Exception; */",
        `String message = "import java.lang.RuntimeException;";`,
        `String text = """`,
        "import java.lang.IllegalStateException;",
        `""";`,
        "import java.io.IOException;"
    ].join("\n");

    assert.deepEqual(findTypeNames(source), ["IOException"]);
    assert.equal(findClauses(source).length, 1);
});

test("does not treat import inside identifiers as a keyword", () => {
    const source = "$import java.io.IOException; import$ java.io.IOException; жimport X; importЖ X;";

    assert.deepEqual(findClauses(source), []);
});

test("does not produce a target for incomplete imports", () => {
    for (const source of [
        "import",
        "import static",
        "import java.io.IOException",
        "import java.io",
        "import java.io.;",
        "import java.io.",
        "import java.io.*"
    ]) {
        const clauses = findClauses(source);

        assert.equal(clauses.length, 1);
        assert.equal(clauses[0].typeRange, undefined);
    }
});

test("handles line breaks between import tokens", () => {
    const source = "import\njava\n. \nio\n. \nIOException\n;";

    assert.deepEqual(findTypeNames(source), ["IOException"]);
});

test("does not reject non-keyword package names", () => {
    assert.deepEqual(findTypeNames("import asset.IOException;"), ["IOException"]);
});

test("does not extend an incomplete import into declarations or block bodies", () => {
    const continuations = [
        "class Example extends Throwable {}",
        "assert true;",
        "public class Example extends Throwable {}",
        "@Marker class Example extends Throwable {}",
        "{ Throwable value = null; }",
        "import java.lang.RuntimeException;"
    ];

    const prefixes = ["import", "import static", "import java.io.IOException", "import java.io."];

    for (const prefix of prefixes) {
        for (const continuation of continuations) {
            const source = prefix + "\n" + continuation;
            const clauses = findClauses(source);

            assert.deepEqual(clauses[0], {
                range: {
                    start: 0,
                    end: prefix.length
                }
            });
        }
    }

    assert.deepEqual(findTypeNames("import java.io.\nimport java.lang.RuntimeException;"), ["RuntimeException"]);
});

function findClauses(source: string): JavaImportClause[] {
    const code = new JavaCodeMask().maskNonCode(source);
    return new JavaImportClauseFinder().findClauses(code);
}

function findTypeNames(source: string): string[] {
    return findClauses(source).flatMap(clause =>
        clause.typeRange === undefined ? [] : [source.slice(clause.typeRange.start, clause.typeRange.end)]
    );
}
