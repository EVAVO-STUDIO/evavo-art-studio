import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  compileHmfFrameBodyCreativeReviewDecision,
  compileHmfFrameBodyCreativeReviewPacket,
  materializeHmfFrameBodyCreativeReview,
} from "./frame-body-creative-review.mjs";
import {
  assessmentFor,
  cleanup,
  fixture,
} from "./frame-body-creative-review.test-support.mjs";

export { cleanup };

export async function selectionFixture({ failedCriterionId = null } = {}) {
  const value = await fixture();
  const packet = await compileHmfFrameBodyCreativeReviewPacket({
    qaReport: value.qaReport,
    workspaceRoot: value.root,
  });
  const creativeReviewDecision = await compileHmfFrameBodyCreativeReviewDecision({
    packet,
    assessment: assessmentFor(packet, { failedCriterionId }),
  });
  await materializeHmfFrameBodyCreativeReview(creativeReviewDecision);
  const receipts = JSON.parse(await readFile(path.join(value.root, ...value.receiptPath.split("/")), "utf8"));
  return { ...value, packet, creativeReviewDecision, receipts };
}

export function humanDecisionFor(creativeReviewDecision, overrides = {}) {
  const outcome = overrides.outcome ?? creativeReviewDecision.recommendedOutcome;
  return {
    actorId: overrides.actorId ?? "greg-parker",
    occurredAt: overrides.occurredAt ?? "2026-08-13T08:05:00.000Z",
    outcome,
    rationale: overrides.rationale ?? (outcome === "selected"
      ? "The completed creative review is accepted for this exact candidate, which is selected for the separate mastering boundary."
      : "The completed creative findings are accepted and this exact candidate is sent to the separate bounded-repair authorization boundary."),
    attestations: {
      candidateSha256: creativeReviewDecision.reviewPacket.candidate.sha256,
      creativeReviewDecisionSha256: creativeReviewDecision.creativeReviewDecisionSha256,
      creativeReviewReceiptSha256: creativeReviewDecision.receipt.receiptSha256,
      reviewEvidenceSha256: creativeReviewDecision.reviewEvidenceSha256,
      recommendationConsidered: true,
      noCandidateMutationMasteringPromotionOrProviderExecutionPerformed: true,
      ...(overrides.attestations ?? {}),
    },
  };
}
