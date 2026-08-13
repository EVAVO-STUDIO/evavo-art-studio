import {
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import {
  assert,
  canonical,
  freeze,
  loadMasteringPolicy,
  masteringRecordPath,
  safeRelativePath,
  selfHashed,
  stableWorkspaceFile,
  stableWorkspaceJson,
  workspaceRoot,
} from "./frame-body-selected-candidate-mastering-common.mjs";
import { validateHmfFrameBodySelectedSelectionDecision } from "./frame-body-selected-candidate-mastering-validation.mjs";

export async function validatedHmfFrameBodySelectedCandidateMasteringWorkspace(
  selectionInput,
  expectedMasteringReceipt = null,
) {
  const selection = await validateHmfFrameBodySelectedSelectionDecision(selectionInput);
  const [policy, order] = await Promise.all([
    loadMasteringPolicy(),
    heavyMetalFightingProductionWorkOrder(selection.unitId),
  ]);
  assert(
    order.assetContract.kind === policy.assetKind,
    "selected-candidate mastering policy is bound to the wrong asset kind.",
  );
  assert(
    order.workOrderSha256 === selection.workOrderSha256,
    "selected-candidate mastering work order drifted from selection.",
  );
  const root = await workspaceRoot(selection.workspaceRoot);
  assert(root === selection.workspaceRoot, "mastering workspace root drifted from selection.");

  const persistedSelection = await stableWorkspaceJson(
    root,
    selection.target,
    "persisted selected Frame body decision",
  );
  assert(
    persistedSelection.value.selectionDecisionSha256 === selection.selectionDecisionSha256
      && canonical(persistedSelection.value) === canonical(selection),
    "supplied selected decision differs from its persisted record.",
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
    "creative-review decision changed before selected-candidate mastering.",
  );

  const candidate = await stableWorkspaceFile(
    root,
    creative.reviewPacket.candidate.path,
    "selected candidate",
    policy.masteringRules.maximumCandidateBytes,
  );
  assert(
    candidate.sha256 === creative.reviewPacket.candidate.sha256
      && candidate.size === creative.reviewPacket.candidate.bytes
      && candidate.sha256 === selection.selectionEvidence.candidateSha256,
    "selected candidate changed before mastering.",
  );

  const qaReport = await stableWorkspaceJson(
    root,
    creative.reviewPacket.qaReport.targets.qaReport,
    "persisted deterministic QA report",
  );
  assert(
    qaReport.value.qaReportSha256 === creative.reviewPacket.qaReportSha256
      && canonical(qaReport.value) === canonical(creative.reviewPacket.qaReport),
    "deterministic QA report changed before selected-candidate mastering.",
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
    "candidate admission lineage changed before selected-candidate mastering.",
  );

  const receiptTarget = safeRelativePath(
    order.executionPaths.receiptPath,
    "selected-candidate mastering receipt-chain target",
  );
  const receiptFile = await stableWorkspaceJson(
    root,
    receiptTarget,
    "persisted production receipt chain",
  );
  assert(Array.isArray(receiptFile.value), "persisted production receipt chain must be an array.");
  const predecessorReceipts = freeze([...selection.previousReceipts, selection.receipt]);
  const completedReceipts = expectedMasteringReceipt
    ? freeze([...predecessorReceipts, expectedMasteringReceipt])
    : null;
  const currentReceipts = freeze(receiptFile.value);
  const isPredecessor = canonical(currentReceipts) === canonical(predecessorReceipts);
  const isCompleted = completedReceipts
    ? canonical(currentReceipts) === canonical(completedReceipts)
    : false;
  assert(
    isPredecessor || isCompleted,
    "persisted receipt chain does not match the selected predecessor or exact mastered outcome.",
  );

  const resume = await heavyMetalFightingProductionBatchResumePlan(
    selection.batchId,
    currentReceipts,
  );
  const state = resume.unitStates.find((entry) => entry.unitId === selection.unitId);
  if (isPredecessor) {
    assert(
      state?.currentState === policy.masteringRules.predecessorState
        && state.currentOutcome === policy.masteringRules.requiredPredecessorOutcome
        && state.nextAction === "master-selected-candidate",
      "persisted lifecycle is not ready for selected-candidate mastering.",
    );
  } else {
    assert(
      state?.currentState === policy.masteringRules.receiptState
        && state.currentOutcome === null
        && state.nextAction === policy.masteringRules.nextLegalAction,
      "persisted mastered lifecycle differs from the governed mastering receipt.",
    );
  }

  const masterTarget = safeRelativePath(
    order.assetContract.masterOutputPath,
    "selected-candidate master target",
  );
  assert(
    !policy.masteringRules.masterPathMustLiveUnderMasters
      || masterTarget.startsWith("masters/"),
    "selected-candidate master target must remain under masters/.",
  );
  const recordTarget = masteringRecordPath(order, selection.attempt);
  return freeze({
    root,
    selection,
    policy,
    order,
    creative,
    candidate,
    currentReceipts,
    predecessorReceipts,
    completedReceipts,
    isPredecessor,
    isCompleted,
    masterTarget,
    recordTarget,
    receiptTarget,
  });
}
