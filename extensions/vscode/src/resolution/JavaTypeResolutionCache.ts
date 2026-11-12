export class JavaTypeResolutionCache {
    private readonly entries = new Map<string, boolean>();

    constructor(private readonly maximumEntries: number) {
        if (!Number.isSafeInteger(maximumEntries) || maximumEntries <= 0) {
            throw new RangeError("Maximum cached resolutions must be a positive safe integer");
        }
    }

    public get size(): number {
        return this.entries.size;
    }

    public get(key: string): boolean | undefined {
        const value = this.entries.get(key);
        if (value !== undefined) {
            this.set(key, value);
        }

        return value;
    }

    public set(key: string, value: boolean): void {
        this.entries.delete(key);

        if (this.entries.size === this.maximumEntries) {
            const oldest = this.entries.keys().next();

            if (!oldest.done) {
                this.entries.delete(oldest.value);
            }
        }

        this.entries.set(key, value);
    }

    public clear(): void {
        this.entries.clear();
    }
}
