import {readExtensionHostLog} from "./ExtensionHostLogReader.mjs";

export function buildResourceResearchArchive({
    javaReport,
    extensionHostLog,
    providerConcurrencyLimit,
    environmentDetails = {},
    scenarioDetails = {}
}) {
    if (!Number.isInteger(providerConcurrencyLimit) || providerConcurrencyLimit <= 0) {
        throw new RangeError("Provider concurrency limit must be a positive integer.");
    }

    const {environment, sampling, measurements} = javaReport;
    const startedAt = Date.parse(sampling.startedAtUtc);
    const duration = sampling.plannedDurationMs;

    if (
        sampling.status !== "complete" ||
        sampling.error !== null ||
        !Number.isFinite(startedAt) ||
        !Number.isFinite(duration) ||
        duration <= 0
    ) {
        throw new Error("A completed Java report with a valid measurement window is required.");
    }

    validatePhasePlan(sampling.phasePlan, duration);

    const endedAt = startedAt + duration;
    const parsed = readExtensionHostLog(extensionHostLog);
    const resources = parsed.extensionHostMeasurements;

    if (resources[0].processId !== environment.extensionHostProcessId) {
        throw new Error("Extension Host process does not match the Java report.");
    }

    if (Date.parse(resources[0].capturedAtUtc) > startedAt || Date.parse(resources.at(-1).capturedAtUtc) < endedAt) {
        throw new Error("The Extension Host log does not cover the measurement window.");
    }

    const inWindow = measurement => {
        const timestamp = Date.parse(measurement.capturedAtUtc);

        return timestamp >= startedAt && timestamp < endedAt;
    };

    const extensionHostMeasurements = resources.filter(inWindow).map(measurement => {
        const provider = measurement.resolver?.providerRequests;

        if (
            ![provider?.active, provider?.queued, provider?.peakActive, provider?.peakQueued].every(
                value => Number.isInteger(value) && value >= 0
            ) ||
            provider.active > provider.peakActive ||
            provider.queued > provider.peakQueued ||
            provider.peakActive > providerConcurrencyLimit
        ) {
            throw new Error("Provider counters do not match the declared concurrency limit.");
        }

        return {...measurement, elapsedMs: roundDuration(measurement.elapsedMs)};
    });

    validateJavaMeasurements(measurements);

    const javaProcessMeasurements = measurements
        .filter(inWindow)
        .map(measurement => ({...measurement, elapsedMs: roundDuration(measurement.elapsedMs)}));

    if (extensionHostMeasurements.length === 0 || javaProcessMeasurements.length === 0) {
        throw new Error("Both processes must have measurements inside the selected window.");
    }

    const refreshMeasurements = parsed.refreshMeasurements
        .filter(measurement => {
            const {from, to} = measurement.completionWindowUtc;

            return (to === null || Date.parse(to) >= startedAt) && (from === null || Date.parse(from) < endedAt);
        })
        .map(measurement => {
            const {from, to} = measurement.completionWindowUtc;
            const fromPhase = findPhase(from, sampling);
            const toPhase = findPhase(to, sampling);

            return {
                ...measurement,
                phase: fromPhase !== null && fromPhase === toPhase ? fromPhase : null,
                waitMs: roundDuration(measurement.waitMs),
                processingMs: roundDuration(measurement.processingMs),
                totalMs: roundDuration(measurement.totalMs)
            };
        });

    return {
        formatVersion: 1,
        environment: {
            ...environmentDetails,
            kind: "manual-extension-host-with-java-process",
            measurementBaseCommit: environment.sourceCommit,
            workingTreeStatus: [...environment.workingTreeStatus],
            extensionHostProcessId: environment.extensionHostProcessId,
            javaProcessId: environment.javaProcessId,
            javaStartedAtUtc: environment.javaStartedAtUtc
        },
        scenario: {
            ...scenarioDetails,
            ...environment.workspaceManifest,
            providerConcurrencyLimit
        },
        sampling: structuredClone(sampling),
        extensionHostMeasurements,
        javaProcessMeasurements,
        refreshMeasurements
    };
}

function validatePhasePlan(phases, duration) {
    if (!Array.isArray(phases) || phases.length === 0 || phases[0].atMs !== 0) {
        throw new Error("The phase plan must start at zero.");
    }

    let previousStart = -1;

    for (const phase of phases) {
        if (
            typeof phase.name !== "string" ||
            phase.name.trim() === "" ||
            !Number.isFinite(phase.atMs) ||
            phase.atMs <= previousStart ||
            phase.atMs >= duration
        ) {
            throw new Error("The phase plan must contain ordered phases inside the measurement window");
        }

        previousStart = phase.atMs;
    }
}

function validateJavaMeasurements(measurements) {
    if (!Array.isArray(measurements)) {
        throw new Error("Java measurements must be an array.");
    }

    let previousTimeStamp = -Infinity;
    let previousElapsed = -Infinity;

    for (const measurement of measurements) {
        const timestamp = Date.parse(measurement.capturedAtUtc);

        if (
            !Number.isFinite(timestamp) ||
            !Number.isFinite(measurement.elapsedMs) ||
            measurement.elapsedMs < 0 ||
            timestamp < previousTimeStamp ||
            measurement.elapsedMs < previousElapsed
        ) {
            throw new Error("Java measurements must have valid ordered timestamps.");
        }

        previousTimeStamp = timestamp;
        previousElapsed = measurement.elapsedMs;
    }
}

function findPhase(timestamp, sampling) {
    if (timestamp === null) {
        return null;
    }

    const elapsed = Date.parse(timestamp) - Date.parse(sampling.startedAtUtc);

    if (elapsed < 0 || elapsed >= sampling.plannedDurationMs) {
        return null;
    }

    return sampling.phasePlan.findLast(phase => phase.atMs <= elapsed).name;
}

function roundDuration(value) {
    return Math.round(value * 1000) / 1000;
}
