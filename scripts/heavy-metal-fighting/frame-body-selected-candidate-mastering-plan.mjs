import {
  createHmfProductionReceipt,
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import {
  HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PLAN_SCHEMA,
  HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PROTOCOL_VERSION,
  HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_RECORD_SCHEMA,
  SHA256,
  assert,
  canonical,
  freeze,
  hashValue,
  loadMasteringPolicy,
  masteringRecordPath,
  safeRelativePath,
} from "./frame-body-selected-candidate-mastering-common.mjs";
import {
  normalizeHmfFrameBodyMasteringRequest,
  validateHmfFrameBodySelectedSelectionDecision,
} from "./frame-body-selected-candidate-mastering-validation.mjs";
import { validatedHmfFrameBodySelectedCandidateMasteringWorkspace } from "./frame-body-selected-candidate-mastering-workspace.mjs";

function validateCandidateDescriptor(candidate, selection, policy) {
  assert(candidate && typeof candidate === "object" && !Array.isArray(candidate), "candidate must be an object.");
  const candidatePath = safeRelativePath(candidate.path, "selected candidate path");
  assert(SHA256.test(String(candidate.sha256 ?? "")), "selected candidate SHA-256 is invalid.");
  assert(
    Number.isInteger(candidate.bytes)
      && candidate.bytes >= 1
      && candidate.bytes <= policy.masteringRules.maximumCandidateBytes,
    "selected candidate byte count is outside the mastering limit.",
  );
  assert(
    candidatePath === selection.creativeReviewDecision.reviewPacket.candidate.path
      && candidate.sha256 === selection.selectionEvidence.candidateSha256
      && candidate.bytes === selection.creativeReviewDecision.reviewPacket.candidate.bytes,
    "selected candidate descriptor drifted from the completed selection evidence.",
  );
  return freeze({ path: candidatePath, sha256: candidate.sha256, bytes: candidate.bytes });
}

export async function compileHmfFrameBodySelectedCandidateMasteringPlanDocument({
  selectionDecision: selectionInput,
  previousReceipts,
  workspaceRoot,
  candidate: candidateInput,
  masteringRequest,
} = {}) {
  const selection = await validateHmfFrameBodySelectedSelectionDecision(selectionInput);
  const [policy, order] = await Promise.all([
    loadMasteringPolicy(),
    heavyMetalFightingProductionWorkOrder(selection.unitId),
  ]);
  assert(
    order.workOrderSha256 === selection.workOrderSha256
      && order.assetContract.kind === policy.assetKind,
    "mastering authority drifted from the selected work order.",
  );
  assert(Array.isArray(previousReceipts), "previousReceipts must be an array.");
  const completedSelectionReceipts = freeze([...selection.previousReceipts, selection.receipt]);
  assert(
    canonical(previousReceipts) === canonical(completedSelectionReceipts),
    "previousReceipts do not exactly represent the completed selected outcome.",
  );
  const resume = await heavyMetalFightingProductionBatchResumePlan(
    selection.batchId,
    previousReceipts,
  );
  const state = resume.unitStates.find((entry) => entry.unitId === selection.unitId);
  assert(
    state?.currentState === policy.masteringRules.predecessorState
      && state.currentOutcome === policy.masteringRules.requiredPredecessorOutcome
      && state.nextAction === "master-selected-candidate",
    "previousReceipts are not ready for selected-candidate mastering.",
  );
  const candidate = validateCandidateDescriptor(candidateInput, selection, policy);
  const normalized = normalizeHmfFrameBodyMasteringRequest(
    selection,
    masteringRequest,
    policy,
  );
  const masterTarget = safeRelativePath(
    order.assetContract.masterOutputPath,
    "selected-candidate master target",
  );
  assert(
    !policy.masteringRules.masterPathMustLiveUnderMasters
      || masterTarget.startsWith("masters/"),
    "selected-candidate master target escaped masters/.",
  );
  const recordTarget = masteringRecordPath(order, selection.attempt);
  const masteringRecordBody = {
    schema: HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_RECORD_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PROTOCOL_VERSION,
    projectId: selection.projectId,
    unitId: selection.unitId,
    batchId: selection.batchId,
    frameId: selection.frameId,
    bodySlot: selection.bodySlot,
    attempt: selection.attempt,
    workspaceRoot,
    workOrderSha256: selection.workOrderSha256,
    policySha256: policy.policySha256,
    selectionDecisionSha256: selection.selectionDecisionSha256,
    selectionEvidenceSha256: selection.selectionEvidenceSha256,
    selectionReceiptSha256: selection.receipt.receiptSha256,
    candidate,
    master: freeze({
      path: masterTarget,
      sha256: candidate.sha256,
      bytes: candidate.bytes,
      exactByteCopy: true,
    }),
    executor: freeze({ actorClass: normalized.actorClass, actorId: normalized.actorId }),
    attestations: normalized.attestations,
    occurredAt: normalized.occurredAt,
    claims: freeze({
      selectedCandidateReadRequired: true,
      workspaceMasterMustBeCreatedOrExactlyReused: true,
      exactCandidateBytesRequired: true,
      exactPostWriteReadbackRequired: true,
      namedHumanApprovalPerformed: false,
      gameRepositoryPromotionPerformed: false,
    }),
    authority: freeze({
      providerExecution: false,
      providerRetry: false,
      candidateMutation: false,
      imageTransformation: false,
      automaticSelection: false,
      namedHumanApproval: false,
      gameRepositoryPromotion: false,
      targetRepositoryMutation: false,
      finalAtlasCompilation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
    }),
  };
  const masteringRecord = freeze({
    ...masteringRecordBody,
    masteringRecordSha256: hashValue(masteringRecordBody),
  });
  const receipt = await createHmfProductionReceipt({
    unitId: selection.unitId,
    state: policy.masteringRules.receiptState,
    attempt: selection.attempt,
    evidenceSha256: masteringRecord.masteringRecordSha256,
    candidateSha256: candidate.sha256,
    actorClass: normalized.actorClass,
    actorId: normalized.actorId,
    occurredAt: normalized.occurredAt,
  }, selection.receipt);
  const body = {
    schema: HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PLAN_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PROTOCOL_VERSION,
    projectId: selection.projectId,
    unitId: selection.unitId,
    batchId: selection.batchId,
    frameId: selection.frameId,
    bodySlot: selection.bodySlot,
    attempt: selection.attempt,
    workspaceRoot,
    workOrderSha256: selection.workOrderSha256,
    policySha256: policy.policySha256,
    selectionDecision: selection,
    previousReceipts: freeze(previousReceipts),
    candidate,
    masteringRecord,
    receipt,
    targets: freeze({
      masterFile: masterTarget,
      masteringRecord: recordTarget,
      receiptChain: order.executionPaths.receiptPath,
    }),
    completedMasteringState: "mastered",
    nextLegalAction: policy.masteringRules.nextLegalAction,
    authority: freeze({
      planCompilation: true,
      selectedCandidateRead: true,
      masterFileCreation: false,
      masteringRecordPersistence: false,
      receiptPersistence: false,
      providerExecution: false,
      providerRetry: false,
      candidateMutation: false,
      imageTransformation: false,
      automaticSelection: false,
      namedHumanApproval: false,
      gameRepositoryPromotion: false,
      targetRepositoryMutation: false,
      finalAtlasCompilation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      explicitWriteEnabledRuntimeRequired: true,
    }),
  };
  return freeze({ ...body, masteringPlanSha256: hashValue(body) });
}

export async function compileHmfFrameBodySelectedCandidateMasteringPlan({
  selectionDecision,
  workspaceRoot,
  masteringRequest,
} = {}) {
  const inputs = await validatedHmfFrameBodySelectedCandidateMasteringWorkspace(
    selectionDecision,
  );
  assert(
    inputs.root === workspaceRoot || inputs.root === selectionDecision.workspaceRoot,
    "mastering workspace root does not match the persisted selection decision.",
  );
  const requestedRoot = workspaceRoot ?? inputs.root;
  assert(requestedRoot === inputs.root, "mastering workspace root drifted from the persistent workspace.");
  assert(
    inputs.candidate.sha256 === inputs.selection.selectionEvidence.candidateSha256
      && inputs.candidate.size
        === inputs.selection.creativeReviewDecision.reviewPacket.candidate.bytes,
    "selected candidate changed before mastering plan compilation.",
  );
  return compileHmfFrameBodySelectedCandidateMasteringPlanDocument({
    selectionDecision: inputs.selection,
    previousReceipts: inputs.currentReceipts,
    workspaceRoot: inputs.root,
    candidate: {
      path: inputs.selection.creativeReviewDecision.reviewPacket.candidate.path,
      sha256: inputs.candidate.sha256,
      bytes: inputs.candidate.size,
    },
    masteringRequest,
  });
}
