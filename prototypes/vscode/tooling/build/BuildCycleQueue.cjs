class BuildCycleQueue {
    #build;
    #onError;
    #pending = false;
    #running;
    #disposed = false;

    constructor(build, {onError = error => console.error(error)} = {}) {
        this.#build = build;
        this.#onError = onError;
    }

    request() {
        if (this.#disposed) {
            return Promise.resolve();
        }

        this.#pending = true;

        if (this.#running === undefined) {
            this.#running = Promise.resolve().then(() => this.#drain());
        }

        return this.#running;
    }

    async dispose() {
        this.#disposed = true;
        this.#pending = false;
        await this.#running;
    }

    async #drain() {
        try {
            while (this.#pending && !this.#disposed) {
                this.#pending = false;

                try {
                    await this.#build();
                } catch (error) {
                    this.#onError(error);
                }
            }
        } finally {
            this.#running = undefined;
        }
    }
}

module.exports = {BuildCycleQueue};
