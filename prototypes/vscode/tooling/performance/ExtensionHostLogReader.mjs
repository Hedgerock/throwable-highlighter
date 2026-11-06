const RESOURCE_PREFIX = "[resource-measurement] ";
const REFRESH_PREFIX = "[refresh-measurement] ";

export function readExtensionHostLog(text) {
    const extensionHostMeasurements = [];
    const refreshMeasurements = [];
    let pendingRefreshes = [];
    let previousResource;

    function completeRefreshes(nextResource) {
        for (const measurement of pendingRefreshes) {
            refreshMeasurements.push({
                ...measurement,
                completionWindowUtc: {
                    from: previousResource?.capturedAtUtc ?? null,
                    to: nextResource?.capturedAtUtc ?? null
                }
            });
        }

        pendingRefreshes = [];
    }

    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);

    for (const [index, rawLine] of lines.entries()) {
        const line = rawLine.trim();
        const lineNumber = index + 1;

        if (line === "" || line === "Decoration controller activated.") {
            continue;
        }

        if (line.startsWith(RESOURCE_PREFIX)) {
            const measurement = parseMeasurement(line.slice(RESOURCE_PREFIX.length), lineNumber);

            if (
                !Number.isInteger(measurement.processId) ||
                measurement.processId <= 0 ||
                !Number.isFinite(measurement.elapsedMs) ||
                measurement.elapsedMs < 0 ||
                typeof measurement.capturedAtUtc !== "string" ||
                !Number.isFinite(Date.parse(measurement.capturedAtUtc))
            ) {
                throw new Error("Invalid resource measurement at line " + lineNumber + ".");
            }

            if (previousResource !== undefined) {
                if (measurement.processId !== previousResource.processId) {
                    throw new Error("Mixed Extension Host processes at line " + lineNumber + ".");
                }

                if (
                    measurement.elapsedMs < previousResource.elapsedMs ||
                    Date.parse(measurement.capturedAtUtc) < Date.parse(previousResource.capturedAtUtc)
                ) {
                    throw new Error("Resource timestamps move backwards at line " + lineNumber + ".");
                }
            }

            completeRefreshes(measurement);
            extensionHostMeasurements.push(measurement);
            previousResource = measurement;
            continue;
        }

        if (line.startsWith(REFRESH_PREFIX)) {
            const measurement = parseMeasurement(line.slice(REFRESH_PREFIX.length), lineNumber);

            if (
                ![measurement.waitMs, measurement.processingMs, measurement.totalMs].every(
                    value => Number.isFinite(value) && value >= 0
                )
            ) {
                throw new Error("Invalid refresh measurement at line " + lineNumber + ".");
            }

            pendingRefreshes.push(measurement);
            continue;
        }

        throw new Error("Unexpected log entry at line " + lineNumber + ".");
    }

    if (extensionHostMeasurements.length === 0) {
        throw new Error("The log contains no resource measurements.");
    }

    completeRefreshes(undefined);

    return {extensionHostMeasurements, refreshMeasurements};
}

function parseMeasurement(text, lineNumber) {
    let value;

    try {
        value = JSON.parse(text);
    } catch (cause) {
        throw new Error("Invalid measurement JSON at line " + lineNumber + ".", {cause});
    }

    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Expected a measurement object at line " + lineNumber);
    }

    return value;
}
