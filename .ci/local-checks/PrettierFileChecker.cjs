const fs = require("node:fs");
const moduleApi = require("node:module");

class PrettierFileChecker {
    #prettier;

    constructor(prettier) {
        this.#prettier = prettier;
    }

    async getFileInfo(file, options = {}) {
        const initial = await this.#prettier.getFileInfo(file, {
            ...options,
            resolveConfig: false,
            plugins: []
        });

        if (initial.ignored) {
            return initial;
        }

        const configuration = await this.#resolveOptions(file);

        return this.#prettier.getFileInfo(file, {
            ...options,
            resolveConfig: true,
            plugins: configuration.plugins ?? []
        });
    }

    async check(files) {
        const unique = [...new Set(files)].sort();
        const unformatted = [];

        for (const file of unique) {
            const content = fs.readFileSync(file, "utf8");
            const options = await this.#resolveOptions(file);

            if (!(await this.#prettier.check(content, options))) {
                unformatted.push(file);
            }
        }

        return {checked: unique.length, unformatted};
    }

    async #resolveOptions(file) {
        const configuration = await this.#prettier.resolveConfig(file, {editorconfig: true});
        const options = {...configuration, filepath: file};

        if (Array.isArray(options.plugins)) {
            const loader = moduleApi.createRequire(file);
            options.plugins = options.plugins.map(plugin => typeof plugin === "string" ? loader.resolve(plugin) : plugin);
        }

        return options;
    }
}

module.exports = {PrettierFileChecker};