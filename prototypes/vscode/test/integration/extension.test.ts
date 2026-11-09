import assert from "node:assert/strict";
import {test} from "node:test";
import type {TestContext} from "node:test";

import * as vscode from "vscode";

import {ThrowableHighlightingFinder} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingFinder";
import {ThrowableDecorationController} from "@throwable-highlighter/decorations/ThrowableDecorationController";
import {OPEN_DIAGNOSTICS_COMMAND} from "@throwable-highlighter/diagnostics/ThrowableHighlightingStatus";
import {activate} from "@throwable-highlighter/extension";
import {JavaTypeDefinitionResolver} from "@throwable-highlighter/resolution/JavaTypeDefinitionResolver";
import type {ResourceMeasurementSnapshot} from "@throwable-highlighter/diagnostics/ThrowableResourceMeasurement";

test("refreshes editors after late Java readiness without blocking activation", async context => {
    context.mock.timers.enable({apis: ["setTimeout"]});
    const fixture = createFixture(context);

    assert.equal(activate(fixture.extensionContext), undefined);
    assert.equal(fixture.languageStatus.busy, true);
    assert.equal(fixture.languageStatus.text, "Waiting for Java");
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
    assert.equal(fixture.languageStatus.busy, false);
    assert.equal(fixture.languageStatus.text, "Ready");
});

test("does not refresh after extension subscriptions are disposed", async context => {
    const fixture = createFixture(context);
    const disposeResolver = context.mock.method(JavaTypeDefinitionResolver.prototype, "dispose");

    activate(fixture.extensionContext);
    await flushTasks();

    fixture.dispose();
    assert.equal(disposeResolver.mock.callCount(), 1);
    assert.equal(fixture.disposeDiagnostics.mock.callCount(), 1);

    fixture.ready.resolve(true);
    await flushTasks();

    assert.deepEqual(fixture.operations, ["refresh"]);
    assert.equal(fixture.appendDiagnosticLine.mock.callCount(), 0);
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
    assert.ok(Number.isFinite(Date.parse(initial.capturedAtUtc)));

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

    assert.equal(fixture.disposeLanguageStatus.mock.callCount(), 1);

    context.mock.timers.tick(3000);

    assert.equal(resourceMeasurements(fixture).length, 1);
    assert.equal(readMemoryUsage.mock.callCount(), 1);
    assert.equal(readResolverSnapshot.mock.callCount(), 1);
});

test("writes Java readiness failures only to the diagnostics channel", async context => {
    const fixture = createFixture(context);
    fixture.getExtension.mock.mockImplementation(() => {
        throw new Error("Private Java startup details");
    });
    let nowMs = 100;
    context.mock.method(performance, "now", () => nowMs);

    activate(fixture.extensionContext);
    nowMs = 117.456789;
    await flushTasks();

    assert.equal(fixture.languageStatus.busy, false);
    assert.equal(fixture.languageStatus.text, "Java readiness unconfirmed");

    const messages = fixture.appendDiagnosticLine.mock.calls.map(call => call.arguments[0]);
    assert.equal(messages.length, 1);

    const prefix = "[java-readiness] ";
    assert.ok(messages[0].startsWith(prefix));
    const {elapsedMs, ...result} = JSON.parse(messages[0].slice(prefix.length));
    assert.deepEqual(result, {outcome: "check-failed"});
    assert.equal(elapsedMs, 17.457);
    assert.deepEqual(
        fixture.appendLine.mock.calls.map(call => call.arguments[0]),
        ["Decoration controller activated."]
    );
    assert.deepEqual(fixture.operations, ["refresh"]);
});

test("writes only classified highlighting failure details to the diagnostics channel", context => {
    context.mock.timers.enable({apis: ["setTimeout"]});
    const fixture = createFixture(context);
    fixture.refresh.mock.restore();

    const privatePath = "/private/workspace/PrivateException.java";
    const document = {
        languageId: "java",
        uri: {scheme: "file", path: privatePath},
        version: 1
    } as vscode.TextDocument;

    const editor = {document} as vscode.TextEditor;

    context.mock.getter(vscode.window, "activeTextEditor", () => editor);
    context.mock.getter(vscode.window, "visibleTextEditors", () => [editor]);

    context.mock.method(ThrowableHighlightingFinder.prototype, "findCandidates", () => {
        throw new Error(`PrivateException at ${privatePath}`);
    });
    const readResolverSnapshot = context.mock.method(JavaTypeDefinitionResolver.prototype, "getResourceSnapshot");

    let nowMs = 100;
    context.mock.method(performance, "now", () => nowMs);

    activate(fixture.extensionContext);
    nowMs = 117.456789;
    context.mock.timers.tick(0);

    assert.equal(fixture.languageStatus.text, "Highlighting update failed");
    assert.equal(fixture.appendDiagnosticLine.mock.callCount(), 1);
    assert.equal(readResolverSnapshot.mock.callCount(), 1);

    const [message] = fixture.appendDiagnosticLine.mock.calls[0].arguments;
    const prefix = "[highlighting-refresh] ";
    assert.ok(message.startsWith(prefix));
    const {elapsedMs, ...result} = JSON.parse(message.slice(prefix.length));
    assert.deepEqual(result, {
        generation: 1,
        outcome: "failed",
        stage: "prepare",
        resolver: readResolverSnapshot.mock.calls[0].result
    });
    assert.equal(elapsedMs, 17.457);
    assert.doesNotMatch(message, /PrivateException|\/private\/workspace/);
    assert.deepEqual(
        fixture.appendLine.mock.calls.map(call => call.arguments[0]),
        ["Decoration controller activated."]
    );
});

test("opens the diagnostics channel from the Java language status command", context => {
    const fixture = createFixture(context);

    activate(fixture.extensionContext);

    assert.deepEqual(
        fixture.createLanguageStatusItem.mock.calls.map(call => call.arguments[1]),
        [{language: "java", scheme: "file"}]
    );
    assert.deepEqual(fixture.languageStatus.command, {
        command: OPEN_DIAGNOSTICS_COMMAND,
        title: "Open Diagnostics"
    });

    const registration = fixture.registerCommand.mock.calls.find(
        call => call.arguments[0] === OPEN_DIAGNOSTICS_COMMAND
    );
    assert.ok(registration);

    registration.arguments[1]();

    assert.deepEqual(
        fixture.showDiagnostics.mock.calls.map(call => call.arguments),
        [[true]]
    );
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
    const refresh = context.mock.method(ThrowableDecorationController.prototype, "refresh", () => {
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

    const showDiagnostics = context.mock.fn((_preserverFocus?: boolean): void => {});

    const appendDiagnosticLine = context.mock.fn((_message: string): void => {});
    const disposeDiagnostics = context.mock.fn();
    const diagnosticsOutputChannel = {
        appendLine: appendDiagnosticLine,
        dispose: disposeDiagnostics,
        show: showDiagnostics
    } as unknown as vscode.OutputChannel;

    const disposeLanguageStatus = context.mock.fn();
    const languageStatus: vscode.LanguageStatusItem = {
        id: "test-highlighting-status",
        name: undefined,
        selector: [],
        severity: 0,
        text: "",
        busy: false,
        command: undefined,
        dispose: disposeLanguageStatus
    };

    const createLanguageStatusItem = context.mock.method(
        vscode.languages,
        "createLanguageStatusItem",
        (_id: string, _selector: vscode.DocumentSelector) => languageStatus
    );

    context.mock.method(vscode.window, "createOutputChannel", (name: string) =>
        name === "Throwable Highlighter Diagnostics" ? diagnosticsOutputChannel : outputChannel
    );
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

    const registerCommand = context.mock.method(
        vscode.commands,
        "registerCommand",
        (_command: string, _callback: (...args: unknown[]) => unknown) => ({dispose: context.mock.fn()})
    );

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

    return {
        extensionContext,
        ready,
        operations,
        getExtension,
        dispose,
        refresh,
        disposeDiagnostics,
        onDidChangeTextDocument,
        appendLine,
        appendDiagnosticLine,
        languageStatus,
        createLanguageStatusItem,
        disposeLanguageStatus,
        registerCommand,
        showDiagnostics
    };
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
