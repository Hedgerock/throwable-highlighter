const fs = require("node:fs");
const {dirname, isAbsolute, relative, resolve, sep} = require("node:path");

const {BuildOutputRegistry} = require("./BuildOutputRegistry.cjs");
const {REGISTRY_FILE_NAME} = require("./BuildOutputRegistryStore.cjs");

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

class BuildOutputCleaner {
    #outputDirectory;
    #options;

    constructor(outputDirectory, {caseSensitive = true} = {}) {
        this.#outputDirectory = resolve(outputDirectory);
        this.#options = {caseSensitive};
    }

    validate(registry, expectedFiles) {
        this.#createPlan(registry, expectedFiles);
    }

    clean(registry, expectedFiles) {
        const {root, stale, current} = this.#createPlan(registry, expectedFiles);

        if (root === undefined) {
            registry.forgetDeletedFiles(stale);
            return;
        }

        for (const file of stale) {
            this.#assertRootUnchanged(root);
            const target = this.#inspectFile(root, file);
            this.#assertNotCurrent(target, current);

            if (target.exists) {
                try {
                    fs.unlinkSync(target.path);
                } catch (error) {
                    if (error.code !== "ENOENT") {
                        throw error;
                    }
                }
            }

            registry.forgetDeletedFiles([file]);

            if (target.exists) {
                this.#pruneEmptyParents(root, dirname(target.path));
            }
        }
    }

    #createPlan(registry, expectedFiles) {
        const expected = new BuildOutputRegistry(expectedFiles, this.#options).getFiles();
        const files = [...new Set([...registry.getFiles(), ...expected])];

        for (const file of files) {
            const first = file.split("/")[0].toLowerCase();
            if (first === REGISTRY_FILE_NAME || first.startsWith(REGISTRY_FILE_NAME + ".")) {
                throw new Error("Build output uses a reserved registry path: " + file);
            }
        }

        const stale = registry.getStaleFiles(expected);
        const root = this.#resolveRoot();

        if (root === undefined) {
            return {root, stale, current: new Set()};
        }

        const inspected = new Map(files.map(file => [file, this.#inspectFile(root, file)]));
        const current = new Set(
            expected
                .map(file => inspected.get(file))
                .filter(target => target.exists)
                .map(target => this.#key(target.path))
        );

        for (const file of stale) {
            this.#assertNotCurrent(inspected.get(file), current);
        }

        return {root, stale, current};
    }

    #resolveRoot() {
        const stats = readStats(this.#outputDirectory);

        if (stats === undefined) {
            return undefined;
        }

        if (!stats.isDirectory()) {
            throw new Error("Build output path must be a real directory: " + this.#outputDirectory);
        }

        return fs.realpathSync(this.#outputDirectory);
    }

    #inspectFile(root, file) {
        const target = resolve(root, file);
        this.#assertInside(root, target);
        const parts = file.split("/");
        let current = root;

        for (let index = 0; index < parts.length; index++) {
            current = resolve(current, parts[index]);
            const stats = readStats(current);

            if (stats === undefined) {
                return {path: target, exists: false};
            }

            if (index === parts.length - 1) {
                if (!stats.isFile()) {
                    throw new Error("Build output must be a regular file: " + current);
                }
            } else if (!stats.isDirectory()) {
                throw new Error("Build output parent must be a real directory: " + current);
            }

            current = fs.realpathSync(current);
            this.#assertInside(root, current);
        }

        return {path: current, exists: true};
    }

    #pruneEmptyParents(root, directory) {
        let current = directory;

        while (this.#key(current) !== this.#key(root)) {
            this.#assertRootUnchanged(root);
            this.#assertInside(root, current);
            const stats = readStats(current);

            if (stats !== undefined) {
                if (!stats.isDirectory()) {
                    throw new Error("Build output parent must be a real directory: " + current);
                }

                current = fs.realpathSync(current);
                this.#assertInside(root, current);

                try {
                    fs.rmdirSync(current);
                } catch (error) {
                    if (error.code === "ENOTEMPTY" || error.code === "EEXIST") {
                        return;
                    }

                    if (error.code !== "ENOENT") {
                        throw error;
                    }
                }
            }

            current = dirname(current);
        }
    }

    #assertInside(root, file) {
        const local = relative(root, file);

        if (local === "" || local === ".." || local.startsWith(".." + sep) || isAbsolute(local)) {
            throw new Error("Build output path is outside its output directory: " + file);
        }
    }

    #assertRootUnchanged(root) {
        const current = this.#resolveRoot();

        if (current === undefined || this.#key(current) !== this.#key(root)) {
            throw new Error("Build output directory changed during cleanup.");
        }
    }

    #assertNotCurrent(target, current) {
        if (target.exists && current.has(this.#key(target.path))) {
            throw new Error("Stale build output resolves to a current output: " + target.path);
        }
    }

    #key(file) {
        return this.#options.caseSensitive ? file : file.toLowerCase();
    }
}

module.exports = {BuildOutputCleaner};
