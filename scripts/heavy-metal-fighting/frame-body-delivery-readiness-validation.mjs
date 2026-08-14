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
import { snapshotApprovalPlan } from "./frame-body-named-human-approval-snapshot.mjs";
import { snapshotReadinessRequest } from "./frame-body-delivery-readiness-snapshot.mjs";

export async function validateHmfFrameBodyNamedHumanApprovalPlanForReadiness(input) {
  const captured = snapshotApprovalPlan(input);
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
  assert(
    plan.completedApprovalState === "named-human-approved"
      && plan.nextLegalAction === "compile-delivery-readiness",
    "named-human approval plan is not ready for delivery-readiness compilation.",
  );
  assert(
    plan.authority?.planCompilation === true
      && plan.authority?.masterRead === true
      && plan.authority?.masteringRecordRead === true
      && plan.authority?.namedHumanApproverRequired === true
      && plan.authority?.explicitWriteEnabledRuntimeRequired === true,
    "named-human approval plan lost its governed compilation boundary.",
  );
  assertForbiddenAuthorityFalse(plan.authority, "named-human approval plan");

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
  assertForbiddenAuthorityFalse(record.authority, "named-human approval record");
  assert(
    record.approver?.actorClass === "human"
      && record.decision === "approved"
      && record.claims?.exactMasterInspected === true
      && record.claims?.exactMasterMatchesSelectedCandidate === true
      && record.claims?.masteringLineageAccepted === true
      && record.claims?.independentNamedHumanApproval === true
      && record.claims?.masterMutationPerformed === false
      && record.claims?.gameRepositoryPromotionPerformed === false
      && record.claims?.deliveryReadinessCompiled === false,
    "named-human approval record is not a closed approved predecessor.",
  );

  const receipt = selfHashed(
    plan.receipt,
    "receiptSha256",
    "named-human-approved production receipt",
  );
  assert(
    receipt.state === "named-human-approved"
      && receipt.outcome === null
      && receipt.actorClass === "human"
      && receipt.actorId === record.approver.actorId,
    "named-human-approved receipt identity drifted.",
  );
  assert(
    receipt.evidenceSha256 === record.approvalRecordSha256
      && receipt.candidateSha256 === plan.master.sha256
      && receipt.previousReceiptSha256 === plan.masteringPlan.receipt.receiptSha256,
    "named-human-approved receipt is not bound to the exact approval and master.",
  );
  assert(
    record.master.sha256 === plan.master.sha256
      && record.master.bytes === plan.master.bytes
      && record.master.path === plan.master.path
      && record.masteringPlanSha256 === plan.masteringPlan.masteringPlanSha256
      && record.masteringRecordSha256 === plan.masteringPlan.masteringRecord.masteringRecordSha256
      && record.masteredReceiptSha256 === plan.masteringPlan.receipt.receiptSha256,
    "named-human approval record mastering or master lineage drifted.",
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
    "named-human approval plan does not recompile from governed evidence.",
  );
  return freeze({ plan, record, receipt });
}

export function normalizeHmfFrameBodyDeliveryReadinessRequest(approvalPlan, raw, policy) {
  const captured = snapshotReadinessRequest(raw);
  const actorId = safeActorId(captured.actorId, "readinessRequest.actorId");
  const occurredAt = canonicalTimestamp(captured.occurredAt, "readinessRequest.occurredAt");
  assert(
    Date.parse(occurredAt) >= Date.parse(approvalPlan.receipt.occurredAt),
    "delivery readiness may not be compiled before named-human approval completed.",
  );
  assert(
    policy.readinessRules.requiredActorClass === "system",
    "delivery-readiness policy lost its system actor boundary.",
  );
  const attestations = captured.attestations;
  const expected = {
    approvalPlanSha256: approvalPlan.approvalPlanSha256,
    approvalRecordSha256: approvalPlan.approvalRecord.approvalRecordSha256,
    namedHumanApprovedReceiptSha256: approvalPlan.receipt.receiptSha256,
    masterSha256: approvalPlan.master.sha256,
  };
  for (const [key, value] of Object.entries(expected)) {
    assert(attestations[key] === value, `delivery-readiness attestation ${key} drifted.`);
  }
  assert(
    attestations.exactApprovedMasterRevalidated === true
      && attestations.deliveryMetadataRevalidated === true
      && attestations.noDeliveryPromotionAtlasGitOrPublicationPerformed === true,
    "delivery-readiness attestations are incomplete.",
  );
  return freeze({
    actorClass: "system",
    actorId,
    occurredAt,
    attestations: freeze({
      ...expected,
      exactApprovedMasterRevalidated: true,
      deliveryMetadataRevalidated: true,
      noDeliveryPromotionAtlasGitOrPublicationPerformed: true,
    }),
  });
}
