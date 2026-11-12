const assert = require("node:assert/strict");
const {test} = require("node:test");

const {BuildCycleQueue} = require("../BuildCycleQueue.cjs");

function createDeferred() {
    let resolve;
    const promise = new Promise(done => {
        resolve = done;
    });
    return {promise, resolve};
}

test("combines requests received before a build starts", async () => {
    // Arrange
    let calls = 0;
    const queue = new BuildCycleQueue(async () => {
        calls++;
    });

    // Act
    await Promise.all([queue.request(), queue.request(), queue.request()]);

    // Assert
    assert.equal(calls, 1);
});

test("runs one follow-up build for changes received during an active build", async () => {
    // Arrange
    const started = createDeferred();
    const release = createDeferred();
    let calls = 0;
    let active = 0;
    let maximumActive = 0;
    const queue = new BuildCycleQueue(async () => {
        calls++;
        active++;
        maximumActive = Math.max(maximumActive, active);
        try {
            if (calls === 1) {
                started.resolve();
                await release.promise;
            }
        } finally {
            active--;
        }
    });

    // Act
    const initial = queue.request();
    await started.promise;
    const pending = [queue.request(), queue.request(), queue.request()];

    // Assert
    assert.equal(calls, 1);

    // Act
    release.resolve();
    await Promise.all([initial, ...pending]);

    // Assert
    assert.equal(calls, 2);
    assert.equal(maximumActive, 1);
});

test("accepts new requests after the previous cycle completes", async () => {
    // Arrange
    let calls = 0;
    const queue = new BuildCycleQueue(async () => {
        calls++;
    });

    // Act
    await queue.request();
    await queue.request();

    // Assert
    assert.equal(calls, 2);
});

test("reports a failed build and continues with pending and later requests", async () => {
    // Arrange
    const started = createDeferred();
    const release = createDeferred();
    const expected = new Error("Build failed.");
    const errors = [];
    let calls = 0;
    const queue = new BuildCycleQueue(
        async () => {
            calls++;
            if (calls === 1) {
                started.resolve();
                await release.promise;
                throw expected;
            }
        },
        {onError: error => errors.push(error)}
    );

    // Act
    const initial = queue.request();
    await started.promise;
    const pending = queue.request();
    release.resolve();
    await Promise.all([initial, pending]);
    await queue.request();

    // Assert
    assert.equal(calls, 3);
    assert.deepEqual(errors, [expected]);
});

test("waits for the active build and discards pending requests on disposal", async () => {
    // Arrange
    const started = createDeferred();
    const release = createDeferred();
    let calls = 0;
    const queue = new BuildCycleQueue(async () => {
        calls++;
        started.resolve();
        await release.promise;
    });
    const initial = queue.request();
    await started.promise;
    const pending = queue.request();

    // Act
    let closed = false;
    const closing = queue.dispose().then(() => {
        closed = true;
    });
    await Promise.resolve();

    // Assert
    assert.equal(closed, false);

    // Act
    const ignored = queue.request();
    release.resolve();
    await Promise.all([initial, pending, closing, ignored]);
    await queue.request();

    // Assert
    assert.equal(calls, 1);
});

test("cancels a queued build when disposed before it starts", async () => {
    // Arrange
    let calls = 0;
    const queue = new BuildCycleQueue(async () => {
        calls++;
    });
    const pending = queue.request();

    // Act
    await queue.dispose();
    await pending;

    // Assert
    assert.equal(calls, 0);
});
