const {dirname, isAbsolute, relative, resolve, sep} = require("node:path");

const ts = require("typescript");

function createWatchSystem() {
    const files = new Set();
    const directories = new Set();
    const timers = new Map();
    let nextTimer = 0;

    const key = file => {
        const absolute = resolve(file);
        return ts.sys.useCaseSensitiveFileNames ? absolute : absolute.toLowerCase();
    };

    const register = (collection, item) => {
        collection.add(item);
        return {close: () => collection.delete(item)};
    };

    return {
        system: {
            ...ts.sys,
            watchFile(file, callback) {
                return register(files, {file: resolve(file), callback});
            },
            watchDirectory(file, callback, recursive) {
                return register(directories, {file: resolve(file), callback, recursive});
            },
            setTimeout(callback, delay, ...args) {
                const id = ++nextTimer;
                timers.set(id, () => callback(...args));
                return id;
            },
            clearTimeout(id) {
                timers.delete(id);
            }
        },
        notify(file, event = ts.FileWatcherEventKind.Changed) {
            const target = resolve(file);

            for (const item of [...files]) {
                if (key(item.file) === key(target)) {
                    item.callback(target, event);
                }
            }

            for (const item of [...directories]) {
                const local = relative(item.file, target);
                const inside = local !== "" && local !== ".." && !local.startsWith(".." + sep) && !isAbsolute(local);

                if (inside && (item.recursive || key(dirname(target)) === key(item.file))) {
                    item.callback(target);
                }
            }
        },
        flush() {
            let passes = 0;

            while (timers.size > 0) {
                if (++passes > 100) {
                    throw new Error("Watch timers did not settle.");
                }

                for (const [id, callback] of [...timers]) {
                    if (timers.delete(id)) {
                        callback();
                    }
                }
            }
        }
    };
}

module.exports = {createWatchSystem};
