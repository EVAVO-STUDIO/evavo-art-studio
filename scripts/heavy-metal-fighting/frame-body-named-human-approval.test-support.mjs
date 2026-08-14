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
    approved: overrides.approved ?? true,
    rationale: overrides.rationale
      ?? "I inspected the exact mastered Frame body asset and approve this immutable master to advance to the separate delivery-readiness boundary.",
    attestations: {
      masteringPlanSha256: masteringPlan.masteringPlanSha256,
      masteringRecordSha256: masteringPlan.masteringRecord.masteringRecordSha256,
      masteredReceiptSha256: masteringPlan.receipt.receiptSha256,
      masterSha256: masteringPlan.masteringRecord.master.sha256,
      masterBytes: masteringPlan.masteringRecord.master.bytes,
      exactMasterInspected: true,
      approvalIsExplicitAndNamedHuman: true,
      noPromotionAtlasGitDeploymentOrPublicationPerformed: true,
      ...(overrides.attestations ?? {}),
    },
  };
}
