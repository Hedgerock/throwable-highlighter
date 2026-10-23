import type {ThrowableColorSettingsTemplate} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsTemplate";
import type {ParsedThrowableColorSettings} from "@throwable-highlighter/settings/ThrowableColorConfiguration";
import type {ColorSettingParseResult} from "@throwable-highlighter/settings/ThrowableColorSettingParser";

const CONTEXTS = ["class", "import", "catch", "throws"] as const;
const SOURCE_LABELS = {
    custom: "Custom color",
    inherit: "Inherit from CLASS",
    native: "Native Java highlighting",
    legacy: "Legacy rules"
} as const;

export class ThrowableColorSettingsHtml {
    public renderTemplate(
        settings: ParsedThrowableColorSettings,
        templates: ThrowableColorSettingsTemplate,
        resources: {readonly cspSource: string; readonly stylesUri: string}
    ): string {
        const rows = CONTEXTS.map(context => this.renderTemplateRow(context, settings[context], templates)).join("\n");

        return this.fillTemplate(templates.document, {
            cspSource: this.escapeHtml(resources.cspSource),
            stylesUri: this.escapeHtml(resources.stylesUri),
            rows
        });
    }

    private renderTemplateRow(
        context: (typeof CONTEXTS)[number],
        result: ColorSettingParseResult,
        templates: ThrowableColorSettingsTemplate
    ): string {
        if (result.kind === "invalid") {
            return this.fillTemplate(templates.invalidContextRow, {
                context: this.escapeHtml(context),
                reason: this.escapeHtml(result.reason)
            });
        }

        return this.fillTemplate(templates.contextRow, {
            context: this.escapeHtml(context),
            source: this.escapeHtml(SOURCE_LABELS[result.setting.source ?? "legacy"]),
            color: this.escapeHtml(result.setting.color || "Not set")
        });
    }

    private fillTemplate(template: string, values: Readonly<Record<string, string>>): string {
        return template.replace(/{{([^{}]*)}}/g, (_placeholder, key: string) => {
            if (!Object.hasOwn(values, key)) {
                throw new Error("Unknown color settings template placeholder: " + key);
            }

            return values[key];
        });
    }

    private escapeHtml(value: string): string {
        return value
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll(`"`, "&quot;")
            .replaceAll("'", "&#39;");
    }
}
