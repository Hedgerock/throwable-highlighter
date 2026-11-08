import assert from "node:assert/strict";
import {test} from "node:test";

import {JavaTypeResolutionCache} from "@throwable-highlighter/resolution/JavaTypeResolutionCache";

test("rejects invalid cache limits", () => {
    for (const limit of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => new JavaTypeResolutionCache(limit), RangeError);
    }
});

test("keeps a recently read negative result and evicts the oldest entry", () => {
    const cache = new JavaTypeResolutionCache(2);
    cache.set("first", false);
    cache.set("second", true);

    assert.equal(cache.get("first"), false);

    assertCheckCacheSequence(cache);
});

test("updates an existing entry and marks it as most recently used", () => {
    const cache = new JavaTypeResolutionCache(2);
    cache.set("first", true);
    cache.set("second", true);

    cache.set("first", false);

    assert.equal(cache.size, 2);

    assertCheckCacheSequence(cache);
});

function assertCheckCacheSequence(cache: JavaTypeResolutionCache) {
    cache.set("third", true);

    assert.equal(cache.size, 2);
    assert.equal(cache.get("second"), undefined);
    assert.equal(cache.get("first"), false);
    assert.equal(cache.get("third"), true);
}
