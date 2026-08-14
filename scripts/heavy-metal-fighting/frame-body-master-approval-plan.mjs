import {
  createHmfProductionReceipt,
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import {
  HMF_FRAME_BODY_MASTER_APPROVAL_DECISION_SCHEMA,
  HMF_FRAME_BODY_MASTER_APPROVAL_PROTOCOL_VERSION,
  approvalDecisionPath,
  assert,
  canonical,
  freeze,
  hashValue,
  loadApprovalPolicy,
} from "./frame-body-master-approval-common.mjs";
import {
  normalizeHmfFrameBodyHumanMasterApproval,
  validateHmfFrameBodyMasteringPlanForApproval,
} from "./frame-body-master-approval-validation.mjs";
import { validatedHmfFrameBodyMasterApprovalWorkspace } from "./frame-body-master-approval-workspace.mjs";

export async function compileHmfFrameBodyMasterApprovalDecisionDocument({
  masteringPlan: masteringPlanInput,
  previousReceipts,
  workspaceRoot,
  humanApproval,
} = {}) {
  const { plan, record, receipt: masteredReceipt } =
    await validateHmfFrameBodyMasteringPlanForApproval(masteringPlanInput);
  const [policy, order] = await Promise.all([
    loadApprovalPolicy(),
    heavyMetalFightingProductionWorkOrder(plan.unitId),
  ]);
  assert(
    order.workOrderSha256 === plan.workOrderSha256
      && order.assetContract.kind === policy.assetKind,
    "master approval authority drifted from the immutable work order.",
  );
  assert(Array.isArray(previousReceipts), "previousReceipts must be an array.");
  const completedMasteringReceipts = freeze([
    ...plan.previousReceipts,
    masteredReceipt,
  ]);
  assert(
    canonical(previousReceipts) === canonical(completedMasteringReceipts),
    "previousReceipts do not exactly represent the completed mastered outcome.",
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
    "previousReceipts are not ready for named-human master approval.",
  );

  const normalized = normalizeHmfFrameBodyHumanMasterApproval(
    plan,
    humanApproval,
    policy,
  );
  const evidenceBody = {
    schema: "evavo.heavy-metal-fighting-frame-body-master-approval-evidence.v1",
    protocolVersion: HMF_FRAME_BODY_MASTER_APPROVAL_PROTOCOL_VERSION,
    projectId: plan.projectId,
    unitId: plan.unitId,
    batchId: plan.batchId,
    frameId: plan.frameId,
    bodySlot: plan.bodySlot,
    attempt: plan.attempt,
    workspaceRoot,
    workOrderSha256: plan.workOrderSha256,
    policySha256: policy.policySha256,
    selectionDecisionSha256:
      plan.selectionDecision.selectionDecisionSha256,
    masteringPlanSha256: plan.masteringPlanSha256,
    masteringRecordSha256: record.masteringRecordSha256,
    masteredReceiptSha256: masteredReceipt.receiptSha256,
    candidate: freeze({
      path: plan.candidate.path,
      sha256: plan.candidate.sha256,
      bytes: plan.candidate.bytes,
    }),
    master: freeze({
      path: record.master.path,
      sha256: record.master.sha256,
      bytes: record.master.bytes,
    }),
    decision: normalized.decision,
    rationale: normalized.rationale,
    decisionMaker: freeze({
      actorClass: normalized.actorClass,
      actorId: normalized.actorId,
    }),
    attestations: normalized.attestations,
    occurredAt: normalized.occurredAt,
  };
  const approvalEvidenceSha256 = hashValue(evidenceBody);
  const approvalReceipt = await createHmfProductionReceipt({
    unitId: plan.unitId,
    state: policy.approvalRules.receiptState,
    attempt: plan.attempt,
    evidenceSha256: approvalEvidenceSha256,
    candidateSha256: plan.candidate.sha256,
    actorClass: normalized.actorClass,
    actorId: normalized.actorId,
    occurredAt: normalized.occurredAt,
  }, masteredReceipt);
  const body = {
    schema: HMF_FRAME_BODY_MASTER_APPROVAL_DECISION_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_MASTER_APPROVAL_PROTOCOL_VERSION,
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
    approvalEvidence: freeze(evidenceBody),
    approvalEvidenceSha256,
    receipt: approvalReceipt,
    target: approvalDecisionPath(order, plan.attempt),
    completedApprovalState: policy.approvalRules.receiptState,
    decision: normalized.decision,
    nextLegalAction: policy.approvalRules.nextLegalAction,
    authority: freeze({
      decisionCompilation: true,
      masterRead: true,
      masteringRecordRead: true,
      approvalDecisionPersistence: false,
      receiptPersistence: false,
      namedHumanDecisionRequired: true,
      providerExecution: false,
      providerRetry: false,
      candidateMutation: false,
      imageTransformation: false,
      automaticSelection: false,
      automaticApproval: false,
      automaticDeliveryReadiness: false,
      candidatePromotion: false,
      gameRepositoryPromotion: false,
      targetRepositoryMutation: false,
      finalAtlasCompilation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      explicitWriteEnabledRuntimeRequired: true,
    }),
  };
  return freeze({
    ...body,
    approvalDecisionSha256: hashValue(body),
  });
}

export async function compileHmfFrameBodyMasterApprovalDecision({
  masteringPlan,
  workspaceRoot: workspaceRootInput,
  humanApproval,
} = {}) {
  const inputs = await validatedHmfFrameBodyMasterApprovalWorkspace(
    masteringPlan,
  );
  assert(
    inputs.root === workspaceRootInput
      || inputs.root === masteringPlan?.workspaceRoot,
    "master approval workspace root does not match the persisted mastering plan.",
  );
  const requestedRoot = workspaceRootInput ?? inputs.root;
  assert(
    requestedRoot === inputs.root,
    "master approval workspace root drifted from the persistent workspace.",
  );
  return compileHmfFrameBodyMasterApprovalDecisionDocument({
    masteringPlan: inputs.plan,
    previousReceipts: inputs.currentReceipts,
    workspaceRoot: inputs.root,
    humanApproval,
  });
}
