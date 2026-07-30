import {
  normalizeJson,
  type JsonValue,
} from "@evavo/art-artifacts";

import {
  REPAIRED_FAMILY_REVISION_PROTOCOL_VERSION,
  type RepairedFamilyRevisionRequestInput,
} from "./revision-types.js";
import {
  repairedFamilyRevisionRequestSha256,
  validateRepairedFamilyRevisionRequest,
} from "./revision-validation.js";

export const REPAIRED_FAMILY_REVISION_CAPABILITIES = Object.freeze([
  "repair.revise-family",
  "quality.sprite-frame",
  "sprite.family.verify",
  "media.layer-compose",
  "selection.compare",
  "artifacts.store",
  "evidence.bundle",
] as const);

export function repairedFamilyRevisionProtocolSummary(): JsonValue {
  return normalizeJson({
    schemaVersion: "1.0",
    protocolVersion: REPAIRED_FAMILY_REVISION_PROTOCOL_VERSION,
    kind: "art.repair.revise-family",
    requiredCapabilities: REPAIRED_FAMILY_REVISION_CAPABILITIES,
    rules: [
      "Only a ready manifest-bound layer repair packet may revise a family.",
      "The restored candidate must be declared by the exact repair-execution evidence.",
      "Candidate and rebuilt composite pixels must pass blocking sprite-frame QA.",
      "Only the authorised layer binding and impacted declared composites may change.",
      "Every untouched timing, pivot, baseline, linked-cel, variant and policy field is preserved.",
      "The complete revised family must pass layered-family verification.",
      "Revision results remain unapproved and cannot update a named reference.",
    ],
    executionModes: ["durable-worker", "deliberate-local-run"],
  });
}

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
