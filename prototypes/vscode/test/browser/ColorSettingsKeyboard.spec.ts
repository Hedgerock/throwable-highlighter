import type {ColorSettingsMessage} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsMessage";

import {expect, test} from "./support/colorSettingsPanelFixture";
import {createClassColorState, createColorSettingsScenario} from "./support/colorSettingsScenario";

const viewports = [
    {name: "wide", width: 1280},
    {name: "narrow", width: 360}
] as const;

for (const viewport of viewports) {
    test("preserves keyboard navigation in the " + viewport.name + " panel", async ({page, colorSettingsPanel}) => {
        const scenario = createColorSettingsScenario();
        const scope = page.getByLabel("Settings scope", {exact: true});
        const color = page.getByLabel("Throwable class color", {exact: true});
        const messages: ColorSettingsMessage[] = [{type: "ready"}];
        const tabOrder = [
            page.getByRole("region", {name: "Color configuration", exact: true}),
            page.getByLabel("Throwable class source", {exact: true}),
            color,
            page.getByLabel("Choose Throwable class RGB color", {exact: true}),
            page.getByRole("button", {name: "Revert Throwable class color to its saved value", exact: true}),
            page.getByRole("button", {name: "Remove Throwable class color from this scope", exact: true}),
            page.getByRole("slider", {name: "Throwable class opacity", exact: true}),
            page.getByLabel("Throwable class opacity percentage", {exact: true}),
            page.getByLabel("Throwable import source", {exact: true}),
            page.getByLabel("Throwable catch source", {exact: true}),
            page.getByLabel("Throwable throws source", {exact: true}),
            page.getByLabel("Throwable throws color", {exact: true}),
            page.getByLabel("Choose Throwable throws RGB color", {exact: true}),
            page.getByRole("button", {name: "Remove Throwable throws color from this scope", exact: true}),
            page.getByRole("slider", {name: "Throwable throws opacity", exact: true}),
            page.getByLabel("Throwable throws opacity percentage", {exact: true}),
            page.getByRole("button", {name: "Discard changes", exact: true}),
            page.locator("#apply-draft"),
            page.getByText("About these settings", {exact: true})
        ];

        await page.setViewportSize({width: viewport.width, height: 900});
        await colorSettingsPanel.open(scenario);
        await expect.poll(() => [...colorSettingsPanel.messages]).toEqual(messages);
        await colorSettingsPanel.send(scenario.state);
        await expect(color).toBeEnabled();

        await color.fill("#11223380");
        messages.push({type: "setColor", target: "user", context: "class", color: "#11223380"});
        await expect.poll(() => [...colorSettingsPanel.messages]).toEqual(messages);
        await colorSettingsPanel.send(createClassColorState(scenario, "#11223380"));
        await expect(page.locator('[data-context="class"] [data-preview-label]')).toHaveText("#11223380");
        await expect(page.locator("#apply-draft")).toBeEnabled();

        await scope.focus();

        for (const control of tabOrder) {
            await page.keyboard.press("Tab");
            await expect(control).toBeFocused();
        }

        for (const control of tabOrder.slice(0, -1).reverse()) {
            await page.keyboard.press("Shift+Tab");
            await expect(control).toBeFocused();
        }

        await page.keyboard.press("Shift+Tab");
        await expect(scope).toBeFocused();
        expect(colorSettingsPanel.messages).toEqual(messages);
        expect(colorSettingsPanel.errors).toEqual([]);
    });
}

test("scrolls the overflowing table with the keyboard", async ({page, colorSettingsPanel}) => {
    const scenario = createColorSettingsScenario();
    const scope = page.getByLabel("Settings scope", {exact: true});
    const table = page.getByRole("region", {name: "Color configuration", exact: true});

    await page.setViewportSize({width: 480, height: 900});
    await page.emulateMedia({reducedMotion: "reduce"});
    await colorSettingsPanel.open(scenario);
    await expect.poll(() => [...colorSettingsPanel.messages]).toEqual([{type: "ready"}]);
    await colorSettingsPanel.send(scenario.state);
    await expect(scope).toBeEnabled();

    await expect.poll(() => table.evaluate(element => element.scrollWidth - element.clientWidth)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
        0
    );

    await scope.focus();
    await page.keyboard.press("Tab");
    await expect(table).toBeFocused();
    await expect.poll(() => table.evaluate(element => element.scrollLeft)).toBe(0);

    const pagePosition = await page.evaluate(() => ({x: window.scrollX, y: window.scrollY}));

    await page.keyboard.press("ArrowRight");

    await expect.poll(() => table.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await expect(table).toBeFocused();
    expect(await page.evaluate(() => ({x: window.scrollX, y: window.scrollY}))).toEqual(pagePosition);
    expect(colorSettingsPanel.messages).toEqual([{type: "ready"}]);
    expect(colorSettingsPanel.errors).toEqual([]);
});
