import type {
    ClassColorSetting,
    ColorSetting,
    ResolvedThrowableColors,
    ThrowableColorSettings
} from "@throwable-highlighter/settings/ThrowableColorSettings";

export class ThrowableColorResolver {
    public resolve(settings: ThrowableColorSettings): ResolvedThrowableColors {
        const classColor = this.resolveClassColor(settings.class);

        return {
            class: classColor,
            import: this.resolveDerivedColor(settings.import, classColor),
            catch: this.resolveDerivedColor(settings.catch, classColor),
            throws: this.resolveDerivedColor(settings.throws, classColor)
        };
    }

    private resolveClassColor(setting: ClassColorSetting): string | undefined {
        return setting.source === "native" ? undefined : this.normalizeColor(setting.color);
    }

    private resolveDerivedColor(setting: ColorSetting, classColor: string | undefined): string | undefined {
        switch (setting.source) {
            case "native":
                return undefined;
            case "inherit":
                return classColor;
            case "custom":
                return this.normalizeColor(setting.color);
            case undefined:
                return this.normalizeColor(setting.color) ?? classColor;
        }
    }

    private normalizeColor(value: string | undefined): string | undefined {
        const color = value?.trim();

        return color === "" ? undefined : color;
    }
}
