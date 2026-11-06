import {buildResearchPhaseAreas, readResearchTimelines} from "./ResearchChartTimeline.mjs";

export function buildResolutionCacheChartOption(archives) {
    const timelines = readResearchTimelines(archives, "extensionHostMeasurements", "Extension Host");
    const lines = timelines.map(timeline => ({
        limit: timeline.limit,
        data: timeline.points.map(({seconds, measurement}) => {
            const count = measurement.resolver?.cachedResolutionCount;

            if (!Number.isSafeInteger(count) || count < 0) {
                throw new Error("Invalid cached resolution count for limit " + timeline.limit + ".");
            }

            return [seconds, count];
        })
    }));
    const sampling = timelines[0].sampling;
    const numberFormat = new Intl.NumberFormat("ru-RU", {maximumFractionDigits: 0});

    return {
        animation: false,
        backgroundColor: "#ffffff",
        color: ["#2563eb", "#d97706"],
        textStyle: {fontFamily: "Arial, sans-serif", color: "#1f2937"},
        title: {
            text: "Кэш результатов определения типов",
            subtext:
                "Количество записей resolver; по одному ручному прогону на лимит.\nЗапись соответствует ссылке на тип, а не уникальному классу.",
            left: 32,
            top: 24,
            textStyle: {fontSize: 22, fontWeight: 600},
            subtextStyle: {fontSize: 14, lineHeight: 22, color: "#475569"}
        },
        legend: {
            top: 120,
            left: "center",
            selectedMode: false,
            textStyle: {fontSize: 14}
        },
        grid: {left: 88, right: 32, top: 180, bottom: 140, outerBoundsMode: "none"},
        xAxis: {
            type: "value",
            min: 0,
            max: sampling.plannedDurationMs / 1000,
            splitNumber: 9,
            name: "От начала измерений, с",
            nameLocation: "middle",
            nameGap: 30,
            nameTextStyle: {fontSize: 13},
            axisLabel: {fontSize: 12},
            axisTick: {show: false},
            axisLine: {lineStyle: {color: "#94a3b8"}},
            splitLine: {show: false}
        },
        yAxis: {
            type: "value",
            min: 0,
            minInterval: 1,
            name: "Записей",
            nameGap: 25,
            nameTextStyle: {fontSize: 13},
            axisLabel: {fontSize: 12},
            splitLine: {lineStyle: {color: "#e2e8f0"}}
        },
        graphic: [
            {
                type: "text",
                left: 64,
                top: 492,
                style: {
                    text: [
                        "Последние снимки: " +
                            lines
                                .map(line => "Лимит " + line.limit + " — " + numberFormat.format(line.data.at(-1)[1]))
                                .join("; ") +
                            ".",
                        "Стабильность на этом наборе файлов не устанавливает предел роста кэша."
                    ].join("\n"),
                    font: "13px Arial",
                    lineHeight: 20,
                    fill: "#475569"
                }
            }
        ],
        series: lines.map((line, index) => ({
            name: "Лимит " + line.limit,
            type: "line",
            data: line.data,
            smooth: false,
            showSymbol: false,
            lineStyle: {width: 2, type: index % 2 === 0 ? "solid" : "dashed"},
            emphasis: {disabled: true},
            silent: true,
            ...(index === 0
                ? {
                      markArea: {
                          silent: true,
                          label: {position: "top", fontSize: 11, color: "#64748b"},
                          data: buildResearchPhaseAreas(sampling)
                      }
                  }
                : {})
        }))
    };
}
