import type {
    ColorSettingControlState,
    ColorSettingsFieldState,
    ThrowableColorSettingsControlState
} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsControlState";
import type {
    RawColorSetting,
    RawThrowableColorSettings
} from "@throwable-highlighter/settings/ThrowableColorConfiguration";

export class ThrowableColorSettingsControlStateBuilder {
    public build(
        current: RawThrowableColorSettings,
        saved: RawThrowableColorSettings
    ): ThrowableColorSettingsControlState {
        return {
            class: this.buildContextState(current.class, saved.class),
            import: this.buildContextState(current.import, saved.import),
            catch: this.buildContextState(current.catch, saved.catch),
            throws: this.buildContextState(current.throws, saved.throws)
        };
    }

    private buildContextState(current: RawColorSetting, saved: RawColorSetting): ColorSettingControlState {
        return {
            source: this.buildFieldState(current.source, saved.source),
            color: this.buildFieldState(current.color, saved.color)
        };
    }

    private buildFieldState(current: unknown, saved: unknown): ColorSettingsFieldState {
        return {
            canRevert: !Object.is(current, saved),
            canRemove: current !== undefined
        };
    }
}
