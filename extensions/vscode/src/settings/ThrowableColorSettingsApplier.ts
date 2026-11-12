import type vscode from "vscode";

import {ThrowableColorConfigurationReader} from "@throwable-highlighter/settings/ThrowableColorConfigurationReader";
import {ThrowableColorConfigurationWriter} from "@throwable-highlighter/settings/ThrowableColorConfigurationWriter";
import {ThrowableColorSettingsApplyValidator} from "@throwable-highlighter/settings/ThrowableColorSettingsApplyValidator";
import type {ThrowableColorConfigurationSnapshot} from "@throwable-highlighter/settings/ThrowableColorConfiguration";
import type {ColorSettingsWriteResult} from "@throwable-highlighter/settings/ThrowableColorConfigurationWriter";
import type {ColorSettingsValidationIssue} from "@throwable-highlighter/settings/ThrowableColorSettingsApplyValidator";
import type {
    ColorSettingChange,
    ColorSettingsTarget
} from "@throwable-highlighter/settings/ThrowableColorSettingsDraft";

type ColorSettingsConfiguration = Pick<vscode.WorkspaceConfiguration, "get" | "inspect" | "update">;

export type ColorSettingsApplyResult =
    | {
          readonly kind: "success";
          readonly snapshot: ThrowableColorConfigurationSnapshot;
          readonly written: readonly ColorSettingChange[];
      }
    | {
          readonly kind: "invalid";
          readonly snapshot: ThrowableColorConfigurationSnapshot;
          readonly issues: readonly ColorSettingsValidationIssue[];
      }
    | {
          readonly kind: "write-failed";
          readonly snapshot: ThrowableColorConfigurationSnapshot;
          readonly writeResult: Extract<ColorSettingsWriteResult, {kind: "failed"}>;
      }
    | {readonly kind: "read-failed"; readonly stage: "before-write"; readonly error: unknown}
    | {
          readonly kind: "read-failed";
          readonly stage: "after-write";
          readonly writeResult: ColorSettingsWriteResult;
          readonly error: unknown;
      };

export class ThrowableColorSettingsApplier {
    constructor(
        private readonly configurationReader = new ThrowableColorConfigurationReader(),
        private readonly validator = new ThrowableColorSettingsApplyValidator(),
        private readonly writer = new ThrowableColorConfigurationWriter()
    ) {}

    public async apply(
        getConfiguration: () => ColorSettingsConfiguration,
        target: ColorSettingsTarget,
        changes: readonly ColorSettingChange[]
    ): Promise<ColorSettingsApplyResult> {
        const requested = changes.map(change => ({...change}));
        let configuration: ColorSettingsConfiguration;
        let snapshot: ThrowableColorConfigurationSnapshot;

        try {
            configuration = getConfiguration();
            snapshot = this.configurationReader.read(configuration);
        } catch (error) {
            return {kind: "read-failed", stage: "before-write", error};
        }

        const validation = this.validator.validate(snapshot, target, requested);

        if (validation.kind === "invalid") {
            return {kind: "invalid", snapshot, issues: validation.issues};
        }

        const pending = requested.filter(
            change => !Object.is(snapshot[target][change.context][change.field], change.value)
        );

        if (pending.length === 0) {
            return {kind: "success", snapshot, written: []};
        }

        const writeResult = await this.writer.write(configuration, target, pending);

        try {
            snapshot = this.configurationReader.read(getConfiguration());
        } catch (error) {
            return {kind: "read-failed", stage: "after-write", writeResult, error};
        }

        if (writeResult.kind === "failed") {
            return {kind: "write-failed", snapshot, writeResult};
        }

        return {kind: "success", snapshot, written: writeResult.written};
    }
}
