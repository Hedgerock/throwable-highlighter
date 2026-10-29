import {ThrowableColorSettingsControlStateBuilder} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsControlStateBuilder";
import {ThrowableColorSettingsPreviewBuilder} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsPreviewBuilder";
import {ThrowableColorSettingsDraft} from "@throwable-highlighter/settings/ThrowableColorSettingsDraft";
import {ThrowableColorSettingsParser} from "@throwable-highlighter/settings/ThrowableColorSettingsParser";
import type {ColorSettingsDraftStateMessage} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsMessage";
import type {ThrowableColorSettingsViewModel} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsViewModel";
import type {RawThrowableColorSettings} from "@throwable-highlighter/settings/ThrowableColorConfiguration";

export type ColorSettingsScenario = {
    readonly model: ThrowableColorSettingsViewModel;
    readonly state: ColorSettingsDraftStateMessage;
};

export function createColorSettingsScenario(): ColorSettingsScenario {
    const saved: RawThrowableColorSettings = {
        class: {source: "custom", color: "#CDA756"},
        import: {source: "inherit", color: "#C586C0"},
        catch: {source: "native", color: undefined},
        throws: {source: "custom", color: "#752CA7"}
    };

    const effective = new ThrowableColorSettingsParser().parse(saved);

    return {
        model: {
            target: "user",
            workspaceAvailable: true,
            scoped: saved,
            effective
        },
        state: {
            type: "draftState",
            target: "user",
            isDirty: false,
            isApplying: false,
            controls: new ThrowableColorSettingsControlStateBuilder().build(saved, saved),
            preview: new ThrowableColorSettingsPreviewBuilder().build(effective)
        }
    };
}

export function createClassColorState(scenario: ColorSettingsScenario, color: string): ColorSettingsDraftStateMessage {
    const draft = new ThrowableColorSettingsDraft(scenario.model.target, scenario.model.scoped);
    draft.update("class", "color", color);

    const current = draft.read();
    const effective = new ThrowableColorSettingsParser().parse(current);

    return {
        ...scenario.state,
        isDirty: draft.isDirty,
        controls: new ThrowableColorSettingsControlStateBuilder().build(current, scenario.model.scoped),
        preview: new ThrowableColorSettingsPreviewBuilder().build(effective)
    };
}
