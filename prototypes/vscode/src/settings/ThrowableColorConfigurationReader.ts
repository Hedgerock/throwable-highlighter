import type vscode from "vscode";

import {ThrowableColorSettingsParser} from "@throwable-highlighter/settings/ThrowableColorSettingsParser";
import type {
    RawColorSetting,
    RawThrowableColorSettings,
    ThrowableColorConfigurationSnapshot
} from "@throwable-highlighter/settings/ThrowableColorConfiguration";

export class ThrowableColorConfigurationReader {
    constructor(private readonly parser = new ThrowableColorSettingsParser()) {}

    public read(
        configuration: Pick<vscode.WorkspaceConfiguration, "get" | "inspect">
    ): ThrowableColorConfigurationSnapshot {
        const effective = this.readSettings(key => configuration.get<unknown>(key));

        return {
            effective: this.parser.parse(effective),
            defaults: this.readSettings(key => configuration.inspect<unknown>(key)?.defaultValue),
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
}
