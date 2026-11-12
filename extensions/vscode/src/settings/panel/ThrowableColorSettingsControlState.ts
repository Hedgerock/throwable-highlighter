import type {
    RawColorSetting,
    RawThrowableColorSettings
} from "@throwable-highlighter/settings/ThrowableColorConfiguration";

export type ColorSettingsFieldState = {
    readonly canRevert: boolean;
    readonly canRemove: boolean;
};

export type ColorSettingControlState = Readonly<Record<keyof RawColorSetting, ColorSettingsFieldState>>;

export type ThrowableColorSettingsControlState = Readonly<
    Record<keyof RawThrowableColorSettings, ColorSettingControlState>
>;
