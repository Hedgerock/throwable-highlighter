import type {ColorSettingsMessageParseResult} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsMessage";
import type {ColorSetting, ThrowableColorSettings} from "@throwable-highlighter/settings/ThrowableColorSettings";
import type {ColorSettingsTarget} from "@throwable-highlighter/settings/ThrowableColorSettingsDraft";

export class ThrowableColorSettingsMessageParser {
    public parse(value: unknown, workspaceAvailable: boolean): ColorSettingsMessageParseResult {
        if (!this.isRecord(value)) {
            return {kind: "invalid"};
        }

        if (value.type === "ready") {
            return this.hasKeys(value, ["type"]) ? {kind: "valid", message: {type: "ready"}} : {kind: "invalid"};
        }

        if (!this.isTarget(value.target, workspaceAvailable)) {
            return {kind: "invalid"};
        }

        const target = value.target;

        if (value.type === "selectTarget" || value.type === "apply" || value.type === "discard") {
            return this.hasKeys(value, ["type", "target"])
                ? {kind: "valid", message: {type: value.type, target}}
                : {kind: "invalid"};
        }

        if (!this.isContext(value.context)) {
            return {kind: "invalid"};
        }

        const context = value.context;

        switch (value.type) {
            case "setColor":
                if (!this.hasKeys(value, ["type", "target", "context", "color"]) || typeof value.color !== "string") {
                    return {kind: "invalid"};
                }
                return {kind: "valid", message: {type: "setColor", target, context, color: value.color}};

            case "setSource":
                if (!this.hasKeys(value, ["type", "target", "context", "source"]) || !this.isSource(value.source)) {
                    return {kind: "invalid"};
                }

                if (context === "class") {
                    return value.source === "inherit"
                        ? {kind: "invalid"}
                        : {kind: "valid", message: {type: "setSource", target, context, source: value.source}};
                }

                return {kind: "valid", message: {type: "setSource", target, context, source: value.source}};

            case "resetField":
            case "revertField":
                if (
                    !this.hasKeys(value, ["type", "target", "context", "field"]) ||
                    (value.field !== "source" && value.field !== "color")
                ) {
                    return {kind: "invalid"};
                }

                return {kind: "valid", message: {type: value.type, target, context, field: value.field}};

            default:
                return {kind: "invalid"};
        }
    }

    private isRecord(value: unknown): value is Record<string, unknown> {
        return value !== null && typeof value === "object" && !Array.isArray(value);
    }

    private isTarget(value: unknown, workspaceAvailable: boolean): value is ColorSettingsTarget {
        return value === "user" || (value === "workspace" && workspaceAvailable);
    }

    private isContext(value: unknown): value is keyof ThrowableColorSettings {
        return value === "class" || value === "import" || value === "catch" || value === "throws";
    }

    private isSource(value: unknown): value is Exclude<ColorSetting["source"], undefined> {
        return value === "custom" || value === "inherit" || value === "native";
    }

    private hasKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
        const actual = Object.keys(value);

        return actual.length === expected.length && actual.every(key => expected.includes(key));
    }
}
