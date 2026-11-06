import assert from "node:assert/strict";
import {test} from "node:test";

import {buildResourceResearchArchive} from "../ResourceResearchArchiveBuilder.mjs";

test("keeps scenario and measurements at the archive top level", () => {
    const fixture = createFixture();

    const archive = fixture.build();

    assert.equal(archive.formatVersion, 1);
    assert.equal(archive.scenario.providerConcurrencyLimit, 16);
    assert.deepEqual(archive.scenario.usageTypeCounts, [10, 50, 100]);
    assert.deepEqual(archive.sampling, fixture.input.javaReport.sampling);
    assert.equal(archive.extensionHostMeasurements.length, 4);
    assert.equal(archive.javaProcessMeasurements.length, 4);
    assert.equal(archive.refreshMeasurements.length, 3);
    assert.equal(archive.environment.scenario, undefined);

    assert.equal(archive.environment.extensionHostMeasurements, undefined);
});

test("selects snapshots by UTC with an inclusive start and exclusive end", () => {
    const fixture = createFixture();

    const archive = fixture.build();
    const expectedTimes = [1000, 1500, 2000, 2500].map(at);

    assert.deepEqual(
        archive.extensionHostMeasurements.map(measurement => measurement.capturedAtUtc),
        expectedTimes
    );
    assert.deepEqual(
        archive.javaProcessMeasurements.map(measurement => measurement.capturedAtUtc),
        expectedTimes
    );
});

test("rounds durations without changing source values", () => {
    const fixture = createFixture();
    const original = structuredClone({input: fixture.input, records: fixture.records});

    const archive = fixture.build();

    assert.equal(archive.extensionHostMeasurements[0].elapsedMs, 11000.123);
    assert.equal(archive.javaProcessMeasurements[0].elapsedMs, 0.123);
    assert.equal(archive.refreshMeasurements[0].waitMs, 25.123);
    assert.equal(archive.refreshMeasurements[0].processingMs, 100.123);
    assert.equal(archive.refreshMeasurements[0].totalMs, 125.247);
    assert.equal(archive.extensionHostMeasurements[0].memory.rss, 123456789);
    assert.deepEqual({input: fixture.input, records: fixture.records}, original);
});

test("preserves measured provenance when additional metadata contains different values", () => {
    const fixture = createFixture();
    fixture.input.environmentDetails = {
        platform: "win32",
        measurementBaseCommit: "b".repeat(40),
        extensionHostProcessId: 999,
        javaProcessId: 999,
        workingTreeStatus: []
    };
    fixture.input.scenarioDetails = {
        maximumVisibleJavaEditors: 1,
        exceptionCount: 999,
        providerConcurrencyLimit: 999
    };

    const archive = fixture.build();

    assert.equal(archive.environment.measurementBaseCommit, "a".repeat(40));

    assert.equal(archive.environment.extensionHostProcessId, 42);
    assert.equal(archive.environment.javaProcessId, 77);
    assert.deepEqual(archive.environment.workingTreeStatus, [" M source.ts"]);
    assert.deepEqual(archive.environment.platform, "win32");
    assert.equal(archive.environment.javaCommandLine, undefined);
    assert.equal(archive.environment.workspacePath, undefined);
    assert.equal(archive.scenario.exceptionCount, 100);
    assert.equal(archive.scenario.providerConcurrencyLimit, 16);

    assert.equal(archive.scenario.maximumVisibleJavaEditors, 1);
});

test("keeps ambiguous refresh phases and excludes completions outside the window", () => {
    const fixture = createFixture();

    const archive = fixture.build();

    assert.deepEqual(
        archive.refreshMeasurements.map(measurement => measurement.generation),
        [2, 3, 4]
    );
    assert.deepEqual(
        archive.refreshMeasurements.map(measurement => measurement.phase),
        ["baseline", null, "first-10"]
    );

    assert.deepEqual(archive.refreshMeasurements[1].completionWindowUtc, {
        from: at(1500),
        to: at(2000)
    });
});

test("rejects an incomplete Java report", () => {
    const fixture = createFixture();
    fixture.input.javaReport.sampling.status = "incomplete";

    assert.throws(() => fixture.build(), /completed Java report/);
});

test("rejects a mismatched Extension Host process", () => {
    const fixture = createFixture();

    fixture.input.javaReport.environment.extensionHostProcessId = 99;

    assert.throws(() => fixture.build(), /process does not match/);
});

test("rejects a log that starts after the measurement window", () => {
    const fixture = createFixture();
    fixture.records = [createResource(1500), createResource(3500)];

    assert.throws(() => fixture.build(), /does not cover the measurement window/);
});

test("rejects a log that ends before the measurement window finishes", () => {
    const fixture = createFixture();
    fixture.records = [createResource(0), createResource(2500)];

    assert.throws(() => fixture.build(), /does not cover the measurement window/);
});

test("rejects a nonpositive concurrency limit", () => {
    const fixture = createFixture();
    fixture.input.providerConcurrencyLimit = 0;

    assert.throws(() => fixture.build(), {
        name: "RangeError",
        message: /positive integer/
    });
});

test("rejects provider counters above the declared concurrency limit", () => {
    const fixture = createFixture();
    fixture.input.providerConcurrencyLimit = 8;

    assert.throws(() => fixture.build(), /counters do not match/);
});

test("rejects unordered phases", () => {
    const fixture = createFixture();
    fixture.input.javaReport.sampling.phasePlan.push({
        name: "late-phase",
        atMs: 500
    });

    assert.throws(() => fixture.build(), /ordered phases/);
});

test("rejects backwards Java UTC timestamps", () => {
    const fixture = createFixture();
    fixture.input.javaReport.measurements[1].capturedAtUtc = at(500);

    assert.throws(() => fixture.build(), /valid ordered timestamps/);
});

test("rejects backwards Java elapsed time", () => {
    const fixture = createFixture();
    fixture.input.javaReport.measurements[1].elapsedMs = 0;

    assert.throws(() => fixture.build(), /valid ordered timestamps/);
});

test("rejects a window without Java samples", () => {
    const fixture = createFixture();
    fixture.input.javaReport.measurements = [createJavaMeasurement(3000), createJavaMeasurement(3500)];

    assert.throws(() => fixture.build(), /Both processes must have measurements/);
});

test("rejects a window without Extension Host samples", () => {
    const fixture = createFixture();
    fixture.records = [createResource(0), createResource(3500)];

    assert.throws(() => fixture.build(), /Both processes must have measurements/);
});

function createFixture() {
    const resources = [0, 500, 1000, 1500, 2000, 2500, 3000, 3500].map(createResource);
    const refreshes = [1, 2, 3, 4, 5].map(createRefresh);

    return {
        input: {
            providerConcurrencyLimit: 16,
            javaReport: {
                environment: {
                    sourceCommit: "a".repeat(40),
                    workingTreeStatus: [" M source.ts"],
                    extensionHostProcessId: 42,
                    javaProcessId: 77,
                    javaStartedAtUtc: "2026-11-06T11:59:00.000Z",
                    workspacePath: "local-workspace-path",
                    javaCommandLine: "local-java-command",
                    workspaceManifest: {
                        formatVersion: 1,
                        exceptionCount: 100,
                        usageTypeCounts: [10, 50, 100]
                    }
                },
                sampling: {
                    status: "complete",
                    error: null,
                    intervalMs: 500,
                    startedAtUtc: at(1000),
                    plannedDurationMs: 2000,
                    phasePlan: [
                        {name: "baseline", atMs: 0},
                        {name: "first-10", atMs: 1000}
                    ]
                },
                measurements: [1000, 1500, 2000, 2500, 3000, 3500].map(createJavaMeasurement)
            }
        },
        records: [
            resources[0],
            refreshes[0],
            resources[1],
            resources[2],
            refreshes[1],
            resources[3],
            refreshes[2],
            resources[4],
            refreshes[3],
            resources[5],
            resources[6],
            resources[7],
            refreshes[4]
        ],
        build() {
            return buildResourceResearchArchive({
                ...this.input,
                extensionHostLog: createLog(this.records)
            });
        }
    };
}

function createResource(offsetMs) {
    return {
        processId: 42,
        elapsedMs: 10_000 + offsetMs + 0.123456,
        capturedAtUtc: at(offsetMs),
        memory: {rss: 123456789},
        resolver: {
            providerRequests: {
                active: 0,
                queued: 0,
                peakActive: 16,
                peakQueued: 20
            }
        }
    };
}

function createJavaMeasurement(offsetMs) {
    return {
        elapsedMs: offsetMs - 1000 + 0.123456,
        capturedAtUtc: at(offsetMs),
        workingSetBytes: 234567890,
        privateBytes: 345678901
    };
}

function createRefresh(generation) {
    return {
        generation,
        reason: "active-editor",
        mode: "urgent",
        editorNumber: 1,
        waitMs: 25.123456,
        processingMs: 100.123456,
        totalMs: 125.246912
    };
}

function createLog(records) {
    return records
        .map(record => {
            const prefix = "processId" in record ? "[resource-measurement] " : "[refresh-measurement] ";

            return prefix + JSON.stringify(record);
        })
        .join("\n");
}

function at(offsetMs) {
    return new Date(Date.parse("2026-11-06T12:00:00.000Z") + offsetMs).toISOString();
}
