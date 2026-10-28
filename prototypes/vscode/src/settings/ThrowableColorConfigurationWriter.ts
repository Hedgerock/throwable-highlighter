import * as vscode from "vscode";

import type {
    ColorSettingChange,
    ColorSettingsTarget
} from "@throwable-highlighter/settings/ThrowableColorSettingsDraft";

export type ColorSettingsWriteResult =
    | {readonly kind: "success"; readonly written: readonly ColorSettingChange[]}
    | {
          readonly kind: "failed";
          readonly written: readonly ColorSettingChange[];
          readonly failed: ColorSettingChange;
          readonly pending: readonly ColorSettingChange[];
          readonly error: unknown;
      };

export class ThrowableColorConfigurationWriter {
    public async write(
        configuration: Pick<vscode.WorkspaceConfiguration, "update">,
        target: ColorSettingsTarget,
        changes: readonly ColorSettingChange[]
    ): Promise<ColorSettingsWriteResult> {
        const requested = changes.map(change => ({...change}));
        const written: ColorSettingChange[] = [];
        const configurationTarget =
            target === "user" ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace;

        for (let index = 0; index < requested.length; index++) {
            const change = requested[index];
            const key = change.context + (change.field === "source" ? "ColorSource" : "Color");

            try {
                await configuration.update(key, change.value, configurationTarget, false);
            } catch (error) {
                return {
                    kind: "failed",
                    written,
                    failed: change,
                    pending: requested.slice(index + 1),
                    error
                };
            }

            written.push(change);
        }

        return {kind: "success", written};
    }
}
