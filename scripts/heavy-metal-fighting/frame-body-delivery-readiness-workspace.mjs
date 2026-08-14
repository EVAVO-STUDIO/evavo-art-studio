import {
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import { namedHumanApprovalRecordPath } from "./frame-body-named-human-approval-common.mjs";
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
import { validateHmfFrameBodyCompletedNamedHumanApprovalPlan } from "./frame-body-delivery-readiness-validation.mjs";

export async function validatedHmfFrameBodyDeliveryReadinessWorkspace(
  approvalInput,
  expectedReadinessReceipt = null,
) {
  const approval = await validateHmfFrameBodyCompletedNamedHumanApprovalPlan(
    approvalInput,
  );
  const [policy, order] = await Promise.all([
    loadDeliveryReadinessPolicy(),
    heavyMetalFightingProductionWorkOrder(approval.unitId),
  ]);
  assert(
    order.assetContract.kind === policy.assetKind
      && order.workOrderSha256 === approval.workOrderSha256,
    "delivery-readiness authority drifted from the approved work order.",
  );
  const root = await workspaceRoot(approval.workspaceRoot);
  assert(root === approval.workspaceRoot, "delivery-readiness workspace root drifted from approval.");

  const mastering = approval.masteringPlan;
  const selection = mastering.selectionDecision;
  const persistedSelection = await stableWorkspaceJson(
    root,
    selection.target,
    "persisted selected Frame body decision",
  );
  assert(
    persistedSelection.value.selectionDecisionSha256 === selection.selectionDecisionSha256
      && canonical(persistedSelection.value) === canonical(selection),
    "selected decision changed before delivery readiness.",
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
    "creative-review decision changed before delivery readiness.",
  );

  const candidate = await stableWorkspaceFile(
    root,
    mastering.candidate.path,
    "selected candidate underlying the approved master",
    policy.readinessRules.maximumMasterBytes,
  );
  assert(
    candidate.sha256 === mastering.candidate.sha256
      && candidate.size === mastering.candidate.bytes,
    "selected candidate changed before delivery readiness.",
  );

  const qaReport = await stableWorkspaceJson(
    root,
    creative.reviewPacket.qaReport.targets.qaReport,
    "persisted deterministic QA report",
  );
  assert(
    qaReport.value.qaReportSha256 === creative.reviewPacket.qaReportSha256
      && canonical(qaReport.value) === canonical(creative.reviewPacket.qaReport),
    "deterministic QA report changed before delivery readiness.",
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
    "candidate admission lineage changed before delivery readiness.",
  );

  const masterTarget = safeRelativePath(
    order.assetContract.masterOutputPath,
    "delivery-readiness master target",
  );
  assert(
    masterTarget === approval.master.path
      && masterTarget === approval.approvalRecord.master.path
      && masterTarget === mastering.targets.masterFile,
    "approved master target drifted from the immutable work order.",
  );
  assert(
    !policy.readinessRules.masterPathMustLiveUnderMasters
      || masterTarget.startsWith("masters/"),
    "delivery-readiness master target escaped masters/.",
  );
  const master = await stableWorkspaceFile(
    root,
    masterTarget,
    "persisted approved Frame body master",
    policy.readinessRules.maximumMasterBytes,
  );
  assert(
    master.sha256 === approval.master.sha256
      && master.size === approval.master.bytes
      && master.sha256 === candidate.sha256
      && master.size === candidate.size,
    "persisted approved master no longer matches the selected candidate identity.",
  );
  assert(master.bytes.equals(candidate.bytes), "approved master bytes differ from the selected candidate bytes.");

  const masteringRecordTarget = safeRelativePath(
    mastering.targets.masteringRecord,
    "delivery-readiness mastering-record target",
  );
  const persistedMasteringRecord = await stableWorkspaceJson(
    root,
    masteringRecordTarget,
    "persisted selected-candidate mastering record",
  );
  assert(
    persistedMasteringRecord.value.masteringRecordSha256
      === mastering.masteringRecord.masteringRecordSha256
      && canonical(persistedMasteringRecord.value) === canonical(mastering.masteringRecord),
    "mastering record changed before delivery readiness.",
  );

  const approvalRecordTarget = safeRelativePath(
    approval.targets.approvalRecord,
    "delivery-readiness approval-record target",
  );
  assert(
    approvalRecordTarget === namedHumanApprovalRecordPath(order, approval.attempt),
    "delivery-readiness approval record path drifted from the immutable work order.",
  );
  const persistedApprovalRecord = await stableWorkspaceJson(
    root,
    approvalRecordTarget,
    "persisted named-human approval record",
  );
  assert(
    persistedApprovalRecord.value.approvalRecordSha256
      === approval.approvalRecord.approvalRecordSha256
      && canonical(persistedApprovalRecord.value) === canonical(approval.approvalRecord),
    "named-human approval record changed before delivery readiness.",
  );

  const receiptTarget = safeRelativePath(
    order.executionPaths.receiptPath,
    "delivery-readiness receipt-chain target",
  );
  assert(
    receiptTarget === approval.targets.receiptChain,
    "delivery-readiness receipt path drifted from named-human approval.",
  );
  const receiptFile = await stableWorkspaceJson(
    root,
    receiptTarget,
    "persisted production receipt chain",
  );
  assert(Array.isArray(receiptFile.value), "persisted production receipt chain must be an array.");
  const predecessorReceipts = freeze([...approval.previousReceipts, approval.receipt]);
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
    "persisted receipt chain does not match the named-human-approved predecessor or exact delivery-ready outcome.",
  );

  const resume = await heavyMetalFightingProductionBatchResumePlan(
    approval.batchId,
    currentReceipts,
  );
  const state = resume.unitStates.find((entry) => entry.unitId === approval.unitId);
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
    approval,
    policy,
    order,
    candidate,
    master,
    approvalRecordTarget,
    readinessRecordTarget: deliveryReadinessRecordPath(order, approval.attempt),
    receiptTarget,
    currentReceipts,
    predecessorReceipts,
    completedReceipts,
    isPredecessor,
    isCompleted,
  });
}
