import {
  createHmfProductionReceipt,
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import {
  HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_DECISION_SCHEMA,
  HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PROTOCOL_VERSION,
  approvalDecisionPath,
  assert,
  canonical,
  freeze,
  hashValue,
  loadApprovalPolicy,
  safeRelativePath,
} from "./frame-body-named-human-approval-common.mjs";
import {
  normalizeHmfFrameBodyNamedHumanApproval,
  validateHmfFrameBodyMasteringPlan,
} from "./frame-body-named-human-approval-validation.mjs";
import {
  validatedHmfFrameBodyNamedHumanApprovalWorkspace,
} from "./frame-body-named-human-approval-workspace.mjs";

function validateMasterDescriptor(master, plan) {
  assert(master && typeof master === "object" && !Array.isArray(master), "master must be an object.");
  const masterPath = safeRelativePath(master.path, "approved master path");
  assert(
    masterPath === plan.targets.masterFile
      && masterPath === plan.masteringRecord.master.path
      && master.sha256 === plan.masteringRecord.master.sha256
      && master.bytes === plan.masteringRecord.master.bytes,
    "approved master descriptor drifted from mastering evidence.",
  );
  return freeze({ path: masterPath, sha256: master.sha256, bytes: master.bytes });
}

export async function compileHmfFrameBodyNamedHumanApprovalDecisionDocument({
  masteringPlan: planInput,
  previousReceipts,
  workspaceRoot,
  master: masterInput,
  humanApproval,
} = {}) {
  const plan = await validateHmfFrameBodyMasteringPlan(planInput);
  const [policy, order] = await Promise.all([
    loadApprovalPolicy(),
    heavyMetalFightingProductionWorkOrder(plan.unitId),
  ]);
  assert(
    order.workOrderSha256 === plan.workOrderSha256
      && order.assetContract.kind === policy.assetKind,
    "named-human approval authority drifted from the mastered work order.",
  );
  assert(Array.isArray(previousReceipts), "previousReceipts must be an array.");
  const masteredReceipts = freeze([...plan.previousReceipts, plan.receipt]);
  assert(
    canonical(previousReceipts) === canonical(masteredReceipts),
    "previousReceipts do not exactly represent the mastered predecessor.",
  );
  const resume = await heavyMetalFightingProductionBatchResumePlan(
    plan.batchId,
    previousReceipts,
  );
  const state = resume.unitStates.find((entry) => entry.unitId === plan.unitId);
  assert(
    state?.currentState === policy.approvalRules.predecessorState
      && state.currentOutcome === null
      && state.nextAction === "request-named-human-approval",
    "previousReceipts are not ready for named-human approval.",
  );

  const master = validateMasterDescriptor(masterInput, plan);
  const normalized = normalizeHmfFrameBodyNamedHumanApproval(
    plan,
    humanApproval,
    policy,
  );
  const evidenceBody = {
    schema: "evavo.heavy-metal-fighting-frame-body-named-human-approval-evidence.v1",
    protocolVersion: HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PROTOCOL_VERSION,
    projectId: plan.projectId,
    unitId: plan.unitId,
    batchId: plan.batchId,
    frameId: plan.frameId,
    bodySlot: plan.bodySlot,
    attempt: plan.attempt,
    workspaceRoot,
    workOrderSha256: plan.workOrderSha256,
    policySha256: policy.policySha256,
    masteringPlanSha256: plan.masteringPlanSha256,
    masteringRecordSha256: plan.masteringRecord.masteringRecordSha256,
    masteredReceiptSha256: plan.receipt.receiptSha256,
    selectionDecisionSha256: plan.selectionDecision.selectionDecisionSha256,
    master,
    approved: true,
    rationale: normalized.rationale,
    approver: freeze({
      actorClass: normalized.actorClass,
      actorId: normalized.actorId,
    }),
    attestations: normalized.attestations,
    occurredAt: normalized.occurredAt,
  };
  const approvalEvidenceSha256 = hashValue(evidenceBody);
  const receipt = await createHmfProductionReceipt({
    unitId: plan.unitId,
    state: policy.approvalRules.receiptState,
    attempt: plan.attempt,
    evidenceSha256: approvalEvidenceSha256,
    candidateSha256: master.sha256,
    actorClass: normalized.actorClass,
    actorId: normalized.actorId,
    occurredAt: normalized.occurredAt,
  }, plan.receipt);

  const target = approvalDecisionPath(order, plan.attempt);
  const body = {
    schema: HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_DECISION_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PROTOCOL_VERSION,
    projectId: plan.projectId,
    unitId: plan.unitId,
    batchId: plan.batchId,
    frameId: plan.frameId,
    bodySlot: plan.bodySlot,
    attempt: plan.attempt,
    workspaceRoot,
    workOrderSha256: plan.workOrderSha256,
    policySha256: policy.policySha256,
    masteringPlan: plan,
    previousReceipts: freeze(previousReceipts),
    master,
    approvalEvidence: freeze(evidenceBody),
    approvalEvidenceSha256,
    receipt,
    target,
    completedApprovalState: "named-human-approved",
    nextLegalAction: policy.approvalRules.nextLegalAction,
    authority: freeze({
      decisionCompilation: true,
      masterRead: true,
      masteringRecordRead: true,
      namedHumanApproval: true,
      approvalDecisionPersistence: false,
      receiptPersistence: false,
      providerExecution: false,
      providerRetry: false,
      candidateMutation: false,
      imageTransformation: false,
      automaticApproval: false,
      gameRepositoryPromotion: false,
      targetRepositoryMutation: false,
      finalAtlasCompilation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      explicitWriteEnabledRuntimeRequired: true,
    }),
  };
  return freeze({ ...body, approvalDecisionSha256: hashValue(body) });
}

export async function compileHmfFrameBodyNamedHumanApprovalDecision({
  masteringPlan,
  workspaceRoot,
  humanApproval,
} = {}) {
  const inputs = await validatedHmfFrameBodyNamedHumanApprovalWorkspace(
    masteringPlan,
  );
  const requestedRoot = workspaceRoot ?? inputs.root;
  assert(
    requestedRoot === inputs.root,
    "named-human approval workspace root drifted from the persistent workspace.",
  );
  return compileHmfFrameBodyNamedHumanApprovalDecisionDocument({
    masteringPlan: inputs.plan,
    previousReceipts: inputs.currentReceipts,
    workspaceRoot: inputs.root,
    master: {
      path: inputs.masterTarget,
      sha256: inputs.master.sha256,
      bytes: inputs.master.size,
    },
    humanApproval,
  });
}
