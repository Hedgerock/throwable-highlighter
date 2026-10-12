export class ThrowableTypeCatalog {
    public static readonly KNOWN_TYPES = [
        "Throwable",
        "Exception",
        "RuntimeException",
        "IOException",
        "IllegalArgumentException",
        "IllegalStateException"
    ] as const;

    public static readonly KNOWN_TYPE_REFERENCE_PATTERN = new RegExp(
        `\\b(?:${this.KNOWN_TYPES.join("|")})\\b`,
        "g"
    );

    public static isKnownThrowableType(
        typeName: string
    ): boolean {
        return this.KNOWN_TYPES.some(
            knownType => knownType === typeName
        );
    }
}
