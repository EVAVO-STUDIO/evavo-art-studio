import {
  normalizeJson,
  type JsonValue,
} from "@evavo/art-artifacts";

import {
  repairedFamilyRevisionRequestSha256,
  validateRepairedFamilyRevisionRequest,
} from "./revision-validation.js";
import type { RepairedFamilyRevisionRequestInput } from "./revision-types.js";

export const REPAIRED_FAMILY_REVISION_CAPABILITIES = Object.freeze([
  "repair.revise-family",
  "quality.sprite-frame",
  "sprite.family.verify",
  "media.layer-compose",
  "selection.compare",
  "artifacts.store",
  "evidence.bundle",
] as const);

export function compileRepairedFamilyRevisionJob(
  input: RepairedFamilyRevisionRequestInput | unknown,
): JsonValue {
  const request = validateRepairedFamilyRevisionRequest(input);
  const requestSha256 = repairedFamilyRevisionRequestSha256(request);
  return normalizeJson({
    schemaVersion: "1.0",
    request,
    requestSha256,
    executionMode: "durable-worker-or-deliberate-local-run",
    runtimeJob: {
      queue: "selection",
      kind: "art.repair.revise-family",
      idempotencyKey: `repair-family-revision:${request.revisionId}:${requestSha256}`,
      payload: request,
      inputArtifacts: [
        request.repairPacketArtifactId,
        request.repairExecutionEvidenceArtifactId,
        request.restoredCandidateArtifactId,
      ].sort(),
      requiredCapabilities: REPAIRED_FAMILY_REVISION_CAPABILITIES,
      maximumAttempts: 1,
      leaseDurationMs: 300_000,
      timeoutMs: 1_800_000,
      labels: {
        revisionId: request.revisionId,
        repairPacketArtifactId: request.repairPacketArtifactId,
        stage: "repaired-family-revision",
      },
    },
  });
}
