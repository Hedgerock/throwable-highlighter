import assert from "node:assert/strict";
import {test} from "node:test";

import {buildFirstRefreshLatencyChartOption} from "../FirstRefreshLatencyChart.mjs";

test("selects only first refreshes in the declared type-count order", () => {
    const archives = createArchives();
    archives[0].scenario.usageTypeCounts = [50, 10, 100];
    archives[1].scenario.usageTypeCounts = [50, 10, 100];

    const option = buildFirstRefreshLatencyChartOption(archives);

    assert.deepEqual(option.xAxis.data, ["50", "10", "100"]);
    assert.deepEqual(
        option.series.map(series => series.name),
        ["Лимит 16", "Лимит 32"]
    );
    assert.deepEqual(
        option.series.map(series => series.data),
        [
            [2216.233, 813.119, 3996.253],
            [1816.195, 927.355, 3001.877]
        ]
    );
});

test("preserves measured precision and rounds only displayed labels", () => {
    const archives = createArchives();
    const original = structuredClone(archives);

    const option = buildFirstRefreshLatencyChartOption(archives);

    assert.equal(option.series[0].data[0], 813.119);
    assert.equal(option.series[0].label.formatter({value: 813.119}), "813");
    assert.deepEqual(archives, original);
});

test("supports a zero duration on a zero-based axis", () => {
    const archives = createArchives();
    findMeasurement(archives[0], "first-10").totalMs = 0;

    const option = buildFirstRefreshLatencyChartOption(archives);

    assert.equal(option.series[0].data[0], 0);
    assert.equal(option.yAxis.min, 0);
});

test("reports the phase and limit when a first refresh is missing", () => {
    const archives = createArchives();
    archives[1].refreshMeasurements = archives[1].refreshMeasurements.filter(
        measurement => measurement.phase !== "first-50"
    );

    assert.throws(() => buildFirstRefreshLatencyChartOption(archives), /first-50.*limit 32/);
});

test("rejects duplicate first refreshes even when their values match", () => {
    const archives = createArchives();
    archives[0].refreshMeasurements.push({...findMeasurement(archives[0], "first-10")});

    assert.throws(() => buildFirstRefreshLatencyChartOption(archives), /first-10.*limit 16/);
});

test("rejects a negative first-refresh duration", () => {
    const archives = createArchives();
    findMeasurement(archives[0], "first-10").totalMs = -1;

    assert.throws(() => buildFirstRefreshLatencyChartOption(archives), /first-10.*limit 16/);
});

test("rejects a non-finite first-refresh duration", () => {
    const archives = createArchives();
    findMeasurement(archives[0], "first-10").totalMs = Infinity;

    assert.throws(() => buildFirstRefreshLatencyChartOption(archives), /first-10.*limit 16/);
});

test("rejects a first-refresh duration stored as text", () => {
    const archives = createArchives();
    findMeasurement(archives[0], "first-10").totalMs = "813.119";

    assert.throws(() => buildFirstRefreshLatencyChartOption(archives), /first-10.*limit 16/);
});

test("rejects different type-count sequences", () => {
    const archives = createArchives();
    archives[1].scenario.usageTypeCounts = [10, 100];

    assert.throws(() => buildFirstRefreshLatencyChartOption(archives), /same Java type counts/);
});

test("rejects archives with the same concurrency limit", () => {
    const archives = createArchives();
    archives[1].scenario.providerConcurrencyLimit = 16;

    assert.throws(() => buildFirstRefreshLatencyChartOption(archives), /distinct positive provider concurrency limits/);
});

test("rejects a nonpositive concurrency limit", () => {
    const archives = createArchives();
    archives[0].scenario.providerConcurrencyLimit = 0;

    assert.throws(() => buildFirstRefreshLatencyChartOption(archives), /distinct positive provider concurrency limits/);
});

test("rejects duplicate type counts", () => {
    const archives = createArchives();
    archives[0].scenario.usageTypeCounts = [10, 10, 100];

    assert.throws(() => buildFirstRefreshLatencyChartOption(archives), /distinct positive Java type counts/);
});

test("rejects an archive without refresh measurements", () => {
    const archives = createArchives();
    delete archives[0].refreshMeasurements;

    assert.throws(() => buildFirstRefreshLatencyChartOption(archives), /must contain refresh measurements/);
});

test("requires at least two archives for comparison", () => {
    const archives = createArchives();

    assert.throws(() => buildFirstRefreshLatencyChartOption(archives.slice(0, 1)), /At least two research archives/);
});

function createArchives() {
    return [createArchive(16, [813.119, 2216.233, 3996.253]), createArchive(32, [927.355, 1816.195, 3001.877])];
}

function createArchive(limit, durations) {
    return {
        scenario: {
            usageTypeCounts: [10, 50, 100],
            providerConcurrencyLimit: limit
        },
        refreshMeasurements: [
            {phase: "repeat-1-10", totalMs: 50},
            {phase: "first-100", totalMs: durations[2]},
            {phase: null, totalMs: 999999},
            {phase: "first-10", totalMs: durations[0]},
            {phase: "first-50", totalMs: durations[1]}
        ]
    };
}

function findMeasurement(archive, phase) {
    return archive.refreshMeasurements.find(measurement => measurement.phase === phase);
}
