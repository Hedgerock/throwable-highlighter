import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {parseArgs} from "node:util";

import {buildResourceResearchArchive} from "./ResourceResearchArchiveBuilder.mjs";

const {values} = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    allowPositionals: false,
    options: {
        run: {type: "string"},
        limit: {type: "string"},
        metadata: {type: "string"},
        output: {type: "string"}
    }
});

for (const name of ["run", "limit", "metadata", "output"]) {
    if (typeof values[name] !== "string" || values[name].trim() === "") {
        throw new Error("Missing required option: --" + name);
    }
}

const runDirectory = path.resolve(values.run);
const metadataPath = path.resolve(values.metadata);
const outputPath = path.resolve(values.output);

const [reportText, extensionHostLog, metadataText] = await Promise.all([
    readFile(path.join(runDirectory, "java-process.json"), "utf-8"),
    readFile(path.join(runDirectory, "extension-host.log"), "utf-8"),
    readFile(metadataPath, "utf-8")
]);

const javaReport = JSON.parse(reportText.replace(/^\uFEFF/, ""));
const metadata = JSON.parse(metadataText.replace(/^\uFEFF/, ""));

if (
    metadata === null ||
    typeof metadata.environment !== "object" ||
    metadata.environment === null ||
    Array.isArray(metadata.environment) ||
    typeof metadata.scenario !== "object" ||
    metadata.scenario === null ||
    Array.isArray(metadata.scenario)
) {
    throw new Error("Metadata must contain environment and scenario objects.");
}

const archive = buildResourceResearchArchive({
    javaReport,
    extensionHostLog,
    providerConcurrencyLimit: Number(values.limit),
    environmentDetails: metadata.environment,
    scenarioDetails: metadata.scenario
});

await mkdir(path.dirname(outputPath), {recursive: true});
await writeFile(outputPath, JSON.stringify(archive, null, 2) + "\n", {
    encoding: "utf-8",
    flag: "wx"
});

console.log("Archive saved: " + outputPath);
console.log(
    "Measurements: " +
        archive.extensionHostMeasurements.length +
        " Extension Host, " +
        archive.javaProcessMeasurements.length +
        " Java, " +
        archive.refreshMeasurements.length +
        " refresh."
);
