import {expect, test} from "./support/colorSettingsPanelFixture";
import {createClassColorState, createColorSettingsScenario} from "./support/colorSettingsScenario";

test("loads the real panel and accepts initial draft state", async ({page, colorSettingsPanel}) => {
    const scenario = createColorSettingsScenario();
    const importPreview = page.locator(`[data-context="import"] [data-preview-label]`);

    await colorSettingsPanel.open(scenario);

    await expect(page.getByRole("heading", {name: "Throwable Highlighter", exact: true})).toBeVisible();
    await expect(page.locator("tbody tr[data-context]")).toHaveCount(4);
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(30, 30, 30)");
    await expect.poll(() => [...colorSettingsPanel.messages]).toEqual([{type: "ready"}]);
    await expect(importPreview).toHaveText("Loading...");

    await colorSettingsPanel.send(scenario.state);

    await expect(page.getByLabel("Settings scope")).toBeEnabled();
    await expect(page.getByLabel("Throwable class source", {exact: true})).toBeEnabled();
    await expect(page.getByLabel("Throwable class color", {exact: true})).toBeEnabled();
    await expect(page.getByLabel("Throwable class color", {exact: true})).toHaveValue("#CDA756");
    await expect(page.getByLabel("Throwable import color", {exact: true})).toBeDisabled();
    await expect(page.getByLabel("Throwable import color", {exact: true})).toHaveValue("#CDA756");
    await expect(importPreview).toHaveText("#CDA756");
    await expect(page.getByRole("status")).toHaveText("No unapplied changes in this scope.");
    await expect(page.getByRole("button", {name: "Apply", exact: true})).toBeDisabled();
    await expect(page.getByRole("button", {name: "Discard changes", exact: true})).toBeDisabled();
    expect(colorSettingsPanel.errors).toEqual([]);
});

test("preserves incomplete color text and focus after acknowledgements", async ({page, colorSettingsPanel}) => {
    const scenario = createColorSettingsScenario();
    const color = page.getByLabel("Throwable class color", {exact: true});
    const preview = page.locator('[data-context="class"] [data-preview-label]');

    await colorSettingsPanel.open(scenario);
    await expect.poll(() => [...colorSettingsPanel.messages]).toEqual([{type: "ready"}]);
    await colorSettingsPanel.send(scenario.state);
    await expect(color).toBeEnabled();

    await color.fill("#aB");

    await expect
        .poll(() => [...colorSettingsPanel.messages])
        .toEqual([{type: "ready"}, {type: "setColor", target: "user", context: "class", color: "#aB"}]);
    await colorSettingsPanel.send(createClassColorState(scenario, "#aB"));

    await expect(preview).toHaveText("Invalid");
    await expect(color).toHaveValue("#aB");
    await expect(color).toBeFocused();

    await color.pressSequentially("c");

    await expect
        .poll(() => [...colorSettingsPanel.messages])
        .toEqual([
            {type: "ready"},
            {type: "setColor", target: "user", context: "class", color: "#aB"},
            {type: "setColor", target: "user", context: "class", color: "#aBc"}
        ]);
    await colorSettingsPanel.send(createClassColorState(scenario, "#aBc"));

    await expect(preview).toHaveText("#aBc");
    await expect(color).toHaveValue("#aBc");
    await expect(color).toBeFocused();
    expect(colorSettingsPanel.errors).toEqual([]);
});

test("keeps actions enabled while edits and acknowledgements are pending", async ({page, colorSettingsPanel}) => {
    const scenario = createColorSettingsScenario();
    const color = page.getByLabel("Throwable class color", {exact: true});
    const preview = page.locator('[data-context="class"] [data-preview-label]');
    const apply = page.getByRole("button", {name: "Apply", exact: true});
    const discard = page.getByRole("button", {name: "Discard changes", exact: true});
    const scope = page.getByLabel("Settings scope");

    await colorSettingsPanel.open(scenario);
    await expect.poll(() => [...colorSettingsPanel.messages]).toEqual([{type: "ready"}]);
    await colorSettingsPanel.send(scenario.state);
    await expect(color).toBeEnabled();

    await color.fill("#111111");

    await expect(apply).toBeEnabled();
    await expect(discard).toBeEnabled();
    await expect(scope).toBeEnabled();

    const transitions = await page.evaluateHandle(() => {
        const disabledControls: string[] = [];
        const watchedIds = new Set(["apply-draft", "discard-draft", "settings-target"]);
        const observer = new MutationObserver(records => {
            for (const record of records) {
                if (
                    record.oldValue === null &&
                    record.target instanceof HTMLElement &&
                    watchedIds.has(record.target.id)
                ) {
                    disabledControls.push(record.target.id);
                }
            }
        });

        observer.observe(document.body, {
            subtree: true,
            attributes: true,
            attributeFilter: ["disabled"],
            attributeOldValue: true
        });

        return {disabledControls, observer};
    });

    await color.fill("#CDA756");
    await color.fill("#222222");

    await expect
        .poll(() => [...colorSettingsPanel.messages])
        .toEqual([
            {type: "ready"},
            {type: "setColor", target: "user", context: "class", color: "#111111"},
            {type: "setColor", target: "user", context: "class", color: "#CDA756"},
            {type: "setColor", target: "user", context: "class", color: "#222222"}
        ]);

    for (const acknowledgedColor of ["#111111", "#CDA756", "#222222"]) {
        await colorSettingsPanel.send(createClassColorState(scenario, acknowledgedColor));

        await expect(preview).toHaveText(acknowledgedColor);
        await expect(color).toHaveValue("#222222");
        await expect(apply).toBeEnabled();
        await expect(discard).toBeEnabled();
        await expect(scope).toBeEnabled();
    }

    const disabledControls = await transitions.evaluate(({disabledControls, observer}) => {
        observer.disconnect();

        return disabledControls;
    });
    await transitions.dispose();

    expect(disabledControls).toEqual([]);
    expect(colorSettingsPanel.errors).toEqual([]);
});

test("cancels queued Apply when the final acknowledgement contains no changes", async ({page, colorSettingsPanel}) => {
    const scenario = createColorSettingsScenario();
    const savedColor = "#CDA756";
    const color = page.getByLabel("Throwable class color", {exact: true});
    const preview = page.locator('[data-context="class"] [data-preview-label]');
    const apply = page.getByRole("button", {name: "Apply", exact: true});
    const discard = page.getByRole("button", {name: "Discard changes", exact: true});
    const scope = page.getByLabel("Settings scope");
    const edits = [
        {type: "ready"},
        {type: "setColor", target: "user", context: "class", color: "#111111"},
        {type: "setColor", target: "user", context: "class", color: savedColor}
    ];

    await colorSettingsPanel.open(scenario);
    await expect.poll(() => [...colorSettingsPanel.messages]).toEqual([{type: "ready"}]);
    await colorSettingsPanel.send(scenario.state);
    await expect(color).toBeEnabled();

    await color.fill("#111111");
    await color.fill(savedColor);
    await expect.poll(() => [...colorSettingsPanel.messages]).toEqual(edits);
    await apply.click();

    await colorSettingsPanel.send(createClassColorState(scenario, "#111111"));

    await expect(preview).toHaveText("#111111");
    await expect(color).toBeDisabled();
    await expect(scope).toBeDisabled();
    expect(colorSettingsPanel.messages).toEqual(edits);

    await colorSettingsPanel.send(createClassColorState(scenario, savedColor));

    await expect(preview).toHaveText(savedColor);
    await expect(color).toHaveValue(savedColor);
    await expect(color).toBeEnabled();
    await expect(scope).toBeEnabled();
    await expect(scope).toHaveValue("user");
    await expect(apply).toBeDisabled();
    await expect(apply).toHaveText("Apply");
    await expect(discard).toBeDisabled();
    await expect(page.getByRole("status")).toHaveText("No unapplied changes in this scope.");
    expect(colorSettingsPanel.messages).toEqual(edits);
    expect(colorSettingsPanel.errors).toEqual([]);
});

const pendingActions = [
    {
        name: "waits for every edit before applying the draft",
        type: "apply",
        target: "user",
        status: "Applying changes in this scope..."
    },
    {
        name: "waits for every edit before discarding the draft",
        type: "discard",
        target: "user",
        status: "Loading settings scope..."
    },
    {
        name: "preserves the current scope until every edit is acknowledged",
        type: "selectTarget",
        target: "workspace",
        status: "Loading settings scope..."
    }
] as const;

for (const action of pendingActions) {
    test(action.name, async ({page, colorSettingsPanel}) => {
        const scenario = createColorSettingsScenario();
        const color = page.getByLabel("Throwable class color", {exact: true});
        const preview = page.locator('[data-context="class"] [data-preview-label]');
        const scope = page.getByLabel("Settings scope");
        const apply = page.locator("#apply-draft");
        const discard = page.getByRole("button", {name: "Discard changes", exact: true});
        const enabledFields = page.locator("tbody select:enabled, tbody input:enabled, tbody button:enabled");
        const edits = [
            {type: "ready"},
            {type: "setColor", target: "user", context: "class", color: "#111111"},
            {type: "setColor", target: "user", context: "class", color: "#222222"}
        ];

        await colorSettingsPanel.open(scenario);
        await expect.poll(() => [...colorSettingsPanel.messages]).toEqual([{type: "ready"}]);
        await colorSettingsPanel.send(scenario.state);
        await expect(color).toBeEnabled();

        await color.fill("#111111");
        await color.fill("#222222");
        await expect.poll(() => [...colorSettingsPanel.messages]).toEqual(edits);

        if (action.type === "apply") {
            await apply.click();
        } else if (action.type === "discard") {
            await discard.click();
        } else {
            await scope.selectOption("workspace");
        }

        await expect(scope).toHaveValue("user");
        await expect(scope).toBeDisabled();
        await expect(apply).toBeDisabled();
        await expect(discard).toBeDisabled();
        await expect(enabledFields).toHaveCount(0);
        await expect(page.getByRole("status")).toHaveText("Unapplied changes in this scope.");
        expect(colorSettingsPanel.messages).toEqual(edits);

        await colorSettingsPanel.send(createClassColorState(scenario, "#111111"));

        await expect(preview).toHaveText("#111111");
        await expect(color).toHaveValue("#222222");
        await expect(scope).toHaveValue("user");
        await expect(scope).toBeDisabled();
        await expect(apply).toBeDisabled();
        await expect(discard).toBeDisabled();
        await expect(enabledFields).toHaveCount(0);
        await expect(page.getByRole("status")).toHaveText("Unapplied changes in this scope.");
        expect(colorSettingsPanel.messages).toEqual(edits);

        await colorSettingsPanel.send(createClassColorState(scenario, "#222222"));

        await expect
            .poll(() => [...colorSettingsPanel.messages])
            .toEqual([...edits, {type: action.type, target: action.target}]);
        await expect(scope).toHaveValue(action.target);
        await expect(scope).toBeDisabled();
        await expect(apply).toBeDisabled();
        await expect(discard).toBeDisabled();
        await expect(enabledFields).toHaveCount(0);
        await expect(page.getByRole("status")).toHaveText(action.status);
        expect(colorSettingsPanel.errors).toEqual([]);

        await expect(apply).toHaveText(action.type === "apply" ? "Applying..." : "Apply");
    });
}
