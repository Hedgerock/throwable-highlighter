export type JavaProviderRequestLimiterSnapshot = {
    readonly active: number;
    readonly queued: number;
    readonly peakActive: number;
    readonly peakQueued: number;
};

type QueuedJavaProviderRequest = {
    readonly start: () => void;
    readonly reject: (reason: unknown) => void;
};

export class JavaProviderRequestCancelledError extends Error {
    constructor() {
        super("Java provider request was cancelled");
        this.name = "JavaProviderRequestCancelledError";
    }
}

export class JavaProviderRequestLimiter {
    private active = 0;
    private peakActive = 0;
    private peakQueued = 0;
    private readonly queue: QueuedJavaProviderRequest[] = [];
    private isDisposed = false;

    constructor(private readonly maximumConcurrentRequests: number) {
        if (!Number.isInteger(maximumConcurrentRequests) || maximumConcurrentRequests <= 0) {
            throw new RangeError("Maximum concurrent requests must be a positive integer");
        }
    }

    public getSnapshot(): JavaProviderRequestLimiterSnapshot {
        return {
            active: this.active,
            queued: this.queue.length,
            peakActive: this.peakActive,
            peakQueued: this.peakQueued
        };
    }

    public run<T>(operation: () => PromiseLike<T>, isCurrent: () => boolean = () => true): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            if (this.isDisposed) {
                reject(new JavaProviderRequestCancelledError());
                return;
            }

            const start = (): void => {
                if (!this.validateRequest(isCurrent, reject)) {
                    return;
                }

                this.active++;
                this.peakActive = Math.max(this.peakActive, this.active);

                let request: Promise<T>;

                try {
                    request = Promise.resolve(operation());
                } catch (error) {
                    request = Promise.reject(error);
                }

                void request.then(
                    value => {
                        this.complete();
                        resolve(value);
                    },
                    error => {
                        this.complete();
                        reject(error);
                    }
                );
            };

            if (this.active < this.maximumConcurrentRequests && this.queue.length === 0) {
                start();
            } else if (this.validateRequest(isCurrent, reject)) {
                this.queue.push({start, reject});
                this.peakQueued = Math.max(this.peakQueued, this.queue.length);
                this.drain();
            }
        });
    }

    public cancelPending(): void {
        const pending = this.queue.splice(0);

        for (const request of pending) {
            request.reject(new JavaProviderRequestCancelledError());
        }
    }

    public dispose(): void {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        this.cancelPending();
    }

    private validateRequest(isCurrent: () => boolean, reject: (reason: unknown) => void): boolean {
        try {
            if (isCurrent() && !this.isDisposed) {
                return true;
            }

            reject(new JavaProviderRequestCancelledError());
        } catch (error) {
            reject(error);
        }

        return false;
    }

    private complete(): void {
        this.active--;
        this.drain();
    }

    private drain(): void {
        while (!this.isDisposed && this.active < this.maximumConcurrentRequests) {
            const next = this.queue.shift();

            if (next === undefined) {
                return;
            }

            next.start();
        }
    }
}
