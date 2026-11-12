import {ThrowableColorSettingParser} from "@throwable-highlighter/settings/ThrowableColorSettingParser";
import {ThrowableColorSettingsDraftConfigurationBuilder} from "@throwable-highlighter/settings/ThrowableColorSettingsDraftConfigurationBuilder";
import type {ThrowableColorConfigurationSnapshot} from "@throwable-highlighter/settings/ThrowableColorConfiguration";
import type {ColorSettingParseResult} from "@throwable-highlighter/settings/ThrowableColorSettingParser";
import type {
    ColorSettingChange,
    ColorSettingsTarget
} from "@throwable-highlighter/settings/ThrowableColorSettingsDraft";

export type ColorSettingsValidationIssue = {
    readonly context: ColorSettingChange["context"];
    readonly field: ColorSettingChange["field"];
    readonly reason: Extract<ColorSettingParseResult, {kind: "invalid"}>["reason"];
};

export type ColorSettingsValidationResult =
    {readonly kind: "valid"} | {readonly kind: "invalid"; readonly issues: readonly ColorSettingsValidationIssue[]};

export class ThrowableColorSettingsApplyValidator {
    constructor(
        private readonly configurationBuilder = new ThrowableColorSettingsDraftConfigurationBuilder(),
        private readonly settingParser = new ThrowableColorSettingParser()
    ) {}

    public validate(
        snapshot: ThrowableColorConfigurationSnapshot,
        target: ColorSettingsTarget,
        changes: readonly ColorSettingChange[]
    ): ColorSettingsValidationResult {
        const settings = this.configurationBuilder.buildForTarget(snapshot, target, changes);

        const issues: ColorSettingsValidationIssue[] = [];

        for (const change of changes) {
            const reason = this.validateChange(change);

            if (reason !== undefined) {
                this.addIssue(issues, {context: change.context, field: change.field, reason});
            }

            const setting = settings[change.context];

            if (setting.kind === "invalid") {
                this.addIssue(issues, {
                    context: change.context,
                    field: setting.reason === "invalid-color" ? "color" : "source",
                    reason: setting.reason
                });
            }
        }

        return issues.length === 0 ? {kind: "valid"} : {kind: "invalid", issues};
    }

    private validateChange(change: ColorSettingChange): ColorSettingsValidationIssue["reason"] | undefined {
        const {context, field, value} = change;

        if (value === undefined) {
            return undefined;
        }

        if (field === "color") {
            if (typeof value === "string" && value.trim() === "") {
                return undefined;
            }

            const result = this.settingParser.parseDerived("custom", value);

            return result.kind === "invalid" ? result.reason : undefined;
        }

        if (context === "class" && value === "inherit") {
            return "class-inheritance";
        }

        return value === "custom" || value === "native" || value === "inherit" ? undefined : "invalid-source";
    }

    private addIssue(issues: ColorSettingsValidationIssue[], issue: ColorSettingsValidationIssue): void {
        if (!issues.some(current => current.context === issue.context && current.field === issue.field)) {
            issues.push(issue);
        }
    }
}
