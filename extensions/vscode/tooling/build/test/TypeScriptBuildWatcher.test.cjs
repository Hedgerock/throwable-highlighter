const assert = require("node:assert/strict");
const {resolve} = require("node:path");
const {test} = require("node:test");

const ts = require("typescript");

const {TypeScriptBuildWatcher} = require("../TypeScriptBuildWatcher.cjs");

function createDeferred() {
    let resolve;
    const promise = new Promise(done => {
        resolve = done;
    });
    return {promise, resolve};
}

function createFixture(context, options = {}) {
    const state = {calls: [], errors: [], statuses: [], closes: 0};
    state.watcher = new TypeScriptBuildWatcher("tsconfig.json", {
        runner: {
            async build(config) {
                state.calls.push(config);
            }
        },
        onError: error => state.errors.push(error),
        onStatus: message => state.statuses.push(message),
        createWatchProgram(host) {
            state.host = host;
            state.initial = host.afterProgramCreate();
            return {
                close() {
                    state.closes++;
                }
            };
        },
        ...options
    });
    context.after(() => state.watcher.dispose());
    return state;
}

test("starts a build through the runner when the watch program is created", async context => {
    // Arrange
    const state = createFixture(context);

    // Act
    await state.initial;

    // Assert
    assert.deepEqual(state.calls, [resolve("tsconfig.json")]);
    assert.deepEqual(state.errors, []);
    assert.match(state.statuses.at(-1), /Build completed/);
    assert.throws(() => state.host.writeFile("unexpected.js", "content"), /cannot write build outputs/);
});

test("queues subsequent program updates without overlapping builds", async context => {
    // Arrange
    const started = createDeferred();
    const release = createDeferred();
    let calls = 0;
    let active = 0;
    let maximumActive = 0;
    const state = createFixture(context, {
        runner: {
            async build() {
                calls++;
                active++;
                maximumActive = Math.max(maximumActive, active);
                try {
                    if (calls === 1) {
                        started.resolve();
                        await release.promise;
                    }
                } finally {
                    active--;
                }
            }
        }
    });
    await started.promise;

    // Act
    const pending = [state.host.afterProgramCreate(), state.host.afterProgramCreate()];

    // Assert
    assert.equal(calls, 1);

    // Act
    release.resolve();
    await Promise.all([state.initial, ...pending]);

    // Assert
    assert.equal(calls, 2);
    assert.equal(maximumActive, 1);
});

test("reports a failed build and accepts the next program update", async context => {
    // Arrange
    const expected = new Error("Build failed.");
    let calls = 0;
    const state = createFixture(context, {
        runner: {
            async build() {
                calls++;
                if (calls === 1) {
                    throw expected;
                }
            }
        }
    });

    // Act
    await state.initial;
    await state.host.afterProgramCreate();

    // Assert
    assert.equal(calls, 2);
    assert.deepEqual(state.errors, [expected]);
});

test("closes the watch once and ignores callbacks after disposal", async context => {
    // Arrange
    const state = createFixture(context);
    await state.initial;

    // Act
    await state.watcher.dispose();
    await state.watcher.dispose();
    await state.host.afterProgramCreate();

    // Assert
    assert.equal(state.closes, 1);
    assert.equal(state.calls.length, 1);
});

test("reports a configuration failure from a scheduled callback without terminating the watch", async context => {
    // Arrange
    let scheduled;
    const state = createFixture(context, {
        system: {
            ...ts.sys,
            setTimeout(callback) {
                scheduled = callback;
                return 1;
            }
        }
    });
    await state.initial;
    const diagnostic = {
        category: ts.DiagnosticCategory.Error,
        code: 5083,
        messageText: "Cannot read configuration.",
        file: undefined,
        start: undefined,
        length: undefined
    };
    state.host.setTimeout(() => state.host.onUnRecoverableConfigFileDiagnostic(diagnostic), 0);

    // Act
    scheduled();
    await state.host.afterProgramCreate();

    // Assert
    assert.equal(state.errors.length, 1);
    assert.match(state.errors[0].message, /TS5083/);
    assert.equal(state.calls.length, 2);
});

test("cancels a queued build when watch creation fails", async () => {
    // Arrange
    const expected = new Error("Watch creation failed.");
    let calls = 0;
    let initial;

    // Act
    const act = () =>
        new TypeScriptBuildWatcher("tsconfig.json", {
            runner: {
                async build() {
                    calls++;
                }
            },
            createWatchProgram(host) {
                initial = host.afterProgramCreate();
                throw expected;
            }
        });

    // Assert
    assert.throws(act, error => error === expected);
    await initial;
    assert.equal(calls, 0);
});
