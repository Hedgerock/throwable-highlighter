import * as vscode from "vscode";

import {JavaClassNameReader} from "@throwable-highlighter/resolution/JavaClassNameReader";
import type {JavaCodeMask} from "@throwable-highlighter/java/JavaCodeMask";
import type {
    ClassDeclaration,
    DirectSuperclassResolution,
    TypeReference
} from "@throwable-highlighter/resolution/hierarchy/index";

export type VsCodeTypeReference = TypeReference & {
    document: vscode.TextDocument;
    range: vscode.Range;
};

export class JavaClassDeclarationReader {
    private readonly classNameReader = new JavaClassNameReader();

    private static readonly IDENTIFIER_PATTERN = /[\p{L}\p{Nl}\p{Sc}\p{Pc}][\p{ID_Continue}\p{Sc}\p{Cf}]*/u;

    private static readonly SUPERCLASS_PATTERN = new RegExp(
        String.raw`^\s*(?:${JavaClassDeclarationReader.IDENTIFIER_PATTERN.source}\s*\.\s*)*(${JavaClassDeclarationReader.IDENTIFIER_PATTERN.source})`,
        "u"
    );

    private static readonly KEYWORD_PATTERNS = {
        class: /(?<![\p{ID_Continue}\p{Sc}\p{Cf}])class(?![\p{ID_Continue}\p{Sc}\p{Cf}])/uy,
        extends: /(?<![\p{ID_Continue}\p{Sc}\p{Cf}])extends(?![\p{ID_Continue}\p{Sc}\p{Cf}])/uy
    };

    constructor(private readonly codeMask: JavaCodeMask) {}

    public readTypeReference(
        document: vscode.TextDocument,
        position: vscode.Position
    ): VsCodeTypeReference | undefined {
        const range = document.getWordRangeAtPosition(position, JavaClassDeclarationReader.IDENTIFIER_PATTERN);

        if (range === undefined) {
            return undefined;
        }

        return {
            document,
            name: document.getText(range),
            range
        };
    }

    public readClassDeclaration(reference: VsCodeTypeReference): ClassDeclaration<VsCodeTypeReference> | undefined {
        const document = reference.document;
        const source = this.codeMask.maskNonCode(document.getText());
        const typeNameOffset = document.offsetAt(reference.range.start);
        const classOffset = source.lastIndexOf("class", typeNameOffset);

        if (classOffset === -1 || !this.isClassName(source, classOffset, typeNameOffset)) {
            return undefined;
        }

        const headerStart = typeNameOffset + reference.name.length;
        const openingBrace = source.indexOf("{", headerStart);

        if (openingBrace === -1) {
            return undefined;
        }

        return {
            identity: this.createDeclarationIdentity(document, reference.range),
            qualifiedName: this.classNameReader.readQualifiedName(source, typeNameOffset),
            directSuperclass: this.readDirectSuperclass(document, source, headerStart, openingBrace)
        };
    }

    private readDirectSuperclass(
        document: vscode.TextDocument,
        source: string,
        headerStart: number,
        openingBrace: number
    ): DirectSuperclassResolution<VsCodeTypeReference> {
        let genericDepth = 0;

        for (let index = headerStart; index < openingBrace; index++) {
            const character = source[index];

            if (character === "<") {
                genericDepth++;
                continue;
            }

            if (character === ">") {
                genericDepth = Math.max(0, genericDepth - 1);
                continue;
            }

            if (genericDepth === 0 && this.hasKeywordAt(source, index, "extends")) {
                const reference = this.readSimpleTypeReference(document, source, index + "extends".length);

                return reference === undefined
                    ? {
                          kind: "unavailable"
                      }
                    : {
                          kind: "found",
                          reference
                      };
            }
        }

        return {
            kind: "none"
        };
    }

    private readSimpleTypeReference(
        document: vscode.TextDocument,
        source: string,
        offset: number
    ): VsCodeTypeReference | undefined {
        const match = JavaClassDeclarationReader.SUPERCLASS_PATTERN.exec(source.slice(offset));

        if (match === null) {
            return undefined;
        }

        const typeName = match[1];
        const typeNameOffset = offset + match[0].lastIndexOf(typeName);

        return this.readTypeReference(document, document.positionAt(typeNameOffset));
    }

    private isClassName(source: string, classOffset: number, typeNameOffset: number): boolean {
        const between = source.slice(classOffset + "class".length, typeNameOffset);

        return this.hasKeywordAt(source, classOffset, "class") && /^\s+$/.test(between);
    }

    private hasKeywordAt(source: string, index: number, keyword: "class" | "extends"): boolean {
        const pattern = JavaClassDeclarationReader.KEYWORD_PATTERNS[keyword];
        pattern.lastIndex = index;

        return pattern.test(source);
    }

    private createDeclarationIdentity(document: vscode.TextDocument, range: vscode.Range): string {
        return JSON.stringify({
            uri: document.uri.toString(),
            start: {
                line: range.start.line,
                character: range.start.character
            },
            end: {
                line: range.end.line,
                character: range.end.character
            }
        });
    }
}
