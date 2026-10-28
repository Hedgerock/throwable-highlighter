const fs = require("node:fs");
const {isAbsolute, relative, resolve, sep} = require("node:path");
const process = require("node:process");
const {parseArgs} = require("node:util");

const {CheckPlanBuilder} = require("./local-checks/CheckPlanBuilder.cjs");
const {GitChangesReader} = require("./local-checks/GitChangesReader.cjs");
const {PrettierCheckRunner} = require("./local-checks/PrettierCheckRunner.cjs");

function isRelativePath(path) {
    return (
        typeof path === "string" &&
        path.length > 0 &&
        !isAbsolute(path) &&
        !path.includes("\0") &&
        !path.split("/").some(part => part === "" || part === "." || part === "..")
    );
}

function isChange(change) {
    if (!change || !["A", "C", "D", "M", "R", "T"].includes(change.status) || !isRelativePath(change.path)) {
        return false;
    }

    return change.status === "R" || change.status === "C"
        ? isRelativePath(change.previousPath)
        : change.previousPath === undefined;
}

function readSelection(file) {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));

    if (
        !value ||
        value.version !== 1 ||
        !["none", "changed", "all"].includes(value.mode) ||
        !Array.isArray(value.changes) ||
        !value.changes.every(isChange) ||
        !Array.isArray(value.trackedPaths) ||
        !value.trackedPaths.every(isRelativePath)
    ) {
        throw new Error("Invalid formatting selection.");
    }

    return {mode: value.mode, changes: value.changes, trackedPaths: value.trackedPaths};
}

async function checkFormat({
                               repositoryRoot = resolve(__dirname, ".."),
                               env = process.env,
                               full = false,
                               selection
                           } = {}) {
    const root = resolve(repositoryRoot);

    if (selection !== undefined) {
        return new PrettierCheckRunner(root).run(selection);
    }

    const reader = new GitChangesReader(root, {env});
    const changes = full ? [] : reader.readLocal();
    const mode = full ? "all" : new CheckPlanBuilder().build(changes).formatting;
    const trackedPaths = mode === "none" ? [] : reader.readTrackedPaths();

    return new PrettierCheckRunner(root).run({mode, changes, trackedPaths});
}

async function main(
    args = process.argv.slice(2),
    {
        repositoryRoot = resolve(__dirname, ".."),
        env = process.env,
        run = checkFormat,
        log = console.log,
        error = console.error
    } = {}
) {
    try {
        const {values} = parseArgs({
            args,
            options: {
                changed: {type: "boolean"},
                all: {type: "boolean"},
                selection: {type: "string"}
            },
            strict: true,
            allowPositionals: false
        });
        const modes = [values.changed === true, values.all === true, values.selection !== undefined];

        if (modes.filter(Boolean).length !== 1 || values.selection === "") {
            throw new Error("Usage: node scripts/check-format.cjs <--changed|--all|--selection file>");
        }

        const options = {repositoryRoot, env, full: values.all === true};

        if (values.selection !== undefined) {
            options.selection = readSelection(values.selection);
        }

        const result = await run(options);

        if (result.unformatted.length > 0) {
            error("[format-check] Unformatted files:");

            for (const file of result.unformatted) {
                error("  " + relative(resolve(repositoryRoot), file).replaceAll(sep, "/"));
            }

            return 1;
        }

        log(
            result.checked === 0
                ? "[format-check] No matching tracked files."
                : "[format-check] Checked " + result.checked + " file(s)."
        );
        return 0;
    } catch (problem) {
        error("[format-check] " + (problem instanceof Error ? problem.message : String(problem)));
        return 2;
    }
}

module.exports = {checkFormat, main};

if (require.main === module) {
    main().then(code => {
        process.exitCode = code;
    });
}
