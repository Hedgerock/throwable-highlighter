import * as vscode from "vscode";

import {JavaProviderRequestLimiter} from "@throwable-highlighter/resolution/JavaProviderRequestLimiter";
import type {
    ClassDeclaration,
    ThrowableTypeResolution,
    TypeHierarchyFallbackStart
} from "@throwable-highlighter/resolution/hierarchy/index";
import type {
    JavaClassDeclarationReader,
    VsCodeTypeReference
} from "@throwable-highlighter/resolution/JavaClassDeclarationReader";

const UNAVAILABLE = {kind: "unavailable"} as const;
const MAXIMUM_CONCURRENT_WALKS = 2;

export class JavaTypeHierarchyResolver {
    private readonly walkLimiter = new JavaProviderRequestLimiter(MAXIMUM_CONCURRENT_WALKS);

    constructor(
        private readonly reader: JavaClassDeclarationReader,
        private readonly requests: JavaProviderRequestLimiter
    ) {}

    public cancelPending(): void {
        this.walkLimiter.cancelPending();
    }

    public async resolve(
        start: TypeHierarchyFallbackStart<VsCodeTypeReference>,
        isCurrent: () => boolean
    ): Promise<ThrowableTypeResolution<VsCodeTypeReference>> {
        if (start.remainingDepth <= 0 || start.visitedDeclarations.has(start.declaration.identity) || !isCurrent()) {
            return UNAVAILABLE;
        }

        try {
            return await this.walkLimiter.run(() => this.walk(start, isCurrent), isCurrent);
        } catch {
            return UNAVAILABLE;
        }
    }

    private async walk(
        start: TypeHierarchyFallbackStart<VsCodeTypeReference>,
        isCurrent: () => boolean
    ): Promise<ThrowableTypeResolution<VsCodeTypeReference>> {
        const {identity, nameReference} = start.declaration;
        const {document, name, range} = nameReference;
        const roots = await this.requests.run(
            () =>
                vscode.commands.executeCommand<readonly vscode.TypeHierarchyItem[]>(
                    "vscode.prepareTypeHierarchy",
                    document.uri,
                    range.start
                ),
            isCurrent
        );

        const matches = roots?.filter(
            item =>
                item.kind === vscode.SymbolKind.Class &&
                item.name === name &&
                item.uri.toString() === document.uri.toString() &&
                item.selectionRange.isEqual(range)
        );

        if (!isCurrent() || matches?.length !== 1) {
            return UNAVAILABLE;
        }

        let current = matches[0];
        const visited = new Set(start.visitedDeclarations);
        visited.add(identity);

        for (let remaining = start.remainingDepth; remaining > 0; remaining--) {
            const supertypes = await this.requests.run(
                () =>
                    vscode.commands.executeCommand<readonly vscode.TypeHierarchyItem[]>(
                        "vscode.provideSupertypes",
                        current
                    ),
                isCurrent
            );
            const classes = supertypes?.filter(item => item.kind === vscode.SymbolKind.Class);

            if (!isCurrent() || classes?.length !== 1) {
                return UNAVAILABLE;
            }

            const parent = classes[0];
            const declaration = await this.readDeclaration(parent);
            if (!isCurrent() || declaration === undefined || visited.has(declaration.identity)) {
                return UNAVAILABLE;
            }

            if (declaration.qualifiedName === "java.lang.Throwable") {
                return {kind: "confirmed", isThrowable: true};
            }

            if (declaration.qualifiedName === "java.lang.Object") {
                return {kind: "confirmed", isThrowable: false};
            }

            visited.add(declaration.identity);
            current = parent;
        }

        return UNAVAILABLE;
    }

    private async readDeclaration(
        item: vscode.TypeHierarchyItem
    ): Promise<ClassDeclaration<VsCodeTypeReference> | undefined> {
        const document = await vscode.workspace.openTextDocument(item.uri);
        const {selectionRange} = item;
        const startAtOrigin = selectionRange.start.line === 0 && selectionRange.start.character === 0;
        const usesClassFileLocation = item.uri.scheme === "jdt" && startAtOrigin;
        const position = usesClassFileLocation
            ? this.reader.findTopLevelClassNamePosition(document, item.name)
            : selectionRange.start;

        if (position === undefined) {
            return undefined;
        }

        const reference = this.reader.readTypeReference(document, position);

        if (reference?.name !== item.name || (!usesClassFileLocation && !selectionRange.isEqual(reference.range))) {
            return undefined;
        }

        return this.reader.readClassDeclaration(reference);
    }
}
