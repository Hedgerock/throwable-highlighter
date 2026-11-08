import {execFileSync} from "node:child_process";
import {mkdir, writeFile} from "node:fs/promises";
import {arch, cpus, platform, release, totalmem} from "node:os";
import {resolve} from "node:path";
import process from "node:process";

import {measureRefresh} from "./ThrowableRefreshBenchmark";
import type {RefreshBenchmarkResult} from "./ThrowableRefreshBenchmark";

const MAXIMUM_CONCURRENT_RESOLUTIONS = 32;

const SCENARIOS = [
    {name: "single", refreshCount: 1, editorCount: 1, disposeAfterMs: null},
    {name: "burst", refreshCount: 20, editorCount: 1, disposeAfterMs: null},
    {name: "two-editors", refreshCount: 1, editorCount: 2, disposeAfterMs: null},
    {name: "dispose", refreshCount: 1, editorCount: 1, disposeAfterMs: 50}
] as const;

type Measurement = RefreshBenchmarkResult & {
    readonly scenario: (typeof SCENARIOS)[number]["name"];
    readonly repetition: number;
};

async function main(): Promise<void> {
    const sourceCommit = execFileSync(
        "git",
        ["--git-dir=" + resolve(process.cwd(), "../../.git"), "rev-parse", "HEAD"],
        {encoding: "utf8"}
    ).trim();
    const measurements: Measurement[] = [];

    for (const candidateCount of [100, 1000]) {
        for (const scenario of SCENARIOS) {
            for (let repetition = 1; repetition <= 5; repetition++) {
                console.error(`[benchmark] ${scenario.name}: ${candidateCount} candidates, repetition ${repetition}/5`);

                const result = await measureRefresh({
                    candidateCount,
                    refreshCount: scenario.refreshCount,
                    intervalMs: 100,
                    resolverDelayMs: 250,
                    editorCount: scenario.editorCount,
                    disposeAfterMs: scenario.disposeAfterMs,
                    maximumConcurrentResolutions: MAXIMUM_CONCURRENT_RESOLUTIONS
                });

                measurements.push({scenario: scenario.name, repetition, ...result});
            }
        }
    }

    const summary = [100, 1000].flatMap(candidateCount =>
        SCENARIOS.map(scenario => {
            const group = measurements.filter(
                result => result.candidateCount === candidateCount && result.scenario === scenario.name
            );

            return {
                scenario: scenario.name,
                candidateCount,
                resolverCalls: summarize(group.map(result => result.resolverCalls)),
                peakPendingResolutions: summarize(group.map(result => result.peakPendingResolutions)),
                appliedUpdates: summarize(group.map(result => result.appliedUpdates)),
                latestUpdateMs: summarize(group.map(result => result.latestUpdateMs)),
                pendingAtDispose: summarize(group.map(result => result.pendingAtDispose)),
                drainAfterDisposeMs: summarize(group.map(result => result.drainAfterDisposeMs)),
                totalMs: summarize(group.map(result => result.totalMs)),
                editorCount: scenario.editorCount,
                disposeAfterMs: scenario.disposeAfterMs
            };
        })
    );

    const report = {
        environment: {
            kind: "controlled-node",
            sourceCommit,
            node: process.version,
            platform: platform(),
            osRelease: release(),
            architecture: arch(),
            cpu: cpus()[0]?.model,
            machineMemoryBytes: totalmem()
        },
        measurements: measurements.map(measurement => ({
            ...measurement,
            latestUpdateMs: roundNullableMilliseconds(measurement.latestUpdateMs),
            drainAfterDisposeMs: roundNullableMilliseconds(measurement.drainAfterDisposeMs),
            totalMs: roundMilliseconds(measurement.totalMs)
        })),
        summary: summary.map(result => ({
            ...result,
            latestUpdateMs: roundStatistics(result.latestUpdateMs),
            drainAfterDisposeMs: roundStatistics(result.drainAfterDisposeMs),
            totalMs: roundStatistics(result.totalMs)
        }))
    };

    const reportJson = JSON.stringify(report, null, 2) + "\n";
    const reportDirectory = resolve(process.cwd(), "build/reports/performance");
    const reportPath = resolve(reportDirectory, "refresh.json");

    await mkdir(reportDirectory, {recursive: true});
    await writeFile(reportPath, reportJson, "utf8");

    console.log(reportJson.trimEnd());
    console.error("[benchmark] Report saved: " + reportPath);
}

function roundMilliseconds(value: number): number {
    return Number(value.toFixed(3));
}

function roundNullableMilliseconds(value: number | null): number | null {
    return value === null ? null : roundMilliseconds(value);
}

function roundStatistics(statistics: ReturnType<typeof summarize>): ReturnType<typeof summarize> {
    if (statistics === null) {
        return null;
    }

    return {
        min: roundMilliseconds(statistics.min),
        median: roundMilliseconds(statistics.median),
        max: roundMilliseconds(statistics.max)
    };
}

function summarize(values: (number | null)[]): {min: number; median: number; max: number} | null {
    const numbers = values.filter((value): value is number => value !== null);

    if (numbers.length === 0) {
        return null;
    }

    if (numbers.length !== values.length) {
        throw new Error("Benchmark summary contains mixed applicable and inapplicable values.");
    }

    const sorted = [...numbers].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];

    return {min: sorted[0], median, max: sorted[sorted.length - 1]};
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
