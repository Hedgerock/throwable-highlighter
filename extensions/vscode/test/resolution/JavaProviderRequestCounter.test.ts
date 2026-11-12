import assert from "node:assert/strict";
import {test} from "node:test";

import {JavaProviderRequestCounter} from "@throwable-highlighter/resolution/JavaProviderRequestCounter";

test("starts with no active requests or recorded peak", () => {
    const counter = new JavaProviderRequestCounter();

    assert.deepEqual(counter.getSnapshot(), {
        active: 0,
        peak: 0
    });
});

test("tracks overlapping requests and retains their peak", async () => {
    const counter = new JavaProviderRequestCounter();
    const first = createDeferred<number>();
    const second = createDeferred<number>();

    const firstRequest = counter.track(() => first.promise);
    const secondRequest = counter.track(() => second.promise);

    const snapshot = counter.getSnapshot();

    assert.deepEqual(snapshot, {
        active: 2,
        peak: 2
    });

    try {
        first.resolve(10);

        assert.equal(await firstRequest, 10);
        assert.deepEqual(counter.getSnapshot(), {active: 1, peak: 2});

        second.resolve(20);

        assert.equal(await secondRequest, 20);
        assert.deepEqual(counter.getSnapshot(), {active: 0, peak: 2});
        assert.deepEqual(snapshot, {active: 2, peak: 2});

        assert.equal(await counter.track(async () => 30), 30);
        assert.deepEqual(counter.getSnapshot(), {active: 0, peak: 2});
    } finally {
        first.resolve(10);
        second.resolve(20);
        await Promise.all([firstRequest, secondRequest]);
    }
});

test("releases the active request when the operation rejects", async () => {
    const counter = new JavaProviderRequestCounter();
    const error = new Error("Provider unavailable");

    const request = counter.track(() => Promise.reject(error));

    assert.deepEqual(counter.getSnapshot(), {
        active: 1,
        peak: 1
    });
    await assert.rejects(request, thrown => thrown === error);
    assert.deepEqual(counter.getSnapshot(), {
        active: 0,
        peak: 1
    });
});

test("releases the active request when the operation throws synchronously", async () => {
    const counter = new JavaProviderRequestCounter();
    const error = new Error("Command failed");

    await assert.rejects(
        counter.track(() => {
            assert.deepEqual(counter.getSnapshot(), {
                active: 1,
                peak: 1
            });
            throw error;
        }),
        thrown => thrown === error
    );

    assert.deepEqual(counter.getSnapshot(), {
        active: 0,
        peak: 1
    });
});

function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>(resolvePromise => {
        resolve = resolvePromise;
    });

    return {promise, resolve};
}
