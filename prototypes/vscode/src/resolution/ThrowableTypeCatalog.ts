export class ThrowableTypeCatalog {
    public static readonly FALLBACK_TYPES = [
        "Throwable",
        "Exception",
        "RuntimeException",
        "IOException",
        "IllegalArgumentException",
        "IllegalStateException"
    ] as const;

    public static isFallbackThrowableType(
        typeName: string
    ): boolean {
        return this.FALLBACK_TYPES.some(
            knownType => knownType === typeName
        );
    }
}
