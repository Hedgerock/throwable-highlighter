import type vscode from "vscode";

export const SymbolKind = {
    Class: 4,
    Method: 5,
    Constructor: 8
} satisfies Pick<typeof vscode.SymbolKind, "Class" | "Method" | "Constructor">;

export const ViewColumn = {
    Beside: -2
} satisfies Pick<typeof vscode.ViewColumn, "Beside">;

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
    }
} satisfies Pick<typeof vscode.commands, "executeCommand">;

export const workspace = {
    async openTextDocument(uri: vscode.Uri): Promise<vscode.TextDocument> {
        throw new Error("Unexpected document request: " + uri.toString());
    },
    getConfiguration(_section?: string): vscode.WorkspaceConfiguration {
        throw new Error("Unexpected configuration request.");
    }
};

export const window = {
    get visibleTextEditors(): readonly vscode.TextEditor[] {
        return [];
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
    }
};

export default {
    SymbolKind,
    ViewColumn,
    Location,
    Range,
    commands,
    workspace,
    window
};
