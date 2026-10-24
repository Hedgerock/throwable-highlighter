import type {ThrowableColorSettingsViewModel} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsViewModel";
import type {ThrowableColorConfigurationSnapshot} from "@throwable-highlighter/settings/ThrowableColorConfiguration";
import type {ColorSettingsTarget} from "@throwable-highlighter/settings/ThrowableColorSettingsDraft";

export class ThrowableColorSettingsViewModelBuilder {
    public build(
        snapshot: ThrowableColorConfigurationSnapshot,
        requestedTarget: ColorSettingsTarget,
        workspaceAvailable: boolean
    ): ThrowableColorSettingsViewModel {
        const target = requestedTarget === "workspace" && !workspaceAvailable ? "user" : requestedTarget;

        return {
            target,
            workspaceAvailable,
            scoped: snapshot[target],
            effective: snapshot.effective
        };
    }
}
