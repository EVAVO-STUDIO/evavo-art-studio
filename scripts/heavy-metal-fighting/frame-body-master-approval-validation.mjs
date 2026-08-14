import {
  HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PLAN_SCHEMA,
  HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PROTOCOL_VERSION,
  HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_RECORD_SCHEMA,
} from "./frame-body-selected-candidate-mastering.mjs";
import { compileHmfFrameBodySelectedCandidateMasteringPlanDocument } from "./frame-body-selected-candidate-mastering-plan.mjs";
import {
  assert,
  boundedString,
  canonical,
  canonicalTimestamp,
  freeze,
  safeActorId,
  selfHashed,
} from "./frame-body-master-approval-common.mjs";

const MASTERING_FORBIDDEN_AUTHORITY = Object.freeze([
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
]);

function assertAuthorityFalse(authority, label, keys) {
  assert(
    authority && typeof authority === "object" && !Array.isArray(authority),
    `${label} authority must be an object.`,
  );
  for (const key of keys) {
    assert(authority[key] === false, `${label} gained forbidden authority: ${key}.`);
  }
}

export async function validateHmfFrameBodyMasteringPlanForApproval(input) {
  const plan = selfHashed(
    input,
    "masteringPlanSha256",
    "selected-candidate mastering plan",
  );
  assert(
    plan.schema === HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PLAN_SCHEMA
      && plan.protocolVersion
        === HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PROTOCOL_VERSION,
    "selected-candidate mastering plan schema or protocol drifted.",
  );
  assert(
    plan.completedMasteringState === "mastered"
      && plan.nextLegalAction === "request-named-human-approval",
    "mastering plan is not ready for named-human approval.",
  );
  assert(
    plan.authority?.planCompilation === true
      && plan.authority?.selectedCandidateRead === true
      && plan.authority?.explicitWriteEnabledRuntimeRequired === true,
    "mastering plan lost its governed compilation boundary.",
  );
  assertAuthorityFalse(
    plan.authority,
    "selected-candidate mastering plan",
    MASTERING_FORBIDDEN_AUTHORITY,
  );

  const record = selfHashed(
    plan.masteringRecord,
    "masteringRecordSha256",
    "selected-candidate mastering record",
  );
  assert(
    record.schema === HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_RECORD_SCHEMA
      && record.protocolVersion
        === HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PROTOCOL_VERSION,
    "selected-candidate mastering record schema or protocol drifted.",
  );
  assertAuthorityFalse(
    record.authority,
    "selected-candidate mastering record",
    MASTERING_FORBIDDEN_AUTHORITY,
  );
  assert(
    record.claims?.exactCandidateBytesRequired === true
      && record.claims?.exactPostWriteReadbackRequired === true
      && record.claims?.namedHumanApprovalPerformed === false
      && record.claims?.gameRepositoryPromotionPerformed === false,
    "mastering record claims drifted before approval.",
  );

  const receipt = selfHashed(plan.receipt, "receiptSha256", "mastered receipt");
  assert(
    receipt.state === "mastered"
      && receipt.outcome === null
      && receipt.actorClass === "system",
    "mastered receipt state, outcome or actor class drifted.",
  );
  assert(
    receipt.evidenceSha256 === record.masteringRecordSha256
      && receipt.candidateSha256 === plan.candidate?.sha256
      && receipt.previousReceiptSha256
        === plan.selectionDecision?.receipt?.receiptSha256,
    "mastered receipt is not bound to the exact mastering record and selected candidate.",
  );
  assert(
    record.selectionDecisionSha256
      === plan.selectionDecision?.selectionDecisionSha256
      && record.selectionReceiptSha256
        === plan.selectionDecision?.receipt?.receiptSha256
      && record.selectionEvidenceSha256
        === plan.selectionDecision?.selectionEvidenceSha256,
    "mastering record selection lineage drifted.",
  );
  assert(
    record.candidate?.path === plan.candidate?.path
      && record.candidate?.sha256 === plan.candidate?.sha256
      && record.candidate?.bytes === plan.candidate?.bytes
      && record.master?.path === plan.targets?.masterFile
      && record.master?.sha256 === plan.candidate?.sha256
      && record.master?.bytes === plan.candidate?.bytes
      && record.master?.exactByteCopy === true,
    "mastering record candidate or master identity drifted.",
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
    "selected-candidate mastering plan does not recompile from governed evidence.",
  );

  return freeze({ plan, record, receipt });
}

export function normalizeHmfFrameBodyHumanMasterApproval(plan, raw, policy) {
  assert(
    raw && typeof raw === "object" && !Array.isArray(raw),
    "humanApproval must be an object.",
  );
  const actorId = safeActorId(raw.actorId, "humanApproval.actorId");
  const occurredAt = canonicalTimestamp(
    raw.occurredAt,
    "humanApproval.occurredAt",
  );
  assert(
    Date.parse(occurredAt) >= Date.parse(plan.receipt.occurredAt),
    "master approval may not occur before mastering completed.",
  );
  assert(
    raw.decision === policy.approvalRules.requiredDecision,
    "master approval decision must be approved; a refusal leaves the unit mastered and unapproved.",
  );
  const rationale = boundedString(
    raw.rationale,
    "humanApproval.rationale",
    policy.approvalRules.minimumRationaleCharacters,
    policy.approvalRules.maximumRationaleCharacters,
  );
  const attestations = raw.attestations ?? {};
  const exact = {
    candidateSha256: plan.candidate.sha256,
    masterSha256: plan.masteringRecord.master.sha256,
    masteringPlanSha256: plan.masteringPlanSha256,
    masteringRecordSha256: plan.masteringRecord.masteringRecordSha256,
    masteredReceiptSha256: plan.receipt.receiptSha256,
  };
  for (const [key, expected] of Object.entries(exact)) {
    assert(
      attestations[key] === expected,
      `master approval attestation ${key} drifted.`,
    );
  }
  for (const key of [
    "reviewedExactMasterAtNativeScale",
    "reviewedExactMasterAtGameplayScale",
    "reviewedExactMasterAtThumbnailScale",
    "reviewedExactMasterInSilhouette",
    "reviewedExactMasterInGrayscale",
    "frameIdentityApproved",
    "silhouetteApproved",
    "materialReadabilityApproved",
    "motionRoleReadabilityApproved",
    "noAutomaticApprovalDeliveryPromotionOrPublicationPerformed",
  ]) {
    assert(attestations[key] === true, `master approval attestation ${key} is required.`);
  }
  return freeze({
    actorClass: "human",
    actorId,
    occurredAt,
    decision: "approved",
    rationale,
    attestations: freeze({
      ...exact,
      reviewedExactMasterAtNativeScale: true,
      reviewedExactMasterAtGameplayScale: true,
      reviewedExactMasterAtThumbnailScale: true,
      reviewedExactMasterInSilhouette: true,
      reviewedExactMasterInGrayscale: true,
      frameIdentityApproved: true,
      silhouetteApproved: true,
      materialReadabilityApproved: true,
      motionRoleReadabilityApproved: true,
      noAutomaticApprovalDeliveryPromotionOrPublicationPerformed: true,
    }),
  });
}
