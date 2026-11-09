import type vscode from "vscode";

export const SymbolKind = {
    Class: 4,
    Method: 5,
    Constructor: 8
} satisfies Pick<typeof vscode.SymbolKind, "Class" | "Method" | "Constructor">;

export const ViewColumn = {
    Beside: -2
} satisfies Pick<typeof vscode.ViewColumn, "Beside">;

export const FileType = {
    File: 1
} satisfies Pick<typeof vscode.FileType, "File">;

export const ConfigurationTarget = {
    Global: 1,
    Workspace: 2
} satisfies Pick<typeof vscode.ConfigurationTarget, "Global" | "Workspace">;

export const languages = {
    createLanguageStatusItem(_id: string, _selector: vscode.DocumentSelector): vscode.LanguageStatusItem {
        throw new Error("Unexpected language status request.");
    }
} satisfies Pick<typeof vscode.languages, "createLanguageStatusItem">;

export const Uri = {
    joinPath(_base: vscode.Uri, ..._pathSegments: string[]): vscode.Uri {
        throw new Error("Unexpected URI join request.");
    }
} satisfies Pick<typeof vscode.Uri, "joinPath">;

export class Location {
    constructor(
        public uri: vscode.Uri,
        public range: vscode.Range
    ) {}
}

export class Range {
    constructor(
        public readonly start: vscode.Position,
        public readonly end: vscode.Position
    ) {}
}

export const commands = {
    async executeCommand<T = unknown>(command: string, ..._args: unknown[]): Promise<T> {
        throw new Error("Unexpected VS Code command: " + command);
    },
    registerCommand(
        _command: string,
        _callback: (...args: unknown[]) => unknown,
        _thisArg?: unknown
    ): vscode.Disposable {
        throw new Error("Unexpected command registration.");
    }
} satisfies Pick<typeof vscode.commands, "executeCommand" | "registerCommand">;

export const extensions = {
    getExtension<T = unknown>(_extensionId: string): vscode.Extension<T> | undefined {
        throw new Error("Unexpected extension lookup.");
    }
} satisfies Pick<typeof vscode.extensions, "getExtension">;

function unexpectedEvent<T>(name: string): vscode.Event<T> {
    return () => {
        throw new Error("Unexpected event subscription: " + name);
    };
}

export const workspace = {
    onDidChangeTextDocument: unexpectedEvent<vscode.TextDocumentChangeEvent>("onDidChangeTextDocument"),
    onDidCreateFiles: unexpectedEvent<vscode.FileCreateEvent>("onDidCreateFiles"),
    onDidDeleteFiles: unexpectedEvent<vscode.FileDeleteEvent>("onDidDeleteFiles"),
    onDidRenameFiles: unexpectedEvent<vscode.FileRenameEvent>("onDidRenameFiles"),
    onDidChangeWorkspaceFolders: unexpectedEvent<vscode.WorkspaceFoldersChangeEvent>("onDidChangeWorkspaceFolders"),
    onDidChangeConfiguration: unexpectedEvent<vscode.ConfigurationChangeEvent>("onDidChangeConfiguration"),
    async openTextDocument(uri: vscode.Uri): Promise<vscode.TextDocument> {
        throw new Error("Unexpected document request: " + uri.toString());
    },
    getConfiguration(_section?: string): vscode.WorkspaceConfiguration {
        throw new Error("Unexpected configuration request.");
    },
    fs: {
        async readFile(_uri: vscode.Uri): Promise<Uint8Array> {
            throw new Error("Unexpected file read request.");
        },
        async stat(_uri: vscode.Uri): Promise<vscode.FileStat> {
            throw new Error("Unexpected file metadata request.");
        }
    } satisfies Pick<vscode.FileSystem, "readFile" | "stat">,
    get workspaceFolders(): readonly vscode.WorkspaceFolder[] | undefined {
        return undefined;
    }
};

export const window = {
    onDidChangeActiveTextEditor: unexpectedEvent<vscode.TextEditor | undefined>("onDidChangeActiveTextEditor"),
    onDidChangeVisibleTextEditors: unexpectedEvent<readonly vscode.TextEditor[]>("onDidChangeVisibleTextEditors"),
    createOutputChannel(_name: string): vscode.OutputChannel {
        throw new Error("Unexpected output channel request.");
    },
    get visibleTextEditors(): readonly vscode.TextEditor[] {
        return [];
    },
    get activeTextEditor(): vscode.TextEditor | undefined {
        return undefined;
    },
    createTextEditorDecorationType(_options: vscode.DecorationRenderOptions): vscode.TextEditorDecorationType {
        throw new Error("Unexpected decoration type request.");
    },
    createWebviewPanel(
        _viewType: string,
        _title: string,
        _showOptions: vscode.ViewColumn | {viewColumn: vscode.ViewColumn; preserveFocus?: boolean},
        _options?: vscode.WebviewPanelOptions & vscode.WebviewOptions
    ): vscode.WebviewPanel {
        throw new Error("Unexpected webview panel request.");
    },
    async showErrorMessage(_message: string): Promise<string | undefined> {
        throw new Error("Unexpected error notification.");
    }
};

export default {
    SymbolKind,
    FileType,
    ConfigurationTarget,
    Uri,
    ViewColumn,
    Location,
    Range,
    commands,
    extensions,
    workspace,
    window,
    languages
};
