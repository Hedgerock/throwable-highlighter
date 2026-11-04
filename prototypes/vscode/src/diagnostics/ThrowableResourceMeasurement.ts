import type {JavaTypeDefinitionResolverResourceSnapshot} from "@throwable-highlighter/resolution/JavaTypeDefinitionResolver";

export type ResourceMeasurementSnapshot = {
    readonly processId: number;
    readonly elapsedMs: number;
    readonly memory: Readonly<NodeJS.MemoryUsage>;
    readonly resolver: JavaTypeDefinitionResolverResourceSnapshot;
};

export type ResourceMeasurementOptions = {
    readonly processId: number;
    readonly intervalMs: number;
    readonly now: () => number;
    readonly readMemoryUsage: () => Readonly<NodeJS.MemoryUsage>;
    readonly readResolverSnapshot: () => JavaTypeDefinitionResolverResourceSnapshot;
    readonly onMeasurement: (snapshot: ResourceMeasurementSnapshot) => void;
};

export class ThrowableResourceMeasurement {
    private timer: ReturnType<typeof setInterval> | undefined;
    private startedAt: number | undefined;
    private isDisposed = false;

    constructor(private readonly options: ResourceMeasurementOptions) {}

    public start(): void {
        if (this.isDisposed || this.timer !== undefined) {
            return;
        }

        this.startedAt = this.options.now();
        this.timer = setInterval(() => this.measure(), this.options.intervalMs);
        this.measure();
    }

    public dispose(): void {
        if (this.isDisposed) {
            return;
        }

        this.isDisposed = true;
        clearInterval(this.timer);
        this.timer = undefined;
    }

    private measure(): void {
        if (this.isDisposed || this.startedAt === undefined) {
            return;
        }

        this.options.onMeasurement({
            processId: this.options.processId,
            elapsedMs: this.options.now() - this.startedAt,
            memory: this.options.readMemoryUsage(),
            resolver: this.options.readResolverSnapshot()
        });
    }
}
