import { freeze } from "./frame-body-delivery-readiness-common.mjs";
import {
  assertExactApprovalKeys,
  snapshotApprovalJson,
  snapshotApprovalPlan,
} from "./frame-body-named-human-approval-snapshot.mjs";

export const READINESS_REQUEST_FIELDS = Object.freeze([
  "actorId",
  "occurredAt",
  "attestations",
]);

export const READINESS_ATTESTATION_FIELDS = Object.freeze([
  "approvalPlanSha256",
  "approvalRecordSha256",
  "namedHumanApprovedReceiptSha256",
  "masterSha256",
  "exactApprovedMasterRevalidated",
  "deliveryMetadataRevalidated",
  "noDeliveryPromotionAtlasGitOrPublicationPerformed",
]);

export const READINESS_PLAN_FIELDS = Object.freeze([
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

export const READINESS_RECORD_FIELDS = Object.freeze([
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
  "namedHumanApprovedReceiptSha256",
  "masteringPlanSha256",
  "masteringRecordSha256",
  "masteredReceiptSha256",
  "selectionDecisionSha256",
  "selectionReceiptSha256",
  "candidateSha256",
  "master",
  "deliveryContract",
  "executor",
  "attestations",
  "occurredAt",
  "claims",
  "authority",
  "readinessRecordSha256",
]);

export const PRODUCTION_RECEIPT_FIELDS = Object.freeze([
  "schema",
  "protocolVersion",
  "unitId",
  "batchId",
  "workOrderSha256",
  "state",
  "attempt",
  "evidenceSha256",
  "candidateSha256",
  "outcome",
  "actorClass",
  "actorId",
  "occurredAt",
  "previousReceiptSha256",
  "receiptSha256",
]);

export function snapshotReadinessRequest(value) {
  const captured = snapshotApprovalJson(value, "delivery-readiness request", {
    maximumBytes: 64 * 1024,
  });
  assertExactApprovalKeys(captured, READINESS_REQUEST_FIELDS, "delivery-readiness request");
  assertExactApprovalKeys(
    captured.attestations,
    READINESS_ATTESTATION_FIELDS,
    "delivery-readiness request attestations",
  );
  return captured;
}

export function snapshotReadinessCompileRequest(value) {
  const captured = snapshotApprovalJson(value, "delivery-readiness compiler input");
  assertExactApprovalKeys(
    captured,
    ["approvalPlan", "workspaceRoot", "readinessRequest"],
    "delivery-readiness compiler input",
  );
  return freeze({
    approvalPlan: snapshotApprovalPlan(captured.approvalPlan),
    workspaceRoot: captured.workspaceRoot,
    readinessRequest: snapshotReadinessRequest(captured.readinessRequest),
  });
}

export function snapshotReadinessDocumentRequest(value) {
  const captured = snapshotApprovalJson(value, "delivery-readiness document compiler input");
  assertExactApprovalKeys(
    captured,
    ["approvalPlan", "previousReceipts", "workspaceRoot", "master", "readinessRequest"],
    "delivery-readiness document compiler input",
  );
  assertExactApprovalKeys(captured.master, ["path", "sha256", "bytes"], "delivery-readiness master");
  return freeze({
    ...captured,
    approvalPlan: snapshotApprovalPlan(captured.approvalPlan),
    readinessRequest: snapshotReadinessRequest(captured.readinessRequest),
  });
}

export function snapshotReadinessPlan(value) {
  const captured = snapshotApprovalJson(value, "Frame body delivery-readiness plan");
  assertExactApprovalKeys(captured, READINESS_PLAN_FIELDS, "Frame body delivery-readiness plan");
  assertExactApprovalKeys(
    captured.readinessRecord,
    READINESS_RECORD_FIELDS,
    "Frame body delivery-readiness record",
  );
  assertExactApprovalKeys(captured.receipt, PRODUCTION_RECEIPT_FIELDS, "delivery-ready receipt");
  return captured;
}
