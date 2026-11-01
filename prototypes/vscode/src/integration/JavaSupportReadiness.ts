import type * as vscode from "vscode";

type JavaExtension = Pick<vscode.Extension<unknown>, "activate">;

type JavaExtensionApi = {
    serverReady(): PromiseLike<boolean>;
};

export class JavaSupportReadiness implements vscode.Disposable {
    private hasStarted = false;
    private isDisposed = false;

    constructor(
        private readonly getJavaExtension: () => JavaExtension | undefined,
        private readonly onReady: () => void,
        private readonly outputChannel: Pick<vscode.OutputChannel, "appendLine">
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
        try {
            const extension = this.getJavaExtension();

            if (extension === undefined) {
                this.log("Red Hat Java extension is unavailable.");

                return;
            }

            const api: unknown = await extension.activate();

            if (this.isDisposed) {
                return;
            }

            if (!this.isJavaExtensionApi(api)) {
                this.log("Red Hat Java API does not provide serverReady().");

                return;
            }

            const isReady = await api.serverReady();

            if (this.isDisposed) {
                return;
            }

            if (!isReady) {
                this.log("Red Hat Java did not confirm standard server readiness.");

                return;
            }

            this.onReady();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            this.log("Java readiness initialization failed: " + message);
        }
    }

    private isJavaExtensionApi(api: unknown): api is JavaExtensionApi {
        return typeof api === "object" && api !== null && "serverReady" in api && typeof api.serverReady === "function";
    }

    private log(message: string): void {
        if (!this.isDisposed) {
            this.outputChannel.appendLine("[Java support] " + message);
        }
    }
}
