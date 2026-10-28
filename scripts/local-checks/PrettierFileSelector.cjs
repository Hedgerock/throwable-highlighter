const fs = require("node:fs");
const {isAbsolute, join, relative, resolve, sep} = require("node:path");

const PROTOTYPE_DIRECTORY = "prototypes/vscode/";

function isInside(directory, file) {
    const path = relative(directory, file);
    return path !== "" && path !== ".." && !path.startsWith(".." + sep) && !isAbsolute(path);
}

function readRealFile(file) {
    try {
        return fs.lstatSync(file).isFile() ? fs.realpathSync(file) : undefined;
    } catch (error) {
        if (error.code === "ENOENT" || error.code === "ENOTDIR") {
            return undefined;
        }

        throw error;
    }
}

class PrettierFileSelector {
    #root;
    #prototype;
    #getFileInfo;

    constructor(repositoryRoot, {getFileInfo}) {
        if (typeof getFileInfo !== "function") {
            throw new TypeError("getFileInfo must be a function.");
        }

        this.#root = resolve(repositoryRoot);
        this.#prototype = join(this.#root, "prototypes", "vscode");
        this.#getFileInfo = getFileInfo;
    }

    async select({mode, changes = [], trackedPaths = []}) {
        if (mode === "none") {
            return [];
        }

        if (mode !== "changed" && mode !== "all") {
            throw new Error("Unknown formatting mode: " + mode);
        }

        const tracked = new Set(trackedPaths);
        const candidates =
            mode === "all" ? trackedPaths : changes.filter(change => change.status !== "D").map(change => change.path);
        const selected = [];
        let realPrototype;

        for (const path of [...new Set(candidates)].sort()) {
            if (typeof path !== "string" || path.length === 0 || isAbsolute(path)) {
                throw new TypeError("Expected a non-empty repository-relative path.");
            }

            if (!tracked.has(path) || !path.startsWith(PROTOTYPE_DIRECTORY)) {
                continue;
            }

            const file = resolve(this.#root, path);

            if (!isInside(this.#prototype, file)) {
                throw new Error("Formatting path leaves the prototype directory: " + path);
            }

            const realFile = readRealFile(file);

            if (realFile === undefined) {
                continue;
            }

            realPrototype ??= join(fs.realpathSync(this.#root), "prototypes", "vscode");

            if (!isInside(realPrototype, realFile)) {
                continue;
            }

            const info = await this.#getFileInfo(file, {
                ignorePath: [join(this.#prototype, ".gitignore"), join(this.#prototype, ".prettierignore")],
                withNodeModules: false,
                resolveConfig: true
            });

            if (!info.ignored && info.inferredParser !== null) {
                selected.push(file);
            }
        }

        return selected;
    }
}

module.exports = {PrettierFileSelector};