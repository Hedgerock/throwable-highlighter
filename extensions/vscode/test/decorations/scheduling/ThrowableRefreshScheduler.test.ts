import assert from "node:assert/strict";
import {test} from "node:test";
import type {TestContext} from "node:test";

import {ThrowableRefreshScheduler} from "@throwable-highlighter/decorations/scheduling/ThrowableRefreshScheduler";

test("combines deferred requests after the last request", context => {
    const fixture = createFixture(context);

    fixture.scheduler.request();
    fixture.advance(60);
    fixture.scheduler.request();
    fixture.advance(99);

    assertAdvanceCount(fixture);
});

test("preserves maximum wait during continuous requests", context => {
    const fixture = createFixture(context);

    fixture.scheduler.request();

    for (let index = 0; index < 3; index++) {
        fixture.advance(80);
        fixture.scheduler.request();
    }

    fixture.advance(59);

    assertAdvanceCount(fixture);
});

test("combines urgent requests with a deferred request", context => {
    const fixture = createFixture(context);

    fixture.scheduler.request();
    fixture.advance(40);
    fixture.scheduler.requestUrgent();
    fixture.scheduler.requestUrgent();

    assert.equal(fixture.refresh.mock.callCount(), 0);

    fixture.advance(0);

    assert.equal(fixture.refresh.mock.callCount(), 1);

    fixture.advance(300);

    assert.equal(fixture.refresh.mock.callCount(), 1);
});

test("preserves an urgent request when deferred requests follow", context => {
    const fixture = createFixture(context);

    fixture.scheduler.requestUrgent();
    fixture.scheduler.request();
    fixture.scheduler.request();

    fixture.advance(0);

    assert.equal(fixture.refresh.mock.callCount(), 1);

    fixture.advance(300);

    assert.equal(fixture.refresh.mock.callCount(), 1);
});

test("starts a new series after the previous refresh", context => {
    const fixture = createFixture(context);

    fixture.scheduler.request();
    fixture.advance(100);

    assert.equal(fixture.refresh.mock.callCount(), 1);

    fixture.scheduler.request();
    fixture.advance(99);

    assert.equal(fixture.refresh.mock.callCount(), 1);

    fixture.advance(1);

    assert.equal(fixture.refresh.mock.callCount(), 2);
});

test("runs once when debounce and maximum wait expire together", context => {
    const fixture = createFixture(context);

    fixture.scheduler.request();
    fixture.advance(80);
    fixture.scheduler.request();
    fixture.advance(80);
    fixture.scheduler.request();
    fixture.advance(40);
    fixture.scheduler.request();
    fixture.advance(100);

    assert.equal(fixture.refresh.mock.callCount(), 1);

    fixture.advance(300);

    assert.equal(fixture.refresh.mock.callCount(), 1);
});

test("cancels a deferred request and ignores requests after disposal", context => {
    const fixture = createFixture(context);

    fixture.scheduler.request();
    fixture.scheduler.dispose();
    fixture.scheduler.dispose();
    fixture.advance(300);

    assert.equal(fixture.refresh.mock.callCount(), 0);

    fixture.scheduler.request();
    fixture.scheduler.request();
    fixture.advance(300);

    assert.equal(fixture.refresh.mock.callCount(), 0);
});

test("cancels an urgent request on disposal", context => {
    const fixture = createFixture(context);

    fixture.scheduler.requestUrgent();
    fixture.scheduler.dispose();
    fixture.advance(300);

    assert.equal(fixture.refresh.mock.callCount(), 0);
});

test("preserves a request created by the refresh callback", context => {
    const fixture = createFixture(context);
    let hasRequested = false;

    fixture.refresh.mock.mockImplementation(() => {
        if (!hasRequested) {
            hasRequested = true;
            fixture.scheduler.request();
        }
    });

    fixture.scheduler.requestUrgent();
    fixture.advance(0);

    assert.equal(fixture.refresh.mock.callCount(), 1);

    fixture.advance(100);

    assert.equal(fixture.refresh.mock.callCount(), 2);
});

test("accepts new requests after the refresh callback throws", context => {
    const fixture = createFixture(context);

    fixture.refresh.mock.mockImplementationOnce(() => {
        throw new Error("Refresh failed.");
    });

    fixture.scheduler.requestUrgent();

    assert.throws(() => fixture.advance(0), /Refresh failed/);

    fixture.scheduler.request();
    fixture.advance(100);

    assert.equal(fixture.refresh.mock.callCount(), 2);
});

function assertAdvanceCount(fixture: ReturnType<typeof createFixture>) {
    assert.equal(fixture.refresh.mock.callCount(), 0);
    fixture.advance(1);
    assert.equal(fixture.refresh.mock.callCount(), 1);
    fixture.advance(300);
    assert.equal(fixture.refresh.mock.callCount(), 1);
}

function createFixture(context: TestContext) {
    context.mock.timers.enable({apis: ["setTimeout"]});

    const refresh = context.mock.fn(() => {});
    const scheduler = new ThrowableRefreshScheduler(refresh, {
        debounceMs: 100,
        maximumWaitMs: 300
    });

    context.after(() => scheduler.dispose());

    return {
        scheduler,
        refresh,
        advance(milliseconds: number): void {
            context.mock.timers.tick(milliseconds);
        }
    };
}
