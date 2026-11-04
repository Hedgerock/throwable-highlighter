import assert from "node:assert/strict";
import {test} from "node:test";
import type {TestContext} from "node:test";

import * as vscode from "vscode";

import {ThrowableDecorationController} from "@throwable-highlighter/decorations/ThrowableDecorationController";
import {activate} from "@throwable-highlighter/extension";
import {JavaTypeDefinitionResolver} from "@throwable-highlighter/resolution/JavaTypeDefinitionResolver";
import type {ResourceMeasurementSnapshot} from "@throwable-highlighter/diagnostics/ThrowableResourceMeasurement";

test("refreshes editors after late Java readiness without blocking activation", async context => {
    context.mock.timers.enable({apis: ["setTimeout"]});
    const fixture = createFixture(context);

    assert.equal(activate(fixture.extensionContext), undefined);
    await flushTasks();

    assert.deepEqual(fixture.operations, ["refresh"]);
    assert.deepEqual(
        fixture.getExtension.mock.calls.map(call => call.arguments),
        [["redhat.java"]]
    );

    context.mock.timers.tick(30_000);
    await flushTasks();

    assert.deepEqual(fixture.operations, ["refresh"]);

    fixture.ready.resolve(true);
    await flushTasks();

    assert.deepEqual(fixture.operations, ["refresh", "clearCache", "refresh"]);
});

test("does not refresh after extension subscriptions are disposed", async context => {
    const fixture = createFixture(context);

    activate(fixture.extensionContext);
    await flushTasks();

    fixture.dispose();
    fixture.ready.resolve(true);
    await flushTasks();

    assert.deepEqual(fixture.operations, ["refresh"]);
});

test("refreshes after content edits and ignores Output and dirty-state events", context => {
    const fixture = createFixture(context);
    activate(fixture.extensionContext);

    const [onChange] = fixture.onDidChangeTextDocument.mock.calls[0].arguments;
    const position = {line: 0, character: 0} as vscode.Position;
    const contentChanges = [{range: new vscode.Range(position, position), rangeOffset: 0, rangeLength: 0, text: "x"}];
    const output = {uri: {scheme: "output"}} as vscode.TextDocument;
    const file = {uri: {scheme: "file"}} as vscode.TextDocument;

    onChange({document: output, contentChanges, reason: undefined});
    assert.deepEqual(fixture.operations, ["refresh"]);

    onChange({document: file, contentChanges: [], reason: undefined});
    assert.deepEqual(fixture.operations, ["refresh"]);

    onChange({document: file, contentChanges, reason: undefined});
    assert.deepEqual(fixture.operations, ["refresh", "clearCache", "refresh"]);
});

test("keeps resource measurements disabled without the exact enabling flag", async context => {
    for (const flag of [undefined, "0", "true", ""]) {
        await context.test(flag === undefined ? "missing flag" : JSON.stringify(flag), current => {
            current.mock.timers.enable({apis: ["setInterval"]});
            const fixture = createFixture(current, flag);
            const readMemoryUsage = current.mock.method(process, "memoryUsage");
            const readResolverSnapshot = current.mock.method(
                JavaTypeDefinitionResolver.prototype,
                "getResourceSnapshot"
            );

            activate(fixture.extensionContext);
            current.mock.timers.tick(3000);

            assert.equal(readMemoryUsage.mock.callCount(), 0);
            assert.equal(readResolverSnapshot.mock.callCount(), 0);
            assert.deepEqual(resourceMeasurements(fixture), []);
        });
    }
});

test("records resource measurements when enabled without requesting refreshes", context => {
    context.mock.timers.enable({apis: ["setInterval"]});
    const fixture = createFixture(context, "1");
    const readMemoryUsage = context.mock.method(process, "memoryUsage");
    const readResolverSnapshot = context.mock.method(JavaTypeDefinitionResolver.prototype, "getResourceSnapshot");

    activate(fixture.extensionContext);

    const [initial] = resourceMeasurements(fixture);

    assert.equal(resourceMeasurements(fixture).length, 1);
    assert.equal(initial.processId, process.pid);
    assert.ok(initial.elapsedMs >= 0);
    assert.deepEqual(initial.memory, readMemoryUsage.mock.calls[0].result);
    assert.deepEqual(initial.resolver, readResolverSnapshot.mock.calls[0].result);

    context.mock.timers.tick(1000);

    assert.equal(resourceMeasurements(fixture).length, 2);
    assert.equal(readMemoryUsage.mock.callCount(), 2);
    assert.equal(readResolverSnapshot.mock.callCount(), 2);
    assert.deepEqual(fixture.operations, ["refresh"]);
});

test("stops resource measurements when extension subscriptions are disposed", context => {
    context.mock.timers.enable({apis: ["setInterval"]});
    const fixture = createFixture(context, "1");
    const readMemoryUsage = context.mock.method(process, "memoryUsage");
    const readResolverSnapshot = context.mock.method(JavaTypeDefinitionResolver.prototype, "getResourceSnapshot");

    activate(fixture.extensionContext);
    fixture.dispose();

    context.mock.timers.tick(3000);

    assert.equal(resourceMeasurements(fixture).length, 1);
    assert.equal(readMemoryUsage.mock.callCount(), 1);
    assert.equal(readResolverSnapshot.mock.callCount(), 1);
});

function createFixture(context: TestContext, resourceMeasurementFlag?: string) {
    const previousResourceMeasurementFlag = process.env.THROWABLE_HIGHLIGHTER_MEASURE_RESOURCES;

    if (resourceMeasurementFlag === undefined) {
        delete process.env.THROWABLE_HIGHLIGHTER_MEASURE_RESOURCES;
    } else {
        process.env.THROWABLE_HIGHLIGHTER_MEASURE_RESOURCES = resourceMeasurementFlag;
    }

    const operations: string[] = [];
    const ready = createDeferred<boolean>();
    const subscriptions: vscode.Disposable[] = [];
    const extensionUri = {scheme: "file", path: "/extension"} as vscode.Uri;
    const extensionContext = {subscriptions, extensionUri} as vscode.ExtensionContext;
    const javaExtension = {
        activate: async () => ({serverReady: () => ready.promise})
    };

    const getExtension = context.mock.method(
        vscode.extensions,
        "getExtension",
        <T>(_extensionId: string): vscode.Extension<T> | undefined => javaExtension as unknown as vscode.Extension<T>
    );

    context.mock.method(JavaTypeDefinitionResolver.prototype, "clearCache", () => {
        operations.push("clearCache");
    });
    context.mock.method(ThrowableDecorationController.prototype, "refresh", () => {
        operations.push("refresh");
    });

    const appendLine = context.mock.fn((_message: string): void => {});

    const outputChannel = {
        appendLine,
        dispose: context.mock.fn()
    } as unknown as vscode.OutputChannel;

    const configuration = {
        get: () => undefined,
        inspect: () => undefined
    } as unknown as vscode.WorkspaceConfiguration;

    context.mock.method(vscode.window, "createOutputChannel", () => outputChannel);
    context.mock.method(vscode.workspace, "getConfiguration", () => configuration);
    context.mock.method(vscode.Uri, "joinPath", () => extensionUri);
    context.mock.method(vscode.window, "createTextEditorDecorationType", () => ({
        key: "test-decoration",
        dispose: context.mock.fn()
    }));

    const subscribe = (_listener: unknown): vscode.Disposable => ({dispose: context.mock.fn()});
    const onDidChangeTextDocument = context.mock.method(
        vscode.workspace,
        "onDidChangeTextDocument",
        (listener: (event: vscode.TextDocumentChangeEvent) => unknown) => subscribe(listener)
    );

    context.mock.method(vscode.window, "onDidChangeActiveTextEditor", subscribe);
    context.mock.method(vscode.window, "onDidChangeVisibleTextEditors", subscribe);
    context.mock.method(vscode.workspace, "onDidCreateFiles", subscribe);
    context.mock.method(vscode.workspace, "onDidDeleteFiles", subscribe);
    context.mock.method(vscode.workspace, "onDidRenameFiles", subscribe);
    context.mock.method(vscode.workspace, "onDidChangeWorkspaceFolders", subscribe);
    context.mock.method(vscode.workspace, "onDidChangeConfiguration", subscribe);
    context.mock.method(vscode.commands, "registerCommand", () => ({dispose: context.mock.fn()}));

    const dispose = (): void => {
        for (const subscription of subscriptions.splice(0)) {
            subscription.dispose();
        }
    };

    context.after(() => {
        dispose();

        if (previousResourceMeasurementFlag === undefined) {
            delete process.env.THROWABLE_HIGHLIGHTER_MEASURE_RESOURCES;
        } else {
            process.env.THROWABLE_HIGHLIGHTER_MEASURE_RESOURCES = previousResourceMeasurementFlag;
        }
    });

    return {extensionContext, ready, operations, getExtension, dispose, onDidChangeTextDocument, appendLine};
}

function resourceMeasurements(fixture: ReturnType<typeof createFixture>): ResourceMeasurementSnapshot[] {
    const prefix = "[resource-measurement] ";

    return fixture.appendLine.mock.calls
        .map(call => call.arguments[0])
        .filter(message => message.startsWith(prefix))
        .map(message => JSON.parse(message.slice(prefix.length)) as ResourceMeasurementSnapshot);
}

function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>(resolvePromise => {
        resolve = resolvePromise;
    });

    return {promise, resolve};
}

async function flushTasks(): Promise<void> {
    await new Promise<void>(resolve => setImmediate(resolve));
}
