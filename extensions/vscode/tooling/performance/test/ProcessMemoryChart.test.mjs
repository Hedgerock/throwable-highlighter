import assert from "node:assert/strict";
import {test} from "node:test";

import {buildProcessMemoryChartOption} from "../ProcessMemoryChart.mjs";

test("converts bytes to MiB and preserves independent process timestamps", () => {
    const archives = createArchives();
    const original = structuredClone(archives);

    const option = buildProcessMemoryChartOption(archives);

    assert.equal(option.series.length, 4);
    assert.deepEqual(findSeries(option, 16, 0).data, [
        [0.5, 1],
        [4.5, 3.0000009536743164]
    ]);
    assert.deepEqual(findSeries(option, 32, 0).data, [
        [0.5, 2],
        [4.5, 4]
    ]);
    assert.deepEqual(findSeries(option, 16, 1).data, [
        [0.125, 5],
        [3.25, 9],
        [7.5, 6]
    ]);
    assert.deepEqual(findSeries(option, 32, 1).data, [
        [0.125, 7],
        [3.25, 10],
        [7.5, 8]
    ]);
    assert.equal(findSeries(option, 16, 0).yAxisIndex, 0);
    assert.equal(findSeries(option, 32, 1).yAxisIndex, 1);
    assert.deepEqual(archives, original);
});

test("formats sampled maxima without rounding the series", () => {
    const option = buildProcessMemoryChartOption(createArchives());
    const caption = option.graphic.map(item => item.style?.text ?? "").join("\n");

    assert.equal(findSeries(option, 16, 0).data[1][1], 3.0000009536743164);
    assert.match(caption, /RSS: Лимит 16 — 3,00; Лимит 32 — 4,00/);
    assert.match(caption, /Working Set: Лимит 16 — 9,00; Лимит 32 — 10,00/);
});

test("supports explicit zero values for both processes", () => {
    const archives = createArchives();
    archives[0].extensionHostMeasurements[0].memory.rss = 0;
    archives[0].javaProcessMeasurements[0].workingSetBytes = 0;

    const option = buildProcessMemoryChartOption(archives);

    assert.equal(findSeries(option, 16, 0).data[0][1], 0);
    assert.equal(findSeries(option, 16, 1).data[0][1], 0);
    assert.deepEqual(
        option.yAxis.map(axis => axis.min),
        [0, 0]
    );
});

test("rejects a missing RSS value", () => {
    const archives = createArchives();
    delete archives[0].extensionHostMeasurements[0].memory.rss;

    assert.throws(() => buildProcessMemoryChartOption(archives), /Extension Host.*RSS.*limit 16/);
});

test("rejects a missing Java Working Set value", () => {
    const archives = createArchives();
    delete archives[1].javaProcessMeasurements[0].workingSetBytes;

    assert.throws(() => buildProcessMemoryChartOption(archives), /Java.*Working Set.*limit 32/);
});

test("rejects a negative RSS value", () => {
    const archives = createArchives();
    archives[0].extensionHostMeasurements[0].memory.rss = -1;

    assert.throws(() => buildProcessMemoryChartOption(archives), /Extension Host.*RSS.*limit 16/);
});

test("rejects a fractional byte count", () => {
    const archives = createArchives();
    archives[0].extensionHostMeasurements[0].memory.rss = 1.5;

    assert.throws(() => buildProcessMemoryChartOption(archives), /Extension Host.*RSS.*limit 16/);
});

test("rejects a non-finite Java Working Set value", () => {
    const archives = createArchives();
    archives[1].javaProcessMeasurements[0].workingSetBytes = Infinity;

    assert.throws(() => buildProcessMemoryChartOption(archives), /Java.*Working Set.*limit 32/);
});

test("rejects an unsafe integer byte count", () => {
    const archives = createArchives();
    archives[1].javaProcessMeasurements[0].workingSetBytes = Number.MAX_SAFE_INTEGER + 1;

    assert.throws(() => buildProcessMemoryChartOption(archives), /Java.*Working Set.*limit 32/);
});

test("rejects a memory value stored as text", () => {
    const archives = createArchives();
    archives[1].javaProcessMeasurements[0].workingSetBytes = "1048576";

    assert.throws(() => buildProcessMemoryChartOption(archives), /Java.*Working Set.*limit 32/);
});

test("requires Java samples independently of Extension Host samples", () => {
    const archives = createArchives();
    delete archives[1].javaProcessMeasurements;

    assert.throws(() => buildProcessMemoryChartOption(archives), /must contain Java measurements/);
});

test("validates the order of Java timestamps independently", () => {
    const archives = createArchives();
    archives[0].javaProcessMeasurements[1].capturedAtUtc = at(archives[0].sampling.startedAtUtc, 100);

    assert.throws(() => buildProcessMemoryChartOption(archives), /Java measurements.*ordered UTC timestamps/);
});

function createArchives() {
    return [createArchive(16, "2026-11-06T12:00:00.000Z"), createArchive(32, "2026-11-06T13:00:00.000Z")];
}

function createArchive(limit, startedAtUtc) {
    const mib = 1_048_576;
    const rss = limit === 16 ? [mib, 3 * mib + 1] : [2 * mib, 4 * mib];
    const workingSet = limit === 16 ? [5 * mib, 9 * mib, 6 * mib] : [7 * mib, 10 * mib, 8 * mib];

    return {
        scenario: {providerConcurrencyLimit: limit},
        sampling: {
            startedAtUtc,
            plannedDurationMs: 10000,
            intervalMs: 1000,
            phasePlan: [
                {name: "baseline", atMs: 0},
                {name: "first-10", atMs: 1000},
                {name: "recovery", atMs: 7000}
            ]
        },
        extensionHostMeasurements: [500, 4500].map((offsetMs, index) => ({
            elapsedMs: 30000 + offsetMs,
            capturedAtUtc: at(startedAtUtc, offsetMs),
            memory: {
                rss: rss[index],
                heapUsed: 64 * mib
            }
        })),
        javaProcessMeasurements: [125, 3250, 7500].map((offsetMs, index) => ({
            elapsedMs: offsetMs,
            capturedAtUtc: at(startedAtUtc, offsetMs),
            workingSetBytes: workingSet[index],
            privateBytes: 100 * mib
        }))
    };
}

function findSeries(option, limit, panel) {
    return option.series.find(series => series.name === "Лимит " + limit && series.xAxisIndex === panel);
}

function at(startedAtUtc, offsetMs) {
    return new Date(Date.parse(startedAtUtc) + offsetMs).toISOString();
}
