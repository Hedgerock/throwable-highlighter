import type vscode from "vscode";

import {ThrowableColorSettingParser} from "@throwable-highlighter/settings/ThrowableColorSettingParser";
import type {
    ParsedThrowableColorSettings,
    RawColorSetting,
    RawThrowableColorSettings,
    ThrowableColorConfigurationSnapshot
} from "@throwable-highlighter/settings/ThrowableColorConfiguration";
import type {ColorSettingParseResult} from "@throwable-highlighter/settings/ThrowableColorSettingParser";

export class ThrowableColorConfigurationReader {
    constructor(private readonly parser = new ThrowableColorSettingParser()) {}

    public read(
        configuration: Pick<vscode.WorkspaceConfiguration, "get" | "inspect">
    ): ThrowableColorConfigurationSnapshot {
        const effective = this.readSettings(key => configuration.get<unknown>(key));

        return {
            effective: this.parseSettings(effective),
            user: this.readSettings(key => configuration.inspect<unknown>(key)?.globalValue),
            workspace: this.readSettings(key => configuration.inspect<unknown>(key)?.workspaceValue)
        };
    }

    private readSettings(readValue: (key: string) => unknown): RawThrowableColorSettings {
        return {
            class: this.readSetting(readValue, "class"),
            import: this.readSetting(readValue, "import"),
            catch: this.readSetting(readValue, "catch"),
            throws: this.readSetting(readValue, "throws")
        };
    }

    private readSetting(
        readValue: (key: string) => unknown,
        context: keyof RawThrowableColorSettings
    ): RawColorSetting {
        return {
            source: readValue(context + "ColorSource"),
            color: readValue(context + "Color")
        };
    }

    private parseSettings(settings: RawThrowableColorSettings): ParsedThrowableColorSettings {
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
