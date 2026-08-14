import {
  APPROVAL_PLAN_FIELDS,
  APPROVAL_RECORD_FIELDS,
  PRODUCTION_RECEIPT_FIELDS,
  assertAllowedApprovalKeys,
  assertExactApprovalKeys,
  snapshotApprovalJson,
} from "./frame-body-named-human-approval-snapshot.mjs";
import { freeze } from "./frame-body-delivery-readiness-common.mjs";

export { assertExactApprovalKeys as assertExactDeliveryReadinessKeys };

export const DELIVERY_READINESS_REQUEST_FIELDS = Object.freeze([
  "actorId",
  "occurredAt",
  "attestations",
]);

export const DELIVERY_READINESS_ATTESTATION_FIELDS = Object.freeze([
  "candidateSha256",
  "masterSha256",
  "approvalPlanSha256",
  "approvalRecordSha256",
  "approvedReceiptSha256",
  "exactApprovedMasterRevalidated",
  "approvalLineageAccepted",
  "noAtlasPromotionTargetGitOrPublicationPerformed",
]);

export const DELIVERY_READINESS_PLAN_FIELDS = Object.freeze([
  "schema",
  "protocolVersion",
  "projectId",
  "unitId",
  "batchId",
  "frameId",
  "bodySlot",
  "attempt",
  "workspaceRoot",
  "workOrderSha256",
  "policySha256",
  "approvalPlan",
  "previousReceipts",
  "master",
  "readinessRecord",
  "receipt",
  "targets",
  "completedReadinessState",
  "nextLegalAction",
  "authority",
  "readinessPlanSha256",
]);

export const DELIVERY_READINESS_RECORD_FIELDS = Object.freeze([
  "schema",
  "protocolVersion",
  "projectId",
  "unitId",
  "batchId",
  "frameId",
  "bodySlot",
  "attempt",
  "workspaceRoot",
  "workOrderSha256",
  "policySha256",
  "approvalPlanSha256",
  "approvalRecordSha256",
  "approvedReceiptSha256",
  "masteringPlanSha256",
  "masteringRecordSha256",
  "selectionDecisionSha256",
  "candidate",
  "master",
  "deliveryDescriptor",
  "compiler",
  "attestations",
  "occurredAt",
  "claims",
  "authority",
  "readinessRecordSha256",
]);

export function snapshotDeliveryReadinessRequest(value) {
  const captured = snapshotApprovalJson(value, "deliveryReadinessRequest", {
    maximumBytes: 64 * 1024,
  });
  assertExactApprovalKeys(
    captured,
    DELIVERY_READINESS_REQUEST_FIELDS,
    "deliveryReadinessRequest",
  );
  assertExactApprovalKeys(
    captured.attestations,
    DELIVERY_READINESS_ATTESTATION_FIELDS,
    "deliveryReadinessRequest.attestations",
  );
  return captured;
}

export function snapshotCompletedApprovalPlan(value) {
  const captured = snapshotApprovalJson(
    value,
    "completed Frame body named-human approval plan",
  );
  assertExactApprovalKeys(
    captured,
    APPROVAL_PLAN_FIELDS,
    "completed Frame body named-human approval plan",
  );
  assertExactApprovalKeys(
    captured.approvalRecord,
    APPROVAL_RECORD_FIELDS,
    "completed Frame body named-human approval record",
  );
  assertExactApprovalKeys(
    captured.receipt,
    PRODUCTION_RECEIPT_FIELDS,
    "named-human-approved receipt",
  );
  return captured;
}

export function snapshotDeliveryReadinessCompileRequest(value) {
  const captured = snapshotApprovalJson(
    value,
    "delivery-readiness compiler input",
  );
  assertAllowedApprovalKeys(
    captured,
    ["approvalPlan", "workspaceRoot", "readinessRequest"],
    ["approvalPlan", "readinessRequest"],
    "delivery-readiness compiler input",
  );
  return freeze({
    approvalPlan: snapshotCompletedApprovalPlan(captured.approvalPlan),
    workspaceRoot: captured.workspaceRoot,
    readinessRequest: snapshotDeliveryReadinessRequest(captured.readinessRequest),
  });
}

export function snapshotDeliveryReadinessDocumentRequest(value) {
  const captured = snapshotApprovalJson(
    value,
    "delivery-readiness document compiler input",
  );
  assertExactApprovalKeys(
    captured,
    ["approvalPlan", "previousReceipts", "workspaceRoot", "master", "readinessRequest"],
    "delivery-readiness document compiler input",
  );
  return freeze({
    ...captured,
    approvalPlan: snapshotCompletedApprovalPlan(captured.approvalPlan),
    readinessRequest: snapshotDeliveryReadinessRequest(captured.readinessRequest),
  });
}

export function snapshotDeliveryReadinessPlan(value) {
  const captured = snapshotApprovalJson(
    value,
    "Frame body delivery-readiness plan",
  );
  assertExactApprovalKeys(
    captured,
    DELIVERY_READINESS_PLAN_FIELDS,
    "Frame body delivery-readiness plan",
  );
  assertExactApprovalKeys(
    captured.readinessRecord,
    DELIVERY_READINESS_RECORD_FIELDS,
    "Frame body delivery-readiness record",
  );
  assertExactApprovalKeys(
    captured.receipt,
    PRODUCTION_RECEIPT_FIELDS,
    "delivery-ready receipt",
  );
  return captured;
}
