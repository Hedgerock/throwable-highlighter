import {buildResearchPhaseAreas, readResearchTimelines} from "./ResearchChartTimeline.mjs";

export function buildProviderRequestsChartOption(archives) {
    const timelines = readResearchTimelines(archives, "extensionHostMeasurements", "Extension Host").map(timeline => {
        const limit = timeline.limit;
        const points = timeline.points.map(({seconds, measurement}) => {
            const provider = measurement.resolver?.providerRequests;

            if (
                ![provider?.active, provider?.queued, provider?.peakActive, provider?.peakQueued].every(
                    value => Number.isInteger(value) && value >= 0
                ) ||
                provider.active > provider.peakActive ||
                provider.queued > provider.peakQueued ||
                provider.peakActive > limit
            ) {
                throw new Error("Invalid provider counters for limit " + limit + ".");
            }

            return {...provider, seconds};
        });

        return {
            ...timeline,
            points,
            peakActive: Math.max(...points.map(point => point.peakActive)),
            peakQueued: Math.max(...points.map(point => point.peakQueued))
        };
    });

    const sampling = timelines[0].sampling;
    const duration = sampling.plannedDurationMs;
    const areas = buildResearchPhaseAreas(sampling);
    const colors = ["#2563eb", "#d97706"];
    const series = ["active", "queued"].flatMap((metric, panel) =>
        timelines.map((timeline, index) => ({
            name: "Лимит " + timeline.limit,
            type: "line",
            xAxisIndex: panel,
            yAxisIndex: panel,
            data: timeline.points.map(point => [point.seconds, point[metric]]),
            smooth: false,
            showSymbol: true,
            symbolSize: 4,
            lineStyle: {width: 1.5, color: colors[index % colors.length]},
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
                text: "Команды Java-провайдеров и очередь",
                subtext:
                    "Линии соединяют снимки; короткие обращения могут отсутствовать.\nПиковые значения счётчиков приведены под графиками.",
                left: 32,
                top: 24,
                textStyle: {fontSize: 22, fontWeight: 600},
                subtextStyle: {fontSize: 14, lineHeight: 22, color: "#475569"}
            },
            {text: "Выполняющиеся команды", left: 64, top: 156, textStyle: {fontSize: 15}},
            {text: "Ожидающие команды", left: 64, top: 416, textStyle: {fontSize: 15}}
        ],
        legend: {
            data: timelines.map(timeline => "Лимит " + timeline.limit),
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
            max: duration / 1000,
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
            minInterval: 1,
            ...(panel === 0 ? {max: Math.ceil(Math.max(...timelines.map(timeline => timeline.limit)) * 1.25)} : {}),
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
                        "Пики счётчиков за время жизни resolver, включая обращения между снимками:",
                        ...timelines.map(
                            timeline =>
                                "Лимит " +
                                timeline.limit +
                                ": пик выполнения — " +
                                timeline.peakActive +
                                ", пик очереди — " +
                                timeline.peakQueued +
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
