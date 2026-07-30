import {
  normalizeJson,
  type JsonValue,
} from "@evavo/art-artifacts";

import type { RepairedFamilySelectionRequestInput } from "./revision-selection-types.js";
import {
  repairedFamilySelectionRequestSha256,
  validateRepairedFamilySelectionRequest,
} from "./revision-selection-validation.js";

export const REPAIRED_FAMILY_SELECTION_CAPABILITIES = Object.freeze([
  "repair.revision-selection",
  "artifacts.store",
  "evidence.bundle",
] as const);

export function compileRepairedFamilySelectionJob(
  input: RepairedFamilySelectionRequestInput | unknown,
): JsonValue {
  const request = validateRepairedFamilySelectionRequest(input);
  const requestSha256 = repairedFamilySelectionRequestSha256(request);
  return normalizeJson({
    schemaVersion: "1.0",
    request,
    requestSha256,
    executionMode: "durable-worker-or-deliberate-local-run",
    runtimeJob: {
      queue: "selection",
      kind: "art.repair.prepare-revision-selection",
      idempotencyKey: `revision-selection:${request.bridgeId}:${requestSha256}`,
      payload: request,
      inputArtifacts: [
        ...request.revisionEvidenceArtifactIds,
        ...request.externalEvidenceArtifactIds,
      ].sort(),
      requiredCapabilities: REPAIRED_FAMILY_SELECTION_CAPABILITIES,
      maximumAttempts: 1,
      leaseDurationMs: 120_000,
      timeoutMs: 900_000,
      labels: {
        bridgeId: request.bridgeId,
        stage: "repaired-family-selection-bridge",
      },
    },
  });
}
