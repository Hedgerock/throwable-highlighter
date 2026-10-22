import type vscode from "vscode";

export const SymbolKind = {
    Class: 4,
    Method: 5,
    Constructor: 8
} satisfies Pick<typeof vscode.SymbolKind, "Class" | "Method" | "Constructor">;

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
    }
};

export default {
    SymbolKind,
    Location,
    Range,
    commands,
    workspace,
    window
};
