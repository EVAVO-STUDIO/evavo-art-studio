import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  compileHmfFrameBodySelectedCandidateMasteringPlan,
  materializeHmfFrameBodySelectedCandidateMaster,
} from "./frame-body-selected-candidate-mastering.mjs";
import {
  cleanup,
  masteringFixture,
  masteringRequestFor,
} from "./frame-body-selected-candidate-mastering.test-support.mjs";

export { cleanup };

export async function approvalFixture() {
  const value = await masteringFixture();
  if (value.selectionDecision.outcome !== "selected") {
    throw new Error("approvalFixture requires a selected candidate.");
  }
  const masteringPlan =
    await compileHmfFrameBodySelectedCandidateMasteringPlan({
      selectionDecision: value.selectionDecision,
      workspaceRoot: value.root,
      masteringRequest: masteringRequestFor(value.selectionDecision),
    });
  const masteringResult =
    await materializeHmfFrameBodySelectedCandidateMaster(masteringPlan);
  const receipts = JSON.parse(
    await readFile(
      path.join(value.root, ...value.receiptPath.split("/")),
      "utf8",
    ),
  );
  return {
    ...value,
    masteringPlan,
    masteringResult,
    receipts,
  };
}

export function approvalRequestFor(masteringPlan, overrides = {}) {
  return {
    actorId: overrides.actorId ?? "greg-parker",
    occurredAt:
      overrides.occurredAt ?? "2026-08-13T08:07:00.000Z",
    decision: overrides.decision ?? "approved",
    rationale:
      overrides.rationale
      ?? "The exact mastered Frame body cel preserves the reviewed identity, silhouette, materials and motion role at all governed review scales.",
    attestations: {
      candidateSha256: masteringPlan.candidate.sha256,
      masterSha256: masteringPlan.masteringRecord.master.sha256,
      masteringPlanSha256: masteringPlan.masteringPlanSha256,
      masteringRecordSha256:
        masteringPlan.masteringRecord.masteringRecordSha256,
      masteredReceiptSha256: masteringPlan.receipt.receiptSha256,
      reviewedExactMasterAtNativeScale: true,
      reviewedExactMasterAtGameplayScale: true,
      reviewedExactMasterAtThumbnailScale: true,
      reviewedExactMasterInSilhouette: true,
      reviewedExactMasterInGrayscale: true,
      frameIdentityApproved: true,
      silhouetteApproved: true,
      materialReadabilityApproved: true,
      motionRoleReadabilityApproved: true,
      noAutomaticApprovalDeliveryPromotionOrPublicationPerformed: true,
      ...(overrides.attestations ?? {}),
    },
  };
}
