import {expect, test} from "./support/colorSettingsPanelFixture";
import {createColorSettingsScenario} from "./support/colorSettingsScenario";

const viewports = [
    {name: "wide", width: 1280, overflows: false},
    {name: "narrow", width: 360, overflows: true}
] as const;

for (const theme of ["dark", "light"] as const) {
    test.describe("panel layout in the " + theme + " theme", () => {
        test.use({colorSettingsTheme: theme, colorScheme: theme});

        for (const viewport of viewports) {
            test("keeps the " + viewport.name + " layout within the page", async ({page, colorSettingsPanel}) => {
                const scenario = createColorSettingsScenario();
                const table = page.getByRole("region", {name: "Color configuration", exact: true});
                const caption = page.getByRole("heading", {name: "Color configuration", exact: true});

                await page.setViewportSize({width: viewport.width, height: 900});
                await colorSettingsPanel.open(scenario);
                await expect.poll(() => [...colorSettingsPanel.messages]).toEqual([{type: "ready"}]);
                await colorSettingsPanel.send(scenario.state);
                await expect(page.getByLabel("Settings scope", {exact: true})).toBeEnabled();

                await expect
                    .poll(() =>
                        page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
                    )
                    .toBe(0);

                const pageWidth = await page.evaluate(() => document.documentElement.clientWidth);

                for (const button of [
                    page.getByRole("button", {name: "Discard changes", exact: true}),
                    page.locator("#apply-draft")
                ]) {
                    const bounds = await button.evaluate(element => {
                        const {left, right, width} = element.getBoundingClientRect();
                        return {left, right, width};
                    });

                    expect(bounds.width).toBeGreaterThan(0);
                    expect(bounds.left).toBeGreaterThanOrEqual(0);
                    expect(bounds.right).toBeLessThanOrEqual(pageWidth);
                }

                if (viewport.overflows) {
                    await expect
                        .poll(() => table.evaluate(element => element.scrollWidth - element.clientWidth))
                        .toBeGreaterThan(0);
                    await expect(caption).toBeVisible();

                    const captionPosition = await caption.evaluate(element => {
                        const {x, y} = element.getBoundingClientRect();
                        return {x, y};
                    });
                    const tableBounds = await table.evaluate(element => {
                        const {left, right} = element.getBoundingClientRect();
                        return {left, right};
                    });

                    await table.evaluate(element => {
                        element.scrollLeft = element.scrollWidth;
                    });

                    await expect
                        .poll(() =>
                            table
                                .getByRole("rowheader", {name: "Throwable class", exact: true})
                                .evaluate(element => element.getBoundingClientRect().right)
                        )
                        .toBeLessThanOrEqual(tableBounds.left);

                    const lastColumn = await table
                        .getByRole("columnheader", {name: "Effective stored color", exact: true})
                        .evaluate(element => {
                            const {left, right} = element.getBoundingClientRect();
                            return {left, right};
                        });

                    expect(lastColumn.left).toBeGreaterThanOrEqual(tableBounds.left - 1);
                    expect(lastColumn.right).toBeLessThanOrEqual(tableBounds.right + 1);
                    expect(
                        await caption.evaluate(element => {
                            const {x, y} = element.getBoundingClientRect();
                            return {x, y};
                        })
                    ).toEqual(captionPosition);
                } else {
                    await expect
                        .poll(() => table.evaluate(element => element.scrollWidth - element.clientWidth))
                        .toBe(0);
                }

                expect(colorSettingsPanel.messages).toEqual([{type: "ready"}]);
                expect(colorSettingsPanel.errors).toEqual([]);
            });
        }
    });
}
