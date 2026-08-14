import {
  createHmfProductionReceipt,
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import {
  HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PLAN_SCHEMA,
  HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PROTOCOL_VERSION,
  HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_RECORD_SCHEMA,
  SHA256,
  assert,
  canonical,
  freeze,
  hashValue,
  loadApprovalPolicy,
  namedHumanApprovalRecordPath,
  safeRelativePath,
} from "./frame-body-named-human-approval-common.mjs";
import {
  normalizeHmfFrameBodyNamedHumanApproval,
  validateHmfFrameBodyCompletedMasteringPlan,
} from "./frame-body-named-human-approval-validation.mjs";
import {
  assertExactApprovalKeys,
  snapshotApprovalCompileRequest,
  snapshotApprovalDocumentRequest,
} from "./frame-body-named-human-approval-snapshot.mjs";
import { validatedHmfFrameBodyNamedHumanApprovalWorkspace } from "./frame-body-named-human-approval-workspace.mjs";

function validateMasterDescriptor(master, mastering, order, policy) {
  assertExactApprovalKeys(master, ["path", "sha256", "bytes"], "named-human approval master");
  const masterPath = safeRelativePath(master.path, "named-human approval master path");
  assert(SHA256.test(String(master.sha256 ?? "")), "named-human approval master SHA-256 is invalid.");
  assert(Number.isInteger(master.bytes) && master.bytes >= 1, "named-human approval master byte count is invalid.");
  assert(
    masterPath === order.assetContract.masterOutputPath
      && masterPath === mastering.masteringRecord.master.path,
    "named-human approval master path drifted from the immutable work order.",
  );
  assert(
    master.sha256 === mastering.masteringRecord.master.sha256
      && master.sha256 === mastering.candidate.sha256
      && master.bytes === mastering.masteringRecord.master.bytes
      && master.bytes === mastering.candidate.bytes,
    "named-human approval master identity drifted from the exact mastered candidate.",
  );
  assert(
    !policy.approvalRules.masterPathMustLiveUnderMasters || masterPath.startsWith("masters/"),
    "named-human approval master path escaped masters/.",
  );
  return freeze({ path: masterPath, sha256: master.sha256, bytes: master.bytes });
}

export async function compileHmfFrameBodyNamedHumanApprovalPlanDocument(input = {}) {
  const captured = snapshotApprovalDocumentRequest(input);
  const {
    masteringPlan: masteringInput,
    previousReceipts,
    workspaceRoot,
    master: masterInput,
    humanApproval,
  } = captured;
  const mastering = await validateHmfFrameBodyCompletedMasteringPlan(masteringInput);
  const [policy, order] = await Promise.all([
    loadApprovalPolicy(),
    heavyMetalFightingProductionWorkOrder(mastering.unitId),
  ]);
  assert(
    order.assetContract.kind === policy.assetKind
      && order.workOrderSha256 === mastering.workOrderSha256,
    "named-human approval authority drifted from the mastered work order.",
  );
  assert(Array.isArray(previousReceipts), "previousReceipts must be an array.");
  const completedMasteringReceipts = freeze([...mastering.previousReceipts, mastering.receipt]);
  assert(
    canonical(previousReceipts) === canonical(completedMasteringReceipts),
    "previousReceipts do not exactly represent the completed mastering outcome.",
  );
  const resume = await heavyMetalFightingProductionBatchResumePlan(
    mastering.batchId,
    previousReceipts,
  );
  const state = resume.unitStates.find((entry) => entry.unitId === mastering.unitId);
  assert(
    state?.currentState === policy.approvalRules.predecessorState
      && state.currentOutcome === null
      && state.nextAction === "request-named-human-approval",
    "previousReceipts are not ready for named-human approval.",
  );
  const master = validateMasterDescriptor(masterInput, mastering, order, policy);
  const normalized = normalizeHmfFrameBodyNamedHumanApproval(
    mastering,
    humanApproval,
    policy,
  );
  const approvalRecordBody = {
    schema: HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_RECORD_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PROTOCOL_VERSION,
    projectId: mastering.projectId,
    unitId: mastering.unitId,
    batchId: mastering.batchId,
    frameId: mastering.frameId,
    bodySlot: mastering.bodySlot,
    attempt: mastering.attempt,
    workspaceRoot,
    workOrderSha256: mastering.workOrderSha256,
    policySha256: policy.policySha256,
    masteringPlanSha256: mastering.masteringPlanSha256,
    masteringRecordSha256: mastering.masteringRecord.masteringRecordSha256,
    masteredReceiptSha256: mastering.receipt.receiptSha256,
    selectionDecisionSha256: mastering.selectionDecision.selectionDecisionSha256,
    selectionReceiptSha256: mastering.selectionDecision.receipt.receiptSha256,
    candidate: freeze({ ...mastering.candidate }),
    master,
    approver: freeze({ actorClass: normalized.actorClass, actorId: normalized.actorId }),
    decision: normalized.decision,
    rationale: normalized.rationale,
    attestations: normalized.attestations,
    occurredAt: normalized.occurredAt,
    claims: freeze({
      exactMasterInspected: true,
      exactMasterMatchesSelectedCandidate: true,
      masteringLineageAccepted: true,
      independentNamedHumanApproval: true,
      masterMutationPerformed: false,
      gameRepositoryPromotionPerformed: false,
      deliveryReadinessCompiled: false,
    }),
    authority: freeze({
      providerExecution: false,
      providerRetry: false,
      candidateMutation: false,
      masterMutation: false,
      imageTransformation: false,
      automaticApproval: false,
      gameRepositoryPromotion: false,
      targetRepositoryMutation: false,
      finalAtlasCompilation: false,
      deliveryReadinessCompilation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
    }),
  };
  const approvalRecord = freeze({
    ...approvalRecordBody,
    approvalRecordSha256: hashValue(approvalRecordBody),
  });
  const receipt = await createHmfProductionReceipt({
    unitId: mastering.unitId,
    state: policy.approvalRules.receiptState,
    attempt: mastering.attempt,
    evidenceSha256: approvalRecord.approvalRecordSha256,
    candidateSha256: master.sha256,
    actorClass: normalized.actorClass,
    actorId: normalized.actorId,
    occurredAt: normalized.occurredAt,
  }, mastering.receipt);
  const body = {
    schema: HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PLAN_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PROTOCOL_VERSION,
    projectId: mastering.projectId,
    unitId: mastering.unitId,
    batchId: mastering.batchId,
    frameId: mastering.frameId,
    bodySlot: mastering.bodySlot,
    attempt: mastering.attempt,
    workspaceRoot,
    workOrderSha256: mastering.workOrderSha256,
    policySha256: policy.policySha256,
    masteringPlan: mastering,
    previousReceipts: freeze(previousReceipts),
    master,
    approvalRecord,
    receipt,
    targets: freeze({
      approvalRecord: namedHumanApprovalRecordPath(order, mastering.attempt),
      receiptChain: order.executionPaths.receiptPath,
    }),
    completedApprovalState: "named-human-approved",
    nextLegalAction: policy.approvalRules.nextLegalAction,
    authority: freeze({
      planCompilation: true,
      masterRead: true,
      masteringRecordRead: true,
      approvalRecordPersistence: false,
      receiptPersistence: false,
      providerExecution: false,
      providerRetry: false,
      candidateMutation: false,
      masterMutation: false,
      imageTransformation: false,
      automaticApproval: false,
      gameRepositoryPromotion: false,
      targetRepositoryMutation: false,
      finalAtlasCompilation: false,
      deliveryReadinessCompilation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      namedHumanApproverRequired: true,
      explicitWriteEnabledRuntimeRequired: true,
    }),
  };
  return freeze({ ...body, approvalPlanSha256: hashValue(body) });
}

export async function compileHmfFrameBodyNamedHumanApprovalPlan(input = {}) {
  const captured = snapshotApprovalCompileRequest(input);
  const inputs = await validatedHmfFrameBodyNamedHumanApprovalWorkspace(captured.masteringPlan);
  const requestedRoot = captured.workspaceRoot ?? inputs.root;
  assert(requestedRoot === inputs.root, "named-human approval workspace root drifted from mastering.");
  assert(
    inputs.master.sha256 === inputs.mastering.masteringRecord.master.sha256
      && inputs.master.size === inputs.mastering.masteringRecord.master.bytes,
    "persisted master changed before named-human approval plan compilation.",
  );
  return compileHmfFrameBodyNamedHumanApprovalPlanDocument({
    masteringPlan: inputs.mastering,
    previousReceipts: inputs.currentReceipts,
    workspaceRoot: inputs.root,
    master: {
      path: inputs.mastering.targets.masterFile,
      sha256: inputs.master.sha256,
      bytes: inputs.master.size,
    },
    humanApproval: captured.humanApproval,
  });
}
