import {
  createHmfProductionReceipt,
  heavyMetalFightingProductionRepairTemplate,
} from "./work-orders.mjs";
import {
  HMF_FRAME_BODY_DETERMINISTIC_QA_PLAN_SCHEMA,
  HMF_FRAME_BODY_DETERMINISTIC_QA_PROTOCOL_VERSION,
  HMF_FRAME_BODY_DETERMINISTIC_QA_REPORT_SCHEMA,
  QA_ACTOR,
  assert,
  canonicalTimestamp,
  freeze,
  hashValue,
  loadPolicy,
  reviewReportPath,
} from "./frame-body-deterministic-qa-common.mjs";
import {
  discoveredPeerAdmissions,
  duplicateUnitIds,
  validateComparisonAdmissionRecord,
  validatedPersistedInputs,
} from "./frame-body-deterministic-qa-inputs.mjs";
import {
  decodeRgbaPng,
  deferredChecks,
  evaluateChecks,
  groundExpectation,
  pixelMetrics,
} from "./frame-body-deterministic-qa-png.mjs";

export async function compileHmfFrameBodyDeterministicQaPlan({
  admissionRecord,
  workspaceRoot: workspaceRootInput,
  comparisonAdmissionRecords = [],
  occurredAt = new Date().toISOString(),
} = {}) {
  assert(Array.isArray(comparisonAdmissionRecords), "comparisonAdmissionRecords must be an array.");
  const policy = await loadPolicy();
  const persisted = await validatedPersistedInputs(admissionRecord, workspaceRootInput, policy);
  const decoded = decodeRgbaPng(persisted.candidate.bytes);
  const metrics = pixelMetrics(decoded, policy);
  const explicitComparisons = comparisonAdmissionRecords.map((record) => validateComparisonAdmissionRecord(record, persisted.admissionRecord));
  const discovered = policy.duplicateScope.sameBatch ? await discoveredPeerAdmissions(persisted.root, persisted.order, persisted.admissionRecord) : [];
  const comparisonsByUnit = new Map([...discovered, ...explicitComparisons].map((record) => [record.unitId, record]));
  const duplicates = duplicateUnitIds(persisted.admissionRecord, [...comparisonsByUnit.values()]);
  const checks = evaluateChecks({ decoded, metrics, policy, order: persisted.order, role: persisted.role, duplicateUnitIds: duplicates });
  const failedChecks = freeze(checks.filter((entry) => entry.status === "failed"));
  const failureCodes = freeze([...new Set(failedChecks.map((entry) => entry.failureCode))]);
  const status = failedChecks.length === 0 ? "passed" : "failed";
  const occurred = canonicalTimestamp(occurredAt, "deterministic QA occurredAt");
  const evidenceBody = {
    schema: "evavo.heavy-metal-fighting-frame-body-deterministic-qa-evidence.v1",
    protocolVersion: HMF_FRAME_BODY_DETERMINISTIC_QA_PROTOCOL_VERSION,
    projectId: persisted.admissionRecord.projectId,
    unitId: persisted.order.unitId,
    batchId: persisted.order.batchId,
    frameId: persisted.admissionRecord.frameId,
    bodySlot: persisted.admissionRecord.bodySlot,
    attempt: persisted.admissionRecord.attempt,
    workOrderSha256: persisted.order.workOrderSha256,
    admissionRecordSha256: persisted.admissionRecord.admissionRecordSha256,
    candidateAdmissionReceiptSha256: persisted.admissionRecord.receipt.receiptSha256,
    candidateSha256: persisted.candidate.sha256,
    candidateBytes: persisted.candidate.size,
    policySha256: policy.policySha256,
    png: freeze({ ...decoded.ihdr, chunkTypes: decoded.chunkTypes }),
    metrics,
    role: freeze({
      frameId: persisted.role.frameId,
      slot: persisted.role.slot,
      bankId: persisted.role.bankId,
      roleId: persisted.role.roleId,
      semanticId: persisted.role.semanticId,
      phase: persisted.role.phase,
      hero: persisted.role.hero,
      contactRole: persisted.role.contactRole,
      holdPriority: persisted.role.holdPriority,
      groundExpectation: groundExpectation(persisted.role),
    }),
    duplicateComparison: freeze({ comparedUnitIds: freeze([...comparisonsByUnit.keys()].sort()), duplicateUnitIds: duplicates }),
    checks,
    failedChecks,
    failureCodes,
    deferredChecks: deferredChecks(policy),
    status,
    occurredAt: occurred,
  };
  const qaEvidenceSha256 = hashValue(evidenceBody);
  let receipt = null;
  if (status === "passed") {
    receipt = await createHmfProductionReceipt({
      unitId: persisted.order.unitId,
      state: "deterministic-qa-passed",
      attempt: persisted.admissionRecord.attempt,
      evidenceSha256: qaEvidenceSha256,
      candidateSha256: persisted.candidate.sha256,
      actorClass: QA_ACTOR.actorClass,
      actorId: QA_ACTOR.actorId,
      occurredAt: occurred,
    }, persisted.admissionRecord.receipt);
  }
  let repairTemplate = null;
  if (status === "failed" && persisted.admissionRecord.attempt <= persisted.order.candidatePolicy.maximumRepairAttempts) {
    repairTemplate = await heavyMetalFightingProductionRepairTemplate(persisted.order.unitId, {
      candidateSha256: persisted.candidate.sha256,
      failureCodes,
      attempt: persisted.admissionRecord.attempt,
    });
  }
  const reportTarget = reviewReportPath(persisted.order, persisted.admissionRecord.attempt);
  const operatorNextAction = status === "passed"
    ? "run-creative-review"
    : repairTemplate
      ? "request-named-human-bounded-repair-authorization"
      : "stop-repair-budget-exhausted";
  const reportBody = {
    schema: HMF_FRAME_BODY_DETERMINISTIC_QA_REPORT_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_DETERMINISTIC_QA_PROTOCOL_VERSION,
    projectId: persisted.admissionRecord.projectId,
    publicTitle: persisted.admissionRecord.publicTitle,
    unitId: persisted.order.unitId,
    batchId: persisted.order.batchId,
    frameId: persisted.admissionRecord.frameId,
    bodySlot: persisted.admissionRecord.bodySlot,
    attempt: persisted.admissionRecord.attempt,
    workOrderSha256: persisted.order.workOrderSha256,
    admissionRecordSha256: persisted.admissionRecord.admissionRecordSha256,
    candidateAdmissionReceiptSha256: persisted.admissionRecord.receipt.receiptSha256,
    candidateSha256: persisted.candidate.sha256,
    policySha256: policy.policySha256,
    qaEvidence: freeze(evidenceBody),
    qaEvidenceSha256,
    status,
    receipt,
    boundedRepairTemplate: repairTemplate,
    productionReceiptStateAfterMaterialization: status === "passed" ? "deterministic-qa-passed" : "candidates-admitted",
    operatorNextAction,
    targets: freeze({
      candidate: persisted.admissionRecord.targets.candidate,
      admissionRecord: persisted.admissionRecord.targets.admissionRecord,
      qaReport: reportTarget,
      receiptChain: persisted.admissionRecord.targets.receiptChain,
    }),
    authority: freeze({
      deterministicQa: true,
      reportPersistence: false,
      receiptPersistence: false,
      providerExecution: false,
      providerRetry: false,
      creativeReview: false,
      repairAuthorization: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      namedHumanRepairAuthorizationRequired: true,
    }),
  };
  const qaReport = freeze({ ...reportBody, qaReportSha256: hashValue(reportBody) });
  const planBody = {
    schema: HMF_FRAME_BODY_DETERMINISTIC_QA_PLAN_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_DETERMINISTIC_QA_PROTOCOL_VERSION,
    projectId: qaReport.projectId,
    unitId: qaReport.unitId,
    batchId: qaReport.batchId,
    frameId: qaReport.frameId,
    bodySlot: qaReport.bodySlot,
    attempt: qaReport.attempt,
    workspaceRoot: persisted.root,
    status: qaReport.status,
    comparisonAdmissionRecords: freeze(explicitComparisons),
    workOrderSha256: qaReport.workOrderSha256,
    admissionRecordSha256: qaReport.admissionRecordSha256,
    candidate: freeze({ path: persisted.admissionRecord.targets.candidate, sha256: persisted.candidate.sha256, bytes: persisted.candidate.size }),
    previousReceipts: persisted.receipts,
    qaReport,
    authority: freeze({
      planCompilation: true,
      reportPersistence: false,
      receiptPersistence: false,
      providerExecution: false,
      creativeReview: false,
      repairAuthorization: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      publication: false,
      explicitWriteEnabledRuntimeRequired: true,
    }),
  };
  return freeze({ ...planBody, qaPlanSha256: hashValue(planBody) });
}
