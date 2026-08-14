import {
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import {
  assert,
  canonical,
  freeze,
  loadApprovalPolicy,
  namedHumanApprovalRecordPath,
  safeRelativePath,
  selfHashed,
  stableWorkspaceFile,
  stableWorkspaceJson,
  workspaceRoot,
} from "./frame-body-named-human-approval-common.mjs";
import { validateHmfFrameBodyCompletedMasteringPlan } from "./frame-body-named-human-approval-validation.mjs";

export async function validatedHmfFrameBodyNamedHumanApprovalWorkspace(masteringInput, expectedApprovalReceipt = null) {
  const mastering = await validateHmfFrameBodyCompletedMasteringPlan(masteringInput);
  const [policy, order] = await Promise.all([
    loadApprovalPolicy(),
    heavyMetalFightingProductionWorkOrder(mastering.unitId),
  ]);
  assert(order.assetContract.kind === policy.assetKind && order.workOrderSha256 === mastering.workOrderSha256, "named-human approval authority drifted from the mastered work order.");
  const root = await workspaceRoot(mastering.workspaceRoot);
  assert(root === mastering.workspaceRoot, "approval workspace root drifted from mastering.");

  const selection = mastering.selectionDecision;
  const persistedSelection = await stableWorkspaceJson(root, selection.target, "persisted selected Frame body decision");
  assert(persistedSelection.value.selectionDecisionSha256 === selection.selectionDecisionSha256 && canonical(persistedSelection.value) === canonical(selection), "selected decision changed before named-human approval.");

  const creative = selection.creativeReviewDecision;
  const persistedCreative = await stableWorkspaceJson(root, creative.target, "persisted creative-review decision");
  assert(persistedCreative.value.creativeReviewDecisionSha256 === creative.creativeReviewDecisionSha256 && canonical(persistedCreative.value) === canonical(creative), "creative-review decision changed before named-human approval.");

  const candidate = await stableWorkspaceFile(root, mastering.candidate.path, "selected candidate underlying the mastered asset");
  assert(candidate.sha256 === mastering.candidate.sha256 && candidate.size === mastering.candidate.bytes, "selected candidate changed before named-human approval.");

  const qaReport = await stableWorkspaceJson(root, creative.reviewPacket.qaReport.targets.qaReport, "persisted deterministic QA report");
  assert(qaReport.value.qaReportSha256 === creative.reviewPacket.qaReportSha256 && canonical(qaReport.value) === canonical(creative.reviewPacket.qaReport), "deterministic QA report changed before named-human approval.");

  const admission = await stableWorkspaceJson(root, creative.reviewPacket.qaReport.targets.admissionRecord, "persisted candidate admission record");
  const admissionValue = selfHashed(admission.value, "admissionRecordSha256", "persisted candidate admission record");
  assert(admissionValue.admissionRecordSha256 === creative.reviewPacket.admissionRecordSha256 && admissionValue.candidateSha256 === candidate.sha256 && admissionValue.receipt?.receiptSha256 === creative.reviewPacket.candidateAdmissionReceiptSha256, "candidate admission lineage changed before named-human approval.");

  const masterTarget = safeRelativePath(order.assetContract.masterOutputPath, "named-human approval master target");
  assert(masterTarget === mastering.targets.masterFile && masterTarget === mastering.masteringRecord.master.path, "master target drifted from the immutable work order or mastering record.");
  assert(!policy.approvalRules.masterPathMustLiveUnderMasters || masterTarget.startsWith("masters/"), "named-human approval master target escaped masters/.");
  const master = await stableWorkspaceFile(root, masterTarget, "persisted mastered Frame body cel");
  assert(master.sha256 === mastering.masteringRecord.master.sha256 && master.size === mastering.masteringRecord.master.bytes && master.sha256 === mastering.candidate.sha256 && master.size === mastering.candidate.bytes, "persisted master no longer matches the exact mastered candidate identity.");
  assert(master.bytes.equals(candidate.bytes), "persisted master bytes differ from the selected candidate bytes.");

  const masteringRecordTarget = safeRelativePath(mastering.targets.masteringRecord, "named-human approval mastering-record target");
  const persistedMasteringRecord = await stableWorkspaceJson(root, masteringRecordTarget, "persisted selected-candidate mastering record");
  assert(persistedMasteringRecord.value.masteringRecordSha256 === mastering.masteringRecord.masteringRecordSha256 && canonical(persistedMasteringRecord.value) === canonical(mastering.masteringRecord), "mastering record changed before named-human approval.");

  const receiptTarget = safeRelativePath(order.executionPaths.receiptPath, "named-human approval receipt-chain target");
  assert(receiptTarget === mastering.targets.receiptChain, "named-human approval receipt path drifted from mastering.");
  const receiptFile = await stableWorkspaceJson(root, receiptTarget, "persisted production receipt chain");
  assert(Array.isArray(receiptFile.value), "persisted production receipt chain must be an array.");
  const predecessorReceipts = freeze([...mastering.previousReceipts, mastering.receipt]);
  const completedReceipts = expectedApprovalReceipt ? freeze([...predecessorReceipts, expectedApprovalReceipt]) : null;
  const currentReceipts = freeze(receiptFile.value);
  const isPredecessor = canonical(currentReceipts) === canonical(predecessorReceipts);
  const isCompleted = completedReceipts ? canonical(currentReceipts) === canonical(completedReceipts) : false;
  assert(isPredecessor || isCompleted, "persisted receipt chain does not match the exact mastered predecessor or named-human approval.");
  const resume = await heavyMetalFightingProductionBatchResumePlan(mastering.batchId, currentReceipts);
  const state = resume.unitStates.find((entry) => entry.unitId === mastering.unitId);
  if (isPredecessor) {
    assert(state?.currentState === policy.approvalRules.predecessorState && state.currentOutcome === null && state.nextAction === "request-named-human-approval", "persisted lifecycle is not ready for named-human approval.");
  } else {
    assert(state?.currentState === policy.approvalRules.receiptState && state.currentOutcome === null && state.nextAction === policy.approvalRules.nextLegalAction, "persisted named-human approval differs from the governed approval receipt.");
  }

  return freeze({
    root,
    mastering,
    policy,
    order,
    selection,
    creative,
    candidate,
    master,
    masteringRecordTarget,
    approvalRecordTarget: namedHumanApprovalRecordPath(order, mastering.attempt),
    receiptTarget,
    currentReceipts,
    predecessorReceipts,
    completedReceipts,
    isPredecessor,
    isCompleted,
  });
}
