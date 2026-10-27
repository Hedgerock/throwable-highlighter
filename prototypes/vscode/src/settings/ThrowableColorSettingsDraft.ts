import type {
    RawColorSetting,
    RawThrowableColorSettings
} from "@throwable-highlighter/settings/ThrowableColorConfiguration";

export type ColorSettingsTarget = "user" | "workspace";

export type ColorSettingChange = {
    readonly context: keyof RawThrowableColorSettings;
    readonly field: keyof RawColorSetting;
    readonly value: unknown;
};

export class ThrowableColorSettingsDraft {
    private baseline: RawThrowableColorSettings;
    private current: RawThrowableColorSettings;

    constructor(
        public readonly target: ColorSettingsTarget,
        settings: RawThrowableColorSettings
    ) {
        this.baseline = this.copy(settings);
        this.current = this.baseline;
    }

    public get isDirty(): boolean {
        return this.getChanges().length > 0;
    }

    public read(): RawThrowableColorSettings {
        return this.copy(this.current);
    }

    public revertField(
        context: keyof RawThrowableColorSettings,
        field: keyof RawColorSetting,
        saveValue: unknown
    ): void {
        this.baseline = {
            ...this.baseline,
            [context]: {
                ...this.baseline[context],
                [field]: saveValue
            }
        };

        this.update(context, field, saveValue);
    }

    public update(context: keyof RawThrowableColorSettings, field: keyof RawColorSetting, value: unknown): void {
        this.current = {
            ...this.current,
            [context]: {
                ...this.current[context],
                [field]: value
            }
        };
    }

    public getChanges(): readonly ColorSettingChange[] {
        const changes: ColorSettingChange[] = [];

        for (const context of ["class", "import", "catch", "throws"] as const) {
            for (const field of ["source", "color"] as const) {
                const value = this.current[context][field];

                if (!Object.is(value, this.baseline[context][field])) {
                    changes.push({context, field, value});
                }
            }
        }

        return changes;
    }

    public discard(): void {
        this.current = this.baseline;
    }

    private copy(settings: RawThrowableColorSettings): RawThrowableColorSettings {
        return {
            class: {...settings.class},
            import: {...settings.import},
            catch: {...settings.catch},
            throws: {...settings.throws}
        };
    }
}
