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
  const masteringPlan = await compileHmfFrameBodySelectedCandidateMasteringPlan({
    selectionDecision: value.selectionDecision,
    workspaceRoot: value.root,
    masteringRequest: masteringRequestFor(value.selectionDecision),
  });
  const masteringResult = await materializeHmfFrameBodySelectedCandidateMaster(
    masteringPlan,
  );
  const receipts = JSON.parse(
    await readFile(path.join(value.root, ...value.receiptPath.split("/")), "utf8"),
  );
  return {
    ...value,
    masteringPlan,
    masteringResult,
    receipts,
  };
}

export function humanApprovalFor(masteringPlan, overrides = {}) {
  return {
    actorId: overrides.actorId ?? "greg-parker",
    occurredAt: overrides.occurredAt ?? "2026-08-13T08:07:00.000Z",
    decision: overrides.decision ?? "approved",
    rationale: overrides.rationale
      ?? "I inspected the exact mastered Frame body cel, accepted its governed mastering lineage and approve these immutable bytes for the separate delivery-readiness boundary.",
    attestations: {
      candidateSha256: masteringPlan.candidate.sha256,
      masterSha256: masteringPlan.masteringRecord.master.sha256,
      masteringPlanSha256: masteringPlan.masteringPlanSha256,
      masteringRecordSha256: masteringPlan.masteringRecord.masteringRecordSha256,
      masteredReceiptSha256: masteringPlan.receipt.receiptSha256,
      exactMasterInspected: true,
      masteringLineageAccepted: true,
      independentNamedHumanApproval: true,
      noMasterMutationPromotionDeliveryGitOrPublicationPerformed: true,
      ...(overrides.attestations ?? {}),
    },
  };
}
