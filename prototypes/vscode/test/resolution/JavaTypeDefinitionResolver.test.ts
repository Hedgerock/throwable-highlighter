import * as vscode from "vscode";
import assert from "node:assert/strict";
import {test} from "node:test";
import {JavaTypeDefinitionResolver} from "@throwable-highlighter/resolution/JavaTypeDefinitionResolver";
import {JavaCodeMask} from "@throwable-highlighter/java/JavaCodeMask";
import type {TestContext} from "node:test";

test("caches confirmed results after resolving a class declaration", async context => {
    const cases = [
        {
            name: "standard Throwable type",
            source: "package java.lang; public class |RuntimeException extends Exception {}",
            expected: true
        },
        {
            name: "unrelated class with a known simple name",
            source: "package example; class |RuntimeException {}",
            expected: false
        },
        {
            name: "nested class with a known simple name",
            source: "package java.lang; class Outer { class |RuntimeException {} }",
            expected: false
        }
    ] as const;

    for (const scenario of cases) {
        await context.test(scenario.name, async current => {
            const usage = createFixture("class Usage { |RuntimeException value; }");
            const definition = createFixture(scenario.source, "jdt://contents/RuntimeException.java");
            const location = new vscode.Location(definition.document.uri, definition.range);

            const provider = current.mock.method(vscode.commands, "executeCommand", async () => [location]);

            const documentProvider = current.mock.method(
                vscode.workspace,
                "openTextDocument",
                async () => definition.document
            );

            const resolver = new JavaTypeDefinitionResolver(new JavaCodeMask());

            assert.equal(await resolver.isThrowableType(usage.document, usage.range.start), scenario.expected);
            assert.equal(provider.mock.callCount(), 1);
            assert.equal(documentProvider.mock.callCount(), 1);

            assert.deepEqual(provider.mock.calls[0].arguments, [
                "vscode.executeDefinitionProvider",
                usage.document.uri,
                usage.range.start
            ]);

            assert.deepEqual(documentProvider.mock.calls[0].arguments, [definition.document.uri]);

            assert.equal(await resolver.isThrowableType(usage.document, usage.range.start), scenario.expected);
            assert.equal(provider.mock.callCount(), 1);

            assert.equal(documentProvider.mock.callCount(), 1);
        });
    }
});

test("does not confirm or cache a known name without a definition", async context => {
    for (const source of [
        "class Usage { |RuntimeException value; }",
        "class Usage { java.lang.|RuntimeException value; }"
    ]) {
        await context.test(source, async current => {
            const usage = createFixture(source);
            const provider = current.mock.method(vscode.commands, "executeCommand", async () => undefined);

            const documentProvider = current.mock.method(vscode.workspace, "openTextDocument", async () => {
                assert.fail("An unavailable definition must not open a document.");
            });

            const resolver = new JavaTypeDefinitionResolver(new JavaCodeMask());

            assert.equal(await resolver.isThrowableType(usage.document, usage.range.start), false);
            assert.equal(provider.mock.callCount(), 1);

            assert.equal(await resolver.isThrowableType(usage.document, usage.range.start), false);
            assert.equal(provider.mock.callCount(), 2);
            assert.equal(documentProvider.mock.callCount(), 0);

            for (const call of provider.mock.calls) {
                assert.deepEqual(call.arguments, [
                    "vscode.executeDefinitionProvider",
                    usage.document.uri,
                    usage.range.start
                ]);
            }
        });
    }
});

test("resolves constructor definitions through their declaring classes", async context => {
    const standard = createConstructorFixture(
        "RuntimeException",
        "java.lang",
        "Exception",
        "jdt://contents/RuntimeException.java"
    );

    const cases = [
        {
            name: "user-defined class",
            target: createConstructorFixture(
                "CustomException",
                "example",
                "RuntimeException",
                "file:///CustomException.java"
            ),
            resolvesParent: true
        },
        {
            name: "standard class",
            target: standard,
            resolvesParent: false
        }
    ] as const;

    for (const scenario of cases) {
        const target = scenario.target;
        const definitions: {name: string; value: vscode.Location | vscode.LocationLink}[] = [
            {
                name: "Location at the constructor name",
                value: new vscode.Location(target.document.uri, target.constructorSymbol.selectionRange)
            },
            {
                name: "Location at the public modifier",
                value: new vscode.Location(target.document.uri, target.constructorSymbol.range)
            },
            {
                name: "LocationLink with a selection range",
                value: {
                    targetUri: target.document.uri,
                    targetRange: target.documentedConstructorRange,
                    targetSelectionRange: target.constructorSymbol.selectionRange
                }
            },
            {
                name: "LocationLink without a selection range",
                value: {
                    targetUri: target.document.uri,
                    targetRange: target.constructorSymbol.range
                }
            }
        ];

        for (const definition of definitions) {
            await context.test(scenario.name + ": " + definition.name, async current => {
                const usage = createFixture("class Usage { Object value = new |" + target.name + "(); }");
                const standardLocation = new vscode.Location(
                    standard.document.uri,
                    standard.classSymbol.selectionRange
                );

                const provider = current.mock.method(
                    vscode.commands,
                    "executeCommand",
                    async (command: string, uri: vscode.Uri) => {
                        if (command === "vscode.executeDocumentSymbolProvider") {
                            return [target.classSymbol];
                        }

                        if (command === "vscode.executeDefinitionProvider") {
                            return uri.toString() === usage.document.uri.toString()
                                ? [definition.value]
                                : [standardLocation];
                        }

                        throw new Error("Unexpected command: " + command);
                    }
                );

                const documentProvider = current.mock.method(
                    vscode.workspace,
                    "openTextDocument",
                    async (uri: vscode.Uri) => {
                        if (uri.toString() === target.document.uri.toString()) {
                            return target.document;
                        }

                        if (uri.toString() === standard.document.uri.toString()) {
                            return standard.document;
                        }

                        throw new Error("Unexpected document: " + uri.toString());
                    }
                );

                const resolver = new JavaTypeDefinitionResolver(new JavaCodeMask());
                const expectedCalls: unknown[][] = [
                    ["vscode.executeDefinitionProvider", usage.document.uri, usage.range.start],
                    ["vscode.executeDocumentSymbolProvider", target.document.uri]
                ];
                const expectedDocuments = [[target.document.uri]];

                if (scenario.resolvesParent) {
                    expectedCalls.push([
                        "vscode.executeDefinitionProvider",
                        target.document.uri,
                        rangeOf(target.document, "RuntimeException").start
                    ]);
                    expectedDocuments.push([standard.document.uri]);
                }

                assert.equal(await resolver.isThrowableType(usage.document, usage.range.start), true);
                assert.deepEqual(
                    provider.mock.calls.map(call => call.arguments),
                    expectedCalls
                );
                assert.deepEqual(
                    documentProvider.mock.calls.map(call => call.arguments),
                    expectedDocuments
                );

                assert.equal(await resolver.isThrowableType(usage.document, usage.range.start), true);
                assert.equal(provider.mock.callCount(), expectedCalls.length);
                assert.equal(documentProvider.mock.callCount(), expectedDocuments.length);
            });
        }
    }
});

test("does not resolve methods or constructor declarations as class references", async context => {
    const target = createConstructorFixture(
        "RuntimeException",
        "java.lang",
        "Exception",
        "jdt://contents/RuntimeException.java"
    );
    const cases = [
        {
            name: "ordinary method with the class name",
            usage: createFixture("class Usage { void run(RuntimeException value) { value.|RuntimeException(1); } }"),
            definitionRange: target.methodSymbol.selectionRange
        },
        {
            name: "constructor declaration itself",
            usage: target,
            definitionRange: target.constructorSymbol.range
        }
    ] as const;

    for (const scenario of cases) {
        await context.test(scenario.name, async current => {
            const provider = current.mock.method(vscode.commands, "executeCommand", async (command: string) => {
                if (command === "vscode.executeDefinitionProvider") {
                    return [new vscode.Location(target.document.uri, scenario.definitionRange)];
                }

                if (command === "vscode.executeDocumentSymbolProvider") {
                    return [target.classSymbol];
                }

                throw new Error("Unexpected command: " + command);
            });
            const documentProvider = current.mock.method(
                vscode.workspace,
                "openTextDocument",
                async () => target.document
            );
            const resolver = new JavaTypeDefinitionResolver(new JavaCodeMask());

            for (let attempt = 0; attempt < 2; attempt++) {
                assert.equal(
                    await resolver.isThrowableType(scenario.usage.document, scenario.usage.range.start),
                    false
                );
            }

            const expectedCalls = [
                ["vscode.executeDefinitionProvider", scenario.usage.document.uri, scenario.usage.range.start],
                ["vscode.executeDocumentSymbolProvider", target.document.uri]
            ];

            assert.deepEqual(
                provider.mock.calls.map(call => call.arguments),
                [...expectedCalls, ...expectedCalls]
            );
            assert.deepEqual(
                documentProvider.mock.calls.map(call => call.arguments),
                [[target.document.uri], [target.document.uri]]
            );
        });
    }
});

test("retries unavailable provider results and caches a later confirmation", async context => {
    const target = createConstructorFixture(
        "RuntimeException",
        "java.lang",
        "Exception",
        "jdt://contents/RuntimeException.java"
    );
    const location = new vscode.Location(target.document.uri, target.constructorSymbol.range);
    const available = {
        definitions: [location],
        symbols: [target.classSymbol]
    };
    const flatSymbol: vscode.SymbolInformation = {
        name: target.name,
        kind: vscode.SymbolKind.Class,
        containerName: "java.lang",
        location: new vscode.Location(target.document.uri, target.classSymbol.selectionRange)
    };
    const cases: {
        name: string;
        definitions: readonly vscode.Location[] | undefined | Error;
        symbols: readonly (vscode.DocumentSymbol | vscode.SymbolInformation)[] | undefined | Error;
        documentError?: Error;
    }[] = [
        {...available, name: "missing definitions", definitions: undefined},
        {...available, name: "empty definitions", definitions: []},
        {...available, name: "definition provider error", definitions: new Error("Definition provider unavailable.")},
        {...available, name: "unavailable definition document", documentError: new Error("Document unavailable.")},
        {...available, name: "missing document symbols", symbols: undefined},
        {...available, name: "empty document symbols", symbols: []},
        {...available, name: "document symbol provider error", symbols: new Error("Symbol provider unavailable.")},
        {...available, name: "flat document symbols", symbols: [flatSymbol]}
    ];

    for (const scenario of cases) {
        await context.test(scenario.name, async current => {
            const usage = createFixture("class Usage { Object value = new |RuntimeException(); }");
            let isAvailable = false;

            const provider = current.mock.method(vscode.commands, "executeCommand", async (command: string) => {
                if (command === "vscode.executeDefinitionProvider") {
                    const response = isAvailable ? available.definitions : scenario.definitions;

                    if (response instanceof Error) {
                        throw response;
                    }

                    return response;
                }

                if (command === "vscode.executeDocumentSymbolProvider") {
                    const response = isAvailable ? available.symbols : scenario.symbols;

                    if (response instanceof Error) {
                        throw response;
                    }

                    return response;
                }

                throw new Error("Unexpected command: " + command);
            });
            const documentProvider = current.mock.method(vscode.workspace, "openTextDocument", async () => {
                if (!isAvailable && scenario.documentError !== undefined) {
                    throw scenario.documentError;
                }

                return target.document;
            });

            const resolver = new JavaTypeDefinitionResolver(new JavaCodeMask());
            const definitionCall = ["vscode.executeDefinitionProvider", usage.document.uri, usage.range.start];
            const symbolsCall = ["vscode.executeDocumentSymbolProvider", target.document.uri];
            const expectedCalls: unknown[][] = [definitionCall];
            const expectedDocuments: unknown[][] = [];

            if (Array.isArray(scenario.definitions) && scenario.definitions.length > 0) {
                expectedDocuments.push([target.document.uri]);

                if (scenario.documentError === undefined) {
                    expectedCalls.push(symbolsCall);
                }
            }

            assert.equal(await resolver.isThrowableType(usage.document, usage.range.start), false);
            assert.deepEqual(
                provider.mock.calls.map(call => call.arguments),
                expectedCalls
            );
            assert.deepEqual(
                documentProvider.mock.calls.map(call => call.arguments),
                expectedDocuments
            );

            isAvailable = true;

            expectedCalls.push(definitionCall, symbolsCall);
            expectedDocuments.push([target.document.uri]);

            assert.equal(await resolver.isThrowableType(usage.document, usage.range.start), true);
            assert.deepEqual(
                provider.mock.calls.map(call => call.arguments),
                expectedCalls
            );
            assert.deepEqual(
                documentProvider.mock.calls.map(call => call.arguments),
                expectedDocuments
            );

            assert.equal(await resolver.isThrowableType(usage.document, usage.range.start), true);
            assert.equal(provider.mock.callCount(), expectedCalls.length);
            assert.equal(documentProvider.mock.callCount(), expectedDocuments.length);
        });
    }
});

test("shares pending resolutions for the same reference", async context => {
    for (const isThrowable of [true, false]) {
        await context.test(isThrowable ? "positive result" : "negative result", async current => {
            const definitions = createDeferred<readonly vscode.Location[]>();
            const fixture = createCacheFixture(current, () => definitions.promise);
            const location = isThrowable ? fixture.throwableLocation : fixture.plainLocation;
            const first = fixture.resolver.isThrowableType(fixture.usage.document, fixture.usage.range.start);
            const second = fixture.resolver.isThrowableType(fixture.usage.document, fixture.usage.range.start);
            const pendingCalls = fixture.provider.mock.callCount();
            const pendingDocuments = fixture.documentProvider.mock.callCount();

            definitions.resolve([location]);

            assert.deepEqual(await Promise.all([first, second]), [isThrowable, isThrowable]);

            assert.equal(pendingCalls, 1);
            assert.equal(pendingDocuments, 0);
            assert.deepEqual(
                fixture.provider.mock.calls.map(call => call.arguments),
                [fixture.definitionCall]
            );
            assert.deepEqual(
                fixture.documentProvider.mock.calls.map(call => call.arguments),
                [[location.uri]]
            );

            assert.equal(
                await fixture.resolver.isThrowableType(fixture.usage.document, fixture.usage.range.start),
                isThrowable
            );

            assert.equal(fixture.provider.mock.callCount(), 1);
            assert.equal(fixture.documentProvider.mock.callCount(), 1);
        });
    }
});

test("clears cached positive and negative resolutions", async context => {
    let definitions: readonly vscode.Location[] = [];
    const fixture = createCacheFixture(context, async () => definitions);
    const stages = [
        {location: fixture.throwableLocation, expected: true},
        {location: fixture.plainLocation, expected: false},
        {location: fixture.throwableLocation, expected: true}
    ];

    for (const [index, stage] of stages.entries()) {
        definitions = [stage.location];

        if (index > 0) {
            fixture.resolver.clearCache();
        }

        assert.equal(
            await fixture.resolver.isThrowableType(fixture.usage.document, fixture.usage.range.start),
            stage.expected
        );
        assert.equal(fixture.provider.mock.callCount(), index + 1);
        assert.equal(fixture.documentProvider.mock.callCount(), index + 1);
        assert.deepEqual(fixture.provider.mock.calls[index].arguments, fixture.definitionCall);
        assert.deepEqual(fixture.documentProvider.mock.calls[index].arguments, [stage.location.uri]);

        assert.equal(
            await fixture.resolver.isThrowableType(fixture.usage.document, fixture.usage.range.start),
            stage.expected
        );
        assert.equal(fixture.provider.mock.callCount(), index + 1);
        assert.equal(fixture.documentProvider.mock.callCount(), index + 1);
    }
});

test("isolates pending requests and cached results across invalidation", async context => {
    for (const obsoleteFinishesFirst of [true, false]) {
        await context.test(
            obsoleteFinishesFirst ? "obsolete request finishes first" : "current request finishes first",
            async current => {
                const obsolete = createDeferred<readonly vscode.Location[]>();
                const active = createDeferred<readonly vscode.Location[]>();
                let requests = 0;
                const fixture = createCacheFixture(current, () => {
                    requests++;

                    return requests === 1 ? obsolete.promise : active.promise;
                });

                const obsoleteCall = fixture.resolver.isThrowableType(
                    fixture.usage.document,
                    fixture.usage.range.start
                );

                fixture.resolver.clearCache();

                const activeCall = fixture.resolver.isThrowableType(fixture.usage.document, fixture.usage.range.start);
                const pendingCalls = [obsoleteCall, activeCall];

                try {
                    assert.equal(fixture.provider.mock.callCount(), 2);

                    if (obsoleteFinishesFirst) {
                        obsolete.resolve([fixture.throwableLocation]);
                        assert.equal(await obsoleteCall, true);

                        const joinedCall = fixture.resolver.isThrowableType(
                            fixture.usage.document,
                            fixture.usage.range.start
                        );
                        pendingCalls.push(joinedCall);
                        active.resolve([fixture.plainLocation]);

                        assert.deepEqual(await Promise.all([activeCall, joinedCall]), [false, false]);
                    } else {
                        active.resolve([fixture.plainLocation]);
                        assert.equal(await activeCall, false);

                        obsolete.resolve([fixture.throwableLocation]);
                        assert.equal(await obsoleteCall, true);
                    }

                    assert.equal(
                        await fixture.resolver.isThrowableType(fixture.usage.document, fixture.usage.range.start),
                        false
                    );
                    assert.deepEqual(
                        fixture.provider.mock.calls.map(call => call.arguments),
                        [fixture.definitionCall, fixture.definitionCall]
                    );

                    const documentUris = obsoleteFinishesFirst
                        ? [fixture.throwableLocation.uri, fixture.plainLocation.uri]
                        : [fixture.plainLocation.uri, fixture.throwableLocation.uri];

                    assert.deepEqual(
                        fixture.documentProvider.mock.calls.map(call => call.arguments),
                        documentUris.map(uri => [uri])
                    );
                } finally {
                    obsolete.resolve([fixture.throwableLocation]);
                    active.resolve([fixture.plainLocation]);
                    await Promise.all(pendingCalls);
                }
            }
        );
    }
});

function createCacheFixture(
    context: TestContext,
    provideDefinitions: () => Promise<readonly vscode.Location[] | undefined>
) {
    const usage = createFixture("class Usage { |RuntimeException value; }");
    const throwable = createFixture(
        "package java.lang; public class |RuntimeException extends Exception {}",
        "jdt://contents/RuntimeException.java"
    );

    const plain = createFixture("package example; class |RuntimeException {}", "file:///RuntimeException.java");
    const documents = new Map([
        [throwable.document.uri.toString(), throwable.document],
        [plain.document.uri.toString(), plain.document]
    ]);

    const provider = context.mock.method(vscode.commands, "executeCommand", async (command: string) => {
        if (command !== "vscode.executeDefinitionProvider") {
            throw new Error("Unexpected command: " + command);
        }

        return provideDefinitions();
    });

    const documentProvider = context.mock.method(vscode.workspace, "openTextDocument", async (uri: vscode.Uri) => {
        const document = documents.get(uri.toString());

        if (document === undefined) {
            throw new Error("unexpected document: " + uri.toString());
        }

        return document;
    });

    return {
        usage,
        resolver: new JavaTypeDefinitionResolver(new JavaCodeMask()),
        provider,
        documentProvider,
        throwableLocation: new vscode.Location(throwable.document.uri, throwable.range),
        plainLocation: new vscode.Location(plain.document.uri, plain.range),
        definitionCall: ["vscode.executeDefinitionProvider", usage.document.uri, usage.range.start]
    };
}

function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>(resolvePromise => {
        resolve = resolvePromise;
    });

    return {promise, resolve};
}

function createConstructorFixture(name: string, packageName: string, superclass: string, uri: string) {
    const fixture = createFixture(
        [
            "package " + packageName + ";",
            "public class " + name + " extends " + superclass + " {",
            "    /** Creates an exception. */",
            "    public |" + name + "() {}",
            "    void " + name + "(int value) {}",
            "}"
        ].join("\n"),
        uri
    );
    const constructorDeclaration = "public " + name + "() {}";
    const constructorSymbol = createDocumentSymbol(
        fixture.document,
        vscode.SymbolKind.Constructor,
        name,
        constructorDeclaration
    );
    const methodSymbol = createDocumentSymbol(
        fixture.document,
        vscode.SymbolKind.Method,
        name,
        "void " + name + "(int value) {}"
    );
    const classDeclaration = fixture.document.getText().slice(fixture.document.getText().indexOf("public class"));
    const classSymbol = createDocumentSymbol(fixture.document, vscode.SymbolKind.Class, name, classDeclaration, [
        constructorSymbol,
        methodSymbol
    ]);

    return {
        ...fixture,
        name,
        classSymbol,
        constructorSymbol,
        methodSymbol,
        documentedConstructorRange: rangeOf(
            fixture.document,
            "/** Creates an exception. */\n    " + constructorDeclaration
        )
    };
}

function createDocumentSymbol(
    document: vscode.TextDocument,
    kind: vscode.SymbolKind,
    name: string,
    declaration: string,
    children: vscode.DocumentSymbol[] = []
): vscode.DocumentSymbol {
    const range = rangeOf(document, declaration);
    const nameIndex = declaration.indexOf(name);
    assert.notEqual(nameIndex, -1);
    const nameOffset = document.offsetAt(range.start) + nameIndex;

    return {
        name,
        detail: "",
        kind,
        range,
        selectionRange: {
            start: document.positionAt(nameOffset),
            end: document.positionAt(nameOffset + name.length)
        } as vscode.Range,
        children
    };
}

function rangeOf(document: vscode.TextDocument, text: string): vscode.Range {
    const offset = document.getText().indexOf(text);
    assert.notEqual(offset, -1);

    return {
        start: document.positionAt(offset),
        end: document.positionAt(offset + text.length)
    } as vscode.Range;
}

function createFixture(
    markedSource: string,
    uri = "file:///Usage.java"
): {document: vscode.TextDocument; range: vscode.Range} {
    const markerOffset = markedSource.indexOf("|");
    assert.notEqual(markerOffset, -1);
    assert.equal(markedSource.indexOf("|", markerOffset + 1), -1);

    const source = markedSource.slice(0, markerOffset) + markedSource.slice(markerOffset + 1);
    const word = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(source.slice(markerOffset));

    assert.ok(word);

    const lineStarts = [0];

    for (let index = 0; index < source.length; index++) {
        if (source[index] === "\n" || (source[index] === "\r" && source[index + 1] !== "\n")) {
            lineStarts.push(index + 1);
        }
    }

    const positionAt = (offset: number): vscode.Position => {
        let line = 0;

        while (line + 1 < lineStarts.length && lineStarts[line + 1] <= offset) {
            line++;
        }

        return {line, character: offset - lineStarts[line]} as vscode.Position;
    };

    const offsetAt = (position: vscode.Position): number => lineStarts[position.line] + position.character;

    const rangeAt = (start: number, end: number): vscode.Range =>
        ({start: positionAt(start), end: positionAt(end)}) as vscode.Range;

    const document = {
        uri: {toString: () => uri},
        version: 1,
        getText: (range?: vscode.Range): string =>
            range === undefined ? source : source.slice(offsetAt(range.start), offsetAt(range.end)),
        offsetAt,
        positionAt,
        getWordRangeAtPosition: (position: vscode.Position): vscode.Range | undefined => {
            const offset = offsetAt(position);

            for (const match of source.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) {
                const start = match.index;
                const end = start + match[0].length;

                if (start <= offset && offset < end) {
                    return rangeAt(start, end);
                }
            }

            return undefined;
        }
    } as vscode.TextDocument;

    return {
        document,
        range: rangeAt(markerOffset, markerOffset + word[0].length)
    };
}
