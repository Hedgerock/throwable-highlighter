import assert from "node:assert/strict";
import {test} from "node:test";
import type {TestContext} from "node:test";

import * as vscode from "vscode";

import {JavaCatchClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaCatchClauseFinder";
import {JavaImportClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaImportClauseFinder";
import {JavaThrowsClauseFinder} from "@throwable-highlighter/decorations/highlighting/JavaThrowsClauseFinder";
import {JavaTypeReferenceRangeReader} from "@throwable-highlighter/decorations/highlighting/JavaTypeReferenceRangeReader";
import {ThrowableHighlightingContext} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingContext";
import {ThrowableHighlightingFinder} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingFinder";
import {ThrowableDecorationController} from "@throwable-highlighter/decorations/ThrowableDecorationController";
import {JavaCodeMask} from "@throwable-highlighter/java/JavaCodeMask";
import {JavaTypeDefinitionResolver} from "@throwable-highlighter/resolution/JavaTypeDefinitionResolver";
import type {HighlightingContext} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingContext";
import type {ThrowableHighlightingCandidate} from "@throwable-highlighter/decorations/highlighting/ThrowableHighlightingFinder";

type ColorSettings = Partial<Record<`${HighlightingContext}Color` | `${HighlightingContext}ColorSource`, unknown>>;

test("applies only confirmed candidates", async context => {
    for (const fails of [false, true]) {
        await context.test(fails ? "resolver error" : "negative result", async current => {
            const candidates = [
                createCandidate("class", 0),
                createCandidate("import", 20),
                createCandidate("catch", 40),
                createCandidate("throws", 60),
                createCandidate("class", 80, "String")
            ];

            const fixture = createFixture(current, candidates);

            fixture.resolve.mock.mockImplementation(async (_document, position) => {
                if (position.character === 80) {
                    if (fails) {
                        throw new Error("Definition unavailable");
                    }

                    return false;
                }

                return true;
            });

            await refresh(fixture.controller);

            assertHighlights(
                fixture,
                candidates.slice(0, 4).map(candidate => [candidate.range])
            );
            assert.deepEqual(
                fixture.resolve.mock.calls.map(call => call.arguments),
                candidates.map(candidate => [fixture.document, candidate.range.start])
            );
        });
    }
});

test("clears previous highlights after a negative resolution", async context => {
    const candidate = createCandidate("class", 0);
    const fixture = createFixture(context, [candidate]);

    await refresh(fixture.controller);
    assertHighlights(fixture, [[candidate.range], [], [], []]);

    fixture.setDecorations.mock.resetCalls();
    fixture.resolve.mock.mockImplementation(async () => false);

    await refresh(fixture.controller);
    assertHighlights(fixture, [[], [], [], []]);
});

test("uses configured colors and class color inheritance", async context => {
    const cases = [
        {
            name: "native Java colors",
            colors: {},
            expected: [{}, {}, {}, {}]
        },
        {
            name: "empty context colors inherit the trimmed class color",
            colors: {classColor: " #FF5555 ", importColor: " ", catchColor: "", throwsColor: "\t"},
            expected: [{color: "#FF5555"}, {color: "#FF5555"}, {color: "#FF5555"}, {color: "#FF5555"}]
        },
        {
            name: "each context uses its own color",
            colors: {
                classColor: "#FF5555",
                importColor: "#FFAA00",
                catchColor: "#AA55FF",
                throwsColor: "#55FFFF"
            },
            expected: [{color: "#FF5555"}, {color: "#FFAA00"}, {color: "#AA55FF"}, {color: "#55FFFF"}]
        },
        {
            name: "one context can use a color while the class color is native",
            colors: {classColor: "", catchColor: "#AA55FF"},
            expected: [{}, {}, {color: "#AA55FF"}, {}]
        }
    ] as const;

    for (const scenario of cases) {
        await context.test(scenario.name, current => {
            const fixture = createFixture(current, [], scenario.colors);

            assert.deepEqual(
                fixture.createDecorationType.mock.calls.map(call => call.arguments),
                scenario.expected.map(options => [options])
            );
        });
    }
});

test("clears unsupported documents without resolving candidates", async context => {
    const cases = [
        {name: "non-Java file", languageId: "plaintext", scheme: "file"},
        {name: "virtual Java document", languageId: "java", scheme: "jdt"}
    ] as const;

    for (const scenario of cases) {
        await context.test(scenario.name, async current => {
            const fixture = createFixture(current, [createCandidate("class", 0)]);
            fixture.documentState.languageId = scenario.languageId;
            fixture.documentState.uri.scheme = scenario.scheme;

            await refresh(fixture.controller);

            assertHighlights(fixture, [[], [], [], []]);

            assert.equal(fixture.findCandidates.mock.callCount(), 0);
            assert.equal(fixture.resolve.mock.callCount(), 0);
        });
    }
});

test("does not recreate decoration types after disposal", context => {
    const fixture = createFixture(context);
    const disposals = fixture.decorationTypes.map(type => context.mock.method(type, "dispose"));

    fixture.controller.dispose();
    fixture.controller.dispose();
    assert.deepEqual(
        disposals.map(dispose => dispose.mock.callCount()),
        [1, 1, 1, 1]
    );

    fixture.controller.refreshConfiguration();
    fixture.controller.refresh();

    assert.equal(fixture.createDecorationType.mock.callCount(), 4);

    assert.deepEqual(
        disposals.map(dispose => dispose.mock.callCount()),
        [1, 1, 1, 1]
    );

    assert.equal(fixture.findCandidates.mock.callCount(), 0);
    assert.equal(fixture.resolve.mock.callCount(), 0);
    assert.equal(fixture.setDecorations.mock.callCount(), 0);
});

test("ignores obsolete refresh results regardless of completion order", async context => {
    for (const obsoleteFinishesFirst of [true, false]) {
        await context.test(
            obsoleteFinishesFirst ? "obsolete request finishes first" : "current request finishes first",
            async current => {
                const obsolete = createDeferred<boolean>();
                const active = createDeferred<boolean>();
                const oldCandidate = createCandidate("class", 0);
                const newCandidate = createCandidate("class", 0);
                const fixture = createFixture(current, [oldCandidate]);

                fixture.resolve.mock.mockImplementation(() => obsolete.promise);

                try {
                    fixture.controller.refresh();
                    await flushRefreshes();

                    assert.equal(fixture.resolve.mock.callCount(), 1);
                    assert.equal(fixture.setDecorations.mock.callCount(), 0);

                    fixture.findCandidates.mock.mockImplementation(() => [newCandidate]);

                    fixture.resolve.mock.mockImplementation(() => active.promise);
                    fixture.controller.refresh();
                    await flushRefreshes();

                    assert.equal(fixture.resolve.mock.callCount(), 2);
                    assert.equal(fixture.setDecorations.mock.callCount(), 0);

                    if (obsoleteFinishesFirst) {
                        obsolete.resolve(true);
                        await flushRefreshes();

                        assert.equal(fixture.setDecorations.mock.callCount(), 0);
                        active.resolve(false);
                    } else {
                        active.resolve(false);
                        await flushRefreshes();
                        assertHighlights(fixture, [[], [], [], []]);

                        obsolete.resolve(true);
                    }

                    await flushRefreshes();
                    assertHighlights(fixture, [[], [], [], []]);

                    assert.deepEqual(
                        fixture.resolve.mock.calls.map(call => call.arguments),
                        [
                            [fixture.document, oldCandidate.range.start],
                            [fixture.document, newCandidate.range.start]
                        ]
                    );
                } finally {
                    obsolete.resolve(true);
                    active.resolve(false);
                    await flushRefreshes();
                }
            }
        );
    }
});

test("ignores a pending result after its target becomes stale", async context => {
    const cases: {
        name: string;
        invalidate: (fixture: ReturnType<typeof createFixture>) => void;
    }[] = [
        {
            name: "document version changes",
            invalidate: fixture => {
                fixture.documentState.version++;
            }
        },
        {
            name: "editor switches to a different document",
            invalidate: fixture => {
                fixture.editorState.document = {...fixture.document};
            }
        },
        {
            name: "document language becomes unsupported",
            invalidate: fixture => {
                fixture.documentState.languageId = "plaintext";
            }
        },
        {
            name: "document scheme becomes unsupported",
            invalidate: fixture => {
                fixture.documentState.uri.scheme = "jdt";
            }
        },
        {
            name: "controller is disposed",
            invalidate: fixture => {
                fixture.controller.dispose();
            }
        }
    ];

    for (const scenario of cases) {
        await context.test(scenario.name, async current => {
            const pending = createDeferred<boolean>();
            const fixture = createFixture(current, [createCandidate("class", 0)]);
            fixture.resolve.mock.mockImplementation(() => pending.promise);

            try {
                fixture.controller.refresh();
                await flushRefreshes();

                assert.equal(fixture.resolve.mock.callCount(), 1);
                assert.equal(fixture.setDecorations.mock.callCount(), 0);

                scenario.invalidate(fixture);
                pending.resolve(true);
                await flushRefreshes();

                assert.equal(fixture.setDecorations.mock.callCount(), 0);
            } finally {
                pending.resolve(true);
                await flushRefreshes();
            }
        });
    }
});

test("recreates decoration types and invalidates pending results when configuration changes", async context => {
    const pending = createDeferred<boolean>();
    const colors = {classColor: "#FF5555"};
    const fixture = createFixture(context, [createCandidate("class", 0)], colors);
    const disposals = fixture.decorationTypes.map(type => context.mock.method(type, "dispose"));
    fixture.resolve.mock.mockImplementation(() => pending.promise);

    try {
        fixture.controller.refresh();
        await flushRefreshes();
        assert.equal(fixture.resolve.mock.callCount(), 1);

        assert.equal(fixture.setDecorations.mock.callCount(), 0);

        colors.classColor = "#55FF55";
        fixture.resolve.mock.mockImplementation(async () => false);
        fixture.controller.refreshConfiguration();
        await flushRefreshes();

        assert.equal(fixture.decorationTypes.length, 8);
        assert.equal(fixture.resolve.mock.callCount(), 2);
        assert.deepEqual(
            disposals.map(dispose => dispose.mock.callCount()),
            [1, 1, 1, 1]
        );

        assert.deepEqual(
            fixture.createDecorationType.mock.calls.map(call => call.arguments),
            ["#FF5555", "#55FF55"].flatMap(color => Array.from({length: 4}, () => [{color}]))
        );

        const expectedCalls = fixture.decorationTypes.slice(4).map(type => [type, []]);

        assert.deepEqual(
            fixture.setDecorations.mock.calls.map(call => call.arguments),
            expectedCalls
        );

        pending.resolve(true);
        await flushRefreshes();

        assert.deepEqual(
            fixture.setDecorations.mock.calls.map(call => call.arguments),
            expectedCalls
        );
    } finally {
        pending.resolve(true);
        await flushRefreshes();
    }
});

test("uses explicit color sources and isolates invalid settings", async context => {
    const scenarios = [
        {
            name: "explicit sources override inactive saved colors",
            colors: {
                classColorSource: "custom",
                classColor: "#FF5555",
                importColorSource: "inherit",
                importColor: "#FFAA00",
                catchColorSource: "native",
                catchColor: "#AA55FF",
                throwsColorSource: "custom",
                throwsColor: " #55FFFF "
            },
            expected: [{color: "#FF5555"}, {color: "#FF5555"}, {}, {color: "#55FFFF"}]
        },
        {
            name: "inherited contexts follow a native class while custom colors remain active",
            colors: {
                classColorSource: "native",
                classColor: "#FF5555",
                importColorSource: "inherit",
                importColor: "#FFAA00",
                catchColorSource: "custom",
                catchColor: "#AA55FF",
                throwsColorSource: "inherit",
                throwsColor: "#55FFFF"
            },
            expected: [{}, {}, {color: "#AA55FF"}, {}]
        },
        {
            name: "null sources preserve legacy non-HEX colors",
            colors: {
                classColorSource: null,
                classColor: " red ",
                importColorSource: null,
                importColor: "",
                catchColorSource: null,
                catchColor: "rgb(1, 2, 3)",
                throwsColorSource: null
            },
            expected: [{color: "red"}, {color: "red"}, {color: "rgb(1, 2, 3)"}, {color: "red"}]
        },
        {
            name: "invalid derived settings use native highlighting instead of the class color",
            colors: {
                classColorSource: "custom",
                classColor: "#FF5555",
                importColorSource: "custom",
                importColor: "red",
                catchColorSource: "unknown",
                catchColor: "#AA55FF",
                throwsColor: false
            },
            expected: [{color: "#FF5555"}, {}, {}, {}]
        },
        {
            name: "invalid class inheritance does not disable independent custom colors",
            colors: {
                classColorSource: "inherit",
                classColor: "#FF5555",
                importColorSource: "inherit",
                catchColorSource: "custom",
                catchColor: "#AA55FF"
            },
            expected: [{}, {}, {color: "#AA55FF"}, {}]
        },
        {
            name: "an invalid custom class color is not passed to decorations",
            colors: {
                classColorSource: "custom",
                classColor: "red",
                importColorSource: "custom",
                importColor: "#FFAA00",
                catchColorSource: "inherit",
                throwsColorSource: "native",
                throwsColor: "#55FFFF"
            },
            expected: [{}, {color: "#FFAA00"}, {}, {}]
        }
    ] as const;

    for (const scenario of scenarios) {
        await context.test(scenario.name, current => {
            const fixture = createFixture(current, [], scenario.colors);

            assert.deepEqual(
                fixture.createDecorationType.mock.calls.map(call => call.arguments),
                scenario.expected.map(options => [options])
            );
        });
    }
});

test("updates color sources without changing stored colors", context => {
    const colors: ColorSettings = {
        classColor: "#FF5555",
        catchColor: "#AA55FF",
        catchColorSource: "custom"
    };
    const fixture = createFixture(context, [], colors);
    const scenarios = [
        {source: "native", expected: {}},
        {source: "inherit", expected: {color: "#FF5555"}},
        {source: "custom", expected: {color: "#AA55FF"}}
    ] as const;

    assert.deepEqual(
        fixture.createDecorationType.mock.calls.map(call => call.arguments),
        [{color: "#FF5555"}, {color: "#FF5555"}, {color: "#AA55FF"}, {color: "#FF5555"}].map(options => [options])
    );

    for (const scenario of scenarios) {
        const disposals = fixture.decorationTypes.slice(-4).map(type => context.mock.method(type, "dispose"));

        colors.catchColorSource = scenario.source;
        fixture.controller.refreshConfiguration();

        assert.deepEqual(
            fixture.createDecorationType.mock.calls.slice(-4).map(call => call.arguments),
            [{color: "#FF5555"}, {color: "#FF5555"}, scenario.expected, {color: "#FF5555"}].map(options => [options])
        );
        assert.deepEqual(colors, {
            classColor: "#FF5555",
            catchColor: "#AA55FF",
            catchColorSource: scenario.source
        });

        for (const dispose of disposals) {
            assert.equal(dispose.mock.callCount(), 1);
        }
    }
});

function createFixture(
    context: TestContext,
    candidates: ThrowableHighlightingCandidate[] = [],
    colors: ColorSettings = {}
) {
    const documentState = {languageId: "java", uri: {scheme: "file"}, version: 1};
    const document = documentState as vscode.TextDocument;
    const setDecorations = context.mock.fn<vscode.TextEditor["setDecorations"]>();
    const editorState: {
        document: vscode.TextDocument;
        setDecorations: vscode.TextEditor["setDecorations"];
    } = {document, setDecorations};
    const editor = editorState as vscode.TextEditor;
    const decorationTypes: vscode.TextEditorDecorationType[] = [];

    const configuration = {
        get<T>(setting: string): T | undefined {
            return colors[setting as keyof ColorSettings] as T | undefined;
        },
        inspect<T>(setting: string) {
            return {
                key: setting,
                workspaceValue: colors[setting as keyof ColorSettings] as T | undefined
            };
        }
    } as vscode.WorkspaceConfiguration;

    context.mock.getter(vscode.window, "visibleTextEditors", () => [editor]);
    context.mock.method(vscode.workspace, "getConfiguration", () => configuration);

    const createDecorationType = context.mock.method(
        vscode.window,
        "createTextEditorDecorationType",
        (_options: vscode.DecorationRenderOptions): vscode.TextEditorDecorationType => {
            const type = {
                key: "decoration-" + decorationTypes.length,
                dispose: context.mock.fn()
            };

            decorationTypes.push(type);

            return type;
        }
    );
    const codeMask = new JavaCodeMask();
    const rangeReader = new JavaTypeReferenceRangeReader();
    const finder = new ThrowableHighlightingFinder(
        codeMask,
        new JavaImportClauseFinder(),
        new JavaCatchClauseFinder(rangeReader),
        new JavaThrowsClauseFinder(rangeReader)
    );

    const resolver = new JavaTypeDefinitionResolver(codeMask);
    const findCandidates = context.mock.method(
        finder,
        "findCandidates",
        (_document: vscode.TextDocument) => candidates
    );
    const resolve = context.mock.method(
        resolver,
        "isThrowableType",
        async (_document: vscode.TextDocument, _position: vscode.Position) => true
    );

    const controller = new ThrowableDecorationController(finder, resolver, new ThrowableHighlightingContext());
    context.after(() => controller.dispose());

    return {
        controller,
        document,
        editorState,
        documentState,
        setDecorations,
        decorationTypes,
        createDecorationType,
        findCandidates,
        resolve
    };
}

function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>(resolvePromise => {
        resolve = resolvePromise;
    });

    return {promise, resolve};
}

function createCandidate(
    context: HighlightingContext,
    start: number,
    typeName = "RuntimeException"
): ThrowableHighlightingCandidate {
    return {
        typeName,
        context,
        range: new vscode.Range(
            {line: 0, character: start} as vscode.Position,
            {line: 0, character: start + typeName.length} as vscode.Position
        )
    };
}

async function refresh(controller: ThrowableDecorationController): Promise<void> {
    controller.refresh();
    await flushRefreshes();
}

async function flushRefreshes(): Promise<void> {
    await new Promise<void>(resolve => setImmediate(resolve));
}

function assertHighlights(
    fixture: ReturnType<typeof createFixture>,
    expected: readonly (readonly vscode.Range[])[]
): void {
    assert.deepEqual(
        fixture.setDecorations.mock.calls.map(call => call.arguments),
        fixture.decorationTypes.map((type, index) => [type, expected[index]])
    );
}
