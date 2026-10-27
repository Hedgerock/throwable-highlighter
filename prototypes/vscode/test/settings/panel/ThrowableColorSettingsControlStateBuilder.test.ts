import assert from "node:assert/strict";
import {test} from "node:test";

import {ThrowableColorSettingsControlStateBuilder} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsControlStateBuilder";
import type {RawThrowableColorSettings} from "@throwable-highlighter/settings/ThrowableColorConfiguration";

test("disables reverting unchanged fields and removing missing settings", () => {
    const saved = createSettings({
        class: {source: "custom", color: "#123456"},
        catch: {source: null, color: ""},
        throws: {source: "native", color: undefined}
    });

    const state = new ThrowableColorSettingsControlStateBuilder().build(structuredClone(saved), saved);

    assert.deepEqual(state, {
        class: {
            source: {canRevert: false, canRemove: true},
            color: {canRevert: false, canRemove: true}
        },
        import: {
            source: {canRevert: false, canRemove: false},
            color: {canRevert: false, canRemove: false}
        },
        catch: {
            source: {canRevert: false, canRemove: true},
            color: {canRevert: false, canRemove: true}
        },
        throws: {
            source: {canRevert: false, canRemove: true},
            color: {canRevert: false, canRemove: false}
        }
    });
});

test("keeps action states independent for every context and field", () => {
    for (const context of ["class", "import", "catch", "throws"] as const) {
        for (const field of ["source", "color"] as const) {
            const saved = createSettings();
            const current = createSettings({
                [context]: {
                    source: undefined,
                    color: undefined,
                    [field]: field === "source" ? "custom" : "#123456"
                }
            });

            const state = new ThrowableColorSettingsControlStateBuilder().build(current, saved);

            for (const name of ["class", "import", "catch", "throws"] as const) {
                for (const key of ["source", "color"] as const) {
                    assert.deepEqual(
                        state[name][key],
                        name === context && key === field
                            ? {canRevert: true, canRemove: true}
                            : {canRevert: false, canRemove: false}
                    );
                }
            }
        }
    }
});

test("allows reverting removed settings and removing an explicit empty string", () => {
    const saved = createSettings({catch: {source: "inherit", color: "#123456"}});
    const builder = new ThrowableColorSettingsControlStateBuilder();

    const removed = builder.build(createSettings(), saved);

    assert.deepEqual(removed.catch, {
        source: {canRevert: true, canRemove: false},
        color: {canRevert: true, canRemove: false}
    });

    const empty = builder.build(createSettings({catch: {source: "inherit", color: ""}}), saved);

    assert.deepEqual(empty.catch, {
        source: {canRevert: false, canRemove: true},
        color: {canRevert: true, canRemove: true}
    });
});

test("treats null and invalid raw values as existing settings", () => {
    for (const value of [null, "", false, 0, {value: "invalid"}, []]) {
        const saved = createSettings({class: {source: undefined, color: value}});
        const current = createSettings({class: {source: undefined, color: value}});

        const state = new ThrowableColorSettingsControlStateBuilder().build(current, saved);

        assert.deepEqual(state.class.color, {canRevert: false, canRemove: true});
    }
});

test("compares raw values without normalizing their color or source", () => {
    const saved = createSettings({class: {source: undefined, color: "#fff"}});
    const builder = new ThrowableColorSettingsControlStateBuilder();

    for (const color of ["#FFF", "#FFFFFF", " #fff "]) {
        const state = builder.build(createSettings({class: {source: null, color}}), saved);

        assert.deepEqual(state.class, {
            source: {canRevert: true, canRemove: true},
            color: {canRevert: true, canRemove: true}
        });
    }
});

test("does not modify current or saved snapshots", () => {
    const current = createSettings({class: {source: "custom", color: " #12 "}});
    const saved = createSettings({class: {source: null, color: "#123456"}});
    const before = structuredClone({current, saved});

    new ThrowableColorSettingsControlStateBuilder().build(current, saved);

    assert.deepEqual({current, saved}, before);
});

function createSettings(overrides: Partial<RawThrowableColorSettings> = {}): RawThrowableColorSettings {
    return {
        class: {source: undefined, color: undefined},
        import: {source: undefined, color: undefined},
        catch: {source: undefined, color: undefined},
        throws: {source: undefined, color: undefined},
        ...overrides
    };
}
