import {waitForJavaSupport} from "./support/javaSupport";

suite("Java support", () => {
    test("starts the standard Java server for the fixture workspace", async () => {
        await waitForJavaSupport();
    });
});
