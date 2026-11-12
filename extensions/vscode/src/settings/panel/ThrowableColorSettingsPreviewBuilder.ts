import {ThrowableColorResolver} from "@throwable-highlighter/settings/ThrowableColorResolver";
import type {
    ColorSettingPreview,
    ThrowableColorSettingsPreview
} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsPreview";
import type {ParsedThrowableColorSettings} from "@throwable-highlighter/settings/ThrowableColorConfiguration";
import type {ColorSettingParseResult} from "@throwable-highlighter/settings/ThrowableColorSettingParser";
import type {ThrowableColorSettings} from "@throwable-highlighter/settings/ThrowableColorSettings";

export class ThrowableColorSettingsPreviewBuilder {
    constructor(private readonly colorResolver = new ThrowableColorResolver()) {}

    public build(settings: ParsedThrowableColorSettings): ThrowableColorSettingsPreview {
        const colors = this.colorResolver.resolve({
            class: settings.class.kind === "valid" ? settings.class.setting : {source: "native"},
            import: settings.import.kind === "valid" ? settings.import.setting : {source: "native"},
            catch: settings.catch.kind === "valid" ? settings.catch.setting : {source: "native"},
            throws: settings.throws.kind === "valid" ? settings.throws.setting : {source: "native"}
        });

        const classPreview = this.createPreview("class", settings.class, colors.class);

        return {
            class: classPreview,
            import: this.createDerivedPreview("import", settings.import, colors.import, classPreview),
            catch: this.createDerivedPreview("catch", settings.catch, colors.catch, classPreview),
            throws: this.createDerivedPreview("throws", settings.throws, colors.throws, classPreview)
        };
    }

    private createDerivedPreview(
        context: Exclude<keyof ThrowableColorSettings, "class">,
        result: ColorSettingParseResult,
        color: string | undefined,
        classPreview: ColorSettingPreview
    ): ColorSettingPreview {
        if (
            result.kind === "valid" &&
            (result.setting.source === "inherit" ||
                (result.setting.source === undefined && !result.setting.color?.trim()))
        ) {
            return classPreview;
        }

        return this.createPreview(context, result, color);
    }

    private createPreview(
        context: keyof ThrowableColorSettings,
        result: ColorSettingParseResult,
        color: string | undefined
    ): ColorSettingPreview {
        if (result.kind === "invalid") {
            return {kind: "invalid", context, reason: result.reason};
        }

        return color === undefined ? {kind: "native"} : {kind: "color", color};
    }
}
