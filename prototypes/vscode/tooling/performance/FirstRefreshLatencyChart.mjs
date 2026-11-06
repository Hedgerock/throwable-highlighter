export function buildFirstRefreshLatencyChartOption(archives) {
    if (!Array.isArray(archives) || archives.length < 2) {
        throw new Error("At least two research archives are required.");
    }

    const typeCounts = archives[0]?.scenario?.usageTypeCounts;

    if (
        !Array.isArray(typeCounts) ||
        typeCounts.length === 0 ||
        !typeCounts.every(value => Number.isInteger(value) && value > 0) ||
        new Set(typeCounts).size !== typeCounts.length
    ) {
        throw new Error("Archives must declare distinct positive Java type counts.");
    }

    const numberFormat = new Intl.NumberFormat("ru-RU", {maximumFractionDigits: 0});
    const limits = new Set();
    const series = archives.map(archive => {
        const limit = archive.scenario?.providerConcurrencyLimit;

        if (!Number.isInteger(limit) || limit <= 0 || limits.has(limit)) {
            throw new Error("Archives must have distinct positive provider concurrency limits.");
        }

        limits.add(limit);

        if (JSON.stringify(archive.scenario.usageTypeCounts) !== JSON.stringify(typeCounts)) {
            throw new Error("Compared archives must use the same Java type counts in the same order.");
        }

        if (!Array.isArray(archive.refreshMeasurements)) {
            throw new Error("The archive must contain refresh measurements.");
        }

        const data = typeCounts.map(count => {
            const phase = "first-" + count;
            const matches = archive.refreshMeasurements.filter(measurement => measurement.phase === phase);

            if (matches.length !== 1 || !Number.isFinite(matches[0].totalMs) || matches[0].totalMs < 0) {
                throw new Error("Expected one valid refresh for phase " + phase + " and limit " + limit + ".");
            }

            return matches[0].totalMs;
        });

        return {
            name: "Лимит " + limit,
            type: "bar",
            data,
            barMaxWidth: 76,
            label: {
                show: true,
                position: "top",
                distance: 8,
                fontSize: 14,
                formatter: parameters => numberFormat.format(Number(parameters.value))
            },
            emphasis: {disabled: true},
            silent: true
        };
    });

    return {
        animation: false,
        backgroundColor: "#ffffff",
        color: ["#2563eb", "#d97706"],
        textStyle: {
            fontFamily: "Arial, sans-serif",
            color: "#1f2937"
        },
        title: {
            text: "Первое обновление подсветки",
            subtext:
                "По одному ручному прогону на лимит.\nВремя totalMs от запроса до применения подсветки; меньше — быстрее.",
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
        grid: {
            left: 64,
            right: 32,
            top: 180,
            bottom: 80,
            outerBoundsMode: "same",
            outerBoundsContain: "all"
        },
        xAxis: {
            type: "category",
            data: typeCounts.map(String),
            name: "Типов в файле",
            nameLocation: "middle",
            nameGap: 34,
            nameTextStyle: {fontSize: 14},
            axisLabel: {fontSize: 14},
            axisTick: {show: false},
            axisLine: {lineStyle: {color: "#94a3b8"}}
        },
        yAxis: {
            type: "value",
            min: 0,
            name: "Время, мс",
            nameGap: 20,
            nameTextStyle: {fontSize: 14},
            axisLabel: {
                fontSize: 13,
                formatter: value => numberFormat.format(Number(value))
            },
            splitLine: {lineStyle: {color: "#e2e8f0"}}
        },
        series
    };
}
