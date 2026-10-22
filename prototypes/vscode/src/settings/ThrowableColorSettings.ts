export type ColorSetting =
    | {readonly source?: undefined; readonly color?: string}
    | {readonly source: "custom"; readonly color: string}
    | {readonly source: "inherit"; readonly color?: string}
    | {readonly source: "native"; readonly color?: string};

export type ClassColorSetting = Exclude<ColorSetting, {source: "inherit"}>;

export type ThrowableColorSettings = {
    readonly class: ClassColorSetting;
    readonly import: ColorSetting;
    readonly catch: ColorSetting;
    readonly throws: ColorSetting;
};

export type ResolvedThrowableColors = Readonly<Record<keyof ThrowableColorSettings, string | undefined>>;
