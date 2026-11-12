import type {
    ParsedThrowableColorSettings,
    RawThrowableColorSettings
} from "@throwable-highlighter/settings/ThrowableColorConfiguration";
import type {ColorSettingsTarget} from "@throwable-highlighter/settings/ThrowableColorSettingsDraft";

export type ThrowableColorSettingsViewModel = {
    readonly target: ColorSettingsTarget;
    readonly workspaceAvailable: boolean;
    readonly scoped: RawThrowableColorSettings;
    readonly effective: ParsedThrowableColorSettings;
};
