const moduleApi = require("node:module");
const {join, resolve} = require("node:path");

const {PrettierFileChecker} = require("./PrettierFileChecker.cjs");
const {PrettierFileSelector} = require("./PrettierFileSelector.cjs");

function loadPrototypePrettier(repositoryRoot) {
    const loader = moduleApi.createRequire(join(repositoryRoot, "prototypes", "vscode", "package.json"));
    return loader("prettier");
}

class PrettierCheckRunner {
    #root;
    #loadPrettier;

    constructor(repositoryRoot, {loadPrettier = loadPrototypePrettier} = {}) {
        this.#root = resolve(repositoryRoot);
        this.#loadPrettier = loadPrettier;
    }

    async run(selection) {
        if (selection.mode === "none") {
            return {checked: 0, unformatted: []};
        }

        let checker;
        const getChecker = () => (checker ??= new PrettierFileChecker(this.#loadPrettier(this.#root)));
        const selector = new PrettierFileSelector(this.#root, {
            getFileInfo: (file, options) => getChecker().getFileInfo(file, options)
        });

        const files = await selector.select(selection);

        return files.length === 0 ? {checked: 0, unformatted: []} : await getChecker().check(files);
    }
}

module.exports = {PrettierCheckRunner};
