export class ThrowableTypeCatalog {
    public static readonly KNOWN_TYPES = [
        "java.lang.Throwable",
        "java.lang.Exception",
        "java.lang.RuntimeException",
        "java.io.IOException",
        "java.lang.IllegalArgumentException",
        "java.lang.IllegalStateException"
    ] as const;

    public static isKnownThrowableType(qualifiedName: string): boolean {
        return this.KNOWN_TYPES.some(knownType => knownType === qualifiedName);
    }
}
