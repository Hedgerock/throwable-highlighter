import {rm} from "node:fs/promises";

export async function cleanupRunDirectory(runDirectory, {remove = rm, warn = console.warn} = {}) {
    try {
        await remove(runDirectory, {
            recursive: true,
            force: true,
            maxRetries: 5,
            retryDelay: 200
        });
    } catch (error) {
        const code = error?.code;

        if (!["EBUSY", "ENOTEMPTY", "EPERM"].includes(code)) {
            throw error;
        }

        warn("[extension-host] Cleanup incomplete (" + code + "). Test data retained: " + runDirectory);
    }
}
