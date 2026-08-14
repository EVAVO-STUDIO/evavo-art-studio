import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  compileHmfFrameBodyNamedHumanApprovalPlan,
  materializeHmfFrameBodyNamedHumanApproval,
} from "./frame-body-named-human-approval.mjs";
import {
  approvalFixture,
  cleanup,
  humanApprovalFor,
} from "./frame-body-named-human-approval.test-support.mjs";

export { cleanup };

export async function deliveryReadinessFixture() {
  const value = await approvalFixture();
  const approvalPlan = await compileHmfFrameBodyNamedHumanApprovalPlan({
    masteringPlan: value.masteringPlan,
    workspaceRoot: value.root,
    humanApproval: humanApprovalFor(value.masteringPlan),
  });
  const approvalResult = await materializeHmfFrameBodyNamedHumanApproval(
    approvalPlan,
  );
  const receipts = JSON.parse(
    await readFile(path.join(value.root, ...value.receiptPath.split("/")), "utf8"),
  );
  return {
    ...value,
    approvalPlan,
    approvalResult,
    receipts,
  };
}

export function deliveryReadinessRequestFor(approvalPlan, overrides = {}) {
  return {
    actorId: overrides.actorId ?? "evavo-art-studio-delivery-readiness",
    occurredAt: overrides.occurredAt ?? "2026-08-13T08:08:00.000Z",
    attestations: {
      candidateSha256: approvalPlan.masteringPlan.candidate.sha256,
      masterSha256: approvalPlan.master.sha256,
      approvalPlanSha256: approvalPlan.approvalPlanSha256,
      approvalRecordSha256: approvalPlan.approvalRecord.approvalRecordSha256,
      approvedReceiptSha256: approvalPlan.receipt.receiptSha256,
      exactApprovedMasterRevalidated: true,
      approvalLineageAccepted: true,
      noAtlasPromotionTargetGitOrPublicationPerformed: true,
      ...(overrides.attestations ?? {}),
    },
  };
}
