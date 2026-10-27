import type {ColorSettingParseResult} from "@throwable-highlighter/settings/ThrowableColorSettingParser";
import type {ThrowableColorSettings} from "@throwable-highlighter/settings/ThrowableColorSettings";

export type RawColorSetting = {
    readonly source: unknown;
    readonly color: unknown;
};

export type RawThrowableColorSettings = Readonly<Record<keyof ThrowableColorSettings, RawColorSetting>>;

export type ParsedThrowableColorSettings = {
    readonly [TContext in keyof ThrowableColorSettings]: ColorSettingParseResult<ThrowableColorSettings[TContext]>;
};

export type ThrowableColorConfigurationSnapshot = {
    readonly effective: ParsedThrowableColorSettings;
    readonly defaults: RawThrowableColorSettings;
    readonly user: RawThrowableColorSettings;
    readonly workspace: RawThrowableColorSettings;
};
