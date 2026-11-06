import assert from "node:assert/strict";
import {test} from "node:test";

import {buildResolutionCacheChartOption} from "../ResolutionCacheChart.mjs";

test("preserves cached counts and independent UTC timestamps without changing archives", () => {
    const archives = createArchives();
    const original = structuredClone(archives);

    const option = buildResolutionCacheChartOption(archives);

    assert.equal(option.series.length, 2);
    assert.deepEqual(option.series.find(series => series.name === "Лимит 16").data, [
        [0.5, 1],
        [2.5, 9],
        [7.5, 4]
    ]);
    assert.deepEqual(option.series.find(series => series.name === "Лимит 32").data, [
        [0.125, 2],
        [3.25, 12],
        [8, 6]
    ]);
    assert.deepEqual(archives, original);
});

test("describes the last cached counts instead of sampled maxima", () => {
    const option = buildResolutionCacheChartOption(createArchives());
    const caption = option.graphic.map(item => item.style?.text ?? "").join("\n");

    assert.match(caption, /Последние снимки: Лимит 16 — 4; Лимит 32 — 6/);
});

test("preserves an explicit zero after cache invalidation", () => {
    const archives = createArchives();
    const lastMeasurement = archives[0].extensionHostMeasurements.at(-1);
    lastMeasurement.resolver.cacheGeneration = 2;
    lastMeasurement.resolver.cachedResolutionCount = 0;

    const option = buildResolutionCacheChartOption(archives);

    assert.deepEqual(option.series.find(series => series.name === "Лимит 16").data.at(-1), [7.5, 0]);
});

test("rejects a missing resolver snapshot", () => {
    const archives = createArchives();
    delete archives[1].extensionHostMeasurements[0].resolver;

    assert.throws(() => buildResolutionCacheChartOption(archives), /Invalid cached resolution count for limit 32/);
});

test("rejects a missing cached resolution count", () => {
    const archives = createArchives();
    delete archives[1].extensionHostMeasurements[0].resolver.cachedResolutionCount;

    assert.throws(() => buildResolutionCacheChartOption(archives), /Invalid cached resolution count for limit 32/);
});

test("rejects a negative cached resolution count", () => {
    assertInvalidCount(-1);
});

test("rejects a fractional cached resolution count", () => {
    assertInvalidCount(1.5);
});

test("rejects a non-finite cached resolution count", () => {
    assertInvalidCount(Infinity);
});

test("rejects an unsafe integer cached resolution count", () => {
    assertInvalidCount(Number.MAX_SAFE_INTEGER + 1);
});

test("rejects a cached resolution count stored as text", () => {
    assertInvalidCount("12");
});

function assertInvalidCount(count) {
    const archives = createArchives();
    archives[1].extensionHostMeasurements[0].resolver.cachedResolutionCount = count;

    assert.throws(() => buildResolutionCacheChartOption(archives), /Invalid cached resolution count for limit 32/);
}

function createArchives() {
    return [createArchive(16, "2026-11-06T12:00:00.000Z"), createArchive(32, "2026-11-06T13:00:00.000Z")];
}

function createArchive(limit, startedAtUtc) {
    const counts = limit === 16 ? [1, 9, 4] : [2, 12, 6];
    const offsets = limit === 16 ? [500, 2500, 7500] : [125, 3250, 8000];

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
        extensionHostMeasurements: offsets.map((offsetMs, index) => ({
            elapsedMs: 30000 + offsetMs,
            capturedAtUtc: new Date(Date.parse(startedAtUtc) + offsetMs).toISOString(),
            resolver: {
                cacheGeneration: 1,
                cachedResolutionCount: counts[index],
                pendingResolutionCount: 777
            }
        }))
    };
}
