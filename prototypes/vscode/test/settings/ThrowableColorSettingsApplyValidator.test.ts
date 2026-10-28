import assert from "node:assert/strict";
import {test} from "node:test";

import {ThrowableColorSettingsApplyValidator} from "@throwable-highlighter/settings/ThrowableColorSettingsApplyValidator";
import type {
    RawThrowableColorSettings,
    ThrowableColorConfigurationSnapshot
} from "@throwable-highlighter/settings/ThrowableColorConfiguration";

test("accepts supported HEX formats without changing the snapshot or proposed values", () => {
    const validator = new ThrowableColorSettingsApplyValidator();
    const snapshot = createSnapshot({user: {class: {source: "custom", color: "#111111"}}});

    for (const color of ["#123", "#1234", "#123456", "#12345678", " #AbCdEf80 "]) {
        const changes = [{context: "class", field: "color", value: color}] as const;
        const before = structuredClone({snapshot, changes});

        assert.deepEqual(validator.validate(snapshot, "user", changes), {kind: "valid"});
        assert.deepEqual({snapshot, changes}, before);
    }
});

test("rejects invalid new colors even when the source or Workspace hides them", () => {
    const validator = new ThrowableColorSettingsApplyValidator();

    for (const source of [undefined, "native", "inherit"]) {
        const snapshot = createSnapshot({
            user: {import: {source, color: "#111111"}},
            workspace: {import: {source: "native", color: "#222222"}}
        });

        for (const value of ["#12", "red", null, 42, false, {}, []]) {
            const changes = [{context: "import", field: "color", value}] as const;

            assert.deepEqual(validator.validate(snapshot, "user", changes), {
                kind: "invalid",
                issues: [{context: "import", field: "color", reason: "invalid-color"}]
            });
        }
    }
});

test("rejects invalid new sources and inheritance for the class context", () => {
    const validator = new ThrowableColorSettingsApplyValidator();
    const snapshot = createSnapshot();

    for (const value of [null, "", "auto", 42, false, {}, []]) {
        assert.deepEqual(validator.validate(snapshot, "user", [{context: "catch", field: "source", value}]), {
            kind: "invalid",
            issues: [{context: "catch", field: "source", reason: "invalid-source"}]
        });
    }

    assert.deepEqual(validator.validate(snapshot, "user", [{context: "class", field: "source", value: "inherit"}]), {
        kind: "invalid",
        issues: [{context: "class", field: "source", reason: "class-inheritance"}]
    });
});

test("rejects an incomplete User custom setting hidden by Workspace", () => {
    const validator = new ThrowableColorSettingsApplyValidator();
    const snapshot = createSnapshot({
        workspace: {catch: {source: "native", color: "#123456"}}
    });

    assert.deepEqual(validator.validate(snapshot, "user", [{context: "catch", field: "source", value: "custom"}]), {
        kind: "invalid",
        issues: [{context: "catch", field: "color", reason: "invalid-color"}]
    });
});

test("uses lower-level colors and distinguishes removal from an empty custom value", () => {
    const validator = new ThrowableColorSettingsApplyValidator();
    const snapshot = createSnapshot({
        user: {import: {source: undefined, color: "#123456"}},
        workspace: {import: {source: "custom", color: "#ABCDEF"}}
    });

    assert.deepEqual(
        validator.validate(snapshot, "workspace", [{context: "import", field: "color", value: undefined}]),
        {kind: "valid"}
    );
    assert.deepEqual(validator.validate(snapshot, "workspace", [{context: "import", field: "color", value: ""}]), {
        kind: "invalid",
        issues: [{context: "import", field: "color", reason: "invalid-color"}]
    });
});

test("rejects removal when a custom source has no valid fallback color", () => {
    const validator = new ThrowableColorSettingsApplyValidator();
    const snapshot = createSnapshot({user: {class: {source: "custom", color: "#123456"}}});

    assert.deepEqual(validator.validate(snapshot, "user", [{context: "class", field: "color", value: undefined}]), {
        kind: "invalid",
        issues: [{context: "class", field: "color", reason: "invalid-color"}]
    });
});

test("accepts empty legacy colors while retaining their exact values", () => {
    const validator = new ThrowableColorSettingsApplyValidator();
    const snapshot = createSnapshot({user: {class: {source: undefined, color: "#123456"}}});

    for (const value of ["", " "]) {
        const changes = [{context: "class", field: "color", value}] as const;
        const before = structuredClone(changes);

        assert.deepEqual(validator.validate(snapshot, "user", changes), {kind: "valid"});
        assert.deepEqual(changes, before);
    }
});

test("preserves unchanged legacy colors without blocking on unrelated configuration errors", () => {
    const validator = new ThrowableColorSettingsApplyValidator();
    const snapshot = createSnapshot({
        user: {
            class: {source: "unknown", color: false},
            import: {source: null, color: "red"}
        }
    });
    const changes = [{context: "import", field: "source", value: "native"}] as const;
    const before = structuredClone({snapshot, changes});

    assert.deepEqual(validator.validate(snapshot, "user", changes), {kind: "valid"});
    assert.deepEqual(validator.validate(snapshot, "user", []), {kind: "valid"});
    assert.deepEqual({snapshot, changes}, before);
});

test("collects issues for different fields without repeating a parser error", () => {
    const validator = new ThrowableColorSettingsApplyValidator();

    assert.deepEqual(
        validator.validate(createSnapshot(), "user", [
            {context: "class", field: "source", value: "inherit"},
            {context: "class", field: "color", value: "#12"},
            {context: "throws", field: "source", value: "unknown"}
        ]),
        {
            kind: "invalid",
            issues: [
                {context: "class", field: "source", reason: "class-inheritance"},
                {context: "class", field: "color", reason: "invalid-color"},
                {context: "throws", field: "source", reason: "invalid-source"}
            ]
        }
    );
});

function createSnapshot(
    overrides: {
        defaults?: Partial<RawThrowableColorSettings>;
        user?: Partial<RawThrowableColorSettings>;
        workspace?: Partial<RawThrowableColorSettings>;
    } = {}
): ThrowableColorConfigurationSnapshot {
    return {
        effective: {
            class: {kind: "valid", setting: {color: undefined}},
            import: {kind: "valid", setting: {color: undefined}},
            catch: {kind: "valid", setting: {color: undefined}},
            throws: {kind: "valid", setting: {color: undefined}}
        },
        defaults: createSettings(overrides.defaults),
        user: createSettings(overrides.user),
        workspace: createSettings(overrides.workspace)
    };
}

function createSettings(overrides: Partial<RawThrowableColorSettings> = {}): RawThrowableColorSettings {
    return {
        class: {source: undefined, color: undefined},
        import: {source: undefined, color: undefined},
        catch: {source: undefined, color: undefined},
        throws: {source: undefined, color: undefined},
        ...overrides
    };
}
