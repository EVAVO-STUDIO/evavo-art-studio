import { compileHmfFrameBodySelectedCandidateMasteringPlanDocument } from "./frame-body-selected-candidate-mastering-plan.mjs";
import {
  HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PLAN_SCHEMA,
  HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PROTOCOL_VERSION,
  HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_RECORD_SCHEMA,
} from "./frame-body-selected-candidate-mastering-common.mjs";
import {
  assert,
  boundedString,
  canonical,
  canonicalTimestamp,
  freeze,
  hashValue,
  safeActorId,
  selfHashed,
} from "./frame-body-named-human-approval-common.mjs";
import {
  snapshotCompletedMasteringPlan,
  snapshotHumanApproval,
} from "./frame-body-named-human-approval-snapshot.mjs";

function assertMasteringPlanAuthority(plan) {
  const authority = plan.authority ?? {};
  assert(
    authority.planCompilation === true
      && authority.selectedCandidateRead === true
      && authority.explicitWriteEnabledRuntimeRequired === true,
    "mastering plan lost its governed compilation, read or explicit-write boundary.",
  );
  for (const key of [
    "providerExecution",
    "providerRetry",
    "candidateMutation",
    "imageTransformation",
    "automaticSelection",
    "namedHumanApproval",
    "gameRepositoryPromotion",
    "targetRepositoryMutation",
    "finalAtlasCompilation",
    "gitMutation",
    "deployment",
    "publication",
  ]) {
    assert(authority[key] === false, `mastering plan gained forbidden authority: ${key}.`);
  }
}

function assertMasteringRecordAuthority(record) {
  const authority = record.authority ?? {};
  for (const key of [
    "providerExecution",
    "providerRetry",
    "candidateMutation",
    "imageTransformation",
    "automaticSelection",
    "namedHumanApproval",
    "gameRepositoryPromotion",
    "targetRepositoryMutation",
    "finalAtlasCompilation",
    "gitMutation",
    "deployment",
    "publication",
  ]) {
    assert(authority[key] === false, `mastering record gained forbidden authority: ${key}.`);
  }
}

export async function validateHmfFrameBodyCompletedMasteringPlan(input) {
  const captured = snapshotCompletedMasteringPlan(input);
  const plan = selfHashed(
    captured,
    "masteringPlanSha256",
    "completed selected-candidate mastering plan",
  );
  assert(
    plan.schema === HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PLAN_SCHEMA
      && plan.protocolVersion === HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PROTOCOL_VERSION,
    "completed mastering plan schema or protocol drifted.",
  );
  assertMasteringPlanAuthority(plan);
  assert(
    plan.completedMasteringState === "mastered"
      && plan.nextLegalAction === "request-named-human-approval",
    "mastering plan is not ready for named-human approval.",
  );
  const record = selfHashed(
    plan.masteringRecord,
    "masteringRecordSha256",
    "completed selected-candidate mastering record",
  );
  assert(
    record.schema === HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_RECORD_SCHEMA
      && record.protocolVersion === HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PROTOCOL_VERSION,
    "completed mastering record schema or protocol drifted.",
  );
  assertMasteringRecordAuthority(record);
  assert(
    record.claims?.selectedCandidateReadRequired === true
      && record.claims?.workspaceMasterMustBeCreatedOrExactlyReused === true
      && record.claims?.exactCandidateBytesRequired === true
      && record.claims?.exactPostWriteReadbackRequired === true
      && record.claims?.namedHumanApprovalPerformed === false
      && record.claims?.gameRepositoryPromotionPerformed === false,
    "completed mastering record claims drifted.",
  );
  assert(
    record.master?.exactByteCopy === true
      && record.master.sha256 === plan.candidate?.sha256
      && record.master.bytes === plan.candidate?.bytes
      && record.master.path === plan.targets?.masterFile,
    "completed mastering record is not bound to the exact selected-candidate master.",
  );
  const receipt = selfHashed(plan.receipt, "receiptSha256", "mastered production receipt");
  assert(
    receipt.state === "mastered"
      && receipt.outcome === null
      && receipt.actorClass === "system",
    "completed mastering receipt state, outcome or actor class drifted.",
  );
  assert(
    receipt.evidenceSha256 === record.masteringRecordSha256
      && receipt.candidateSha256 === plan.candidate.sha256
      && receipt.previousReceiptSha256 === plan.selectionDecision?.receipt?.receiptSha256,
    "completed mastering receipt is not bound to its exact record, candidate and selected predecessor.",
  );
  assert(
    record.selectionDecisionSha256 === plan.selectionDecision?.selectionDecisionSha256
      && record.selectionEvidenceSha256 === plan.selectionDecision?.selectionEvidenceSha256
      && record.selectionReceiptSha256 === plan.selectionDecision?.receipt?.receiptSha256,
    "completed mastering selection lineage drifted.",
  );
  const reconstructed = await compileHmfFrameBodySelectedCandidateMasteringPlanDocument({
    selectionDecision: plan.selectionDecision,
    previousReceipts: plan.previousReceipts,
    workspaceRoot: plan.workspaceRoot,
    candidate: plan.candidate,
    masteringRequest: {
      actorId: record.executor.actorId,
      occurredAt: record.occurredAt,
      attestations: record.attestations,
    },
  });
  assert(
    reconstructed.masteringPlanSha256 === plan.masteringPlanSha256
      && canonical(reconstructed) === canonical(plan),
    "completed mastering plan does not recompile from its governed evidence.",
  );
  return freeze(plan);
}

export function normalizeHmfFrameBodyNamedHumanApproval(mastering, raw, policy) {
  const captured = snapshotHumanApproval(raw);
  const actorId = safeActorId(captured.actorId, "humanApproval.actorId");
  const occurredAt = canonicalTimestamp(captured.occurredAt, "humanApproval.occurredAt");
  assert(
    Date.parse(occurredAt) >= Date.parse(mastering.receipt.occurredAt),
    "named-human approval may not occur before mastering completed.",
  );
  assert(
    captured.decision === policy.approvalRules.requiredDecision,
    "humanApproval.decision must be approved.",
  );
  const rationale = boundedString(
    captured.rationale,
    "humanApproval.rationale",
    policy.approvalRules.minimumRationaleCharacters,
    policy.approvalRules.maximumRationaleCharacters,
  );
  const attestations = captured.attestations;
  assert(attestations.candidateSha256 === mastering.candidate.sha256, "approval attestation candidate SHA drifted.");
  assert(attestations.masterSha256 === mastering.masteringRecord.master.sha256, "approval attestation master SHA drifted.");
  assert(attestations.masteringPlanSha256 === mastering.masteringPlanSha256, "approval attestation mastering-plan SHA drifted.");
  assert(attestations.masteringRecordSha256 === mastering.masteringRecord.masteringRecordSha256, "approval attestation mastering-record SHA drifted.");
  assert(attestations.masteredReceiptSha256 === mastering.receipt.receiptSha256, "approval attestation mastered-receipt SHA drifted.");
  assert(attestations.exactMasterInspected === true, "approval must attest that the exact mastered asset was inspected.");
  assert(attestations.masteringLineageAccepted === true, "approval must attest that the governed mastering lineage was accepted.");
  assert(attestations.independentNamedHumanApproval === true, "approval must attest an independent named-human decision.");
  assert(
    attestations.noMasterMutationPromotionDeliveryGitOrPublicationPerformed === true,
    "approval must preserve master mutation, promotion, delivery, Git and publication boundaries.",
  );
  assert(policy.approvalRules.requiredActorClass === "human", "approval policy lost its named-human actor boundary.");
  return freeze({
    actorClass: "human",
    actorId,
    occurredAt,
    decision: captured.decision,
    rationale,
    attestations: freeze({
      candidateSha256: attestations.candidateSha256,
      masterSha256: attestations.masterSha256,
      masteringPlanSha256: attestations.masteringPlanSha256,
      masteringRecordSha256: attestations.masteringRecordSha256,
      masteredReceiptSha256: attestations.masteredReceiptSha256,
      exactMasterInspected: true,
      masteringLineageAccepted: true,
      independentNamedHumanApproval: true,
      noMasterMutationPromotionDeliveryGitOrPublicationPerformed: true,
    }),
  });
}

export function approvalEvidenceHash(value) {
  return hashValue(value);
}
