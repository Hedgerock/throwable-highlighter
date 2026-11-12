import type {ColorSettingsMessage} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsMessage";

import {expect, test} from "./support/colorSettingsPanelFixture";
import {
    createClassColorState,
    createColorSettingsScenario,
    createColorSettingsState
} from "./support/colorSettingsScenario";

test("keeps RGB and alpha synchronized across text, picker and slider", async ({page, colorSettingsPanel}) => {
    const scenario = createColorSettingsScenario();
    const color = page.getByLabel("Throwable class color", {exact: true});
    const picker = page.getByLabel("Choose Throwable class RGB color", {exact: true});
    const opacity = page.getByRole("slider", {name: "Throwable class opacity", exact: true});
    const percentage = page.getByLabel("Throwable class opacity percentage", {exact: true});
    const row = page.locator('[data-context="class"]');
    const preview = row.locator("[data-preview-label]");
    const messages: ColorSettingsMessage[] = [{type: "ready"}];

    await colorSettingsPanel.open(scenario);
    await expect.poll(() => [...colorSettingsPanel.messages]).toEqual(messages);
    await colorSettingsPanel.send(scenario.state);
    await expect(color).toBeEnabled();

    await color.fill("#11223380");
    messages.push({type: "setColor", target: "user", context: "class", color: "#11223380"});
    await expect.poll(() => [...colorSettingsPanel.messages]).toEqual(messages);
    await colorSettingsPanel.send(createClassColorState(scenario, "#11223380"));

    await expect(preview).toHaveText("#11223380");
    await expect(picker).toHaveValue("#112233");
    await expect(opacity).toHaveValue("128");
    await expect(percentage).toHaveValue("50.2");
    await expect(picker).toBeEnabled();

    await picker.evaluate((element, value) => {
        if (!(element instanceof HTMLInputElement)) {
            throw new Error("Expected an RGB color input");
        }

        element.value = value;
        element.dispatchEvent(new Event("input", {bubbles: true}));
    }, "#abcdef");

    messages.push({type: "setColor", target: "user", context: "class", color: "#abcdef80"});
    await expect.poll(() => [...colorSettingsPanel.messages]).toEqual(messages);
    await colorSettingsPanel.send(createClassColorState(scenario, "#abcdef80"));

    await expect(preview).toHaveText("#abcdef80");
    await expect(color).toHaveValue("#abcdef80");
    await expect(opacity).toHaveValue("128");
    await expect(percentage).toHaveValue("50.2");

    await opacity.press("End");

    messages.push({type: "setColor", target: "user", context: "class", color: "#abcdefff"});
    await expect.poll(() => [...colorSettingsPanel.messages]).toEqual(messages);
    await colorSettingsPanel.send(createClassColorState(scenario, "#abcdefff"));

    await expect(preview).toHaveText("#abcdefff");
    await expect(color).toHaveValue("#abcdefff");
    await expect(picker).toHaveValue("#abcdef");
    await expect(opacity).toHaveValue("255");
    await expect(percentage).toHaveValue("100");
    await expect(row.locator("[data-color-swatch]")).toBeVisible();
    await expect(row.locator("[data-color-swatch-fill]")).toHaveCSS("background-color", "rgb(171, 205, 239)");
    expect(colorSettingsPanel.errors).toEqual([]);
});

for (const key of ["Enter", "Tab"] as const) {
    test("normalizes opacity on " + key + " without another color edit", async ({page, colorSettingsPanel}) => {
        const scenario = createColorSettingsScenario();
        const color = page.getByLabel("Throwable class color", {exact: true});
        const percentage = page.getByLabel("Throwable class opacity percentage", {exact: true});
        const opacity = page.getByRole("slider", {name: "Throwable class opacity", exact: true});
        const preview = page.locator('[data-context="class"] [data-preview-label]');
        const messages: ColorSettingsMessage[] = [{type: "ready"}];

        await colorSettingsPanel.open(scenario);
        await expect.poll(() => [...colorSettingsPanel.messages]).toEqual(messages);
        await colorSettingsPanel.send(scenario.state);
        await expect(color).toBeEnabled();

        await color.fill("#112233ff");
        messages.push({type: "setColor", target: "user", context: "class", color: "#112233ff"});
        await expect.poll(() => [...colorSettingsPanel.messages]).toEqual(messages);
        await colorSettingsPanel.send(createClassColorState(scenario, "#112233ff"));
        await expect(preview).toHaveText("#112233ff");
        await expect(percentage).toHaveValue("100");

        await percentage.fill("50");
        messages.push({type: "setColor", target: "user", context: "class", color: "#11223380"});
        await expect.poll(() => [...colorSettingsPanel.messages]).toEqual(messages);
        await colorSettingsPanel.send(createClassColorState(scenario, "#11223380"));

        await expect(preview).toHaveText("#11223380");
        await expect(color).toHaveValue("#11223380");
        await expect(opacity).toHaveValue("128");
        await expect(percentage).toHaveValue("50");
        await expect(percentage).toBeFocused();

        await percentage.press(key);

        await expect(percentage).toHaveValue("50.2");
        await expect(color).toHaveValue("#11223380");

        if (key === "Enter") {
            await expect(percentage).toBeFocused();
        } else {
            await expect(percentage).not.toBeFocused();
        }

        expect(colorSettingsPanel.messages).toEqual(messages);
        expect(colorSettingsPanel.errors).toEqual([]);
    });
}

test("restores the own color after inherited and native sources", async ({page, colorSettingsPanel}) => {
    const scenario = createColorSettingsScenario();
    const source = page.getByLabel("Throwable throws source", {exact: true});
    const color = page.getByLabel("Throwable throws color", {exact: true});
    const picker = page.getByLabel("Choose Throwable throws RGB color", {exact: true});
    const opacity = page.getByRole("slider", {name: "Throwable throws opacity", exact: true});
    const percentage = page.getByLabel("Throwable throws opacity percentage", {exact: true});
    const remove = page.getByRole("button", {name: "Remove Throwable throws color from this scope", exact: true});
    const row = page.locator('[data-context="throws"]');
    const preview = row.locator("[data-preview-label]");
    const messages: ColorSettingsMessage[] = [{type: "ready"}];
    const steps = [
        {source: "inherit", value: "#CDA756", preview: "#CDA756", locked: true},
        {source: "native", value: "", preview: "Native Java", locked: true},
        {source: "custom", value: "#752CA7", preview: "#752CA7", locked: false}
    ] as const;

    await colorSettingsPanel.open(scenario);
    await expect.poll(() => [...colorSettingsPanel.messages]).toEqual(messages);
    await colorSettingsPanel.send(scenario.state);
    await expect(source).toBeEnabled();
    await expect(color).toHaveValue("#752CA7");

    for (const step of steps) {
        await source.selectOption(step.source);
        messages.push({type: "setSource", target: "user", context: "throws", source: step.source});
        await expect.poll(() => [...colorSettingsPanel.messages]).toEqual(messages);
        await colorSettingsPanel.send(
            createColorSettingsState(scenario, [{context: "throws", field: "source", value: step.source}])
        );

        await expect(source).toBeEnabled();
        await expect(preview).toHaveText(step.preview);
        await expect(color).toHaveValue(step.value);
        await expect(row.locator('[data-value-field="color"] code')).toHaveText('"#752CA7"');

        for (const control of [color, picker, opacity, percentage, remove]) {
            if (step.locked) {
                await expect(control).toBeDisabled();
            } else {
                await expect(control).toBeEnabled();
            }
        }
    }

    await expect(page.getByRole("status")).toHaveText("No unapplied changes in this scope.");
    expect(colorSettingsPanel.messages).toEqual(messages);
    expect(colorSettingsPanel.errors).toEqual([]);
});
