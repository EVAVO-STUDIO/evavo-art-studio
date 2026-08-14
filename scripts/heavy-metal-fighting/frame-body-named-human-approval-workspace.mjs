import {
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import {
  assert,
  canonical,
  freeze,
  loadApprovalPolicy,
  safeRelativePath,
  selfHashed,
  stableWorkspaceFile,
  stableWorkspaceJson,
  workspaceRoot,
} from "./frame-body-named-human-approval-common.mjs";
import { validateHmfFrameBodyMasteringPlan } from "./frame-body-named-human-approval-validation.mjs";

export async function validatedHmfFrameBodyNamedHumanApprovalWorkspace(
  masteringPlanInput,
  expectedApprovalReceipt = null,
) {
  const plan = await validateHmfFrameBodyMasteringPlan(masteringPlanInput);
  const [policy, order] = await Promise.all([
    loadApprovalPolicy(),
    heavyMetalFightingProductionWorkOrder(plan.unitId),
  ]);
  assert(
    order.assetContract.kind === policy.assetKind
      && order.workOrderSha256 === plan.workOrderSha256,
    "named-human approval policy or work order drifted from mastering.",
  );
  const root = await workspaceRoot(plan.workspaceRoot);
  assert(root === plan.workspaceRoot, "named-human approval workspace root drifted from mastering.");

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
    "selected decision changed before named-human approval.",
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
    "creative-review decision changed before named-human approval.",
  );

  const candidate = await stableWorkspaceFile(
    root,
    creative.reviewPacket.candidate.path,
    "approved candidate lineage",
  );
  assert(
    candidate.sha256 === plan.candidate.sha256
      && candidate.size === plan.candidate.bytes,
    "candidate lineage changed before named-human approval.",
  );

  const qaReport = await stableWorkspaceJson(
    root,
    creative.reviewPacket.qaReport.targets.qaReport,
    "persisted deterministic QA report",
  );
  assert(
    qaReport.value.qaReportSha256 === creative.reviewPacket.qaReportSha256
      && canonical(qaReport.value) === canonical(creative.reviewPacket.qaReport),
    "deterministic QA report changed before named-human approval.",
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
      && admissionValue.candidateSha256 === candidate.sha256,
    "candidate admission lineage changed before named-human approval.",
  );

  const masterTarget = safeRelativePath(
    plan.targets.masterFile,
    "named-human approval master target",
  );
  assert(
    masterTarget === order.assetContract.masterOutputPath
      && masterTarget === plan.masteringRecord.master.path,
    "named-human approval master target drifted from mastering and the work order.",
  );
  const master = await stableWorkspaceFile(
    root,
    masterTarget,
    "persisted mastered Frame body",
  );
  assert(
    master.sha256 === plan.masteringRecord.master.sha256
      && master.size === plan.masteringRecord.master.bytes
      && master.sha256 === candidate.sha256
      && master.size === candidate.size,
    "persisted master differs from the exact selected candidate and mastering record.",
  );

  const recordTarget = safeRelativePath(
    plan.targets.masteringRecord,
    "named-human approval mastering-record target",
  );
  const record = await stableWorkspaceJson(
    root,
    recordTarget,
    "persisted mastering record",
  );
  assert(
    record.value.masteringRecordSha256
      === plan.masteringRecord.masteringRecordSha256
      && canonical(record.value) === canonical(plan.masteringRecord),
    "persisted mastering record differs from the approved mastering evidence.",
  );

  const receiptTarget = safeRelativePath(
    plan.targets.receiptChain,
    "named-human approval receipt-chain target",
  );
  const receiptFile = await stableWorkspaceJson(
    root,
    receiptTarget,
    "persisted production receipt chain",
  );
  assert(Array.isArray(receiptFile.value), "persisted production receipt chain must be an array.");
  const masteredReceipts = freeze([...plan.previousReceipts, plan.receipt]);
  const approvedReceipts = expectedApprovalReceipt
    ? freeze([...masteredReceipts, expectedApprovalReceipt])
    : null;
  const currentReceipts = freeze(receiptFile.value);
  const isMastered = canonical(currentReceipts) === canonical(masteredReceipts);
  const isApproved = approvedReceipts
    ? canonical(currentReceipts) === canonical(approvedReceipts)
    : false;
  assert(
    isMastered || isApproved,
    "persisted receipt chain does not match the mastered predecessor or exact approval.",
  );

  const resume = await heavyMetalFightingProductionBatchResumePlan(
    plan.batchId,
    currentReceipts,
  );
  const state = resume.unitStates.find((entry) => entry.unitId === plan.unitId);
  if (isMastered) {
    assert(
      state?.currentState === policy.approvalRules.predecessorState
        && state.currentOutcome === null
        && state.nextAction === "request-named-human-approval",
      "persisted lifecycle is not ready for named-human approval.",
    );
  } else {
    assert(
      state?.currentState === policy.approvalRules.receiptState
        && state.currentOutcome === null
        && state.nextAction === policy.approvalRules.nextLegalAction,
      "persisted named-human approval differs from the governed approval receipt.",
    );
  }

  return freeze({
    root,
    plan,
    policy,
    order,
    selection,
    creative,
    candidate,
    master,
    record,
    masterTarget,
    recordTarget,
    receiptTarget,
    masteredReceipts,
    approvedReceipts,
    currentReceipts,
    isMastered,
    isApproved,
  });
}
