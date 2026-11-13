const childProcess = require("node:child_process");
const {resolve} = require("node:path");
const process = require("node:process");

function splitNul(output) {
    if (output === "") {
        return [];
    }

    if (!output.endsWith("\0")) {
        throw new Error("Git output must end with a NUL separator.");
    }

    const fields = output.slice(0, -1).split("\0");

    if (fields.some(field => field === "")) {
        throw new Error("Git output contains an empty field.");
    }

    return fields;
}

function parseChanges(output) {
    const fields = splitNul(output);
    const changes = [];
    let index = 0;

    while (index < fields.length) {
        const rawStatus = fields[index++];

        if (!/^(?:[ADMT]|[MRC]\d{1,3})$/.test(rawStatus) || Number(rawStatus.slice(1)) > 100) {
            throw new Error("Unsupported Git change status: " + rawStatus);
        }

        const status = rawStatus[0];
        const hasPreviousPath = status === "R" || status === "C";
        const count = hasPreviousPath ? 2 : 1;

        if (index + count > fields.length) {
            throw new Error("Git change does not contain all required paths.");
        }

        const firstPath = fields[index++];

        changes.push(hasPreviousPath
            ? {status, path: fields[index++], previousPath: firstPath}
            : {status, path: firstPath}
        );
    }

    return changes;
}

class GitChangesReader {
    #root;
    #env;

    constructor(repositoryRoot, {env = process.env} = {}) {
        this.#root = resolve(repositoryRoot);
        this.#env = env;
    }

    readStaged() {
        return parseChanges(this.#readDiff(["--cached"]));
    }

    readLocal() {
        return [...this.readStaged(), ...parseChanges(this.#readDiff([]))];
    }

    readTrackedPaths() {
        return [...new Set(splitNul(this.#runGit([
            "ls-files",
            "--cached",
            "--full-name",
            "-z",
            "--"
        ])))];
    }

    #readDiff(options) {
        return this.#runGit([
            "diff",
            ...options,
            "--name-status",
            "-z",
            "--find-renames",
            "--no-relative",
            "--no-ext-diff",
            "--no-textconv",
            "--"
        ]);
    }

    #runGit(args) {
        const result = childProcess.spawnSync("git", ["--no-optional-locks", ...args], {
            cwd: this.#root,
            env: this.#env,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
            maxBuffer: 16 * 1024 * 1024
        });

        if (result.error) {
            throw new Error(
                "Unable to start git: " + result.error.message,
                {cause: result.error}
            );
        }

        if (result.status !== 0) {
            const reason = result.signal ? "signal " + result.signal : "exit code " + result.status;
            const details = typeof result.stderr === "string" ? result.stderr.trim() : "";

            throw new Error(
                "git " + args.join(" ") + " failed: " + reason + (details ? "\n" + details : "")
            );
        }

        if (typeof result.stdout !== "string") {
            throw new Error("Git did not return textual output.");
        }

        return result.stdout;
    }
}

module.exports = {GitChangesReader};