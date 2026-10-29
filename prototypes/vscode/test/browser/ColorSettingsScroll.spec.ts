import {expect, test} from "./support/colorSettingsPanelFixture";
import {createColorSettingsScenario} from "./support/colorSettingsScenario";

test.use({
    viewport: {width: 480, height: 480},
    reducedMotion: "reduce"
});

test.beforeEach(async ({page, colorSettingsPanel}) => {
    const scenario = createColorSettingsScenario();

    await colorSettingsPanel.open(scenario);
    await expect.poll(() => [...colorSettingsPanel.messages]).toEqual([{type: "ready"}]);
    await colorSettingsPanel.send(scenario.state);
    await expect(page.getByLabel("Settings scope", {exact: true})).toBeEnabled();
    await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight))
        .toBeGreaterThan(0);
});

test.afterEach(({colorSettingsPanel}) => {
    expect(colorSettingsPanel.messages).toEqual([{type: "ready"}]);
    expect(colorSettingsPanel.errors).toEqual([]);
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test("routes vertical wheel input to the table with motion " + reducedMotion, async ({page}) => {
        const table = page.getByRole("region", {name: "Color configuration", exact: true});

        await page.emulateMedia({reducedMotion});
        await expect
            .poll(() => table.evaluate(element => element.scrollWidth - element.clientWidth))
            .toBeGreaterThan(0);
        await table.getByRole("columnheader", {name: "Context", exact: true}).hover();

        const pagePosition = await page.evaluate(() => ({x: window.scrollX, y: window.scrollY}));

        await page.mouse.wheel(0, 240);

        await expect.poll(() => table.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
        expect(await page.evaluate(() => ({x: window.scrollX, y: window.scrollY}))).toEqual(pagePosition);

        await page.mouse.wheel(0, -240);

        await expect.poll(() => table.evaluate(element => element.scrollLeft)).toBe(0);
        expect(await page.evaluate(() => ({x: window.scrollX, y: window.scrollY}))).toEqual(pagePosition);
    });
}

test("routes Ctrl+wheel to the page instead of the table", async ({page}) => {
    const table = page.getByRole("region", {name: "Color configuration", exact: true});

    await expect.poll(() => table.evaluate(element => element.scrollWidth - element.clientWidth)).toBeGreaterThan(0);
    await table.getByRole("columnheader", {name: "Context", exact: true}).hover();

    const tablePosition = await table.evaluate(element => element.scrollLeft);
    const pagePosition = await page.evaluate(() => window.scrollY);

    await page.keyboard.down("Control");

    try {
        await page.mouse.wheel(0, 120);

        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(pagePosition);
        expect(await table.evaluate(element => element.scrollLeft)).toBe(tablePosition);
    } finally {
        await page.keyboard.up("Control");
    }
});

for (const edge of ["start", "end"] as const) {
    test("releases wheel input to the page at the " + edge + " of the table", async ({page}) => {
        const table = page.getByRole("region", {name: "Color configuration", exact: true});

        await expect
            .poll(() => table.evaluate(element => element.scrollWidth - element.clientWidth))
            .toBeGreaterThan(0);

        if (edge === "start") {
            await page.evaluate(() => window.scrollTo(0, 80));
            await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
        }

        await table.getByRole("columnheader", {name: "Context", exact: true}).hover();
        await table.evaluate((element, edge) => {
            element.scrollLeft = edge === "start" ? 0 : element.scrollWidth;
        }, edge);

        const tablePosition = await table.evaluate(element => element.scrollLeft);
        const pagePosition = await page.evaluate(() => window.scrollY);

        if (edge === "end") {
            expect(tablePosition).toBeGreaterThan(0);
        } else {
            expect(tablePosition).toBe(0);
        }

        await page.mouse.wheel(0, edge === "start" ? -120 : 120);

        if (edge === "start") {
            await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(pagePosition);
        } else {
            await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(pagePosition);
        }

        expect(await table.evaluate(element => element.scrollLeft)).toBe(tablePosition);
    });
}

test("preserves page scrolling when the table has no horizontal overflow", async ({page}) => {
    const table = page.getByRole("region", {name: "Color configuration", exact: true});

    await page.setViewportSize({width: 1280, height: 480});
    await expect.poll(() => table.evaluate(element => element.scrollWidth - element.clientWidth)).toBe(0);
    await table.getByRole("columnheader", {name: "Context", exact: true}).hover();

    const pagePosition = await page.evaluate(() => window.scrollY);

    await page.mouse.wheel(0, 120);

    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(pagePosition);
    expect(await table.evaluate(element => element.scrollLeft)).toBe(0);
});
