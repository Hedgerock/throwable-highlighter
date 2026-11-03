export type RefreshSchedulerOptions = {
    readonly debounceMs: number;
    readonly maximumWaitMs: number;
};

export type RefreshMode = "deferred" | "urgent";

export class ThrowableRefreshScheduler {
    private executionTimer: ReturnType<typeof setTimeout> | undefined;
    private maximumWaitTimer: ReturnType<typeof setTimeout> | undefined;
    private pendingKind: RefreshMode | undefined;
    private isDisposed = false;

    constructor(
        private readonly onRefresh: (mode: RefreshMode) => void,
        private readonly options: RefreshSchedulerOptions
    ) {}

    public request(): void {
        if (this.isDisposed || this.pendingKind === "urgent") {
            return;
        }

        if (this.pendingKind === undefined) {
            this.pendingKind = "deferred";
            this.maximumWaitTimer = setTimeout(() => this.run(), this.options.maximumWaitMs);
        }

        clearTimeout(this.executionTimer);
        this.executionTimer = setTimeout(() => this.run(), this.options.debounceMs);
    }

    public requestUrgent(): void {
        if (this.isDisposed || this.pendingKind === "urgent") {
            return;
        }

        this.clearPending();
        this.pendingKind = "urgent";
        this.executionTimer = setTimeout(() => this.run(), 0);
    }

    public dispose(): void {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        this.clearPending();
    }

    private run(): void {
        if (this.isDisposed || this.pendingKind === undefined) {
            return;
        }

        const mode = this.pendingKind;
        this.clearPending();
        this.onRefresh(mode);
    }

    private clearPending(): void {
        clearTimeout(this.executionTimer);
        clearTimeout(this.maximumWaitTimer);

        this.executionTimer = undefined;
        this.maximumWaitTimer = undefined;
        this.pendingKind = undefined;
    }
}
