import assert from "node:assert/strict";
import {test} from "node:test";

import {readExtensionHostLog} from "../ExtensionHostLogReader.mjs";

test("preserves resource snapshots and brackets refresh completion", () => {
    // Arrange
    const first = createResource();
    const second = createResource({
        elapsedMs: 1000,
        capturedAtUtc: "2026-11-06T12:00:01.000Z"
    });
    const refresh = createRefresh();
    const log = "\uFEFFDecoration controller activated.\r\n\r\n" + createLog(first, refresh, second);

    // Act
    const result = readExtensionHostLog(log);

    // Assert
    assert.deepEqual(result.extensionHostMeasurements, [first, second]);
    assert.deepEqual(result.refreshMeasurements, [
        {
            ...refresh,
            completionWindowUtc: {
                from: first.capturedAtUtc,
                to: second.capturedAtUtc
            }
        }
    ]);

    assert.equal(result.refreshMeasurements[0].totalMs, 125.123456);
});

test("preserves the order of refreshes between the same resource snapshots", () => {
    const first = createResource();
    const second = createResource({
        elapsedMs: 1000,
        capturedAtUtc: "2026-11-06T12:00:01.000Z"
    });
    const result = readExtensionHostLog(
        createLog(first, createRefresh({generation: 2}), createRefresh({generation: 3}), second)
    );

    assert.deepEqual(
        result.refreshMeasurements.map(measurement => measurement.generation),
        [2, 3]
    );

    assert.deepEqual(
        result.refreshMeasurements.map(measurement => measurement.completionWindowUtc),
        [
            {from: first.capturedAtUtc, to: second.capturedAtUtc},
            {from: first.capturedAtUtc, to: second.capturedAtUtc}
        ]
    );
});

test("keeps missing completion bounds explicit", () => {
    const resource = createResource();
    const result = readExtensionHostLog(
        createLog(createRefresh({generation: 1}), resource, createRefresh({generation: 2}))
    );

    assert.deepEqual(
        result.refreshMeasurements.map(measurement => measurement.completionWindowUtc),
        [
            {from: null, to: resource.capturedAtUtc},
            {from: resource.capturedAtUtc, to: null}
        ]
    );
});

test("reports the source line of invalid JSON", () => {
    assert.throws(
        () => readExtensionHostLog(createLog(createResource()) + "\n[refresh-measurement] {"),
        /Invalid measurement JSON at line 2/
    );
});

test("rejects diagnostic entries instead of silently excluding them", () => {
    assert.throws(
        () => readExtensionHostLog(createLog(createResource()) + '\nInspecting "<no symbol>".'),
        /Unexpected log entry at line 2/
    );
});

test("rejects measurements from different Extension Host processes", () => {
    assert.throws(
        () =>
            readExtensionHostLog(
                createLog(
                    createResource(),
                    createResource({
                        processId: 43
                    })
                )
            ),
        /Mixed Extension Host processes at line 2/
    );
});

test("rejects a backwards UTC clock", () => {
    assert.throws(
        () =>
            readExtensionHostLog(
                createLog(
                    createResource(),
                    createResource({elapsedMs: 1000, capturedAtUtc: "2026-11-06T11:59:59.000Z"})
                )
            ),
        /Resource timestamps move backwards at line 2/
    );
});

test("rejects a backwards monotonic clock", () => {
    assert.throws(
        () =>
            readExtensionHostLog(
                createLog(
                    createResource({
                        elapsedMs: 1000
                    }),
                    createResource()
                )
            ),
        /Resource timestamps move backwards at line 2/
    );
});

test("rejects refresh measurements without finite durations", () => {
    assert.throws(
        () => readExtensionHostLog(createLog(createResource(), createRefresh({totalMs: null}))),
        /Invalid refresh measurement at line 2/
    );
});

test("rejects logs without resource measurements", () => {
    assert.throws(() => readExtensionHostLog("Decoration controller activated."), /no resource measurements/);
});

function createResource(overrides = {}) {
    return {
        processId: 42,
        elapsedMs: 0,
        capturedAtUtc: "2026-11-06T12:00:00.000Z",
        memory: {rss: 1024},
        resolver: {cachedResolutionCount: 1},
        ...overrides
    };
}

function createRefresh(overrides = {}) {
    return {
        generation: 1,
        reason: "active-editor",
        mode: "urgent",
        editorNumber: 1,
        waitMs: 25,
        processingMs: 100.123456,
        totalMs: 125.123456,
        ...overrides
    };
}

function createLog(...measurements) {
    return measurements
        .map(measurement => {
            const prefix = "processId" in measurement ? "[resource-measurement] " : "[refresh-measurement] ";
            return prefix + JSON.stringify(measurement);
        })
        .join("\n");
}
