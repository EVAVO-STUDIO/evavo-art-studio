import {
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import {
  approvalDecisionPath,
  assert,
  canonical,
  freeze,
  loadApprovalPolicy,
  safeRelativePath,
  selfHashed,
  stableWorkspaceFile,
  stableWorkspaceJson,
  workspaceRoot,
} from "./frame-body-master-approval-common.mjs";
import { validateHmfFrameBodyMasteringPlanForApproval } from "./frame-body-master-approval-validation.mjs";

export async function validatedHmfFrameBodyMasterApprovalWorkspace(
  planInput,
  expectedApprovalReceipt = null,
) {
  const { plan, record, receipt } = await validateHmfFrameBodyMasteringPlanForApproval(planInput);
  const [policy, order] = await Promise.all([
    loadApprovalPolicy(),
    heavyMetalFightingProductionWorkOrder(plan.unitId),
  ]);
  assert(
    order.assetContract.kind === policy.assetKind
      && order.workOrderSha256 === plan.workOrderSha256,
    "master approval authority drifted from the immutable work order.",
  );
  const root = await workspaceRoot(plan.workspaceRoot);
  assert(root === plan.workspaceRoot, "master approval workspace root drifted from mastering.");

  const selection = plan.selectionDecision;
  const persistedSelection = await stableWorkspaceJson(
    root,
    selection.target,
    "persisted selected Frame body decision",
  );
  assert(
    persistedSelection.value.selectionDecisionSha256
      === selection.selectionDecisionSha256
      && canonical(persistedSelection.value) === canonical(selection),
    "selected decision changed before master approval.",
  );

  const creative = selection.creativeReviewDecision;
  const persistedCreative = await stableWorkspaceJson(
    root,
    creative.target,
    "persisted creative-review decision",
  );
  assert(
    persistedCreative.value.creativeReviewDecisionSha256
      === creative.creativeReviewDecisionSha256
      && canonical(persistedCreative.value) === canonical(creative),
    "creative-review decision changed before master approval.",
  );

  const candidate = await stableWorkspaceFile(
    root,
    plan.candidate.path,
    "selected candidate",
    policy.approvalRules.maximumMasterBytes,
  );
  assert(
    candidate.sha256 === plan.candidate.sha256
      && candidate.size === plan.candidate.bytes,
    "selected candidate changed before master approval.",
  );

  const qaReport = await stableWorkspaceJson(
    root,
    creative.reviewPacket.qaReport.targets.qaReport,
    "persisted deterministic QA report",
  );
  assert(
    qaReport.value.qaReportSha256 === creative.reviewPacket.qaReportSha256
      && canonical(qaReport.value) === canonical(creative.reviewPacket.qaReport),
    "deterministic QA report changed before master approval.",
  );

  const admission = await stableWorkspaceJson(
    root,
    creative.reviewPacket.qaReport.targets.admissionRecord,
    "persisted candidate admission record",
  );
  const admissionValue = selfHashed(
    admission.value,
    "admissionRecordSha256",
    "persisted candidate admission record",
  );
  assert(
    admissionValue.admissionRecordSha256
      === creative.reviewPacket.admissionRecordSha256
      && admissionValue.candidateSha256 === candidate.sha256
      && admissionValue.receipt?.receiptSha256
        === creative.reviewPacket.candidateAdmissionReceiptSha256,
    "candidate admission lineage changed before master approval.",
  );

  const masterTarget = safeRelativePath(
    order.assetContract.masterOutputPath,
    "master approval master target",
  );
  assert(
    masterTarget === plan.targets.masterFile
      && masterTarget === record.master.path
      && masterTarget.startsWith("masters/"),
    "master approval target drifted from the immutable work order.",
  );
  const master = await stableWorkspaceFile(
    root,
    masterTarget,
    "persisted selected-candidate master",
    policy.approvalRules.maximumMasterBytes,
  );
  assert(
    master.sha256 === record.master.sha256
      && master.size === record.master.bytes
      && master.sha256 === candidate.sha256
      && master.bytes.equals(candidate.bytes),
    "persisted master differs from the exact selected candidate or mastering record.",
  );

  const recordTarget = safeRelativePath(
    plan.targets.masteringRecord,
    "master approval mastering-record target",
  );
  const persistedRecord = await stableWorkspaceJson(
    root,
    recordTarget,
    "persisted selected-candidate mastering record",
  );
  assert(
    persistedRecord.value.masteringRecordSha256 === record.masteringRecordSha256
      && canonical(persistedRecord.value) === canonical(record),
    "mastering record changed before master approval.",
  );

  const receiptTarget = safeRelativePath(
    plan.targets.receiptChain,
    "master approval receipt-chain target",
  );
  assert(
    receiptTarget === order.executionPaths.receiptPath,
    "master approval receipt path drifted from the immutable work order.",
  );
  const receiptFile = await stableWorkspaceJson(
    root,
    receiptTarget,
    "persisted production receipt chain",
  );
  assert(Array.isArray(receiptFile.value), "persisted production receipt chain must be an array.");
  const predecessorReceipts = freeze([...plan.previousReceipts, receipt]);
  const completedReceipts = expectedApprovalReceipt
    ? freeze([...predecessorReceipts, expectedApprovalReceipt])
    : null;
  const currentReceipts = freeze(receiptFile.value);
  const isPredecessor = canonical(currentReceipts) === canonical(predecessorReceipts);
  const isCompleted = completedReceipts
    ? canonical(currentReceipts) === canonical(completedReceipts)
    : false;
  assert(
    isPredecessor || isCompleted,
    "persisted receipt chain does not match the mastered predecessor or exact approval outcome.",
  );
  const resume = await heavyMetalFightingProductionBatchResumePlan(
    plan.batchId,
    currentReceipts,
  );
  const state = resume.unitStates.find((entry) => entry.unitId === plan.unitId);
  if (isPredecessor) {
    assert(
      state?.currentState === policy.approvalRules.predecessorState
        && state.currentOutcome === null
        && state.nextAction === "request-named-human-approval",
      "persisted lifecycle is not ready for master approval.",
    );
  } else {
    assert(
      state?.currentState === policy.approvalRules.receiptState
        && state.currentOutcome === null
        && state.nextAction === policy.approvalRules.nextLegalAction,
      "persisted approval lifecycle differs from the governed approval receipt.",
    );
  }

  return freeze({
    root,
    plan,
    record,
    masteredReceipt: receipt,
    policy,
    order,
    candidate,
    master,
    predecessorReceipts,
    completedReceipts,
    currentReceipts,
    isPredecessor,
    isCompleted,
    masterTarget,
    recordTarget,
    receiptTarget,
    decisionTarget: approvalDecisionPath(order, plan.attempt),
  });
}
