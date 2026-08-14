import {
  compileHmfFrameBodySelectedCandidateMasteringPlanDocument,
} from "./frame-body-selected-candidate-mastering-plan.mjs";
import {
  HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PLAN_SCHEMA,
  HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PROTOCOL_VERSION,
  HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_RECORD_SCHEMA,
} from "./frame-body-selected-candidate-mastering-common.mjs";
import {
  assert,
  assertExactKeys,
  boundedString,
  canonical,
  canonicalTimestamp,
  freeze,
  safeActorId,
  selfHashed,
} from "./frame-body-named-human-approval-common.mjs";

function assertMasteringAuthority(plan) {
  const authority = plan.authority ?? {};
  assert(
    authority.planCompilation === true
      && authority.selectedCandidateRead === true
      && authority.explicitWriteEnabledRuntimeRequired === true,
    "mastered candidate lost its governed mastering boundary.",
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

export async function validateHmfFrameBodyMasteringPlan(input) {
  const plan = selfHashed(
    input,
    "masteringPlanSha256",
    "Frame body selected-candidate mastering plan",
  );
  assert(
    plan.schema === HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PLAN_SCHEMA
      && plan.protocolVersion
        === HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PROTOCOL_VERSION,
    "Frame body mastering plan schema or protocol drifted.",
  );
  assertMasteringAuthority(plan);
  assert(
    plan.completedMasteringState === "mastered"
      && plan.nextLegalAction === "request-named-human-approval",
    "Frame body mastering plan is not ready for named-human approval.",
  );

  const record = selfHashed(
    plan.masteringRecord,
    "masteringRecordSha256",
    "Frame body mastering record",
  );
  assert(
    record.schema === HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_RECORD_SCHEMA
      && record.protocolVersion
        === HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PROTOCOL_VERSION,
    "Frame body mastering record schema or protocol drifted.",
  );
  assert(
    record.claims?.selectedCandidateReadRequired === true
      && record.claims?.workspaceMasterMustBeCreatedOrExactlyReused === true
      && record.claims?.exactCandidateBytesRequired === true
      && record.claims?.exactPostWriteReadbackRequired === true
      && record.claims?.namedHumanApprovalPerformed === false
      && record.claims?.gameRepositoryPromotionPerformed === false,
    "Frame body mastering record claims drifted.",
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
    assert(record.authority?.[key] === false, `mastering record gained forbidden authority: ${key}.`);
  }

  const receipt = selfHashed(plan.receipt, "receiptSha256", "mastered receipt");
  assert(
    receipt.state === "mastered"
      && receipt.outcome === null
      && receipt.actorClass === "system",
    "mastered receipt state, outcome or actor class drifted.",
  );
  assert(
    receipt.evidenceSha256 === record.masteringRecordSha256
      && receipt.candidateSha256 === plan.candidate.sha256
      && receipt.previousReceiptSha256
        === plan.selectionDecision.receipt.receiptSha256,
    "mastered receipt is not bound to its exact record, candidate and selection predecessor.",
  );
  assert(
    record.master.path === plan.targets.masterFile
      && record.master.sha256 === plan.candidate.sha256
      && record.master.bytes === plan.candidate.bytes
      && record.master.exactByteCopy === true,
    "mastering record master identity drifted from the mastering plan.",
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
    "Frame body mastering plan does not recompile from its governed evidence.",
  );
  return freeze(plan);
}

export function normalizeHmfFrameBodyNamedHumanApproval(plan, raw, policy) {
  assertExactKeys(
    raw,
    ["actorId", "occurredAt", "approved", "rationale", "attestations"],
    "humanApproval",
  );
  const actorId = safeActorId(raw.actorId, "humanApproval.actorId");
  const occurredAt = canonicalTimestamp(raw.occurredAt, "humanApproval.occurredAt");
  assert(
    Date.parse(occurredAt) >= Date.parse(plan.receipt.occurredAt),
    "named-human approval may not occur before mastering completed.",
  );
  assert(
    raw.approved === true && policy.approvalRules.explicitApprovalRequired === true,
    "humanApproval.approved must be explicitly true.",
  );
  const rationale = boundedString(
    raw.rationale,
    "humanApproval.rationale",
    policy.approvalRules.minimumRationaleCharacters,
    policy.approvalRules.maximumRationaleCharacters,
  );
  const attestations = assertExactKeys(
    raw.attestations,
    [
      "masteringPlanSha256",
      "masteringRecordSha256",
      "masteredReceiptSha256",
      "masterSha256",
      "masterBytes",
      "exactMasterInspected",
      "approvalIsExplicitAndNamedHuman",
      "noPromotionAtlasGitDeploymentOrPublicationPerformed",
    ],
    "humanApproval.attestations",
  );
  assert(
    attestations.masteringPlanSha256 === plan.masteringPlanSha256,
    "approval attestation mastering-plan SHA drifted.",
  );
  assert(
    attestations.masteringRecordSha256
      === plan.masteringRecord.masteringRecordSha256,
    "approval attestation mastering-record SHA drifted.",
  );
  assert(
    attestations.masteredReceiptSha256 === plan.receipt.receiptSha256,
    "approval attestation mastered-receipt SHA drifted.",
  );
  assert(
    attestations.masterSha256 === plan.masteringRecord.master.sha256,
    "approval attestation master SHA drifted.",
  );
  assert(
    attestations.masterBytes === plan.masteringRecord.master.bytes,
    "approval attestation master byte count drifted.",
  );
  assert(attestations.exactMasterInspected === true, "approval must attest exact master inspection.");
  assert(
    attestations.approvalIsExplicitAndNamedHuman === true,
    "approval must attest an explicit named-human decision.",
  );
  assert(
    attestations.noPromotionAtlasGitDeploymentOrPublicationPerformed === true,
    "approval must preserve promotion, atlas, Git, deployment and publication boundaries.",
  );
  return freeze({
    actorClass: "human",
    actorId,
    occurredAt,
    approved: true,
    rationale,
    attestations: freeze({
      masteringPlanSha256: attestations.masteringPlanSha256,
      masteringRecordSha256: attestations.masteringRecordSha256,
      masteredReceiptSha256: attestations.masteredReceiptSha256,
      masterSha256: attestations.masterSha256,
      masterBytes: attestations.masterBytes,
      exactMasterInspected: true,
      approvalIsExplicitAndNamedHuman: true,
      noPromotionAtlasGitDeploymentOrPublicationPerformed: true,
    }),
  });
}
