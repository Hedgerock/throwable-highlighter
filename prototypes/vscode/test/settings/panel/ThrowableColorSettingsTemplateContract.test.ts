import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {test} from "node:test";

test("matches template placeholders to their documented contract", async context => {
    const root = resolve(__dirname, "../../../..");
    const contracts: Record<string, Record<string, string>> = JSON.parse(
        await readFile(resolve(root, "tooling/template-variables.json"), "utf-8")
    );

    assert.deepEqual(Object.keys(contracts).sort(), [
        "context-row.html",
        "index.html",
        "invalid-context-row.html",
        "source-option.html"
    ]);

    for (const [fileName, descriptions] of Object.entries(contracts)) {
        await context.test(fileName, async () => {
            const html = await readFile(resolve(root, "webview/color-settings", fileName), "utf-8");

            const placeholders = [...new Set([...html.matchAll(/{{([^{}]*)}}/g)].map(match => match[1]))].sort();

            assert.deepEqual(placeholders, Object.keys(descriptions).sort());

            for (const [name, description] of Object.entries(descriptions)) {
                assert.equal(typeof description, "string", name);
                assert.notEqual(description.trim(), "", name);
            }
        });
    }
});
