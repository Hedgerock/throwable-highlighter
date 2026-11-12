import assert from "node:assert/strict";
import {test} from "node:test";

import {createThrowableColorSettingsWebviewFixture as createFixture} from "../../support/webview/ThrowableColorSettingsWebviewFixture";

test("initializes visual controls from HEX without changing the draft", async context => {
    const cases = [
        {value: "#ABC", rgb: "#aabbcc", alpha: 255, percentage: "100", fill: "#aabbcc"},
        {value: "#1234", rgb: "#112233", alpha: 68, percentage: "26.7", fill: "#11223344"},
        {value: "#112233", rgb: "#112233", alpha: 255, percentage: "100", fill: "#112233"},
        {value: "#11223380", rgb: "#112233", alpha: 128, percentage: "50.2", fill: "#11223380"},
        {value: "#11223300", rgb: "#112233", alpha: 0, percentage: "0", fill: "#11223300"}
    ] as const;

    for (const current of cases) {
        await context.test(current.value, () => {
            const fixture = createFixture({class: {color: current.value}});
            const row = fixture.rows.class;
            fixture.receivePreview({class: {kind: "color", color: current.value}});

            assert.equal(row.color.value, current.value);
            assert.equal(row.picker.value, current.rgb);
            assert.equal(row.opacity.valueAsNumber, current.alpha);
            assert.equal(row.percent.value, current.percentage);
            assert.equal(row.swatch.hidden, false);
            assert.equal(row.fill.style.backgroundColor, current.fill);
            assert.deepEqual(fixture.messages, [{type: "ready"}]);
        });
    }
});

test("preserves every alpha byte when selecting RGB", () => {
    const fixture = createFixture();
    const row = fixture.rows.class;

    for (let alpha = 0; alpha <= 255; alpha++) {
        const suffix = alpha.toString(16).padStart(2, "0");
        row.color.input("#112233" + suffix);

        assert.equal(row.opacity.valueAsNumber, alpha, suffix);

        const count = fixture.messages.length;
        row.opacity.input(String(alpha));
        assert.equal(fixture.messages.length, count, suffix);

        row.picker.input("#abcdef");

        assert.equal(row.color.value, "#abcdef" + suffix, suffix);
        assert.deepEqual(fixture.messages.at(-1), {
            type: "setColor",
            color: "#abcdef" + suffix,
            target: "user",
            context: "class"
        });
    }
});

test("changes opacity without changing RGB or applying stale preview values", () => {
    const fixture = createFixture();
    const row = fixture.rows.class;

    for (const [alpha, expected] of [
        ["0", "#11223300"],
        ["64", "#11223340"],
        ["255", "#112233ff"]
    ] as const) {
        row.opacity.input(alpha);
        fixture.receivePreview({class: {kind: "color", color: "#11223380"}});

        assert.equal(row.color.value, expected);
        assert.equal(row.opacity.valueAsNumber, Number(alpha));
        assert.equal(row.picker.value, "#112233");
    }
});

test("preserves the original text when visual values do not change", () => {
    const fixture = createFixture({class: {color: " #AbC "}});
    const row = fixture.rows.class;

    row.picker.input("#aabbcc");
    row.opacity.input("255");

    assert.equal(row.color.value, " #AbC ");
    assert.deepEqual(fixture.messages, [{type: "ready"}]);
});

test("preserves incomplete text and avoids assigning the input value while typing", () => {
    const fixture = createFixture();
    const row = fixture.rows.class;

    for (const value of ["#12", "#12345", "", "red"]) {
        const writes = row.color.valueWrites;

        row.color.input(value);
        fixture.receiveState();

        assert.equal(row.color.value, value);
        assert.equal(row.color.valueWrites, writes);
        assert.equal(row.opacity.disabled, true);
        assert.equal(row.percent.value, "");
        assert.equal(row.picker.disabled, false);
        assert.deepEqual(fixture.messages.at(-1), {type: "setColor", color: value, target: "user", context: "class"});
    }
});

test("locks inherited and native colors without losing the own value", () => {
    const fixture = createFixture({catch: {color: "#ABC4"}});
    const row = fixture.rows.catch;
    fixture.receivePreview({class: {kind: "color", color: "#12345680"}});

    row.source.change("inherit");

    assert.equal(row.color.value, "#12345680");
    assert.equal(row.color.disabled, true);
    assert.equal(row.picker.disabled, true);
    assert.equal(row.opacity.disabled, true);
    assert.equal(row.percent.value, "50.2");

    row.source.change("custom");
    assert.equal(row.color.value, "#ABC4");
    assert.equal(row.opacity.valueAsNumber, 68);
    assert.equal(row.opacity.disabled, false);

    row.source.change("native");
    assert.equal(row.color.value, "");
    assert.equal(row.picker.disabled, true);
    assert.equal(row.opacity.disabled, true);
    assert.equal(row.percent.value, "");

    row.source.change("custom");
    assert.equal(row.color.value, "#ABC4");
});

test("synchronizes visual controls after reverting and removing a color", () => {
    const fixture = createFixture();
    const row = fixture.rows.class;
    row.color.input("#abcdef44");

    fixture.receiveReverted("class", "color", "#11223380");

    assert.equal(row.color.value, "#11223380");
    assert.equal(row.picker.value, "#112233");
    assert.equal(row.opacity.valueAsNumber, 128);
    assert.equal(row.percent.value, "50.2");

    row.removeColor.click();

    assert.equal(row.color.value, "");
    assert.equal(row.opacity.disabled, true);
    assert.equal(row.percent.value, "");
    assert.deepEqual(fixture.messages.at(-1), {
        type: "resetField",
        field: "color",
        target: "user",
        context: "class"
    });
});

test("clears the swatch for native highlighting and invalid previews", () => {
    const fixture = createFixture();
    const row = fixture.rows.class;

    fixture.receivePreview({class: {kind: "color", color: "#1234"}});
    assert.equal(row.fill.style.backgroundColor, "#11223344");

    fixture.receivePreview({class: {kind: "native"}});
    assert.equal(row.swatch.hidden, true);
    assert.equal(row.fill.style.backgroundColor, "");

    fixture.receivePreview({class: {kind: "invalid", context: "class", reason: "invalid-color"}});
    assert.equal(row.swatch.hidden, true);
    assert.equal(row.fill.style.backgroundColor, "");
    assert.equal(row.label.textContent, "Invalid");
    assert.equal(row.preview.classes.has("error"), true);
});

test("routes RGB changes to the selected context", () => {
    const fixture = createFixture();

    for (const context of ["class", "import", "catch", "throws"] as const) {
        fixture.rows[context].picker.input("#abcdef");

        assert.deepEqual(fixture.messages.at(-1), {
            type: "setColor",
            color: "#abcdef80",
            target: "user",
            context
        });
    }
});

test("keeps color controls locked while switching settings scopes", () => {
    const fixture = createFixture();
    fixture.target.change("workspace");
    const count = fixture.messages.length;

    fixture.rows.class.picker.input("#abcdef");
    fixture.rows.class.opacity.input("0");
    fixture.rows.class.color.input("#1234");
    fixture.receiveState();

    assert.deepEqual(fixture.messages.at(-1), {type: "selectTarget", target: "workspace"});
    assert.equal(fixture.messages.length, count);

    for (const row of Object.values(fixture.rows)) {
        assert.equal(row.color.disabled, true);
        assert.equal(row.picker.disabled, true);
        assert.equal(row.opacity.disabled, true);
    }
});

test("keeps actions available while edits await acknowledgement", () => {
    // Arrange
    const fixture = createFixture();

    // Act
    fixture.rows.class.color.input("#111111");

    // Assert
    assert.equal(fixture.apply.disabled, false);
    assert.equal(fixture.discard.disabled, false);
    assert.equal(fixture.target.disabled, false);

    // Act
    fixture.rows.class.picker.input("#222222");
    fixture.rows.class.opacity.input("0");
    fixture.receiveState({isDirty: false});
    fixture.receiveState({isDirty: true});

    // Assert
    assert.equal(fixture.apply.disabled, false);
    assert.equal(fixture.discard.disabled, false);
    assert.equal(fixture.target.disabled, false);

    // Act
    fixture.receiveState({isDirty: true});

    // Assert
    assert.equal(fixture.apply.disabled, false);
    assert.equal(fixture.discard.disabled, false);
    assert.equal(fixture.target.disabled, false);
});

test("waits for every pending edit before applying the draft", () => {
    // Arrange
    const fixture = createFixture();
    fixture.rows.class.color.input("#111111");
    fixture.rows.class.color.input("#222222");
    const count = fixture.messages.length;

    // Act
    fixture.apply.click();
    fixture.apply.click();
    fixture.rows.class.picker.input("#abcdef");
    fixture.receiveState({isDirty: true});

    // Assert
    assert.equal(fixture.messages.length, count);
    assert.equal(fixture.apply.disabled, true);
    assert.equal(fixture.discard.disabled, true);
    assert.equal(fixture.target.disabled, true);
    assert.equal(fixture.rows.class.color.disabled, true);

    // Act
    fixture.receiveState({isDirty: true});

    // Assert
    assert.equal(fixture.messages.length, count + 1);
    assert.deepEqual(fixture.messages.at(-1), {type: "apply", target: "user"});
    assert.equal(fixture.apply.textContent, "Applying...");
});

test("waits for pending edits before discarding the draft", () => {
    // Arrange
    const fixture = createFixture();
    fixture.rows.class.color.input("#111111");
    fixture.rows.class.opacity.input("0");
    const count = fixture.messages.length;

    // Act
    fixture.discard.click();
    fixture.receiveState({isDirty: true});

    // Assert
    assert.equal(fixture.messages.length, count);
    assert.equal(fixture.rows.class.color.disabled, true);

    // Act
    fixture.receiveState({isDirty: true});

    // Assert
    assert.equal(fixture.messages.length, count + 1);
    assert.deepEqual(fixture.messages.at(-1), {type: "discard", target: "user"});
    assert.equal(fixture.target.disabled, true);
});

test("preserves the current scope until pending edits are acknowledged", () => {
    // Arrange
    const fixture = createFixture();
    fixture.rows.class.color.input("#111111");
    fixture.rows.class.color.input("#222222");
    const count = fixture.messages.length;

    // Act
    fixture.target.change("workspace");
    fixture.receiveState({isDirty: true});

    // Assert
    assert.equal(fixture.target.value, "user");
    assert.equal(fixture.messages.length, count);
    assert.equal(fixture.target.disabled, true);
    assert.equal(fixture.rows.class.color.disabled, true);

    // Act
    fixture.receiveState({isDirty: true});

    // Assert
    assert.equal(fixture.messages.length, count + 1);
    assert.deepEqual(fixture.messages.at(-1), {type: "selectTarget", target: "workspace"});
    assert.equal(fixture.target.value, "workspace");
});

test("cancels a queued Apply when the acknowledged draft is clean", () => {
    // Arrange
    const fixture = createFixture();
    fixture.rows.class.color.input("#11223380");
    const count = fixture.messages.length;

    // Act
    fixture.apply.click();
    fixture.receiveState({isDirty: false});

    // Assert
    assert.equal(fixture.messages.length, count);
    assert.equal(fixture.apply.disabled, true);
    assert.equal(fixture.discard.disabled, true);
    assert.equal(fixture.target.disabled, false);
    assert.equal(fixture.rows.class.color.disabled, false);
});

test("blocks a repeated Apply and editing before the extension acknowledges saving", () => {
    const fixture = createFixture();
    fixture.receiveState({isDirty: true});

    fixture.apply.click();
    const count = fixture.messages.length;
    fixture.apply.click();
    fixture.discard.click();
    fixture.rows.class.color.input("#abcdef");
    fixture.rows.class.picker.input("#123456");
    fixture.rows.class.opacity.input("0");
    fixture.rows.class.removeColor.click();
    fixture.rows.class.revertColor.click();
    fixture.target.change("workspace");

    assert.deepEqual(fixture.messages.at(-1), {type: "apply", target: "user"});
    assert.equal(fixture.messages.length, count);
    assert.equal(fixture.target.value, "user");
    assert.equal(fixture.apply.textContent, "Applying...");
    assert.equal(fixture.status.textContent, "Applying changes in this scope...");
    assert.equal(fixture.apply.disabled, true);
    assert.equal(fixture.discard.disabled, true);
    assert.equal(fixture.target.disabled, true);

    for (const row of Object.values(fixture.rows)) {
        assert.equal(row.source.disabled, true);
        assert.equal(row.color.disabled, true);
        assert.equal(row.picker.disabled, true);
        assert.equal(row.opacity.disabled, true);
        assert.equal(row.revertSource.disabled, true);
        assert.equal(row.revertColor.disabled, true);
        assert.equal(row.removeColor.disabled, true);
    }
});

test("restores action states after successful and unsuccessful Apply", async context => {
    for (const isDirty of [false, true]) {
        await context.test(isDirty ? "remaining changes" : "saved changes", () => {
            const fixture = createFixture({class: {color: " #AbC "}});
            fixture.receiveState({isDirty: true});
            fixture.apply.click();
            fixture.receiveState({isDirty: true, isApplying: true});

            assert.equal(fixture.rows.class.color.value, " #AbC ");
            fixture.receiveState({isDirty, isApplying: false});

            assert.equal(fixture.apply.textContent, "Apply");
            assert.equal(fixture.apply.disabled, !isDirty);
            assert.equal(fixture.discard.disabled, !isDirty);
            assert.equal(fixture.target.disabled, false);
            assert.equal(fixture.rows.class.source.disabled, false);
            assert.equal(fixture.rows.class.color.disabled, false);
            assert.equal(fixture.rows.class.picker.disabled, false);
            assert.equal(fixture.rows.class.opacity.disabled, false);
            assert.equal(fixture.rows.class.color.value, " #AbC ");
            assert.equal(
                fixture.status.textContent,
                isDirty ? "Unapplied changes in this scope." : "No unapplied changes in this scope."
            );
        });
    }
});

test("restores inherited and native locks after Apply without losing own colors", () => {
    const fixture = createFixture({
        catch: {source: "inherit", color: "#ABC4"},
        throws: {source: "native", color: "#12345680"}
    });
    fixture.receivePreview({class: {kind: "color", color: "#11223344"}});
    fixture.receiveState({isDirty: true});
    fixture.apply.click();
    fixture.receiveState({isApplying: true});
    fixture.receiveState({isApplying: false, isDirty: false});

    assert.equal(fixture.rows.catch.source.disabled, false);
    assert.equal(fixture.rows.catch.color.disabled, true);
    assert.equal(fixture.rows.catch.picker.disabled, true);
    assert.equal(fixture.rows.catch.opacity.disabled, true);
    assert.equal(fixture.rows.catch.color.value, "#11223344");
    assert.equal(fixture.rows.throws.color.disabled, true);
    assert.equal(fixture.rows.throws.color.value, "");

    fixture.rows.catch.source.change("custom");
    fixture.rows.throws.source.change("custom");

    assert.equal(fixture.rows.catch.color.value, "#ABC4");
    assert.equal(fixture.rows.throws.color.value, "#12345680");
});

test("ignores messages with a missing or invalid Apply state", () => {
    const fixture = createFixture();
    const state = fixture.receiveState({isDirty: true});

    for (const isApplying of [undefined, null, "true", 1]) {
        fixture.receiveMessage({...state, isDirty: false, isApplying});

        assert.equal(fixture.apply.disabled, false);
        assert.equal(fixture.discard.disabled, false);
        assert.equal(fixture.target.disabled, false);
    }
});

test("keeps Apply disabled while switching settings scopes", () => {
    const fixture = createFixture();
    fixture.receiveState({isDirty: true});

    fixture.target.change("workspace");
    fixture.apply.click();
    fixture.discard.click();
    fixture.receiveState({isApplying: false, isDirty: true});

    assert.deepEqual(fixture.messages.at(-1), {type: "selectTarget", target: "workspace"});
    assert.equal(fixture.apply.disabled, true);
    assert.equal(fixture.discard.disabled, true);
    assert.equal(fixture.target.disabled, true);
});

test("keeps editing locked until the initial state arrives", () => {
    const fixture = createFixture({}, {ready: false});

    assert.equal(fixture.target.disabled, true);
    assert.equal(fixture.apply.disabled, true);
    assert.equal(fixture.discard.disabled, true);

    for (const row of Object.values(fixture.rows)) {
        assert.equal(row.source.disabled, true);
        assert.equal(row.color.disabled, true);
    }

    fixture.receiveState();

    assert.equal(fixture.target.disabled, false);
    assert.equal(fixture.rows.class.source.disabled, false);
});

test("preserves every alpha byte when confirming the displayed percentage", () => {
    const fixture = createFixture();
    const row = fixture.rows.class;

    for (let alpha = 0; alpha <= 255; alpha++) {
        const color = "#AbCdEf" + alpha.toString(16).padStart(2, "0");
        row.color.input(color);
        const percentage = String(Math.round((alpha * 1000) / 255) / 10);
        assert.equal(row.percent.value, percentage, String(alpha));
        const count = fixture.messages.length;

        row.percent.input(percentage);
        row.percent.emit("blur");

        assert.equal(row.color.value, color, String(alpha));
        assert.equal(fixture.messages.length, count, String(alpha));
    }
});

test("preserves percentage text while editing and normalizes it on Enter or blur", () => {
    const fixture = createFixture({class: {color: "#112233ff"}});
    const row = fixture.rows.class;

    row.percent.input("50");
    fixture.receiveState({isDirty: true});

    assert.equal(row.color.value, "#11223380");
    assert.equal(row.percent.value, "50");
    let prevented = false;
    row.percent.emit("keydown", {
        key: "Enter",
        preventDefault() {
            prevented = true;
        }
    });

    assert.equal(prevented, true);
    assert.equal(row.percent.value, "50.2");

    for (const [value, color, displayed] of [
        ["25,5", "#11223341", "25.5"],
        [".5", "#11223301", "0.4"],
        ["0", "#11223300", "0"],
        ["100", "#112233ff", "100"]
    ]) {
        row.percent.input(value);
        assert.equal(row.color.value, color);
        assert.equal(row.percent.value, value);
        row.percent.emit("blur");
        assert.equal(row.percent.value, displayed);
    }
});

test("restores the last valid percentage after incomplete or invalid input", () => {
    const fixture = createFixture();
    const row = fixture.rows.class;
    const count = fixture.messages.length;

    for (const value of ["", ".", "-1", "101", "100.1", "1e2", "50.25"]) {
        row.percent.input(value);

        assert.equal(row.percent.attributes.get("aria-invalid"), "true");
        assert.equal(row.color.value, "#11223380");
        assert.equal(fixture.messages.length, count);
        row.percent.emit("blur");
        assert.equal(row.percent.value, "50.2");
        assert.equal(row.percent.attributes.get("aria-invalid"), "false");
    }
});

test("applies an acknowledged percentage without sending another edit on blur", () => {
    const fixture = createFixture({class: {color: "#112233ff"}});
    const row = fixture.rows.class;
    row.percent.input("50");
    fixture.receiveState({isDirty: true});
    const count = fixture.messages.length;

    row.percent.emit("blur");
    fixture.apply.click();

    assert.equal(fixture.messages.length, count + 1);
    assert.deepEqual(fixture.messages.at(-1), {type: "apply", target: "user"});
    assert.equal(row.color.value, "#11223380");
    assert.equal(row.percent.disabled, true);
});
