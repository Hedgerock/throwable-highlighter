import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {Script} from "node:vm";

import type {
    ColorSettingsDraftStateMessage,
    ColorSettingsFieldRevertedMessage
} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsMessage";

const CONTEXTS = ["class", "import", "catch", "throws"] as const;
type ColorContext = (typeof CONTEXTS)[number];
type RowValues = {readonly source?: string; readonly color?: string};
type Listener = (event: unknown) => void;

const scriptPath = resolve(__dirname, "../../../../webview/color-settings/app.js");
const script = new Script(readFileSync(scriptPath, "utf8"), {filename: scriptPath});

class TestElement {
    textContent = "";
    title = "";
    hidden = false;
    readonly dataset: Record<string, string> = {};
    readonly style = {backgroundColor: ""};
    readonly attributes = new Map<string, string>();
    readonly elements = new Map<string, TestElement>();
    readonly groups = new Map<string, TestElement[]>();
    readonly listeners = new Map<string, Listener[]>();
    readonly classes = new Set<string>();
    readonly classList = {
        toggle: (name: string, enabled: boolean) => {
            if (enabled) {
                this.classes.add(name);
            } else {
                this.classes.delete(name);
            }
        }
    };
    parentElement: TestElement | null = null;
    row: TestElement | null = null;

    querySelector(selector: string): TestElement | null {
        return this.elements.get(selector) ?? null;
    }

    querySelectorAll(selector: string): TestElement[] {
        return this.groups.get(selector) ?? [];
    }

    setAttribute(name: string, value: string): void {
        this.attributes.set(name, value);
    }

    addEventListener(type: string, listener: Listener): void {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    emit(type: string, event: unknown = {}): void {
        for (const listener of this.listeners.get(type) ?? []) {
            listener(event);
        }
    }

    closest(selector: string): TestElement | null {
        return selector === "tr" ? this.row : null;
    }
}

class TestInput extends TestElement {
    disabled = true;
    valueWrites = 0;

    constructor(private currentValue: string) {
        super();
    }

    get value(): string {
        return this.currentValue;
    }

    set value(value: string) {
        this.currentValue = value;
        this.valueWrites++;
    }

    get valueAsNumber(): number {
        return this.currentValue === "" ? Number.NaN : Number(this.currentValue);
    }

    input(value: string): void {
        this.currentValue = value;
        this.emit("input");
    }
}

class TestSelect extends TestElement {
    disabled = true;

    constructor(public value: string) {
        super();
    }

    change(value: string): void {
        this.value = value;
        this.emit("change");
    }
}

class TestButton extends TestElement {
    disabled = true;

    constructor(dataset: Record<string, string> = {}) {
        super();
        Object.assign(this.dataset, dataset);
    }

    click(): void {
        this.emit("click");
    }
}

function createRow(context: ColorContext, values: RowValues = {}) {
    const element = new TestElement();
    element.dataset.context = context;

    const source = new TestSelect(values.source ?? "custom");
    const color = new TestInput(values.color ?? "#11223380");
    const picker = new TestInput("#000000");
    const opacity = new TestInput("255");
    const output = new TestElement();
    const preview = new TestElement();
    const swatch = new TestElement();
    const fill = new TestElement();
    const label = new TestElement();
    const sourceValue = new TestElement();
    const colorValue = new TestElement();
    const revertSource = new TestButton({revertField: "source"});
    const revertColor = new TestButton({revertField: "color"});
    const removeColor = new TestButton({resetField: "color"});

    sourceValue.parentElement = new TestElement();
    colorValue.parentElement = new TestElement();
    swatch.hidden = true;

    for (const control of [source, color, picker, opacity]) {
        control.row = element;
    }

    for (const [selector, control] of Object.entries({
        '[data-setting="source"]': source,
        '[data-setting="color"]': color,
        "[data-color-picker]": picker,
        "[data-color-opacity]": opacity,
        "[data-opacity-value]": output,
        "[data-color-preview]": preview,
        '[data-value-field="source"] code': sourceValue,
        '[data-value-field="color"] code': colorValue
    })) {
        element.elements.set(selector, control);
    }

    preview.elements.set("[data-preview-label]", label);
    preview.elements.set("[data-color-swatch]", swatch);
    preview.elements.set("[data-color-swatch-fill]", fill);
    element.groups.set("[data-revert-field]", [revertSource, revertColor]);
    element.groups.set("[data-reset-field]", [removeColor]);

    return {element, source, color, picker, opacity, output, preview, swatch, fill, label, removeColor};
}

export function createThrowableColorSettingsWebviewFixture(values: Partial<Record<ColorContext, RowValues>> = {}) {
    const rows = {
        class: createRow("class", values.class),
        import: createRow("import", values.import),
        catch: createRow("catch", values.catch),
        throws: createRow("throws", values.throws)
    };
    const target = new TestSelect("user");
    const status = new TestElement();
    const discard = new TestButton();
    const apply = new TestButton();
    const browserWindow = new TestElement();
    const messages: unknown[] = [];
    const ids = new Map<string, TestElement>([
        ["settings-target", target],
        ["draft-status", status],
        ["discard-draft", discard]
    ]);

    for (const [context, row] of Object.entries(rows)) {
        ids.set("source-" + context, row.source);
        ids.set("color-" + context, row.color);
    }

    const rowList = Object.values(rows);
    const controls = rowList.flatMap(row => [
        row.source,
        row.color,
        row.picker,
        row.opacity,
        ...row.element.querySelectorAll("[data-revert-field]"),
        row.removeColor
    ]);

    script.runInNewContext({
        HTMLElement: TestElement,
        HTMLInputElement: TestInput,
        HTMLSelectElement: TestSelect,
        HTMLButtonElement: TestButton,
        acquireVsCodeApi: () => ({postMessage: (message: unknown) => messages.push(structuredClone(message))}),
        window: browserWindow,
        document: {
            getElementById: (id: string) => ids.get(id) ?? null,
            querySelector: () => null,
            querySelectorAll: (selector: string) => {
                if (selector === "tbody tr[data-context]") {
                    return rowList.map(row => row.element);
                }

                if (selector === "tbody select, tbody input, tbody button, .panel-actions button") {
                    return [...controls, discard, apply];
                }

                return [];
            }
        }
    });

    let state: ColorSettingsDraftStateMessage = {
        type: "draftState",
        target: "user",
        isDirty: false,
        controls: Object.fromEntries(
            CONTEXTS.map(context => [
                context,
                {
                    source: {canRevert: false, canRemove: true},
                    color: {canRevert: false, canRemove: true}
                }
            ])
        ) as ColorSettingsDraftStateMessage["controls"],
        preview: Object.fromEntries(
            CONTEXTS.map(context => [context, {kind: "native"}])
        ) as ColorSettingsDraftStateMessage["preview"]
    };

    function receiveState(changes: Partial<ColorSettingsDraftStateMessage> = {}): void {
        state = {...state, ...changes};
        browserWindow.emit("message", {data: state});
    }

    function receivePreview(changes: Partial<ColorSettingsDraftStateMessage["preview"]>): void {
        receiveState({preview: {...state.preview, ...changes}});
    }

    function receiveReverted(context: ColorContext, field: "source" | "color", value: unknown): void {
        const message: ColorSettingsFieldRevertedMessage = {...state, type: "fieldReverted", context, field, value};
        browserWindow.emit("message", {data: message});
    }

    receiveState();

    return {rows, target, messages, receiveState, receivePreview, receiveReverted};
}
