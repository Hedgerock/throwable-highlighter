import assert from "node:assert/strict";
import {test} from "node:test";

import {ThrowableColorResolver} from "@throwable-highlighter/settings/ThrowableColorResolver";
import type {ThrowableColorSettings} from "@throwable-highlighter/settings/ThrowableColorSettings";

test("preserves legacy color rules when no source is specified", async context => {
    const cases = [
        {
            name: "native colors by default",
            settings: createSettings(),
            expected: {class: undefined, import: undefined, catch: undefined, throws: undefined}
        },
        {
            name: "empty derived colors inherit the trimmed class color",
            settings: createSettings({
                class: {color: " #112233 "},
                import: {color: ""},
                catch: {color: " "},
                throws: {color: "\t"}
            }),
            expected: {class: "#112233", import: "#112233", catch: "#112233", throws: "#112233"}
        },
        {
            name: "nonempty derived colors override the class color",
            settings: createSettings({
                class: {color: "#112233"},
                import: {color: " #445566 "},
                catch: {color: "#778899"},
                throws: {color: "#AABBCC"}
            }),
            expected: {class: "#112233", import: "#445566", catch: "#778899", throws: "#AABBCC"}
        }
    ] as const;

    for (const scenario of cases) {
        await context.test(scenario.name, () => {
            assert.deepEqual(new ThrowableColorResolver().resolve(scenario.settings), scenario.expected);
        });
    }
});

test("resolves explicit sources independently for each derived context", async context => {
    const classColor = "#112233";
    const cases = [
        {source: "custom", expected: "#445566"},
        {source: "inherit", expected: classColor},
        {source: "native", expected: undefined}
    ] as const;

    for (const contextName of ["import", "catch", "throws"] as const) {
        for (const scenario of cases) {
            await context.test(contextName + " uses " + scenario.source, () => {
                const settings = createSettings({
                    class: {source: "custom", color: classColor},
                    [contextName]: {source: scenario.source, color: " #445566"}
                });

                assert.deepEqual(new ThrowableColorResolver().resolve(settings), {
                    class: classColor,
                    import: classColor,
                    catch: classColor,
                    throws: classColor,
                    [contextName]: scenario.expected
                });
            });
        }
    }
});

test("inherits native class colors without changing saved color values", () => {
    const inherited = {source: "inherit", color: "#445566"} as const;

    const settings = createSettings({
        class: {source: "native", color: " #112233 "},
        import: inherited,
        catch: inherited,
        throws: inherited
    });

    const original = structuredClone(settings);

    assert.deepEqual(new ThrowableColorResolver().resolve(settings), {
        class: undefined,
        import: undefined,
        catch: undefined,
        throws: undefined
    });

    assert.deepEqual(settings, original);
});

test("uses own derived colors when the class source is native", () => {
    const settings = createSettings({
        class: {source: "native", color: "#112233"},
        import: {source: "custom", color: "#445566"},
        catch: {source: "custom", color: "#778899"},
        throws: {source: "custom", color: "#AABBCC"}
    });

    assert.deepEqual(new ThrowableColorResolver().resolve(settings), {
        class: undefined,
        import: "#445566",
        catch: "#778899",
        throws: "#AABBCC"
    });
});

function createSettings(overrides: Partial<ThrowableColorSettings> = {}): ThrowableColorSettings {
    return {
        class: {},
        import: {},
        catch: {},
        throws: {},
        ...overrides
    };
}
