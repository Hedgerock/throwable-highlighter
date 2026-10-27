import type {ColorSettingParseResult} from "@throwable-highlighter/settings/ThrowableColorSettingParser";
import type {ThrowableColorSettings} from "@throwable-highlighter/settings/ThrowableColorSettings";

export type ColorSettingPreview =
    | {readonly kind: "color"; readonly color: string}
    | {readonly kind: "native"}
    | {
          readonly kind: "invalid";
          readonly context: keyof ThrowableColorSettings;
          readonly reason: Extract<ColorSettingParseResult, {kind: "invalid"}>["reason"];
      };

export type ThrowableColorSettingsPreview = Readonly<Record<keyof ThrowableColorSettings, ColorSettingPreview>>;
