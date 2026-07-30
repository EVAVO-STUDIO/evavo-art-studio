import { normalizeJson, type JsonValue } from "@evavo/art-artifacts";

import type { RepairedFamilyRankingRequestInput } from "./revision-ranking-types.js";
import {
  repairedFamilyRankingRequestSha256,
  validateRepairedFamilyRankingRequest,
} from "./revision-ranking-validation.js";

export const REPAIRED_FAMILY_RANKING_CAPABILITIES = Object.freeze([
  "repair.revision-ranking",
  "selection.compare",
  "artifacts.store",
  "evidence.bundle",
] as const);

export function compileRepairedFamilyRankingJob(
  input: RepairedFamilyRankingRequestInput | unknown,
): JsonValue {
  const request = validateRepairedFamilyRankingRequest(input);
  const requestSha256 = repairedFamilyRankingRequestSha256(request);
  return normalizeJson({
    schemaVersion: "1.0",
    request,
    requestSha256,
    executionMode: "durable-worker-or-deliberate-local-run",
    runtimeJob: {
      queue: "selection",
      kind: "art.repair.rank-revisions",
      idempotencyKey: `revision-ranking:${request.rankingId}:${requestSha256}`,
      payload: request,
      inputArtifacts: [request.bridgeEvidenceArtifactId],
      requiredCapabilities: REPAIRED_FAMILY_RANKING_CAPABILITIES,
      maximumAttempts: 1,
      leaseDurationMs: 180_000,
      timeoutMs: 1_200_000,
      labels: {
        rankingId: request.rankingId,
        bridgeEvidenceArtifactId: request.bridgeEvidenceArtifactId,
        stage: "revision-bound-candidate-ranking",
      },
    },
  });
}
