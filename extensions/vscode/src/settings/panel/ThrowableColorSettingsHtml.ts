import type {ThrowableColorSettingsTemplate} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsTemplate";
import type {ThrowableColorSettingsViewModel} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsViewModel";

const CONTEXTS = ["class", "import", "catch", "throws"] as const;
const SOURCE_LABELS = {
    custom: "Custom color",
    inherit: "Inherit from CLASS",
    native: "Native Java highlighting",
    legacy: "Legacy rules"
} as const;

export class ThrowableColorSettingsHtml {
    public renderTemplate(
        model: ThrowableColorSettingsViewModel,
        templates: ThrowableColorSettingsTemplate,
        resources: {
            readonly cspSource: string;
            readonly stylesUri: string;
            readonly scriptUri: string;
            readonly nonce: string;
        }
    ): string {
        const rows = CONTEXTS.map(context => this.renderTemplateRow(context, model, templates)).join("\n");

        return this.fillTemplate(templates.document, {
            cspSource: this.escapeHtml(resources.cspSource),
            stylesUri: this.escapeHtml(resources.stylesUri),
            scriptUri: this.escapeHtml(resources.scriptUri),
            nonce: this.escapeHtml(resources.nonce),
            userSelected: model.target === "user" ? "selected" : "",
            workspaceSelected: model.target === "workspace" ? "selected" : "",
            workspaceDisabled: model.workspaceAvailable ? "" : "disabled",
            targetLabel: this.escapeHtml(model.target === "user" ? "User" : "Workspace"),
            rows
        });
    }

    private renderTemplateRow(
        context: (typeof CONTEXTS)[number],
        model: ThrowableColorSettingsViewModel,
        templates: ThrowableColorSettingsTemplate
    ): string {
        const scoped = model.scoped[context];
        const result = model.effective[context];
        const values = {
            context: this.escapeHtml(context),
            scopedSource: this.escapeHtml(this.formatScopedValue(scoped.source, "source")),
            scopedColor: this.escapeHtml(this.formatScopedValue(scoped.color, "color")),
            sourceOptions: this.renderSourceOptions(context, scoped.source, templates.sourceOption),
            colorValue: this.escapeHtml(typeof scoped.color === "string" ? scoped.color : "")
        };

        if (result.kind === "invalid") {
            return this.fillTemplate(templates.invalidContextRow, {
                ...values,
                reason: this.escapeHtml(result.reason)
            });
        }

        return this.fillTemplate(templates.contextRow, {
            ...values,
            source: this.escapeHtml(SOURCE_LABELS[result.setting.source ?? "legacy"]),
            color: this.escapeHtml(result.setting.color || "Not set")
        });
    }

    private renderSourceOptions(context: (typeof CONTEXTS)[number], source: unknown, template: string): string {
        const options = [
            {value: "", label: "Not set in this scope"},
            {value: "custom", label: SOURCE_LABELS.custom},
            ...(context === "class" ? [] : [{value: "inherit", label: SOURCE_LABELS.inherit}]),
            {value: "native", label: SOURCE_LABELS.native}
        ];

        const known =
            source === undefined ||
            source === "custom" ||
            source === "native" ||
            (context !== "class" && source === "inherit");

        if (!known) {
            options.unshift({value: "stored", label: "Stored value (see below)"});
        }

        return options
            .map(option => {
                const selected = known
                    ? option.value === (source === undefined ? "" : source)
                    : option.value === "stored";

                return this.fillTemplate(template, {
                    value: this.escapeHtml(option.value),
                    label: this.escapeHtml(option.label),
                    selected: selected ? "selected" : "",
                    disabled: option.value === "stored" ? "disabled" : ""
                });
            })
            .join("\n");
    }

    private formatScopedValue(value: unknown, field: "source" | "color"): string {
        if (value === undefined) {
            return field === "color" ? "Not set" : "Not set in this scope";
        }

        if (typeof value === "string") {
            return JSON.stringify(value);
        }

        if (value === null || typeof value === "boolean" || typeof value === "number") {
            return String(value);
        }

        return "Unsupported value";
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
