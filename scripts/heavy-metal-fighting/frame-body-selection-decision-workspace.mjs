import {
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import {
  assert,
  canonical,
  freeze,
  loadPolicy,
  safeRelativePath,
  selfHashed,
  stableWorkspaceFile,
  stableWorkspaceJson,
  workspaceRoot,
} from "./frame-body-selection-decision-common.mjs";
import { validateHmfFrameBodyCreativeReviewDecision } from "./frame-body-selection-decision-validation.mjs";

export async function validatedHmfFrameBodySelectionWorkspace(decision) {
  const creative = await validateHmfFrameBodyCreativeReviewDecision(decision.creativeReviewDecision);
  const [policy, order] = await Promise.all([
    loadPolicy(),
    heavyMetalFightingProductionWorkOrder(decision.unitId),
  ]);
  assert(decision.policySha256 === policy.policySha256, "selection decision is stale against the governed policy.");
  assert(
    order.workOrderSha256 === decision.workOrderSha256 && order.workOrderSha256 === creative.workOrderSha256,
    "selection decision is stale against the immutable work order.",
  );
  const root = await workspaceRoot(decision.workspaceRoot);
  assert(root === decision.workspaceRoot, "selection workspace root changed after decision compilation.");
  const persistedCreative = await stableWorkspaceJson(root, creative.target, "persisted creative review decision");
  assert(
    persistedCreative.value.creativeReviewDecisionSha256 === creative.creativeReviewDecisionSha256
      && canonical(persistedCreative.value) === canonical(creative),
    "creative review decision changed before selection materialization.",
  );
  const candidate = await stableWorkspaceFile(
    root,
    creative.reviewPacket.candidate.path,
    "selected-or-repair-requested candidate",
  );
  assert(
    candidate.sha256 === creative.reviewPacket.candidate.sha256
      && candidate.size === creative.reviewPacket.candidate.bytes,
    "candidate changed after creative review.",
  );
  const qaReport = await stableWorkspaceJson(
    root,
    creative.reviewPacket.qaReport.targets.qaReport,
    "persisted deterministic QA report",
  );
  assert(
    qaReport.value.qaReportSha256 === creative.reviewPacket.qaReportSha256
      && canonical(qaReport.value) === canonical(creative.reviewPacket.qaReport),
    "deterministic QA report changed before selection materialization.",
  );
  const admission = await stableWorkspaceJson(
    root,
    creative.reviewPacket.qaReport.targets.admissionRecord,
    "persisted candidate admission record",
  );
  const admissionValue = selfHashed(admission.value, "admissionRecordSha256", "persisted candidate admission record");
  assert(
    admissionValue.admissionRecordSha256 === creative.reviewPacket.admissionRecordSha256,
    "candidate admission record changed before selection materialization.",
  );
  assert(
    admissionValue.candidateSha256 === candidate.sha256
      && admissionValue.receipt?.receiptSha256 === creative.reviewPacket.candidateAdmissionReceiptSha256,
    "candidate admission lineage drifted before selection materialization.",
  );
  const receiptTarget = safeRelativePath(
    creative.reviewPacket.qaReport.targets.receiptChain,
    "selection receipt-chain target",
  );
  assert(receiptTarget === order.executionPaths.receiptPath, "selection receipt path drifted from the immutable work order.");
  const receiptFile = await stableWorkspaceJson(root, receiptTarget, "persisted production receipt chain");
  assert(Array.isArray(receiptFile.value), "persisted production receipt chain must be an array.");
  const completedReceipts = freeze([...decision.previousReceipts, decision.receipt]);
  const currentReceipts = freeze(receiptFile.value);
  assert(
    canonical(currentReceipts) === canonical(decision.previousReceipts)
      || canonical(currentReceipts) === canonical(completedReceipts),
    "selection predecessor receipts changed after decision compilation.",
  );
  const resume = await heavyMetalFightingProductionBatchResumePlan(decision.batchId, currentReceipts);
  const state = resume.unitStates.find((entry) => entry.unitId === decision.unitId);
  if (currentReceipts.length === decision.previousReceipts.length) {
    assert(
      state?.currentState === "creative-review-passed" && state.nextAction === "select-or-request-repair",
      "receipt chain is not ready for selection materialization.",
    );
  } else {
    assert(
      state?.currentState === "selected-or-repair-requested" && state.currentOutcome === decision.outcome,
      "persisted selection receipt differs from the governed decision.",
    );
    assert(state.nextAction === decision.nextLegalAction, "persisted selection next action drifted.");
  }
  return freeze({
    root,
    creative,
    policy,
    order,
    candidate,
    receiptTarget,
    currentReceipts,
  });
}
