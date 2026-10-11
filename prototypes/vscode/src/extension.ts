import * as vscode from 'vscode';

const TOKEN_TYPES = [
    "throwableClass",
    "throwableImport",
    "throwableCatch"
] as const;

type ThrowableTokenType = typeof TOKEN_TYPES[number];

const TOKEN_TYPE_INDEX = new Map<ThrowableTokenType, number>(
    TOKEN_TYPES.map((tokenType, index) => [tokenType, index])
);

const TOKEN_LEGEND = new vscode.SemanticTokensLegend([...TOKEN_TYPES]);

const KNOWN_THROWABLE_TYPES = new Set([
    "Throwable",
    "Exception",
    "RuntimeException",
    "IOException",
    "IllegalArgumentException",
    "IllegalStateException"
])

const TYPE_REFERENCE_PATTERN =
    /\b(?:Throwable|Exception|RuntimeException|IOException|IllegalArgumentException|IllegalStateException)\b/g;

export function activate(context: vscode.ExtensionContext): void {
    const provider = new ThrowableSemanticTokensProvider();

    context.subscriptions.push(
        vscode.languages.registerDocumentSemanticTokensProvider(
            { language: "java", scheme: "file" },
            provider,
            TOKEN_LEGEND
        )
    );

    const outputChannel = vscode.window.createOutputChannel(
        "Throwable Highlighter Prototype"
    );

    outputChannel.appendLine("Semantic Tokens provider activated.");

    context.subscriptions.push(outputChannel);
}

export function deactivate(): void {
}

class ThrowableSemanticTokensProvider
    implements vscode.DocumentSemanticTokensProvider {

    provideDocumentSemanticTokens(
        document: vscode.TextDocument
    ): vscode.ProviderResult<vscode.SemanticTokens> {
        const builder = new vscode.SemanticTokensBuilder(TOKEN_LEGEND);

        for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
            const line = document.lineAt(lineNumber).text;

            for (const match of line.matchAll(TYPE_REFERENCE_PATTERN)) {
                const typeName = match[0];
                const startCharacter = match.index;

                if (startCharacter === undefined || !KNOWN_THROWABLE_TYPES.has(typeName)) {
                    continue;
                }

                const tokenType = this.resolveTokenType(line, startCharacter);
                const tokenTypeIndex = TOKEN_TYPE_INDEX.get(tokenType);

                if (tokenTypeIndex === undefined) {
                    continue;
                }

                builder.push(
                    lineNumber,
                    startCharacter,
                    typeName.length,
                    tokenTypeIndex
                );
            }
        }

        return builder.build();
    }

    private resolveTokenType(
        line: string,
        startCharacter: number
    ): ThrowableTokenType {
        const prefix = line.slice(0, startCharacter);

        if (/^\s*import\s+(?!static\b)/.test(prefix)) {
            return "throwableImport";
        }

        if (/\bcatch\s*\([^)]*$/.test(prefix)) {
            return "throwableCatch";
        }

        return "throwableClass"
    }
}
