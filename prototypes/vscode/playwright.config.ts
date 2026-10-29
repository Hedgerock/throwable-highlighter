import {defineConfig} from "@playwright/test";

export default defineConfig({
    testDir: "./test/browser",
    testMatch: "**/*.spec.ts",
    tsconfig: "./tsconfig.browser.json",
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    workers: 1,
    retries: 0,
    timeout: 30_000,
    globalTimeout: 180_000,
    expect: {
        timeout: 5_000
    },
    reporter: [["list"], ["html", {open: "never"}]],
    outputDir: "./test-results",
    use: {
        browserName: "chromium",
        viewport: {width: 1280, height: 900},
        deviceScaleFactor: 1,
        locale: "en-US",
        timezoneId: "UTC",
        trace: "retain-on-failure",
        screenshot: "only-on-failure"
    }
});
