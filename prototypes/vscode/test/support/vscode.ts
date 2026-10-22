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

export const commands = {
    async executeCommand<T = unknown>(command: string, ..._args: unknown[]): Promise<T> {
        throw new Error("Unexpected VS Code command: " + command);
    }
} satisfies Pick<typeof vscode.commands, "executeCommand">;

export const workspace = {
    async openTextDocument(uri: vscode.Uri): Promise<vscode.TextDocument> {
        throw new Error("Unexpected document request: " + uri.toString());
    }
};
