import assert from "node:assert/strict";
import {test} from "node:test";
import type {TestContext} from "node:test";

import {JavaSupportReadiness} from "@throwable-highlighter/integration/JavaSupportReadiness";
import type {
    JavaSupportReadinessOutcome,
    JavaSupportReadinessResult
} from "@throwable-highlighter/integration/JavaSupportReadiness";

type JavaExtensionLookup = ConstructorParameters<typeof JavaSupportReadiness>[0];

test("waits for readiness without blocking the caller", async context => {
    const fixture = createFixture(context);

    assert.equal(fixture.readiness.start(), undefined);
    await flushTasks();

    assert.equal(fixture.activate.mock.callCount(), 1);
    assert.equal(fixture.serverReady.mock.callCount(), 1);
    assertReadinessOutcomes(fixture);

    fixture.ready.resolve(true);
    await flushTasks();

    assertReadinessOutcomes(fixture, "ready");
});

test("handles an already ready server", async context => {
    const fixture = createFixture(context);
    fixture.ready.resolve(true);

    fixture.readiness.start();
    await flushTasks();

    assertReadinessOutcomes(fixture, "ready");
});

test("starts readiness waiting only once", async context => {
    const fixture = createFixture(context);

    fixture.readiness.start();
    fixture.readiness.start();
    await flushTasks();

    fixture.ready.resolve(true);
    await flushTasks();

    fixture.readiness.start();
    await flushTasks();

    assert.equal(fixture.getJavaExtension.mock.callCount(), 1);
    assert.equal(fixture.activate.mock.callCount(), 1);
    assert.equal(fixture.serverReady.mock.callCount(), 1);
    assertReadinessOutcomes(fixture, "ready");
});

test("handles an unavailable Java extension", async context => {
    const fixture = createFixture(context);
    fixture.getJavaExtension.mock.mockImplementation(() => undefined);

    fixture.readiness.start();
    await flushTasks();

    assert.equal(fixture.activate.mock.callCount(), 0);
    assertReadinessOutcomes(fixture, "extension-unavailable");
});

test("handles incompatible Java APIs", async context => {
    const cases = [
        ["undefined API", undefined],
        ["null API", null],
        ["missing method", {}],
        ["non-callable method", {serverReady: true}]
    ] as const;

    for (const [name, api] of cases) {
        await context.test(name, async current => {
            const fixture = createFixture(current);

            fixture.activate.mock.mockImplementation(async () => api);

            fixture.readiness.start();
            await flushTasks();

            assert.equal(fixture.serverReady.mock.callCount(), 0);
            assertReadinessOutcomes(fixture, "api-unavailable");
        });
    }
});

test("reports activation and readiness failures", async context => {
    for (const stage of ["activation", "readiness"] as const) {
        await context.test(stage, async current => {
            const fixture = createFixture(current);
            const failure = new Error("Java startup failed");
            const reject = async (): Promise<never> => {
                throw failure;
            };

            if (stage === "activation") {
                fixture.activate.mock.mockImplementation(reject);
            } else {
                fixture.serverReady.mock.mockImplementation(reject);
            }

            fixture.readiness.start();
            await flushTasks();

            assertReadinessOutcomes(fixture, "check-failed");
        });
    }
});

test("does not refresh when readiness is not confirmed", async context => {
    const fixture = createFixture(context);
    fixture.ready.resolve(false);

    fixture.readiness.start();
    await flushTasks();

    assertReadinessOutcomes(fixture, "server-unconfirmed");
});

test("ignores readiness completion after disposal", async context => {
    for (const fails of [false, true]) {
        await context.test(fails ? "rejected readiness" : "confirmed readiness", async current => {
            const fixture = createFixture(current);

            fixture.readiness.start();
            await flushTasks();
            fixture.readiness.dispose();

            if (fails) {
                fixture.ready.reject(new Error("Java startup failed"));
            } else {
                fixture.ready.resolve(true);
            }

            await flushTasks();

            assertReadinessOutcomes(fixture);
        });
    }
});

test("does not wait for readiness after disposal during activation", async context => {
    const fixture = createFixture(context);
    const activation = createDeferred<unknown>();
    fixture.activate.mock.mockImplementation(() => activation.promise);

    fixture.readiness.start();
    fixture.readiness.dispose();

    activation.resolve({serverReady: fixture.serverReady});
    await flushTasks();

    assert.equal(fixture.serverReady.mock.callCount(), 0);
    assertReadinessOutcomes(fixture);
});

test("does not activate Java after disposal", async context => {
    const fixture = createFixture(context);
    fixture.readiness.dispose();

    fixture.readiness.start();
    await flushTasks();

    assert.equal(fixture.getJavaExtension.mock.callCount(), 0);
    assert.equal(fixture.activate.mock.callCount(), 0);
    assertReadinessOutcomes(fixture);
});

function createFixture(context: TestContext) {
    const ready = createDeferred<boolean>();
    const serverReady = context.mock.fn(() => ready.promise);
    const activate = context.mock.fn(async (): Promise<unknown> => ({serverReady}));
    const getJavaExtension = context.mock.fn<JavaExtensionLookup>(() => ({activate}));

    const onResult = context.mock.fn<(result: JavaSupportReadinessResult) => void>();
    const readiness = new JavaSupportReadiness(getJavaExtension, onResult);
    context.after(() => readiness.dispose());

    return {readiness, ready, serverReady, activate, getJavaExtension, onResult};
}

function assertReadinessOutcomes(
    fixture: ReturnType<typeof createFixture>,
    ...expected: JavaSupportReadinessOutcome[]
): void {
    assert.deepEqual(
        fixture.onResult.mock.calls.map(call => call.arguments[0].outcome),
        expected
    );
}

function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;

    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return {promise, resolve, reject};
}

async function flushTasks(): Promise<void> {
    await new Promise<void>(resolve => setImmediate(resolve));
}
