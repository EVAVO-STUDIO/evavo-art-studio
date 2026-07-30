import {
  normalizeJson,
  sha256,
  stableStringify,
  type ArtifactId,
} from "@evavo/art-artifacts";

import { validateTargetedRepairExecutionRequest } from "./execution.js";
import type {
  NormalizedTargetedRepairExecutionRequest,
  TargetedRepairExecutionRequestInput,
} from "./types.js";

export const TARGETED_REPAIR_EXECUTION_CAPABILITIES = Object.freeze([
  "repair.execute",
  "media.provider-canvas",
  "provider.inpaint",
  "provider.reference-lock",
  "provider.mask",
  "provider.candidate-store",
  "evidence.bundle",
] as const);

export interface CompiledTargetedRepairExecutionJob {
  readonly schemaVersion: "1.0";
  readonly request: NormalizedTargetedRepairExecutionRequest;
  readonly requestSha256: string;
  readonly executionMode: "durable-worker-only";
  readonly runtimeJob: Readonly<{
    queue: "provider";
    kind: "art.repair.execute-provider-canvas";
    idempotencyKey: string;
    payload: NormalizedTargetedRepairExecutionRequest;
    inputArtifacts: readonly ArtifactId[];
    requiredCapabilities: typeof TARGETED_REPAIR_EXECUTION_CAPABILITIES;
    maximumAttempts: 2;
    leaseDurationMs: 600_000;
    timeoutMs: 2_400_000;
    labels: Readonly<{
      repairPacketArtifactId: ArtifactId;
      stage: "pixel-safe-provider-repair";
    }>;
  }>;
}

export function targetedRepairExecutionRequestSha256(
  request: NormalizedTargetedRepairExecutionRequest,
): string {
  return sha256(stableStringify(normalizeJson(request)));
}

export function compileTargetedRepairExecutionJob(
  input: TargetedRepairExecutionRequestInput | unknown,
): CompiledTargetedRepairExecutionJob {
  const request = validateTargetedRepairExecutionRequest(input);
  const requestSha256 = targetedRepairExecutionRequestSha256(request);
  return {
    schemaVersion: "1.0",
    request,
    requestSha256,
    executionMode: "durable-worker-only",
    runtimeJob: {
      queue: "provider",
      kind: "art.repair.execute-provider-canvas",
      idempotencyKey: `repair-execute:${requestSha256}`,
      payload: request,
      inputArtifacts: [request.repairPacketArtifactId],
      requiredCapabilities: TARGETED_REPAIR_EXECUTION_CAPABILITIES,
      maximumAttempts: 2,
      leaseDurationMs: 600_000,
      timeoutMs: 2_400_000,
      labels: {
        repairPacketArtifactId: request.repairPacketArtifactId,
        stage: "pixel-safe-provider-repair",
      },
    },
  };
}
