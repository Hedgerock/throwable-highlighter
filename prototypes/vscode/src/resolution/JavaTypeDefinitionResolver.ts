import {JavaCodeMask} from "../java/JavaCodeMask";
import * as vscode from "vscode";
import {ThrowableTypeCatalog} from "./ThrowableTypeCatalog";

export class JavaTypeDefinitionResolver {
    private readonly codeMask: JavaCodeMask;

    constructor(codeMask: JavaCodeMask) {
        this.codeMask = codeMask;
    }

    public async isThrowableType(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<boolean> {
        const range = document.getWordRangeAtPosition(position);

        if (range === undefined) {
            return false;
        }

        const typeName = document.getText(range);

        if (ThrowableTypeCatalog.isKnownThrowableType(typeName)) {
            return true;
        }

        if (this.hasDirectThrowableSuperclass(document, range.start, typeName)) {
            return true;
        }

        try {
            const definitions = await vscode.commands.executeCommand<readonly (vscode.Location | vscode.LocationLink)[]>(
                "vscode.executeDefinitionProvider",
                document.uri,
                position
            );

            if (definitions === undefined) {
                return false;
            }

            for (const definition of definitions) {
                const location = this.toLocation(definition);

                try {
                    const definitionDocument = await vscode.workspace.openTextDocument(location.uri);

                    if (this.hasDirectThrowableSuperclass(
                        definitionDocument,
                        location.range.start,
                        typeName
                    )) {
                        return true;
                    }
                } catch {
                    continue;
                }
            }
        } catch {
            return false;
        }

        return false;
    }

    private hasDirectThrowableSuperclass(
        document: vscode.TextDocument,
        position: vscode.Position,
        typeName: string
    ): boolean {
        const range = document.getWordRangeAtPosition(position);

        if (range === undefined || document.getText(range) !== typeName) {
            return false;
        }

        const source = this.codeMask.maskNonCode(document.getText());
        const typeNameOffset = document.offsetAt(range.start);
        const classOffset = source.lastIndexOf("class", typeNameOffset);

        if (classOffset === -1 || !this.isClassName(source, classOffset, typeNameOffset)) {
            return false;
        }

        const headerStart = typeNameOffset + typeName.length;
        const openingBrace = source.indexOf("{", headerStart);

        if (openingBrace === -1) {
            return false;
        }

        const header = source.slice(headerStart, openingBrace);
        const directSuperclass = this.findDirectSuperclass(header);

        return directSuperclass !== undefined
            && ThrowableTypeCatalog.isKnownThrowableType(
                directSuperclass
            )
    }

    private isClassName(
        source: string,
        classOffset: number,
        typeNameOffset: number
    ): boolean {
        const beforeClass = source[classOffset - 1];
        const between = source.slice(
            classOffset + "class".length,
            typeNameOffset
        );

        return !this.isIdentifierPart(beforeClass)
            && /^\s+$/.test(between);
    }

    private findDirectSuperclass(
        header: string
    ): string | undefined {
        let genericDepth = 0;

        for (let index = 0; index < header.length; index++) {
            const character = header[index];

            if (character === "<") {
                genericDepth++;
                continue;
            }

            if (character === ">") {
                genericDepth = Math.max(0, genericDepth - 1);
                continue;
            }

            if (genericDepth === 0 && this.hasKeywordAt(header, index, "extends")) {
                return this.readSimpleTypeName(
                    header,
                    index + "extends".length
                )
            }
        }

        return undefined;
    }

    private hasKeywordAt(
        source: string,
        index: number,
        keyword: string
    ): boolean {
        const before = source[index - 1];
        const after = source[index + keyword.length];

        return source.slice(index, index + keyword.length) === keyword
            && !this.isIdentifierPart(before)
            && !this.isIdentifierPart(after);
    }

    private readSimpleTypeName(
        source: string,
        offset: number
    ): string | undefined {
        const match =
            /^\s*(?:[A-Za-z_$][A-Za-z0-9_$]*\s*\.\s*)*([A-Za-z_$][A-Za-z0-9_$]*)/.exec(
            source.slice(offset)
        );

        return match?.[1];
    }

    private toLocation(
        definition: vscode.Location | vscode.LocationLink
    ): vscode.Location {
        if ("targetUri" in definition) {
            if (!definition.targetUri || !definition.targetSelectionRange) {
                throw new Error("Invalid location link");
            }

            return new vscode.Location(
                definition.targetUri,
                definition.targetSelectionRange
            );
        }

        return definition;
    }

    private isIdentifierPart(
        character: string | undefined
    ): boolean {
        return character !== undefined
            && /[A-Za-z0-9_$]/.test(character)
    }
}
