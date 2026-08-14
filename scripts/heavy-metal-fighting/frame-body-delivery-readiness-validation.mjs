import { compileHmfFrameBodyNamedHumanApprovalPlanDocument } from "./frame-body-named-human-approval-plan.mjs";
import {
  HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PLAN_SCHEMA,
  HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PROTOCOL_VERSION,
  HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_RECORD_SCHEMA,
  assertForbiddenAuthorityFalse,
} from "./frame-body-named-human-approval-common.mjs";
import {
  assert,
  canonical,
  canonicalTimestamp,
  freeze,
  safeActorId,
  selfHashed,
} from "./frame-body-delivery-readiness-common.mjs";
import {
  snapshotCompletedApprovalPlan,
  snapshotDeliveryReadinessRequest,
} from "./frame-body-delivery-readiness-snapshot.mjs";

function assertApprovalPlanAuthority(plan) {
  const authority = plan.authority ?? {};
  assert(
    authority.planCompilation === true
      && authority.masterRead === true
      && authority.masteringRecordRead === true
      && authority.namedHumanApproverRequired === true
      && authority.explicitWriteEnabledRuntimeRequired === true,
    "named-human approval plan lost its governed compilation, read, human or explicit-write boundary.",
  );
  assertForbiddenAuthorityFalse(authority, "named-human approval plan");
}

function assertApprovalRecordAuthority(record) {
  assertForbiddenAuthorityFalse(record.authority, "named-human approval record");
}

export async function validateHmfFrameBodyCompletedNamedHumanApprovalPlan(input) {
  const captured = snapshotCompletedApprovalPlan(input);
  const plan = selfHashed(
    captured,
    "approvalPlanSha256",
    "completed Frame body named-human approval plan",
  );
  assert(
    plan.schema === HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PLAN_SCHEMA
      && plan.protocolVersion === HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PROTOCOL_VERSION,
    "completed named-human approval plan schema or protocol drifted.",
  );
  assertApprovalPlanAuthority(plan);
  assert(
    plan.completedApprovalState === "named-human-approved"
      && plan.nextLegalAction === "compile-delivery-readiness",
    "named-human approval plan is not ready for delivery-readiness compilation.",
  );

  const record = selfHashed(
    plan.approvalRecord,
    "approvalRecordSha256",
    "completed Frame body named-human approval record",
  );
  assert(
    record.schema === HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_RECORD_SCHEMA
      && record.protocolVersion === HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PROTOCOL_VERSION,
    "completed named-human approval record schema or protocol drifted.",
  );
  assertApprovalRecordAuthority(record);
  assert(
    record.decision === "approved"
      && record.approver?.actorClass === "human"
      && typeof record.approver.actorId === "string",
    "completed named-human approval record lost its explicit human approval.",
  );
  assert(
    record.claims?.exactMasterInspected === true
      && record.claims?.exactMasterMatchesSelectedCandidate === true
      && record.claims?.masteringLineageAccepted === true
      && record.claims?.independentNamedHumanApproval === true
      && record.claims?.masterMutationPerformed === false
      && record.claims?.gameRepositoryPromotionPerformed === false
      && record.claims?.deliveryReadinessCompiled === false,
    "completed named-human approval claims drifted.",
  );
  assert(
    record.master?.path === plan.master?.path
      && record.master.sha256 === plan.master.sha256
      && record.master.bytes === plan.master.bytes
      && record.master.sha256 === plan.masteringPlan?.candidate?.sha256,
    "completed named-human approval record is not bound to the exact approved master.",
  );

  const receipt = selfHashed(
    plan.receipt,
    "receiptSha256",
    "named-human-approved production receipt",
  );
  assert(
    receipt.state === "named-human-approved"
      && receipt.outcome === null
      && receipt.actorClass === "human",
    "named-human-approved receipt state, outcome or actor class drifted.",
  );
  assert(
    receipt.actorId === record.approver.actorId
      && receipt.evidenceSha256 === record.approvalRecordSha256
      && receipt.candidateSha256 === plan.master.sha256
      && receipt.previousReceiptSha256 === plan.masteringPlan?.receipt?.receiptSha256,
    "named-human-approved receipt is not bound to its approver, evidence, master and mastered predecessor.",
  );
  assert(
    record.masteringPlanSha256 === plan.masteringPlan?.masteringPlanSha256
      && record.masteringRecordSha256
        === plan.masteringPlan?.masteringRecord?.masteringRecordSha256
      && record.masteredReceiptSha256 === plan.masteringPlan?.receipt?.receiptSha256
      && record.selectionDecisionSha256
        === plan.masteringPlan?.selectionDecision?.selectionDecisionSha256,
    "named-human approval lineage drifted before delivery readiness.",
  );

  const reconstructed = await compileHmfFrameBodyNamedHumanApprovalPlanDocument({
    masteringPlan: plan.masteringPlan,
    previousReceipts: plan.previousReceipts,
    workspaceRoot: plan.workspaceRoot,
    master: plan.master,
    humanApproval: {
      actorId: record.approver.actorId,
      occurredAt: record.occurredAt,
      decision: record.decision,
      rationale: record.rationale,
      attestations: record.attestations,
    },
  });
  assert(
    reconstructed.approvalPlanSha256 === plan.approvalPlanSha256
      && canonical(reconstructed) === canonical(plan),
    "completed named-human approval plan does not recompile from its governed evidence.",
  );
  return freeze(plan);
}

export function normalizeHmfFrameBodyDeliveryReadinessRequest(
  approval,
  rawInput,
  policy,
) {
  const raw = snapshotDeliveryReadinessRequest(rawInput);
  const actorId = safeActorId(raw.actorId, "deliveryReadinessRequest.actorId");
  const occurredAt = canonicalTimestamp(
    raw.occurredAt,
    "deliveryReadinessRequest.occurredAt",
  );
  assert(
    Date.parse(occurredAt) >= Date.parse(approval.receipt.occurredAt),
    "delivery readiness may not compile before named-human approval completed.",
  );
  const attestations = raw.attestations;
  assert(
    attestations.candidateSha256 === approval.masteringPlan.candidate.sha256,
    "delivery-readiness attestation candidate SHA drifted.",
  );
  assert(
    attestations.masterSha256 === approval.master.sha256,
    "delivery-readiness attestation master SHA drifted.",
  );
  assert(
    attestations.approvalPlanSha256 === approval.approvalPlanSha256,
    "delivery-readiness attestation approval-plan SHA drifted.",
  );
  assert(
    attestations.approvalRecordSha256 === approval.approvalRecord.approvalRecordSha256,
    "delivery-readiness attestation approval-record SHA drifted.",
  );
  assert(
    attestations.approvedReceiptSha256 === approval.receipt.receiptSha256,
    "delivery-readiness attestation approved-receipt SHA drifted.",
  );
  assert(
    attestations.exactApprovedMasterRevalidated === true,
    "delivery readiness must attest that the exact approved master was revalidated.",
  );
  assert(
    attestations.approvalLineageAccepted === true,
    "delivery readiness must attest that the complete approval lineage was accepted.",
  );
  assert(
    attestations.noAtlasPromotionTargetGitOrPublicationPerformed === true,
    "delivery readiness must preserve atlas, promotion, target-repository, Git and publication boundaries.",
  );
  assert(
    policy.readinessRules.requiredActorClass === "system",
    "delivery-readiness policy lost its system-actor boundary.",
  );
  return freeze({
    actorClass: "system",
    actorId,
    occurredAt,
    attestations: freeze({
      candidateSha256: attestations.candidateSha256,
      masterSha256: attestations.masterSha256,
      approvalPlanSha256: attestations.approvalPlanSha256,
      approvalRecordSha256: attestations.approvalRecordSha256,
      approvedReceiptSha256: attestations.approvedReceiptSha256,
      exactApprovedMasterRevalidated: true,
      approvalLineageAccepted: true,
      noAtlasPromotionTargetGitOrPublicationPerformed: true,
    }),
  });
}
