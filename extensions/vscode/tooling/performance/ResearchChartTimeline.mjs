export function readResearchTimelines(
    archives,
    measurementsKey,
    sourceLabel,
    {limitKey = "providerConcurrencyLimit", limitLabel = "provider concurrency"} = {}
) {
    if (!Array.isArray(archives) || archives.length < 2) {
        throw new Error("At least two research archives are required.");
    }

    const sampling = archives[0].sampling;
    const duration = sampling?.plannedDurationMs;

    if (
        !Number.isFinite(duration) ||
        duration <= 0 ||
        !Number.isFinite(sampling.intervalMs) ||
        sampling.intervalMs <= 0 ||
        !Array.isArray(sampling.phasePlan) ||
        sampling.phasePlan.length === 0 ||
        sampling.phasePlan[0].atMs !== 0 ||
        !sampling.phasePlan.every(
            (phase, index, phases) =>
                typeof phase.name === "string" &&
                phase.name.trim() !== "" &&
                Number.isFinite(phase.atMs) &&
                phase.atMs >= 0 &&
                phase.atMs < duration &&
                (index === 0 || phase.atMs > phases[index - 1].atMs)
        )
    ) {
        throw new Error("A valid sampling window and phase plan are required.");
    }

    const signature = samplingSignature(sampling);
    const limits = new Set();

    return archives.map(archive => {
        const limit = archive.scenario?.[limitKey];
        const startedAt = Date.parse(archive.sampling?.startedAtUtc);

        if (!Number.isInteger(limit) || limit <= 0 || limits.has(limit)) {
            throw new Error("Archives must have distinct positive " + limitLabel + " limits.");
        }

        limits.add(limit);

        if (!Number.isFinite(startedAt) || samplingSignature(archive.sampling) !== signature) {
            throw new Error("Compared archives must use the same duration, sampling interval and phase plan.");
        }

        const measurements = archive[measurementsKey];

        if (!Array.isArray(measurements) || measurements.length === 0) {
            throw new Error("The archive must contain " + sourceLabel + " measurements.");
        }

        let previousTime = -Infinity;
        const points = measurements.map(measurement => {
            const elapsedMs = Date.parse(measurement.capturedAtUtc) - startedAt;

            if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs >= duration || elapsedMs < previousTime) {
                throw new Error(sourceLabel + " measurements must have ordered UTC timestamps inside the window.");
            }

            previousTime = elapsedMs;

            return {seconds: elapsedMs / 1000, measurement};
        });

        return {limit, sampling: archive.sampling, points};
    });
}

export function buildResearchPhaseAreas(sampling) {
    const groups = [];

    for (const phase of sampling.phasePlan) {
        const label =
            phase.name === "baseline"
                ? "До открытия"
                : phase.name === "recovery"
                  ? "После закрытия"
                  : phase.name.startsWith("first-")
                    ? phase.name.slice("first-".length) + " типов"
                    : phase.name.startsWith("repeat-")
                      ? "Повторные открытия"
                      : phase.name;

        if (groups.at(-1)?.name !== label) {
            groups.push({name: label, atMs: phase.atMs});
        }
    }

    return groups.map((phase, index) => [
        {
            name: phase.name,
            xAxis: phase.atMs / 1000,
            itemStyle: {color: index % 2 === 0 ? "rgba(226,232,240,0.4)" : "rgba(248,250,252,0.35)"}
        },
        {xAxis: (groups[index + 1]?.atMs ?? sampling.plannedDurationMs) / 1000}
    ]);
}

function samplingSignature(sampling) {
    return JSON.stringify([
        sampling?.plannedDurationMs,
        sampling?.intervalMs,
        Array.isArray(sampling?.phasePlan) ? sampling.phasePlan.map(phase => [phase.name, phase.atMs]) : null
    ]);
}
