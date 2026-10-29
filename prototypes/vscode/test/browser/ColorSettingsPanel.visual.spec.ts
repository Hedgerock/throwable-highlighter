import {expect, test} from "./support/colorSettingsPanelFixture";
import {createColorSettingsScenario} from "./support/colorSettingsScenario";

const viewports = [
    {name: "wide", width: 1280},
    {name: "narrow", width: 360}
] as const;

for (const theme of ["dark", "light"] as const) {
    test.describe("color settings screenshots in the " + theme + " theme", () => {
        test.use({colorSettingsTheme: theme, colorScheme: theme});

        for (const viewport of viewports) {
            test("matches the " + viewport.name + " panel", async ({page, colorSettingsPanel}) => {
                const scenario = createColorSettingsScenario();

                await page.setViewportSize({width: viewport.width, height: 900});
                await colorSettingsPanel.open(scenario);
                await expect.poll(() => [...colorSettingsPanel.messages]).toEqual([{type: "ready"}]);
                await colorSettingsPanel.send(scenario.state);
                await expect(page.getByLabel("Settings scope", {exact: true})).toBeEnabled();
                await expect(page.getByRole("status")).toHaveText("No unapplied changes in this scope.");
                await expect(page.locator('[data-context="class"] [data-preview-label]')).toHaveText("#CDA756");
                await page.mouse.move(0, 0);

                await expect(page).toHaveScreenshot("color-settings-" + viewport.name + "-" + theme + ".png", {
                    fullPage: true
                });

                expect(colorSettingsPanel.messages).toEqual([{type: "ready"}]);
                expect(colorSettingsPanel.errors).toEqual([]);
            });
        }
    });
}
