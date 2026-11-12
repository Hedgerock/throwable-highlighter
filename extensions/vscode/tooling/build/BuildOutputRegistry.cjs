const REGISTRY_VERSION = 1;

function normalizeFiles(files) {
    if (!Array.isArray(files)) {
        throw new TypeError("Build output files must be an array.");
    }

    return Array.from(files, file => {
        if (typeof file !== "string") {
            throw new TypeError("Build output paths must be strings.");
        }

        const normalized = file.replaceAll("\\", "/");
        const invalidSegment = normalized
            .split("/")
            .some(segment => segment === "" || segment.endsWith(".") || segment.endsWith(" "));

        if (invalidSegment || /[\x00-\x1f<>:"|?*]/.test(normalized)) {
            throw new Error("Invalid build output path: " + JSON.stringify(file));
        }

        return normalized;
    });
}

class BuildOutputRegistry {
    #files = new Map();
    #caseSensitive;

    constructor(files = [], {caseSensitive = true} = {}) {
        this.#caseSensitive = caseSensitive;
        this.recordWrittenFiles(files);
    }

    static fromJSON(value, options) {
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
            throw new Error("Invalid build output registry.");
        }

        const keys = Object.keys(value);

        if (keys.length !== 2 || !keys.includes("version") || !keys.includes("files")) {
            throw new Error("Invalid build output registry.");
        }

        if (value.version !== REGISTRY_VERSION) {
            throw new Error("Unsupported build output registry version.");
        }

        return new BuildOutputRegistry(value.files, options);
    }

    recordWrittenFiles(files) {
        for (const file of normalizeFiles(files)) {
            this.#files.set(this.#key(file), file);
        }
    }

    getFiles() {
        return [...this.#files.values()].sort();
    }

    getStaleFiles(expectedFiles) {
        const expected = new Set(normalizeFiles(expectedFiles).map(file => this.#key(file)));
        return this.getFiles().filter(file => !expected.has(this.#key(file)));
    }

    forgetDeletedFiles(files) {
        for (const file of normalizeFiles(files)) {
            this.#files.delete(this.#key(file));
        }
    }

    toJSON() {
        return {
            version: REGISTRY_VERSION,
            files: this.getFiles()
        };
    }

    #key(file) {
        return this.#caseSensitive ? file : file.toLowerCase();
    }
}

module.exports = {BuildOutputRegistry};
