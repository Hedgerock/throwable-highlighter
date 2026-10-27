import type {ThrowableColorSettingsControlState} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsControlState";
import type {ThrowableColorSettingsPreview} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsPreview";
import type {
    ClassColorSetting,
    ColorSetting,
    ThrowableColorSettings
} from "@throwable-highlighter/settings/ThrowableColorSettings";
import type {
    ColorSettingChange,
    ColorSettingsTarget
} from "@throwable-highlighter/settings/ThrowableColorSettingsDraft";

type ColorContext = keyof ThrowableColorSettings;

type ScopedMessage = {
    readonly target: ColorSettingsTarget;
};

type ContextMessage = ScopedMessage & {
    readonly context: ColorContext;
};

type SourceMessage = ScopedMessage & {
    readonly type: "setSource";
} & (
        | {readonly context: "class"; readonly source: Exclude<ClassColorSetting["source"], undefined>}
        | {
              readonly context: Exclude<ColorContext, "class">;
              readonly source: Exclude<ColorSetting["source"], undefined>;
          }
    );

export type ColorSettingsDraftState = {
    readonly isDirty: boolean;
    readonly controls: ThrowableColorSettingsControlState;
    readonly preview: ThrowableColorSettingsPreview;
};

export type ColorSettingsDraftStateMessage = ScopedMessage &
    ColorSettingsDraftState & {
        readonly type: "draftState";
    };

export type ColorSettingsMessage =
    | {readonly type: "ready"}
    | SourceMessage
    | (ContextMessage & {readonly type: "setColor"; readonly color: string})
    | (ContextMessage & {readonly type: "resetField" | "revertField"; readonly field: ColorSettingChange["field"]})
    | (ScopedMessage & {readonly type: "selectTarget" | "discard" | "apply"});

export type ColorSettingsMessageParseResult =
    {readonly kind: "valid"; readonly message: ColorSettingsMessage} | {readonly kind: "invalid"};

export type ColorSettingsFieldRevertedMessage = ContextMessage &
    ColorSettingsDraftState & {
        readonly type: "fieldReverted";
        readonly field: ColorSettingChange["field"];
        readonly value: unknown;
    };
