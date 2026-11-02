import assert from "node:assert/strict";
import {test} from "node:test";

import {cleanupRunDirectory} from "../cleanupRunDirectory.mjs";

test("removes the run directory with bounded retries", async context => {
    // Arrange
    const fixture = createFixture(context);

    // Act
    await fixture.cleanup();

    // Assert
    assert.equal(fixture.remove.mock.callCount(), 1);

    assert.deepEqual(fixture.remove.mock.calls[0].arguments, [
        fixture.runDirectory,
        {
            recursive: true,
            force: true,
            maxRetries: 5,
            retryDelay: 200
        }
    ]);
    assert.deepEqual(fixture.warn.mock.callCount(), 0);
});

test("reports EBUSY without rejecting cleanup", context => assertCleanupWarning(context, "EBUSY"));
test("reports ENOTEMPTY without rejecting cleanup", context => assertCleanupWarning(context, "ENOTEMPTY"));
test("reports EPERM without rejecting cleanup", context => assertCleanupWarning(context, "EPERM"));

test("propagates EACCES without replacing the original error", context => assertCleanupFailure(context, "EACCES"));
test("propagates EIO without replacing the original error", context => assertCleanupFailure(context, "EIO"));

test("propagates an error without a filesystem code", async context => {
    // Arrange
    const failure = new Error("Unexpected failure.");
    const fixture = createFixture(context, failure);

    // Act / Assert
    await assert.rejects(fixture.cleanup, error => error === failure);
    assert.equal(fixture.warn.mock.callCount(), 0);
});

async function assertCleanupWarning(context, code) {
    // Arrange
    const failure = Object.assign(new Error("Directory is unavailable."), {code});
    const fixture = createFixture(context, failure);

    // Act
    await fixture.cleanup();

    // Assert
    assert.equal(fixture.warn.mock.callCount(), 1);

    const [message] = fixture.warn.mock.calls[0].arguments;

    assert.ok(message.includes(code));
    assert.ok(message.includes(fixture.runDirectory));
}

async function assertCleanupFailure(context, code) {
    // Arrange
    const failure = Object.assign(new Error("Filesystem operation failed."), {code});
    const fixture = createFixture(context, failure);

    // Act / Assert
    await assert.rejects(fixture.cleanup, error => error === failure);
    assert.equal(fixture.warn.mock.callCount(), 0);
}

function createFixture(context, failure) {
    const runDirectory = "virtual-run-directory";
    const remove = context.mock.fn(async () => {
        if (failure !== undefined) {
            throw failure;
        }
    });

    const warn = context.mock.fn();

    return {
        runDirectory,
        remove,
        warn,
        cleanup: () => cleanupRunDirectory(runDirectory, {remove, warn})
    };
}
