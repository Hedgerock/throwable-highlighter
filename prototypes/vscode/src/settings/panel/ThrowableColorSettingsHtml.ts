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
            scopedSource: this.escapeHtml(this.formatScopedValue(scoped.source)),
            scopedColor: this.escapeHtml(this.formatScopedValue(scoped.color))
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

    private formatScopedValue(value: unknown): string {
        if (value === undefined) {
            return "Not set in this scope";
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
