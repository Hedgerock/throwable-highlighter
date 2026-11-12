import assert from "node:assert/strict";
import {test} from "node:test";
import type {TestContext} from "node:test";

import {ThrowableResourceMeasurement} from "@throwable-highlighter/diagnostics/ThrowableResourceMeasurement";
import type {ResourceMeasurementSnapshot} from "@throwable-highlighter/diagnostics/ThrowableResourceMeasurement";

test("collects an initial snapshot and reads current values on each interval", context => {
    const fixture = createFixture(context);

    assert.equal(fixture.readMemoryUsage.mock.callCount(), 0);
    assert.equal(fixture.readResolverSnapshot.mock.callCount(), 0);

    fixture.measurement.start();

    assert.deepEqual(fixture.snapshots, [
        {
            processId: 42,
            elapsedMs: 0,
            memory: fixture.state.memory,
            capturedAtUtc: fixture.state.utcNow,
            resolver: fixture.state.resolver
        }
    ]);

    fixture.state.now = 1100;
    fixture.state.utcNow = "2026-11-04T20:00:01.000Z";
    fixture.state.memory = {...fixture.state.memory, rss: 200};
    fixture.state.resolver = {
        ...fixture.state.resolver,
        cacheGeneration: 1,
        cachedResolutionCount: 2,
        pendingResolutionCount: 3,
        definitionRequests: {active: 1, peak: 1},
        providerRequests: {active: 1, queued: 2, peakActive: 1, peakQueued: 2}
    };

    context.mock.timers.tick(999);

    assert.equal(fixture.snapshots.length, 1);

    context.mock.timers.tick(1);

    assert.deepEqual(fixture.snapshots[1], {
        processId: 42,
        elapsedMs: 1000,
        memory: fixture.state.memory,
        capturedAtUtc: fixture.state.utcNow,
        resolver: fixture.state.resolver
    });

    assert.equal(fixture.readMemoryUsage.mock.callCount(), 2);
    assert.equal(fixture.snapshots[0].memory.rss, 100);
    assert.equal(fixture.snapshots[0].resolver.cacheGeneration, 0);
    assert.equal(fixture.snapshots[0].resolver.providerRequests.queued, 0);
    assert.equal(fixture.snapshots[1].resolver.providerRequests.queued, 2);
});

test("does not schedule duplicate sampling when started repeatedly", context => {
    const fixture = createFixture(context);

    fixture.measurement.start();
    fixture.measurement.start();

    assert.equal(fixture.snapshots.length, 1);

    context.mock.timers.tick(1000);

    assert.equal(fixture.snapshots.length, 2);
    assert.equal(fixture.readMemoryUsage.mock.callCount(), 2);
    assert.equal(fixture.readResolverSnapshot.mock.callCount(), 2);
});

test("stops sampling on disposal and cannot restart", context => {
    const fixture = createFixture(context);

    fixture.measurement.start();
    fixture.measurement.dispose();
    fixture.measurement.dispose();
    fixture.measurement.start();

    context.mock.timers.tick(3000);

    assert.equal(fixture.snapshots.length, 1);

    assert.equal(fixture.readMemoryUsage.mock.callCount(), 1);
    assert.equal(fixture.readResolverSnapshot.mock.callCount(), 1);
});

test("does not sample when disposed before startup", context => {
    const fixture = createFixture(context);

    fixture.measurement.dispose();
    fixture.measurement.start();

    context.mock.timers.tick(3000);

    assert.equal(fixture.snapshots.length, 0);
    assert.equal(fixture.readMemoryUsage.mock.callCount(), 0);
    assert.equal(fixture.readResolverSnapshot.mock.callCount(), 0);
});

test("supports disposal from the initial measurement callback", context => {
    const fixture = createFixture(context);

    fixture.onMeasurement.mock.mockImplementation(() => fixture.measurement.dispose());
    fixture.measurement.start();

    context.mock.timers.tick(3000);

    assert.equal(fixture.onMeasurement.mock.callCount(), 1);
    assert.equal(fixture.readMemoryUsage.mock.callCount(), 1);
    assert.equal(fixture.readResolverSnapshot.mock.callCount(), 1);
});

test("keeps elapsed time independent of UTC clock adjustments", context => {
    const fixture = createFixture(context);

    fixture.measurement.start();
    fixture.state.now = 1100;
    fixture.state.utcNow = "2026-11-04T19:59:00.000Z";

    context.mock.timers.tick(1000);

    assert.equal(fixture.snapshots[1].elapsedMs, 1000);
    assert.equal(fixture.snapshots[1].capturedAtUtc, "2026-11-04T19:59:00.000Z");
    assert.equal(fixture.snapshots[0].capturedAtUtc, "2026-11-04T20:00:00.000Z");
});

function createFixture(context: TestContext) {
    context.mock.timers.enable({apis: ["setInterval"]});

    const state = {
        now: 100,
        utcNow: "2026-11-04T20:00:00.000Z",
        memory: {
            rss: 100,
            heapUsed: 40,
            heapTotal: 60,
            external: 10,
            arrayBuffers: 4
        },
        resolver: {
            cacheGeneration: 0,
            cachedResolutionCount: 0,
            pendingResolutionCount: 0,
            definitionRequests: {active: 0, peak: 0},
            documentSymbolRequests: {active: 0, peak: 0},
            providerRequests: {active: 0, queued: 0, peakActive: 0, peakQueued: 0}
        }
    };

    const snapshots: ResourceMeasurementSnapshot[] = [];
    const readMemoryUsage = context.mock.fn(() => state.memory);
    const readResolverSnapshot = context.mock.fn(() => state.resolver);
    const onMeasurement = context.mock.fn<(snapshot: ResourceMeasurementSnapshot) => void>(snapshot => {
        snapshots.push(snapshot);
    });

    const measurement = new ThrowableResourceMeasurement({
        processId: 42,
        intervalMs: 1000,
        now: () => state.now,
        utcNow: () => state.utcNow,
        readMemoryUsage,
        readResolverSnapshot,
        onMeasurement
    });

    context.after(() => measurement.dispose());

    return {state, snapshots, readMemoryUsage, readResolverSnapshot, onMeasurement, measurement};
}
