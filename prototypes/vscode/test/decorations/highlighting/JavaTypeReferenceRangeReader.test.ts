import assert from "node:assert/strict";
import {test} from "node:test";

import {JavaCodeMask} from "../../../src/java/JavaCodeMask";
import {JavaTypeReferenceRangeReader} from "../../../src/decorations/highlighting/JavaTypeReferenceRangeReader";

test("skips qualified annotations and their nested arguments", () => {
    const source =
        "@pkg.Marker(@Outer({IOException.class, @Inner(RuntimeException.class)})) " +
        "java.io.@Tag IOException, CustomException";

    const ranges = new JavaTypeReferenceRangeReader().read(source, {
        start: 0,
        end: source.length
    });

    assert.deepEqual(
        ranges.map(range => source.slice(range.start, range.end)),
        ["IOException", "CustomException"]
    );
});

test("reads type names only within the supplied range", () => {
    const source = "before java.io.IOException, example.Outer.CustomException after";
    const start = source.indexOf("java.io");
    const end = source.indexOf(" after");

    const ranges = new JavaTypeReferenceRangeReader().read(source, {
        start,
        end
    });

    assert.deepEqual(
        ranges.map(range => source.slice(range.start, range.end)),
        ["IOException", "CustomException"]
    );
});

test("preserves offsets after masking annotation strings and comments", () => {
    const source = `@Marker("IOException") /* comment */ IOException)`;

    const code = new JavaCodeMask().maskNonCode(source);
    const start = source.lastIndexOf("IOException");

    const ranges = new JavaTypeReferenceRangeReader().read(code, {
        start: 0,
        end: code.length
    });

    assert.deepEqual(ranges, [{start, end: start + "IOException".length}]);
});
