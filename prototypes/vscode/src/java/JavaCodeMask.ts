type LexicalState = "code" | "lineComment" | "blockComment" | "string" | "character" | "textBlock";

export class JavaCodeMask {
    public maskNonCode(source: string): string {
        const masked = source.split("");
        let state: LexicalState = "code";

        for (let index = 0; index < source.length; index++) {
            const current = source[index];
            const next = source[index + 1];
            const third = source[index + 2];

            if (state === "code") {
                if (current === "/" && next === "/") {
                    this.maskCharacter(masked, index);
                    this.maskCharacter(masked, index + 1);
                    index++;
                    state = "lineComment";
                    continue;
                }

                if (current === "/" && next === "*") {
                    this.maskCharacter(masked, index);
                    this.maskCharacter(masked, index + 1);
                    index++;
                    state = "blockComment";
                    continue;
                }

                if (current === '"' && next === '"' && third === '"') {
                    this.maskCharacter(masked, index);
                    this.maskCharacter(masked, index + 1);
                    this.maskCharacter(masked, index + 2);
                    index += 2;
                    state = "textBlock";
                    continue;
                }

                if (current === '"') {
                    this.maskCharacter(masked, index);
                    state = "string";
                    continue;
                }

                if (current === "'") {
                    this.maskCharacter(masked, index);
                    state = "character";
                }

                continue;
            }

            this.maskCharacter(masked, index);

            if (state === "lineComment") {
                if (current === "\n" || current === "\r") {
                    state = "code";
                }

                continue;
            }

            if (state === "blockComment") {
                if (current === "*" && next === "/") {
                    this.maskCharacter(masked, index + 1);
                    index++;
                    state = "code";
                }

                continue;
            }

            if (state === "textBlock" && current === '"' && next === '"' && third === '"') {
                this.maskCharacter(masked, index + 1);
                this.maskCharacter(masked, index + 2);
                index += 2;
                state = "code";
                continue;
            }

            if ((state === "string" || state === "character") && current === "\\" && next !== undefined) {
                this.maskCharacter(masked, index + 1);
                index++;
                continue;
            }

            if (state === "string" && current === '"') {
                state = "code";
                continue;
            }

            if (state === "character" && current === "'") {
                state = "code";
            }
        }

        return masked.join("");
    }

    private maskCharacter(characters: string[], index: number): void {
        if (characters[index] !== "\n" && characters[index] !== "\r") {
            characters[index] = " ";
        }
    }
}
