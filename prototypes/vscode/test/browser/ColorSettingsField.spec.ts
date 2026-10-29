import type {ColorSettingsMessage} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsMessage";

import {expect, test} from "./support/colorSettingsPanelFixture";
import {
    createClassColorState,
    createColorSettingsScenario,
    createColorSettingsState
} from "./support/colorSettingsScenario";

test("removes a draft color and restores its saved value", async ({page, colorSettingsPanel}) => {
    const scenario = createColorSettingsScenario();
    const row = page.locator('[data-context="throws"]');
    const color = page.getByLabel("Throwable throws color", {exact: true});
    const remove = page.getByRole("button", {name: "Remove Throwable throws color from this scope", exact: true});
    const revert = page.getByRole("button", {name: "Revert Throwable throws color to its saved value", exact: true});
    const preview = row.locator("[data-preview-label]");
    const ownValue = row.locator('[data-value-field="color"] code');
    const messages: ColorSettingsMessage[] = [{type: "ready"}];

    await colorSettingsPanel.open(scenario);
    await expect.poll(() => [...colorSettingsPanel.messages]).toEqual(messages);
    await colorSettingsPanel.send(scenario.state);
    await expect(remove).toBeEnabled();
    await expect(revert).toBeDisabled();

    await remove.click();
    messages.push({type: "resetField", target: "user", context: "throws", field: "color"});
    await expect.poll(() => [...colorSettingsPanel.messages]).toEqual(messages);
    await colorSettingsPanel.send(
        createColorSettingsState(scenario, [{context: "throws", field: "color", value: undefined}])
    );

    await expect(preview).toHaveText("Invalid");
    await expect(color).toHaveValue("");
    await expect(ownValue).toHaveText("Not set in this scope");
    await expect(remove).toBeDisabled();
    await expect(revert).toBeEnabled();

    await revert.click();
    messages.push({type: "revertField", target: "user", context: "throws", field: "color"});
    await expect.poll(() => [...colorSettingsPanel.messages]).toEqual(messages);
    await colorSettingsPanel.send({
        ...scenario.state,
        type: "fieldReverted",
        context: "throws",
        field: "color",
        value: "#752CA7"
    });

    await expect(preview).toHaveText("#752CA7");
    await expect(color).toHaveValue("#752CA7");
    await expect(ownValue).toHaveText('"#752CA7"');
    await expect(remove).toBeEnabled();
    await expect(revert).toBeDisabled();
    await expect(page.getByLabel("Choose Throwable throws RGB color", {exact: true})).toHaveValue("#752ca7");
    await expect(page.getByRole("slider", {name: "Throwable throws opacity", exact: true})).toBeEnabled();
    await expect(page.getByLabel("Throwable throws opacity percentage", {exact: true})).toHaveValue("100");
    await expect(page.getByRole("status")).toHaveText("No unapplied changes in this scope.");
    expect(colorSettingsPanel.messages).toEqual(messages);
    expect(colorSettingsPanel.errors).toEqual([]);
});

test("preserves another context when reverting a color", async ({page, colorSettingsPanel}) => {
    const scenario = createColorSettingsScenario();
    const classColor = page.getByLabel("Throwable class color", {exact: true});
    const throwsColor = page.getByLabel("Throwable throws color", {exact: true});
    const classPreview = page.locator('[data-context="class"] [data-preview-label]');
    const throwsPreview = page.locator('[data-context="throws"] [data-preview-label]');
    const revert = page.getByRole("button", {name: "Revert Throwable throws color to its saved value", exact: true});
    const messages: ColorSettingsMessage[] = [{type: "ready"}];

    await colorSettingsPanel.open(scenario);
    await expect.poll(() => [...colorSettingsPanel.messages]).toEqual(messages);
    await colorSettingsPanel.send(scenario.state);
    await expect(classColor).toBeEnabled();

    await classColor.fill("#11223380");
    messages.push({type: "setColor", target: "user", context: "class", color: "#11223380"});
    await expect.poll(() => [...colorSettingsPanel.messages]).toEqual(messages);
    await colorSettingsPanel.send(createClassColorState(scenario, "#11223380"));
    await expect(classPreview).toHaveText("#11223380");

    await throwsColor.fill("#abcdef44");
    messages.push({type: "setColor", target: "user", context: "throws", color: "#abcdef44"});
    await expect.poll(() => [...colorSettingsPanel.messages]).toEqual(messages);
    await colorSettingsPanel.send(
        createColorSettingsState(scenario, [
            {context: "class", field: "color", value: "#11223380"},
            {context: "throws", field: "color", value: "#abcdef44"}
        ])
    );
    await expect(throwsPreview).toHaveText("#abcdef44");
    await expect(revert).toBeEnabled();

    await revert.click();
    messages.push({type: "revertField", target: "user", context: "throws", field: "color"});
    await expect.poll(() => [...colorSettingsPanel.messages]).toEqual(messages);
    await colorSettingsPanel.send({
        ...createClassColorState(scenario, "#11223380"),
        type: "fieldReverted",
        context: "throws",
        field: "color",
        value: "#752CA7"
    });

    await expect(throwsColor).toHaveValue("#752CA7");
    await expect(throwsPreview).toHaveText("#752CA7");
    await expect(revert).toBeDisabled();
    await expect(classColor).toHaveValue("#11223380");
    await expect(classPreview).toHaveText("#11223380");
    await expect(page.locator("#apply-draft")).toBeEnabled();
    await expect(page.getByRole("button", {name: "Discard changes", exact: true})).toBeEnabled();
    await expect(page.getByRole("status")).toHaveText("Unapplied changes in this scope.");
    expect(colorSettingsPanel.messages).toEqual(messages);
    expect(colorSettingsPanel.errors).toEqual([]);
});

test("restores the source after removing its scoped setting", async ({page, colorSettingsPanel}) => {
    const scenario = createColorSettingsScenario();
    const source = page.getByLabel("Throwable throws source", {exact: true});
    const color = page.getByLabel("Throwable throws color", {exact: true});
    const revert = page.getByRole("button", {name: "Revert Throwable throws source to its saved value", exact: true});
    const sourceValue = page.locator('[data-context="throws"] [data-value-field="source"] code');
    const messages: ColorSettingsMessage[] = [{type: "ready"}];

    await colorSettingsPanel.open(scenario);
    await expect.poll(() => [...colorSettingsPanel.messages]).toEqual(messages);
    await colorSettingsPanel.send(scenario.state);
    await expect(source).toBeEnabled();
    await expect(revert).toBeDisabled();

    await source.selectOption("");
    messages.push({type: "resetField", target: "user", context: "throws", field: "source"});
    await expect.poll(() => [...colorSettingsPanel.messages]).toEqual(messages);
    await colorSettingsPanel.send(
        createColorSettingsState(scenario, [{context: "throws", field: "source", value: undefined}])
    );

    await expect(source).toHaveValue("");
    await expect(sourceValue).toHaveText("Not set in this scope");
    await expect(color).toHaveValue("#752CA7");
    await expect(revert).toBeEnabled();

    await revert.click();
    messages.push({type: "revertField", target: "user", context: "throws", field: "source"});
    await expect.poll(() => [...colorSettingsPanel.messages]).toEqual(messages);
    await colorSettingsPanel.send({
        ...scenario.state,
        type: "fieldReverted",
        context: "throws",
        field: "source",
        value: "custom"
    });

    await expect(source).toHaveValue("custom");
    await expect(sourceValue).toHaveText('"custom"');
    await expect(color).toHaveValue("#752CA7");
    await expect(revert).toBeDisabled();
    await expect(page.getByRole("status")).toHaveText("No unapplied changes in this scope.");
    expect(colorSettingsPanel.messages).toEqual(messages);
    expect(colorSettingsPanel.errors).toEqual([]);
});
