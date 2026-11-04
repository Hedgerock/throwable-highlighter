export type JavaProviderRequestSnapshot = {
    readonly active: number;
    readonly peak: number;
};

export class JavaProviderRequestCounter {
    private active = 0;
    private peak = 0;

    public getSnapshot(): JavaProviderRequestSnapshot {
        return {
            active: this.active,
            peak: this.peak
        };
    }

    public async track<T>(operation: () => PromiseLike<T>): Promise<T> {
        this.active++;
        this.peak = Math.max(this.peak, this.active);

        try {
            return await operation();
        } finally {
            this.active--;
        }
    }
}
