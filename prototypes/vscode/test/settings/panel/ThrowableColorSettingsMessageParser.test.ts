import assert from "node:assert/strict";
import {test} from "node:test";

import {ThrowableColorSettingsMessageParser} from "@throwable-highlighter/settings/panel/ThrowableColorSettingsMessageParser";

test("accepts the ready message without an open workspace", () => {
    assertValid({type: "ready"}, false);
});

test("accepts scoped target selection, apply and discard requests without accepting settings", () => {
    for (const target of ["user", "workspace"]) {
        for (const type of ["selectTarget", "apply", "discard"]) {
            assertValid({type, target});
        }
    }
});

test("accepts valid explicit sources for each context and target", () => {
    for (const target of ["user", "workspace"]) {
        for (const context of ["class", "import", "catch", "throws"]) {
            for (const source of ["custom", "native", "inherit"]) {
                const message = {type: "setSource", target, context, source};

                if (context === "class" && source === "inherit") {
                    assertInvalid(message);
                } else {
                    assertValid(message);
                }
            }
        }
    }
});

test("preserves incomplete color input without HEX validation", () => {
    for (const target of ["user", "workspace"]) {
        for (const context of ["class", "import", "catch", "throws"]) {
            for (const color of ["", "#", " #12 ", "red", "#123456"]) {
                assertValid({type: "setColor", target, context, color});
            }
        }
    }
});

test("accepts resetting only source and color fields", () => {
    for (const target of ["user", "workspace"]) {
        for (const context of ["class", "import", "catch", "throws"]) {
            for (const field of ["source", "color"]) {
                assertValid({type: "resetField", target, context, field});
            }
        }
    }

    for (const field of [undefined, null, "", "target", "__proto__", "classColor"]) {
        assertInvalid({type: "resetField", target: "user", context: "class", field});
    }
});

test("rejects invalid roots and unknown message types", () => {
    for (const value of [undefined, null, false, 0, "", [], {}, {type: "save"}, {type: "state"}]) {
        assertInvalid(value);
    }
});

test("rejects missing or invalid targets and contexts", () => {
    for (const target of [undefined, null, false, 0, "", "global", "Workspace", {}, []]) {
        assertInvalid({type: "apply", target});
        assertInvalid({type: "setColor", target, context: "class", color: "#123456"});
        assertInvalid({type: "selectTarget", target});
    }

    for (const context of [undefined, null, false, 0, "", "CLASS", "__proto__", {}, []]) {
        assertInvalid({type: "setSource", target: "user", context, source: "native"});
    }
});

test("rejects non-string colors and invalid explicit sources", () => {
    for (const color of [undefined, null, false, 0, {}, []]) {
        assertInvalid({type: "setColor", target: "user", context: "class", color});
    }

    for (const source of [undefined, null, false, 0, "", "CUSTOM", "legacy", {}, []]) {
        for (const context of ["class", "catch"]) {
            assertInvalid({type: "setSource", target: "user", context, source});
        }
    }
});

test("rejects Workspace operations when no workspace is available", () => {
    const messages = [
        {type: "apply"},
        {type: "discard"},
        {type: "setColor", context: "class", color: "#123456"},
        {type: "setSource", context: "catch", source: "inherit"},
        {type: "resetField", context: "import", field: "color"},
        {type: "selectTarget"}
    ];

    for (const message of messages) {
        assertInvalid({...message, target: "workspace"}, false);
        assertValid({...message, target: "user"}, false);
    }
});

test("rejects extra payload fields for every message type", () => {
    const messages = [
        {type: "ready"},
        {type: "apply", target: "user"},
        {type: "discard", target: "user"},
        {type: "setColor", target: "user", context: "class", color: "#123456"},
        {type: "setSource", target: "user", context: "class", source: "native"},
        {type: "resetField", target: "user", context: "class", field: "color"},
        {type: "selectTarget", target: "user"}
    ];

    for (const message of messages) {
        assertInvalid({...message, settings: {classColor: "#FFFFFF"}});
    }
});

test("requires message fields to be own enumerable properties", () => {
    assertInvalid(Object.create({type: "ready"}));
    assertInvalid(Object.assign(Object.create({target: "user"}), {type: "apply"}));
    assertInvalid(Object.assign(Object.create({target: "user"}), {type: "selectTarget"}));
});

test("returns a new message without retaining the input object", () => {
    const parser = new ThrowableColorSettingsMessageParser();
    const message = {type: "setSource", target: "user", context: "class", source: "custom"};
    const result = parser.parse(message, true);

    if (result.kind !== "valid") {
        assert.fail("Expected a valid message.");
    }

    assert.notEqual(result.message, message);

    message.source = "inherit";

    assert.deepEqual(result.message, {
        type: "setSource",
        target: "user",
        context: "class",
        source: "custom"
    });
});

test("accepts selecting User without an open workspace", () => {
    assertValid({type: "selectTarget", target: "user"}, false);
});

test("returns a detached target selection message", () => {
    const parser = new ThrowableColorSettingsMessageParser();
    const message = {type: "selectTarget", target: "user"};

    const result = parser.parse(message, true);

    if (result.kind !== "valid") {
        assert.fail("Expected a valid message.");
    }

    assert.notEqual(result.message, message);
    message.target = "workspace";
    assert.deepEqual(result.message, {type: "selectTarget", target: "user"});
});

test("preserves the revertField message type", () => {
    assertValid({
        type: "revertField",
        target: "user",
        context: "class",
        field: "color"
    });
});

test("rejects invalid revert requests and replacement values", () => {
    for (const field of [undefined, null, "", "target", "__proto__", "classColor"]) {
        assertInvalid({type: "revertField", target: "user", context: "class", field});
    }

    assertInvalid({type: "revertField", target: "workspace", context: "class", field: "color"}, false);
    assertInvalid({type: "revertField", target: "user", context: "CLASS", field: "color"});
    assertInvalid({type: "revertField", target: "user", context: "class", field: "color", value: "#FFFFFF"});
});

function assertValid(message: unknown, workspaceAvailable = true): void {
    const parser = new ThrowableColorSettingsMessageParser();

    const result = parser.parse(message, workspaceAvailable);

    assert.deepEqual(result, {
        kind: "valid",
        message
    });
}

function assertInvalid(message: unknown, workspaceAvailable = true): void {
    const parser = new ThrowableColorSettingsMessageParser();

    const result = parser.parse(message, workspaceAvailable);

    const expected: typeof result = {
        kind: "invalid"
    };

    assert.deepEqual(result, expected);
}
