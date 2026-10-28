import assert from "node:assert/strict";
import {test} from "node:test";

import {createThrowableColorSettingsWebviewFixture as createFixture} from "../../support/webview/ThrowableColorSettingsWebviewFixture";

test("initializes visual controls from HEX without changing the draft", async context => {
    const cases = [
        {value: "#ABC", rgb: "#aabbcc", alpha: 255, percentage: "100%", fill: "#aabbcc"},
        {value: "#1234", rgb: "#112233", alpha: 68, percentage: "26.7%", fill: "#11223344"},
        {value: "#112233", rgb: "#112233", alpha: 255, percentage: "100%", fill: "#112233"},
        {value: "#11223380", rgb: "#112233", alpha: 128, percentage: "50.2%", fill: "#11223380"},
        {value: "#11223300", rgb: "#112233", alpha: 0, percentage: "0%", fill: "#11223300"}
    ] as const;

    for (const current of cases) {
        await context.test(current.value, () => {
            const fixture = createFixture({class: {color: current.value}});
            const row = fixture.rows.class;
            fixture.receivePreview({class: {kind: "color", color: current.value}});

            assert.equal(row.color.value, current.value);
            assert.equal(row.picker.value, current.rgb);
            assert.equal(row.opacity.valueAsNumber, current.alpha);
            assert.equal(row.output.textContent, current.percentage);
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
        assert.equal(row.output.textContent, "—");
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
    assert.equal(row.output.textContent, "50.2%");

    row.source.change("custom");
    assert.equal(row.color.value, "#ABC4");
    assert.equal(row.opacity.valueAsNumber, 68);
    assert.equal(row.opacity.disabled, false);

    row.source.change("native");
    assert.equal(row.color.value, "");
    assert.equal(row.picker.disabled, true);
    assert.equal(row.opacity.disabled, true);
    assert.equal(row.output.textContent, "—");

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
    assert.equal(row.output.textContent, "50.2%");

    row.removeColor.click();

    assert.equal(row.color.value, "");
    assert.equal(row.opacity.disabled, true);
    assert.equal(row.output.textContent, "—");
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
