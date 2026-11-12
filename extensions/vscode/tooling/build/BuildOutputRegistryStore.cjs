const crypto = require("node:crypto");
const fs = require("node:fs");
const {join, resolve} = require("node:path");

const {BuildOutputRegistry} = require("./BuildOutputRegistry.cjs");

const REGISTRY_FILE_NAME = ".build-output-registry.json";

function readStats(file) {
    try {
        return fs.lstatSync(file);
    } catch (error) {
        if (error.code === "ENOENT") {
            return undefined;
        }

        throw error;
    }
}

class BuildOutputRegistryStore {
    #outputDirectory;
    #options;

    constructor(outputDirectory, {caseSensitive = true} = {}) {
        this.#outputDirectory = resolve(outputDirectory);
        this.#options = {caseSensitive};
    }

    load() {
        const stats = readStats(this.#outputDirectory);

        if (stats === undefined) {
            return new BuildOutputRegistry([], this.#options);
        }

        const directory = this.#resolveDirectory(stats);
        const file = join(directory, REGISTRY_FILE_NAME);

        if (this.#checkRegistryFile(file) === undefined) {
            return new BuildOutputRegistry([], this.#options);
        }

        const content = fs.readFileSync(file, "utf8");
        return BuildOutputRegistry.fromJSON(JSON.parse(content), this.#options);
    }

    save(registry) {
        const content = JSON.stringify(registry.toJSON(), null, 2) + "\n";
        let stats = readStats(this.#outputDirectory);

        if (stats === undefined) {
            fs.mkdirSync(this.#outputDirectory, {recursive: true});
            stats = fs.lstatSync(this.#outputDirectory);
        }

        const directory = this.#resolveDirectory(stats);
        const file = join(directory, REGISTRY_FILE_NAME);
        this.#checkRegistryFile(file);

        const temporary = join(directory, REGISTRY_FILE_NAME + "." + crypto.randomUUID() + ".tmp");
        const descriptor = fs.openSync(temporary, "wx");
        let replaced = false;

        try {
            try {
                fs.writeFileSync(descriptor, content, "utf8");
            } finally {
                fs.closeSync(descriptor);
            }

            fs.renameSync(temporary, file);
            replaced = true;
        } finally {
            if (!replaced) {
                fs.rmSync(temporary, {force: true});
            }
        }
    }

    #resolveDirectory(stats) {
        if (!stats.isDirectory()) {
            throw new Error("Build output path must be a real directory: " + this.#outputDirectory);
        }

        return fs.realpathSync(this.#outputDirectory);
    }

    #checkRegistryFile(file) {
        const stats = readStats(file);

        if (stats !== undefined && !stats.isFile()) {
            throw new Error("Build output registry must be a regular file: " + file);
        }

        return stats;
    }
}

module.exports = {BuildOutputRegistryStore, REGISTRY_FILE_NAME};
