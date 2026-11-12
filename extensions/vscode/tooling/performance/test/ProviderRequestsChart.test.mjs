import assert from "node:assert/strict";
import {test} from "node:test";

import {buildProviderRequestsChartOption} from "../ProviderRequestsChart.mjs";

test("uses UTC for both panels and preserves the original samples", () => {
    const archives = createArchives();
    const original = structuredClone(archives);

    const option = buildProviderRequestsChartOption(archives);

    assert.equal(option.series.length, 4);
    assert.deepEqual(findSeries(option, 16, 0).data, [
        [0.5, 2],
        [2, 4],
        [8, 0]
    ]);
    assert.deepEqual(findSeries(option, 32, 0).data, [
        [0.5, 2],
        [2, 8],
        [8, 0]
    ]);
    assert.deepEqual(findSeries(option, 16, 1).data, [
        [0.5, 5],
        [2, 40],
        [8, 0]
    ]);
    assert.deepEqual(findSeries(option, 32, 1).data, [
        [0.5, 5],
        [2, 20],
        [8, 0]
    ]);
    assert.equal(findSeries(option, 16, 0).yAxisIndex, 0);
    assert.equal(findSeries(option, 32, 1).yAxisIndex, 1);
    assert.deepEqual(archives, original);
});

test("reports counter peaks without inserting them into sampled series", () => {
    const option = buildProviderRequestsChartOption(createArchives());
    const caption = option.graphic.map(item => item.style?.text ?? "").join("\n");

    assert.equal(Math.max(...findSeries(option, 16, 0).data.map(point => point[1])), 4);
    assert.equal(Math.max(...findSeries(option, 16, 1).data.map(point => point[1])), 40);
    assert.match(caption, /Лимит 16: пик выполнения — 16, пик очереди — 100/);
    assert.match(caption, /Лимит 32: пик выполнения — 32, пик очереди — 80/);
});

test("groups consecutive repeat phases using the recorded boundaries", () => {
    const option = buildProviderRequestsChartOption(createArchives());
    const areas = findSeries(option, 16, 0).markArea.data;

    assert.deepEqual(
        areas.map(([start, end]) => [start.name, start.xAxis, end.xAxis]),
        [
            ["До открытия", 0, 1],
            ["10 типов", 1, 3],
            ["Повторные открытия", 3, 7],
            ["После закрытия", 7, 10]
        ]
    );
    assert.deepEqual(findSeries(option, 16, 1).markArea.data, areas);
    assert.deepEqual(
        option.xAxis.map(axis => axis.max),
        [10, 10]
    );
});

test("accepts equivalent phase plans with a different JSON property order", () => {
    const archives = createArchives();
    archives[1].sampling.phasePlan = archives[1].sampling.phasePlan.map(phase => ({
        atMs: phase.atMs,
        name: phase.name
    }));

    assert.doesNotThrow(() => buildProviderRequestsChartOption(archives));
});

test("rejects different measurement durations", () => {
    const archives = createArchives();
    archives[1].sampling.plannedDurationMs = 11000;

    assert.throws(() => buildProviderRequestsChartOption(archives), /same duration/);
});

test("rejects different sampling intervals", () => {
    const archives = createArchives();
    archives[1].sampling.intervalMs = 500;

    assert.throws(() => buildProviderRequestsChartOption(archives), /same duration/);
});

test("rejects different phase boundaries", () => {
    const archives = createArchives();
    archives[1].sampling.phasePlan[1].atMs = 1500;

    assert.throws(() => buildProviderRequestsChartOption(archives), /same duration/);
});

test("rejects an unordered reference phase plan", () => {
    const archives = createArchives();
    archives[0].sampling.phasePlan[2].atMs = 500;

    assert.throws(() => buildProviderRequestsChartOption(archives), /valid sampling window/);
});

test("rejects an invalid sample timestamp", () => {
    const archives = createArchives();
    archives[0].extensionHostMeasurements[0].capturedAtUtc = "invalid";

    assert.throws(() => buildProviderRequestsChartOption(archives), /ordered UTC timestamps/);
});

test("rejects backwards sample timestamps", () => {
    const archives = createArchives();
    archives[0].extensionHostMeasurements[1].capturedAtUtc = at(archives[0].sampling.startedAtUtc, 250);

    assert.throws(() => buildProviderRequestsChartOption(archives), /ordered UTC timestamps/);
});

test("rejects a sample at the exclusive end of the window", () => {
    const archives = createArchives();
    archives[0].extensionHostMeasurements[2].capturedAtUtc = at(archives[0].sampling.startedAtUtc, 10000);

    assert.throws(() => buildProviderRequestsChartOption(archives), /ordered UTC timestamps/);
});

test("rejects a sample before the measurement window", () => {
    const archives = createArchives();
    archives[0].extensionHostMeasurements[0].capturedAtUtc = at(archives[0].sampling.startedAtUtc, -1);

    assert.throws(() => buildProviderRequestsChartOption(archives), /ordered UTC timestamps/);
});

test("rejects an archive without Extension Host samples", () => {
    const archives = createArchives();
    archives[0].extensionHostMeasurements = [];

    assert.throws(() => buildProviderRequestsChartOption(archives), /must contain Extension Host measurements/);
});

test("rejects a sample without provider counters", () => {
    const archives = createArchives();
    delete archives[0].extensionHostMeasurements[0].resolver.providerRequests;

    assert.throws(() => buildProviderRequestsChartOption(archives), /Invalid provider counters.*16/);
});

test("rejects a negative queue size", () => {
    const archives = createArchives();
    archives[0].extensionHostMeasurements[0].resolver.providerRequests.queued = -1;

    assert.throws(() => buildProviderRequestsChartOption(archives), /Invalid provider counters.*16/);
});

test("rejects a counter peak above the declared concurrency limit", () => {
    const archives = createArchives();
    archives[0].extensionHostMeasurements[0].resolver.providerRequests.peakActive = 17;

    assert.throws(() => buildProviderRequestsChartOption(archives), /Invalid provider counters.*16/);
});

test("rejects archives with the same concurrency limit", () => {
    const archives = createArchives();
    archives[1].scenario.providerConcurrencyLimit = 16;

    assert.throws(() => buildProviderRequestsChartOption(archives), /distinct positive provider concurrency limits/);
});

test("requires at least two archives for comparison", () => {
    assert.throws(
        () => buildProviderRequestsChartOption(createArchives().slice(0, 1)),
        /At least two research archives/
    );
});

function createArchives() {
    return [createArchive(16, "2026-11-06T12:00:00.000Z"), createArchive(32, "2026-11-06T13:00:00.000Z")];
}

function createArchive(limit, startedAtUtc) {
    const active = [2, limit / 4, 0];
    const queued = [5, limit === 16 ? 40 : 20, 0];

    return {
        scenario: {providerConcurrencyLimit: limit},
        sampling: {
            startedAtUtc,
            plannedDurationMs: 10000,
            intervalMs: 1000,
            phasePlan: [
                {name: "baseline", atMs: 0},
                {name: "first-10", atMs: 1000},
                {name: "repeat-1-10", atMs: 3000},
                {name: "repeat-1-50", atMs: 4000},
                {name: "repeat-2-10", atMs: 5000},
                {name: "recovery", atMs: 7000}
            ]
        },
        extensionHostMeasurements: [500, 2000, 8000].map((offsetMs, index) => ({
            elapsedMs: (limit === 16 ? 10000 : 50000) + offsetMs,
            capturedAtUtc: at(startedAtUtc, offsetMs),
            resolver: {
                providerRequests: {
                    active: active[index],
                    queued: queued[index],
                    peakActive: limit,
                    peakQueued: limit === 16 ? 100 : 80,
                    seconds: 999
                }
            }
        }))
    };
}

function findSeries(option, limit, panel) {
    return option.series.find(series => series.name === "Лимит " + limit && series.xAxisIndex === panel);
}

function at(startedAtUtc, offsetMs) {
    return new Date(Date.parse(startedAtUtc) + offsetMs).toISOString();
}
