import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

import * as echarts from "echarts";

import {buildFirstRefreshLatencyChartOption} from "./FirstRefreshLatencyChart.mjs";
import {buildProcessMemoryChartOption} from "./ProcessMemoryChart.mjs";
import {buildProviderRequestsChartOption} from "./ProviderRequestsChart.mjs";
import {buildResolutionCacheChartOption} from "./ResolutionCacheChart.mjs";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const dataDirectory = path.join(repositoryRoot, "docs/research/data");
const figuresDirectory = path.join(repositoryRoot, "docs/research/figures");

const providerArchives = await readArchives("vscode-resources-limit-", [16, 32]);
const cacheArchives = await readArchives("vscode-resources-cache-limit-", [256, 512]);

await renderFigures("vscode-provider-concurrency", [
    {
        filename: "refresh-latency.svg",
        height: 560,
        option: buildFirstRefreshLatencyChartOption(providerArchives)
    },
    {
        filename: "provider-requests.svg",
        height: 800,
        option: buildProviderRequestsChartOption(providerArchives)
    },
    {
        filename: "process-memory.svg",
        height: 800,
        option: buildProcessMemoryChartOption(providerArchives)
    },
    {
        filename: "resolution-cache.svg",
        height: 560,
        option: buildResolutionCacheChartOption(providerArchives)
    }
]);

await renderFigures("vscode-resolution-cache", [
    {
        filename: "resolution-cache.svg",
        height: 560,
        option: buildResolutionCacheChartOption(cacheArchives, {compareCacheLimits: true})
    }
]);

function readArchives(prefix, limits) {
    return Promise.all(
        limits.map(async limit => {
            const filename = prefix + limit + ".json";
            const text = await readFile(path.join(dataDirectory, filename), "utf8");

            return JSON.parse(text.replace(/^\uFEFF/, ""));
        })
    );
}

async function renderFigures(directory, figures) {
    const outputDirectory = path.join(figuresDirectory, directory);
    await mkdir(outputDirectory, {recursive: true});

    for (const figure of figures) {
        const chart = echarts.init(null, null, {
            renderer: "svg",
            ssr: true,
            width: 1000,
            height: figure.height
        });

        try {
            chart.setOption(figure.option);

            const outputPath = path.join(outputDirectory, figure.filename);
            await writeFile(outputPath, chart.renderToSVGString() + "\n", "utf8");
            console.log("Chart saved: " + outputPath);
        } finally {
            chart.dispose();
        }
    }
}
