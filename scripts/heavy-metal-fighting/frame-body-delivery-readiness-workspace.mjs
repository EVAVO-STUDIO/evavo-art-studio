import {
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import {
  assert,
  canonical,
  deliveryReadinessRecordPath,
  freeze,
  loadDeliveryReadinessPolicy,
  safeRelativePath,
  selfHashed,
  stableWorkspaceFile,
  stableWorkspaceJson,
  workspaceRoot,
} from "./frame-body-delivery-readiness-common.mjs";
import { validateHmfFrameBodyNamedHumanApprovalPlanForReadiness } from "./frame-body-delivery-readiness-validation.mjs";

export async function validatedHmfFrameBodyDeliveryReadinessWorkspace(
  planInput,
  expectedReadinessReceipt = null,
) {
  const { plan: approvalPlan, record: approvalRecord, receipt: approvalReceipt } =
    await validateHmfFrameBodyNamedHumanApprovalPlanForReadiness(planInput);
  const [policy, order] = await Promise.all([
    loadDeliveryReadinessPolicy(),
    heavyMetalFightingProductionWorkOrder(approvalPlan.unitId),
  ]);
  assert(
    order.assetContract.kind === policy.assetKind
      && order.workOrderSha256 === approvalPlan.workOrderSha256,
    "delivery-readiness authority drifted from the immutable work order.",
  );
  const root = await workspaceRoot(approvalPlan.workspaceRoot);
  assert(root === approvalPlan.workspaceRoot, "delivery-readiness workspace root drifted from approval.");

  const selection = approvalPlan.masteringPlan.selectionDecision;
  const persistedSelection = await stableWorkspaceJson(
    root,
    selection.target,
    "persisted selected Frame body decision",
  );
  assert(
    persistedSelection.value.selectionDecisionSha256 === selection.selectionDecisionSha256
      && canonical(persistedSelection.value) === canonical(selection),
    "selected decision changed before delivery-readiness compilation.",
  );

  const creative = selection.creativeReviewDecision;
  const persistedCreative = await stableWorkspaceJson(
    root,
    creative.target,
    "persisted creative-review decision",
  );
  assert(
    persistedCreative.value.creativeReviewDecisionSha256 === creative.creativeReviewDecisionSha256
      && canonical(persistedCreative.value) === canonical(creative),
    "creative-review decision changed before delivery-readiness compilation.",
  );

  const candidate = await stableWorkspaceFile(
    root,
    approvalPlan.masteringPlan.candidate.path,
    "selected candidate underlying the approved master",
    policy.readinessRules.maximumMasterBytes,
  );
  assert(
    candidate.sha256 === approvalPlan.masteringPlan.candidate.sha256
      && candidate.size === approvalPlan.masteringPlan.candidate.bytes,
    "selected candidate changed before delivery-readiness compilation.",
  );

  const qaReport = await stableWorkspaceJson(
    root,
    creative.reviewPacket.qaReport.targets.qaReport,
    "persisted deterministic QA report",
  );
  assert(
    qaReport.value.qaReportSha256 === creative.reviewPacket.qaReportSha256
      && canonical(qaReport.value) === canonical(creative.reviewPacket.qaReport),
    "deterministic QA report changed before delivery-readiness compilation.",
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
    admissionValue.admissionRecordSha256 === creative.reviewPacket.admissionRecordSha256
      && admissionValue.candidateSha256 === candidate.sha256
      && admissionValue.receipt?.receiptSha256
        === creative.reviewPacket.candidateAdmissionReceiptSha256,
    "candidate admission lineage changed before delivery-readiness compilation.",
  );

  const masterTarget = safeRelativePath(
    order.assetContract.masterOutputPath,
    "delivery-readiness master target",
  );
  assert(
    masterTarget === approvalPlan.master.path
      && masterTarget === approvalPlan.masteringPlan.targets.masterFile
      && masterTarget === approvalPlan.masteringPlan.masteringRecord.master.path,
    "delivery-readiness master target drifted from work order, mastering or approval.",
  );
  assert(
    !policy.readinessRules.masterPathMustLiveUnderMasters || masterTarget.startsWith("masters/"),
    "delivery-readiness master target escaped masters/.",
  );
  const master = await stableWorkspaceFile(
    root,
    masterTarget,
    "persisted named-human-approved Frame body master",
    policy.readinessRules.maximumMasterBytes,
  );
  assert(
    master.sha256 === approvalPlan.master.sha256
      && master.size === approvalPlan.master.bytes
      && master.sha256 === candidate.sha256
      && master.size === candidate.size
      && master.bytes.equals(candidate.bytes),
    "persisted approved master no longer matches the exact selected candidate.",
  );

  const masteringRecordTarget = safeRelativePath(
    approvalPlan.masteringPlan.targets.masteringRecord,
    "delivery-readiness mastering-record target",
  );
  const persistedMasteringRecord = await stableWorkspaceJson(
    root,
    masteringRecordTarget,
    "persisted selected-candidate mastering record",
  );
  assert(
    persistedMasteringRecord.value.masteringRecordSha256
      === approvalPlan.masteringPlan.masteringRecord.masteringRecordSha256
      && canonical(persistedMasteringRecord.value)
        === canonical(approvalPlan.masteringPlan.masteringRecord),
    "mastering record changed before delivery-readiness compilation.",
  );

  const approvalRecordTarget = safeRelativePath(
    approvalPlan.targets.approvalRecord,
    "delivery-readiness approval-record target",
  );
  const persistedApproval = await stableWorkspaceJson(
    root,
    approvalRecordTarget,
    "persisted named-human approval record",
  );
  assert(
    persistedApproval.value.approvalRecordSha256 === approvalRecord.approvalRecordSha256
      && canonical(persistedApproval.value) === canonical(approvalRecord),
    "named-human approval record changed before delivery-readiness compilation.",
  );

  const receiptTarget = safeRelativePath(
    order.executionPaths.receiptPath,
    "delivery-readiness receipt-chain target",
  );
  assert(
    receiptTarget === approvalPlan.targets.receiptChain
      && receiptTarget === approvalPlan.masteringPlan.targets.receiptChain,
    "delivery-readiness receipt-chain target drifted from governed evidence.",
  );
  const receiptFile = await stableWorkspaceJson(
    root,
    receiptTarget,
    "persisted production receipt chain",
  );
  assert(Array.isArray(receiptFile.value), "persisted production receipt chain must be an array.");
  const predecessorReceipts = freeze([...approvalPlan.previousReceipts, approvalReceipt]);
  const completedReceipts = expectedReadinessReceipt
    ? freeze([...predecessorReceipts, expectedReadinessReceipt])
    : null;
  const currentReceipts = freeze(receiptFile.value);
  const isPredecessor = canonical(currentReceipts) === canonical(predecessorReceipts);
  const isCompleted = completedReceipts
    ? canonical(currentReceipts) === canonical(completedReceipts)
    : false;
  assert(
    isPredecessor || isCompleted,
    "persisted receipt chain does not match the exact named-human-approved predecessor or delivery-ready result.",
  );
  const resume = await heavyMetalFightingProductionBatchResumePlan(
    approvalPlan.batchId,
    currentReceipts,
  );
  const state = resume.unitStates.find((entry) => entry.unitId === approvalPlan.unitId);
  if (isPredecessor) {
    assert(
      state?.currentState === policy.readinessRules.predecessorState
        && state.currentOutcome === null
        && state.nextAction === "compile-delivery-readiness",
      "persisted lifecycle is not ready for delivery-readiness compilation.",
    );
  } else {
    assert(
      state?.currentState === policy.readinessRules.receiptState
        && state.currentOutcome === null
        && state.nextAction === policy.readinessRules.nextLegalAction
        && state.complete === true,
      "persisted delivery-ready lifecycle differs from the governed readiness receipt.",
    );
  }

  return freeze({
    root,
    approvalPlan,
    approvalRecord,
    approvalReceipt,
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
    masteringRecordTarget,
    approvalRecordTarget,
    receiptTarget,
    readinessRecordTarget: deliveryReadinessRecordPath(order, approvalPlan.attempt),
  });
}
