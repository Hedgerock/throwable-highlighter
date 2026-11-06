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
const outputDirectory = path.join(repositoryRoot, "docs/research/figures/vscode-provider-concurrency");

const archives = await Promise.all(
    [16, 32].map(async limit => {
        const filename = "vscode-resources-limit-" + limit + ".json";
        const text = await readFile(path.join(dataDirectory, filename), "utf8");

        return JSON.parse(text.replace(/^\uFEFF/, ""));
    })
);

const figures = [
    {
        filename: "refresh-latency.svg",
        height: 560,
        option: buildFirstRefreshLatencyChartOption(archives)
    },
    {
        filename: "provider-requests.svg",
        height: 800,
        option: buildProviderRequestsChartOption(archives)
    },
    {
        filename: "process-memory.svg",
        height: 800,
        option: buildProcessMemoryChartOption(archives)
    },
    {
        filename: "resolution-cache.svg",
        height: 560,
        option: buildResolutionCacheChartOption(archives)
    }
];

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
