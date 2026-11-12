import type {ClassColorSetting, ColorSetting} from "@throwable-highlighter/settings/ThrowableColorSettings";

type LegacyColorSetting = Extract<ColorSetting, {source?: undefined}>;

export type ColorSettingParseResult<TSetting extends ColorSetting = ColorSetting> =
    | {readonly kind: "valid"; readonly setting: TSetting}
    | {readonly kind: "invalid"; readonly reason: "invalid-source" | "invalid-color" | "class-inheritance"};

export class ThrowableColorSettingParser {
    private static readonly HEX_COLOR_PATTERN = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;

    public parseLegacy(color: unknown): ColorSettingParseResult<LegacyColorSetting> {
        if (color !== undefined && typeof color !== "string") {
            return {kind: "invalid", reason: "invalid-color"};
        }

        return {kind: "valid", setting: {color}};
    }

    public parseClass(source: unknown, color: unknown): ColorSettingParseResult<ClassColorSetting> {
        const result = this.parse(source, color);

        if (result.kind === "invalid") {
            return result;
        }

        if (result.setting.source === "inherit") {
            return {kind: "invalid", reason: "class-inheritance"};
        }

        return {kind: "valid", setting: result.setting};
    }

    public parseDerived(source: unknown, color: unknown): ColorSettingParseResult {
        return this.parse(source, color);
    }

    private parse(source: unknown, color: unknown): ColorSettingParseResult {
        if (source !== "custom" && source !== "inherit" && source !== "native") {
            return {kind: "invalid", reason: "invalid-source"};
        }

        if (color !== undefined && typeof color !== "string") {
            return {kind: "invalid", reason: "invalid-color"};
        }

        if (source === "custom") {
            if (color === undefined || !ThrowableColorSettingParser.HEX_COLOR_PATTERN.test(color.trim())) {
                return {kind: "invalid", reason: "invalid-color"};
            }

            return {kind: "valid", setting: {source, color}};
        }

        return {kind: "valid", setting: {source, color}};
    }
}
