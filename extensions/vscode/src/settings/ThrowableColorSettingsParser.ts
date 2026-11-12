import {ThrowableColorSettingParser} from "@throwable-highlighter/settings/ThrowableColorSettingParser";
import type {
    ParsedThrowableColorSettings,
    RawColorSetting,
    RawThrowableColorSettings
} from "@throwable-highlighter/settings/ThrowableColorConfiguration";
import type {ColorSettingParseResult} from "@throwable-highlighter/settings/ThrowableColorSettingParser";

export class ThrowableColorSettingsParser {
    constructor(private readonly parser = new ThrowableColorSettingParser()) {}

    public parse(settings: RawThrowableColorSettings): ParsedThrowableColorSettings {
        const classSetting = settings.class;

        return {
            class: this.isLegacySource(classSetting.source)
                ? this.parser.parseLegacy(classSetting.color)
                : this.parser.parseClass(classSetting.source, classSetting.color),
            import: this.parseDerived(settings.import),
            catch: this.parseDerived(settings.catch),
            throws: this.parseDerived(settings.throws)
        };
    }

    private parseDerived(setting: RawColorSetting): ColorSettingParseResult {
        return this.isLegacySource(setting.source)
            ? this.parser.parseLegacy(setting.color)
            : this.parser.parseDerived(setting.source, setting.color);
    }

    private isLegacySource(source: unknown): boolean {
        return source === undefined || source === null;
    }
}
