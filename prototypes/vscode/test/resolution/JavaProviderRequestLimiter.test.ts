import assert from "node:assert/strict";
import {test} from "node:test";

import {
    JavaProviderRequestCancelledError,
    JavaProviderRequestLimiter
} from "@throwable-highlighter/resolution/JavaProviderRequestLimiter";

test("rejects invalid concurrency limits", () => {
    for (const limit of [0, -1, 1.5, NaN, Infinity]) {
        assert.throws(() => new JavaProviderRequestLimiter(limit), RangeError);
    }
});

test("limits concurrent operations and starts queued operation in FIFO order", async () => {
    const limiter = new JavaProviderRequestLimiter(2);
    const gates = Array.from({length: 4}, () => createDeferred<number>());
    const started: number[] = [];
    const requests = gates.map((gate, index) =>
        limiter.run(() => {
            started.push(index);
            return gate.promise;
        })
    );

    const initialSnapshot = limiter.getSnapshot();

    try {
        assert.deepEqual(started, [0, 1]);
        assert.deepEqual(initialSnapshot, {
            active: 2,
            queued: 2,
            peakActive: 2,
            peakQueued: 2
        });

        gates[1].resolve(20);

        assert.equal(await requests[1], 20);
        assert.deepEqual(started, [0, 1, 2]);
        assert.deepEqual(limiter.getSnapshot(), {
            active: 2,
            queued: 1,
            peakActive: 2,
            peakQueued: 2
        });

        gates[0].resolve(10);

        assert.equal(await requests[0], 10);
        assert.deepEqual(started, [0, 1, 2, 3]);
        assert.deepEqual(limiter.getSnapshot(), {
            active: 2,
            queued: 0,
            peakActive: 2,
            peakQueued: 2
        });

        gates[2].resolve(30);
        gates[3].resolve(40);

        assert.deepEqual(await Promise.all(requests), [10, 20, 30, 40]);
        assert.deepEqual(limiter.getSnapshot(), {
            active: 0,
            queued: 0,
            peakActive: 2,
            peakQueued: 2
        });
        assert.deepEqual(initialSnapshot, {
            active: 2,
            queued: 2,
            peakActive: 2,
            peakQueued: 2
        });
    } finally {
        gates.forEach((gate, index) => gate.resolve((index + 1) * 10));
        await Promise.allSettled(requests);
    }
});

test("releases a slot and continues the queue after rejection", async () => {
    const limiter = new JavaProviderRequestLimiter(1);
    const gate = createDeferred<number>();
    const error = new Error("Provider unavailable");
    const first = limiter.run(() => gate.promise);
    const second = limiter.run(async () => 20);
    const failure = assert.rejects(first, thrown => thrown === error);

    try {
        assert.deepEqual(limiter.getSnapshot(), {
            active: 1,
            queued: 1,
            peakActive: 1,
            peakQueued: 1
        });

        gate.reject(error);

        await failure;
        assert.equal(await second, 20);
        assert.deepEqual(limiter.getSnapshot(), {
            active: 0,
            queued: 0,
            peakActive: 1,
            peakQueued: 1
        });
    } finally {
        gate.resolve(10);
        await Promise.allSettled([first, second, failure]);
    }
});

test("releases a slot when a queued operation throws synchronously", async () => {
    const limiter = new JavaProviderRequestLimiter(1);
    const gate = createDeferred<number>();
    const error = new Error("Command failed");
    const first = limiter.run(() => gate.promise);
    const failing = limiter.run(() => {
        throw error;
    });
    const last = limiter.run(async () => 30);
    const failure = assert.rejects(failing, thrown => thrown === error);

    try {
        gate.resolve(10);

        assert.equal(await first, 10);
        await failure;
        assert.equal(await last, 30);
        assert.deepEqual(limiter.getSnapshot(), {
            active: 0,
            queued: 0,
            peakActive: 1,
            peakQueued: 2
        });
    } finally {
        gate.resolve(10);
        await Promise.allSettled([first, failing, last, failure]);
    }
});

test("accepts PromiseLike operations and preserves their results", async () => {
    const limiter = new JavaProviderRequestLimiter(1);
    const result: PromiseLike<number> = {
        then: (onfulfilled, onrejected) => Promise.resolve(10).then(onfulfilled, onrejected)
    };

    assert.equal(await limiter.run(() => result), 10);
    assert.equal(await limiter.run(async () => "resolved"), "resolved");
    assert.deepEqual(limiter.getSnapshot(), {
        active: 0,
        queued: 0,
        peakActive: 1,
        peakQueued: 0
    });
});

test("cancels queued requests without releasing active slots", async () => {
    const limiter = new JavaProviderRequestLimiter(1);
    const gate = createDeferred<number>();
    let cancelledStarted = false;
    const first = limiter.run(() => gate.promise);
    const cancelled = limiter.run(async () => {
        cancelledStarted = true;
        return 20;
    });
    const cancellation = assert.rejects(cancelled, JavaProviderRequestCancelledError);
    const requests = [first, cancelled];

    try {
        limiter.cancelPending();
        limiter.cancelPending();

        const current = limiter.run(async () => 30);
        requests.push(current);

        await cancellation;

        assert.equal(cancelledStarted, false);
        assert.deepEqual(limiter.getSnapshot(), {
            active: 1,
            queued: 1,
            peakActive: 1,
            peakQueued: 1
        });

        gate.resolve(10);

        assert.equal(await first, 10);
        assert.equal(await current, 30);
        assert.deepEqual(limiter.getSnapshot(), {
            active: 0,
            queued: 0,
            peakActive: 1,
            peakQueued: 1
        });
    } finally {
        limiter.dispose();
        gate.resolve(10);
        await Promise.allSettled([...requests, cancellation]);
    }
});

test("disposes queued requests and rejects new requests while active operations finish", async () => {
    const limiter = new JavaProviderRequestLimiter(1);
    const gate = createDeferred<number>();
    let queuedStarted = false;
    let newStarted = false;
    const first = limiter.run(() => gate.promise);
    const queued = limiter.run(async () => {
        queuedStarted = true;
        return 20;
    });

    const cancellation = assert.rejects(queued, JavaProviderRequestCancelledError);

    try {
        limiter.dispose();
        limiter.dispose();

        await cancellation;

        assert.deepEqual(limiter.getSnapshot(), {
            active: 1,
            queued: 0,
            peakActive: 1,
            peakQueued: 1
        });

        await assert.rejects(
            limiter.run(async () => {
                newStarted = true;
                return 30;
            }),
            JavaProviderRequestCancelledError
        );

        gate.resolve(10);

        assert.equal(await first, 10);
        assert.equal(queuedStarted, false);
        assert.equal(newStarted, false);
        assert.deepEqual(limiter.getSnapshot(), {
            active: 0,
            queued: 0,
            peakActive: 1,
            peakQueued: 1
        });
    } finally {
        limiter.dispose();
        gate.resolve(10);
        await Promise.allSettled([first, queued, cancellation]);
    }
});

test("does not start remaining requests when an operation disposes the limiter", async () => {
    const limiter = new JavaProviderRequestLimiter(1);
    const gate = createDeferred<number>();
    let lastStarted = false;
    const first = limiter.run(() => gate.promise);
    const disposing = limiter.run(async () => {
        limiter.dispose();
        return 20;
    });
    const last = limiter.run(async () => {
        lastStarted = true;
        return 30;
    });

    const cancellation = assert.rejects(last, JavaProviderRequestCancelledError);

    try {
        gate.resolve(10);

        assert.deepEqual(await Promise.all([first, disposing]), [10, 20]);
        await cancellation;

        assert.equal(lastStarted, false);
        assert.deepEqual(limiter.getSnapshot(), {
            active: 0,
            queued: 0,
            peakActive: 1,
            peakQueued: 2
        });
    } finally {
        limiter.dispose();
        gate.resolve(10);
        await Promise.allSettled([first, disposing, last, cancellation]);
    }
});

test("rejects obsolete requests before they start", async () => {
    const limiter = new JavaProviderRequestLimiter(1);
    let started = false;

    await assert.rejects(
        limiter.run(
            async () => {
                started = true;
                return 10;
            },
            () => false
        ),
        JavaProviderRequestCancelledError
    );

    assert.equal(started, false);
    assert.deepEqual(limiter.getSnapshot(), {
        active: 0,
        queued: 0,
        peakActive: 0,
        peakQueued: 0
    });
});

test("does not queue obsolete requests while all slots are occupied", async () => {
    const limiter = new JavaProviderRequestLimiter(1);
    const gate = createDeferred<number>();
    const first = limiter.run(() => gate.promise);
    let obsoleteStarted = false;

    try {
        await assert.rejects(
            limiter.run(
                async () => {
                    obsoleteStarted = true;
                    return 20;
                },
                () => false
            ),
            JavaProviderRequestCancelledError
        );

        assert.equal(obsoleteStarted, false);
        assert.deepEqual(limiter.getSnapshot(), {
            active: 1,
            queued: 0,
            peakActive: 1,
            peakQueued: 0
        });

        gate.resolve(10);

        assert.equal(await first, 10);
        assert.deepEqual(limiter.getSnapshot(), {
            active: 0,
            queued: 0,
            peakActive: 1,
            peakQueued: 0
        });
    } finally {
        limiter.dispose();
        gate.resolve(10);
        await Promise.allSettled([first]);
    }
});

test("rechecks queued request validity and continues with current requests", async () => {
    const limiter = new JavaProviderRequestLimiter(1);
    const gate = createDeferred<number>();
    let generation = 0;
    const initialGeneration = generation;
    let obsoleteStarted = false;
    const first = limiter.run(
        () => gate.promise,
        () => generation === initialGeneration
    );
    const obsolete = limiter.run(
        async () => {
            obsoleteStarted = true;
            return 20;
        },
        () => generation === initialGeneration
    );
    const cancellation = assert.rejects(obsolete, JavaProviderRequestCancelledError);

    generation++;
    const currentGeneration = generation;
    const current = limiter.run(
        async () => 30,
        () => generation === currentGeneration
    );

    try {
        assert.deepEqual(limiter.getSnapshot(), {
            active: 1,
            queued: 2,
            peakActive: 1,
            peakQueued: 2
        });

        gate.resolve(10);

        assert.equal(await first, 10);
        await cancellation;
        assert.equal(await current, 30);
        assert.equal(obsoleteStarted, false);
        assert.deepEqual(limiter.getSnapshot(), {
            active: 0,
            queued: 0,
            peakActive: 1,
            peakQueued: 2
        });
    } finally {
        limiter.dispose();
        gate.resolve(10);
        await Promise.allSettled([first, obsolete, current, cancellation]);
    }
});

test("rejects a queued request when its validity check throws and continues the queue", async () => {
    const limiter = new JavaProviderRequestLimiter(1);
    const gate = createDeferred<number>();
    const error = new Error("Validity check failed");
    let failValidation = false;
    let failingStarted = false;
    const first = limiter.run(() => gate.promise);
    const failing = limiter.run(
        async () => {
            failingStarted = true;
            return 20;
        },
        () => {
            if (failValidation) {
                throw error;
            }

            return true;
        }
    );

    const current = limiter.run(async () => 30);
    const failure = assert.rejects(failing, thrown => thrown === error);

    try {
        failValidation = true;
        gate.resolve(10);

        assert.equal(await first, 10);
        await failure;
        assert.equal(await current, 30);
        assert.equal(failingStarted, false);
        assert.deepEqual(limiter.getSnapshot(), {
            active: 0,
            queued: 0,
            peakActive: 1,
            peakQueued: 2
        });
    } finally {
        limiter.dispose();
        gate.resolve(10);
        await Promise.allSettled([first, failing, current, failure]);
    }
});

function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return {promise, reject, resolve};
}
