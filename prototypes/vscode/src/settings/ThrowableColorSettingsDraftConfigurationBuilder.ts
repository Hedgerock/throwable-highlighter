import {ThrowableColorSettingsParser} from "@throwable-highlighter/settings/ThrowableColorSettingsParser";
import type {
    ParsedThrowableColorSettings,
    RawColorSetting,
    RawThrowableColorSettings,
    ThrowableColorConfigurationSnapshot
} from "@throwable-highlighter/settings/ThrowableColorConfiguration";
import type {
    ColorSettingChange,
    ColorSettingsTarget
} from "@throwable-highlighter/settings/ThrowableColorSettingsDraft";

export class ThrowableColorSettingsDraftConfigurationBuilder {
    constructor(private readonly parser = new ThrowableColorSettingsParser()) {}

    public build(
        snapshot: ThrowableColorConfigurationSnapshot,
        target: ColorSettingsTarget,
        changes: readonly ColorSettingChange[]
    ): ParsedThrowableColorSettings {
        return this.buildConfiguration(snapshot, target, changes, true);
    }

    public buildForTarget(
        snapshot: ThrowableColorConfigurationSnapshot,
        target: ColorSettingsTarget,
        changes: readonly ColorSettingChange[]
    ): ParsedThrowableColorSettings {
        return this.buildConfiguration(snapshot, target, changes, target === "workspace");
    }

    private buildConfiguration(
        snapshot: ThrowableColorConfigurationSnapshot,
        target: ColorSettingsTarget,
        changes: readonly ColorSettingChange[],
        includesWorkspace: boolean
    ): ParsedThrowableColorSettings {
        const scoped = this.applyChanges(snapshot[target], changes);
        const user = target === "user" ? scoped : snapshot.user;
        const workspace = target === "workspace" ? scoped : snapshot.workspace;
        const settings = this.merge(snapshot.defaults, user);

        return this.parser.parse(includesWorkspace ? this.merge(settings, workspace) : settings);
    }

    private applyChanges(
        settings: RawThrowableColorSettings,
        changes: readonly ColorSettingChange[]
    ): RawThrowableColorSettings {
        let current = settings;

        for (const {context, field, value} of changes) {
            current = {
                ...current,
                [context]: {...current[context], [field]: value}
            };
        }

        return current;
    }

    private merge(base: RawThrowableColorSettings, override: RawThrowableColorSettings): RawThrowableColorSettings {
        return {
            class: this.mergeSetting(base.class, override.class),
            import: this.mergeSetting(base.import, override.import),
            catch: this.mergeSetting(base.catch, override.catch),
            throws: this.mergeSetting(base.throws, override.throws)
        };
    }

    private mergeSetting(base: RawColorSetting, override: RawColorSetting): RawColorSetting {
        return {
            source: override.source === undefined ? base.source : override.source,
            color: override.color === undefined ? base.color : override.color
        };
    }
}
