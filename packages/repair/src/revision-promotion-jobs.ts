import { normalizeJson, type JsonValue } from "@evavo/art-artifacts";

import type { RepairedFamilyPromotionRequestInput } from "./revision-promotion-types.js";
import {
  repairedFamilyPromotionRequestSha256,
  validateRepairedFamilyPromotionRequest,
} from "./revision-promotion-validation.js";

export const REPAIRED_FAMILY_PROMOTION_CAPABILITIES = Object.freeze([
  "repair.revision-promote",
  "selection.promote",
  "artifacts.store",
  "evidence.bundle",
] as const);

export function compileRepairedFamilyPromotionJob(
  input: RepairedFamilyPromotionRequestInput | unknown,
): JsonValue {
  const request = validateRepairedFamilyPromotionRequest(input);
  const requestSha256 = repairedFamilyPromotionRequestSha256(request);
  return normalizeJson({
    schemaVersion: "1.0",
    request,
    requestSha256,
    executionMode: "durable-worker-or-deliberate-local-run",
    runtimeJob: {
      queue: "selection",
      kind: "art.repair.promote-revision",
      idempotencyKey: `revision-promotion:${request.promotionId}:${requestSha256}`,
      payload: request,
      inputArtifacts: [request.rankingEvidenceArtifactId],
      requiredCapabilities: REPAIRED_FAMILY_PROMOTION_CAPABILITIES,
      maximumAttempts: 1,
      leaseDurationMs: 120_000,
      timeoutMs: 600_000,
      labels: {
        promotionId: request.promotionId,
        rankingEvidenceArtifactId: request.rankingEvidenceArtifactId,
        targetReference: `${request.target.namespace}/${request.target.name}`,
        stage: "revision-bound-candidate-promotion",
      },
    },
  });
}
