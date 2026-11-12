const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const {basename, dirname, join, resolve} = require("node:path");

const TEMP_PREFIX = "throwable-highlighter-build-test-";

function createWorkspace(context) {
    const parent = fs.realpathSync(os.tmpdir());
    const root = fs.mkdtempSync(join(parent, TEMP_PREFIX));

    context.after(() => {
        const target = resolve(root);
        assert.equal(dirname(target), parent);
        assert.ok(basename(target).startsWith(TEMP_PREFIX));
        fs.rmSync(target, {recursive: true, force: true, maxRetries: 3});
    });

    return {root, output: join(root, "out")};
}

function createDirectoryLink(context, target, link) {
    try {
        fs.symlinkSync(target, link, "junction");
        return true;
    } catch (error) {
        if (["EPERM", "EACCES", "ENOSYS", "ENOTSUP"].includes(error.code)) {
            context.skip("Directory links are unavailable: " + error.code);
            return false;
        }

        throw error;
    }
}

module.exports = {createWorkspace, createDirectoryLink};
