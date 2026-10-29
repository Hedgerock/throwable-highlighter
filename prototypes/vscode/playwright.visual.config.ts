import {defineConfig} from "@playwright/test";

import base from "./playwright.config";

if (process.platform !== "linux") {
    throw new Error("Run visual checks in the Playwright Linux container");
}

export default defineConfig({
    ...base,
    testMatch: "**/*.visual.spec.ts",
    testIgnore: [],
    snapshotPathTemplate: "{testDir}/snapshots/{arg}{ext}",
    updateSnapshots: "none",
    expect: {
        ...base.expect,
        toHaveScreenshot: {
            animations: "disabled",
            caret: "hide",
            scale: "css",
            maxDiffPixels: 0
        }
    },
    use: {
        ...base.use,
        reducedMotion: "reduce"
    }
});
