import {buildResearchPhaseAreas, readResearchTimelines} from "./ResearchChartTimeline.mjs";

const BYTES_PER_MIB = 1024 ** 2;

export function buildProcessMemoryChartOption(archives) {
    const panels = [
        {
            title: "Extension Host — RSS",
            timelines: readResearchTimelines(archives, "extensionHostMeasurements", "Extension Host"),
            readBytes: measurement => measurement.memory?.rss
        },
        {
            title: "Java-процесс — Working Set",
            timelines: readResearchTimelines(archives, "javaProcessMeasurements", "Java"),
            readBytes: measurement => measurement.workingSetBytes
        }
    ].map(panel => ({
        ...panel,
        lines: panel.timelines.map(timeline => {
            const data = timeline.points.map(({seconds, measurement}) => {
                const bytes = panel.readBytes(measurement);

                if (!Number.isSafeInteger(bytes) || bytes < 0) {
                    throw new Error("Invalid memory value for " + panel.title + " and limit " + timeline.limit + ".");
                }

                return [seconds, bytes / BYTES_PER_MIB];
            });

            return {
                limit: timeline.limit,
                data,
                maximumMiB: Math.max(...data.map(point => point[1]))
            };
        })
    }));

    const sampling = panels[0].timelines[0].sampling;
    const areas = buildResearchPhaseAreas(sampling);
    const numberFormat = new Intl.NumberFormat("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    const colors = ["#2563eb", "#d97706"];

    const series = panels.flatMap((panel, panelIndex) =>
        panel.lines.map((line, index) => ({
            name: "Лимит " + line.limit,
            type: "line",
            xAxisIndex: panelIndex,
            yAxisIndex: panelIndex,
            data: line.data,
            smooth: false,
            showSymbol: false,
            lineStyle: {width: 2, color: colors[index % colors.length]},
            itemStyle: {color: colors[index % colors.length]},
            emphasis: {disabled: true},
            silent: true,
            ...(index === 0
                ? {
                      markArea: {
                          silent: true,
                          label: {position: "top", fontSize: 11, color: "#64748b"},
                          data: areas
                      }
                  }
                : {})
        }))
    );

    return {
        animation: false,
        backgroundColor: "#ffffff",
        textStyle: {fontFamily: "Arial, sans-serif", color: "#1f2937"},
        title: [
            {
                text: "Память процессов",
                subtext:
                    "По одному ручному прогону на лимит; показана память процессов целиком.\nКаждый процесс сохраняет собственные UTC-отметки снимков.",
                left: 32,
                top: 24,
                textStyle: {fontSize: 22, fontWeight: 600},
                subtextStyle: {fontSize: 14, lineHeight: 22, color: "#475569"}
            },
            ...panels.map((panel, index) => ({
                text: panel.title + ", МиБ",
                left: 64,
                top: index === 0 ? 156 : 416,
                textStyle: {fontSize: 15}
            }))
        ],
        legend: {
            data: panels[0].lines.map(line => "Лимит " + line.limit),
            top: 120,
            left: "center",
            selectedMode: false,
            textStyle: {fontSize: 14}
        },
        grid: [
            {left: 88, right: 32, top: 210, height: 155, outerBoundsMode: "none"},
            {left: 88, right: 32, top: 470, height: 155, outerBoundsMode: "none"}
        ],
        xAxis: [0, 1].map(panel => ({
            type: "value",
            gridIndex: panel,
            min: 0,
            max: sampling.plannedDurationMs / 1000,
            splitNumber: 9,
            name: panel === 1 ? "От начала измерений, с" : "",
            nameLocation: "middle",
            nameGap: 30,
            nameTextStyle: {fontSize: 13},
            axisLabel: {fontSize: 12},
            axisTick: {show: false},
            axisLine: {lineStyle: {color: "#94a3b8"}},
            splitLine: {show: false}
        })),
        yAxis: [0, 1].map(panel => ({
            type: "value",
            gridIndex: panel,
            min: 0,
            axisLabel: {fontSize: 12},
            splitLine: {lineStyle: {color: "#e2e8f0"}}
        })),
        graphic: [
            {
                type: "text",
                left: 64,
                top: 704,
                style: {
                    text: [
                        "Максимумы среди снимков, МиБ:",
                        ...panels.map(
                            panel =>
                                panel.title +
                                ": " +
                                panel.lines
                                    .map(line => "Лимит " + line.limit + " — " + numberFormat.format(line.maximumMiB))
                                    .join("; ") +
                                "."
                        )
                    ].join("\n"),
                    font: "13px Arial",
                    lineHeight: 20,
                    fill: "#475569"
                }
            }
        ],
        series
    };
}
