import type * as vscode from "vscode";

type JavaExtension = Pick<vscode.Extension<unknown>, "activate">;

type JavaExtensionApi = {
    serverReady(): PromiseLike<boolean>;
};

export type JavaSupportReadinessOutcome =
    "ready" | "extension-unavailable" | "api-unavailable" | "server-unconfirmed" | "check-failed";

export type JavaSupportReadinessResult = {
    readonly outcome: JavaSupportReadinessOutcome;
    readonly elapsedMs: number;
};

export class JavaSupportReadiness implements vscode.Disposable {
    private hasStarted = false;
    private isDisposed = false;

    constructor(
        private readonly getJavaExtension: () => JavaExtension | undefined,
        private readonly onResult: (result: JavaSupportReadinessResult) => void
    ) {}

    public start(): void {
        if (this.isDisposed || this.hasStarted) {
            return;
        }

        this.hasStarted = true;
        void this.waitForServerReady();
    }

    public dispose(): void {
        this.isDisposed = true;
    }

    private async waitForServerReady(): Promise<void> {
        const startedAt = performance.now();
        const outcome = await this.checkReadiness();

        if (!this.isDisposed && outcome !== undefined) {
            this.onResult({outcome, elapsedMs: performance.now() - startedAt});
        }
    }

    private async checkReadiness(): Promise<JavaSupportReadinessOutcome | undefined> {
        try {
            const extension = this.getJavaExtension();

            if (extension === undefined) {
                return "extension-unavailable";
            }

            const api: unknown = await extension.activate();

            if (this.isDisposed) {
                return undefined;
            }

            if (!this.isJavaExtensionApi(api)) {
                return "api-unavailable";
            }

            return (await api.serverReady()) ? "ready" : "server-unconfirmed";
        } catch {
            return "check-failed";
        }
    }

    private isJavaExtensionApi(api: unknown): api is JavaExtensionApi {
        return typeof api === "object" && api !== null && "serverReady" in api && typeof api.serverReady === "function";
    }
}
