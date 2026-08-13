import { validatedCreativeInputs } from "./frame-body-creative-review-packet.mjs";
import {
  createHmfProductionReceipt,
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionRepairTemplate,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import {
  HMF_FRAME_BODY_SELECTION_DECISION_SCHEMA,
  HMF_FRAME_BODY_SELECTION_PROTOCOL_VERSION,
  assert,
  canonical,
  freeze,
  hashValue,
  loadPolicy,
  selectionDecisionPath,
  stableWorkspaceJson,
} from "./frame-body-selection-decision-common.mjs";
import {
  normalizeHmfFrameBodyHumanSelectionDecision,
  validateHmfFrameBodyCreativeReviewDecision,
  validateSelectionTemplateAgainstPolicy,
} from "./frame-body-selection-decision-validation.mjs";

export async function compileHmfFrameBodySelectionDecisionDocument({
  creativeReviewDecision: decisionInput,
  previousReceipts,
  workspaceRoot,
  humanDecision,
} = {}) {
  const decision = await validateHmfFrameBodyCreativeReviewDecision(decisionInput);
  const [policy, order] = await Promise.all([
    loadPolicy(),
    heavyMetalFightingProductionWorkOrder(decision.unitId),
  ]);
  assert(
    order.assetContract.kind === policy.assetKind && order.workOrderSha256 === decision.workOrderSha256,
    "selection authority drifted from the immutable work order.",
  );
  assert(Array.isArray(previousReceipts), "previousReceipts must be an array.");
  const resume = await heavyMetalFightingProductionBatchResumePlan(decision.batchId, previousReceipts);
  const state = resume.unitStates.find((entry) => entry.unitId === decision.unitId);
  assert(
    state?.currentState === "creative-review-passed" && state.nextAction === "select-or-request-repair",
    "previousReceipts are not ready for the selection gate.",
  );
  assert(
    previousReceipts.at(-1)?.receiptSha256 === decision.receipt.receiptSha256
      && canonical(previousReceipts.at(-1)) === canonical(decision.receipt),
    "previousReceipts do not end at the governed creative-review receipt.",
  );
  const template = decision.selectionDecisionTemplate;
  validateSelectionTemplateAgainstPolicy(template, policy, decision);
  const normalized = normalizeHmfFrameBodyHumanSelectionDecision(decision, humanDecision, policy);
  const evidenceBody = {
    schema: "evavo.heavy-metal-fighting-frame-body-selection-evidence.v1",
    protocolVersion: HMF_FRAME_BODY_SELECTION_PROTOCOL_VERSION,
    projectId: decision.projectId,
    unitId: decision.unitId,
    batchId: decision.batchId,
    frameId: decision.frameId,
    bodySlot: decision.bodySlot,
    attempt: decision.attempt,
    workOrderSha256: decision.workOrderSha256,
    policySha256: policy.policySha256,
    creativeReviewDecisionSha256: decision.creativeReviewDecisionSha256,
    creativeReviewReceiptSha256: decision.receipt.receiptSha256,
    reviewEvidenceSha256: decision.reviewEvidenceSha256,
    selectionDecisionTemplateSha256: template.selectionDecisionTemplateSha256,
    candidateSha256: decision.reviewPacket.candidate.sha256,
    recommendation: decision.recommendedOutcome,
    outcome: normalized.outcome,
    failureCodes: normalized.failureCodes,
    rationale: normalized.rationale,
    decisionMaker: freeze({ actorClass: "human", actorId: normalized.actorId }),
    attestations: normalized.attestations,
    occurredAt: normalized.occurredAt,
  };
  const selectionEvidenceSha256 = hashValue(evidenceBody);
  const receipt = await createHmfProductionReceipt({
    unitId: decision.unitId,
    state: policy.decisionRules.receiptState,
    attempt: decision.attempt,
    evidenceSha256: selectionEvidenceSha256,
    candidateSha256: decision.reviewPacket.candidate.sha256,
    outcome: normalized.outcome,
    actorClass: "human",
    actorId: normalized.actorId,
    occurredAt: normalized.occurredAt,
  }, decision.receipt);
  const boundedRepairTemplate = normalized.outcome === "repair-requested"
    ? await heavyMetalFightingProductionRepairTemplate(decision.unitId, {
      candidateSha256: decision.reviewPacket.candidate.sha256,
      failureCodes: normalized.failureCodes,
      attempt: decision.attempt,
    })
    : null;
  const nextLegalAction = normalized.outcome === "selected"
    ? policy.decisionRules.selectedNextAction
    : policy.decisionRules.repairRequestedNextAction;
  const body = {
    schema: HMF_FRAME_BODY_SELECTION_DECISION_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_SELECTION_PROTOCOL_VERSION,
    projectId: decision.projectId,
    unitId: decision.unitId,
    batchId: decision.batchId,
    frameId: decision.frameId,
    bodySlot: decision.bodySlot,
    attempt: decision.attempt,
    workspaceRoot,
    workOrderSha256: decision.workOrderSha256,
    policySha256: policy.policySha256,
    creativeReviewDecision: decision,
    previousReceipts: freeze(previousReceipts),
    selectionEvidence: freeze(evidenceBody),
    selectionEvidenceSha256,
    receipt,
    boundedRepairTemplate,
    target: selectionDecisionPath(order, decision.attempt),
    completedSelectionState: "selected-or-repair-requested",
    outcome: normalized.outcome,
    nextLegalAction,
    authority: freeze({
      decisionCompilation: true,
      decisionPersistence: false,
      receiptPersistence: false,
      providerExecution: false,
      providerRetry: false,
      candidateMutation: false,
      automaticSelection: false,
      automaticRepairAuthorization: false,
      mastering: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      namedHumanDecisionRequired: true,
      explicitWriteEnabledRuntimeRequired: true,
    }),
  };
  return freeze({ ...body, selectionDecisionSha256: hashValue(body) });
}

export async function compileHmfFrameBodySelectionDecision({
  creativeReviewDecision,
  workspaceRoot: workspaceRootInput,
  humanDecision,
} = {}) {
  const decision = await validateHmfFrameBodyCreativeReviewDecision(creativeReviewDecision);
  const packet = decision.reviewPacket;
  const inputs = await validatedCreativeInputs(
    packet.qaReport,
    workspaceRootInput,
    { completedReviewReceipt: decision.receipt },
  );
  assert(inputs.root === decision.workspaceRoot, "selection workspace root drifted from the creative review decision.");
  const expectedReceipts = freeze([...packet.previousReceipts, decision.receipt]);
  assert(
    canonical(inputs.receipts) === canonical(expectedReceipts),
    "persisted receipt chain differs from the completed creative-review chain.",
  );
  const persistedDecisionFile = await stableWorkspaceJson(
    inputs.root,
    decision.target,
    "persisted creative review decision",
  );
  assert(
    persistedDecisionFile.value.creativeReviewDecisionSha256 === decision.creativeReviewDecisionSha256
      && canonical(persistedDecisionFile.value) === canonical(decision),
    "supplied creative review decision differs from its persisted record.",
  );
  return compileHmfFrameBodySelectionDecisionDocument({
    creativeReviewDecision: decision,
    previousReceipts: inputs.receipts,
    workspaceRoot: inputs.root,
    humanDecision,
  });
}
