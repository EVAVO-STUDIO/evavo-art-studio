import { heavyMetalFightingFrameBodyRole } from "./frame-body-role-grammar.mjs";
import {
  HMF_PRODUCTION_RECEIPT_SCHEMA,
  HMF_WORK_ORDER_PROTOCOL_VERSION,
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import {
  HMF_CANDIDATE_ADMISSION_PROTOCOL_VERSION,
  HMF_CANDIDATE_ADMISSION_RECORD_SCHEMA,
  HMF_FRAME_BODY_CREATIVE_REVIEW_PACKET_SCHEMA,
  HMF_FRAME_BODY_CREATIVE_REVIEW_PROTOCOL_VERSION,
  HMF_FRAME_BODY_DETERMINISTIC_QA_PROTOCOL_VERSION,
  HMF_FRAME_BODY_DETERMINISTIC_QA_REPORT_SCHEMA,
  SHA256,
  assert,
  assertForbiddenAuthorityFalse,
  canonical,
  creativeReviewPath,
  freeze,
  hashValue,
  loadPolicy,
  safeRelativePath,
  selfHashed,
  stableWorkspaceFile,
  stableWorkspaceJson,
  workspaceRoot,
} from "./frame-body-creative-review-common.mjs";

function validateProductionReceipt(input, expectedState, label) {
  const receipt = selfHashed(input, "receiptSha256", label);
  assert(receipt.schema === HMF_PRODUCTION_RECEIPT_SCHEMA && receipt.protocolVersion === HMF_WORK_ORDER_PROTOCOL_VERSION, `${label} schema or protocol drifted.`);
  assert(receipt.state === expectedState, `${label} must be ${expectedState}.`);
  assert(SHA256.test(String(receipt.evidenceSha256 ?? "")), `${label} evidence SHA is invalid.`);
  assert(SHA256.test(String(receipt.candidateSha256 ?? "")), `${label} candidate SHA is invalid.`);
  return receipt;
}
function validateQaReport(input) {
  const report = selfHashed(input, "qaReportSha256", "deterministic QA report");
  assert(report.schema === HMF_FRAME_BODY_DETERMINISTIC_QA_REPORT_SCHEMA && report.protocolVersion === HMF_FRAME_BODY_DETERMINISTIC_QA_PROTOCOL_VERSION, "creative review requires the governed deterministic QA report schema and protocol.");
  assert(report.projectId === "heavy-metal-fighting", "deterministic QA report project drifted.");
  assert(report.status === "passed", "creative review requires a passed deterministic QA report.");
  const receipt = validateProductionReceipt(report.receipt, "deterministic-qa-passed", "deterministic QA receipt");
  assert(report.productionReceiptStateAfterMaterialization === "deterministic-qa-passed", "deterministic QA report did not declare the QA-passed state.");
  assert(report.operatorNextAction === "run-creative-review", "deterministic QA report does not authorize the creative-review next action.");
  assert(SHA256.test(String(report.admissionRecordSha256 ?? "")), "deterministic QA report admission-record SHA is invalid.");
  assert(SHA256.test(String(report.candidateAdmissionReceiptSha256 ?? "")), "deterministic QA report candidate-admission receipt SHA is invalid.");
  assert(SHA256.test(String(report.candidateSha256 ?? "")), "deterministic QA report candidate SHA is invalid.");
  assert(report.qaEvidence && hashValue(report.qaEvidence) === report.qaEvidenceSha256, "deterministic QA evidence hash drifted.");
  assert(report.qaEvidence.status === "passed" && Array.isArray(report.qaEvidence.failureCodes) && report.qaEvidence.failureCodes.length === 0, "creative review cannot consume failed deterministic QA evidence.");
  assert(report.qaEvidence.policySha256 === report.policySha256, "deterministic QA evidence policy hash drifted from its report.");
  assert(report.qaEvidence.admissionRecordSha256 === report.admissionRecordSha256, "deterministic QA evidence admission-record hash drifted from its report.");
  assert(report.qaEvidence.candidateAdmissionReceiptSha256 === report.candidateAdmissionReceiptSha256, "deterministic QA evidence candidate-admission receipt hash drifted from its report.");
  assert(report.qaEvidence.candidateSha256 === report.candidateSha256, "deterministic QA evidence candidate hash drifted from its report.");
  assert(receipt.evidenceSha256 === report.qaEvidenceSha256 && receipt.candidateSha256 === report.candidateSha256, "deterministic QA receipt is not bound to its evidence and candidate.");
  assert(receipt.previousReceiptSha256 === report.candidateAdmissionReceiptSha256, "deterministic QA receipt is not linked to the candidate-admission receipt.");
  assertForbiddenAuthorityFalse(report.authority, "deterministic QA report", [
    "providerExecution",
    "providerRetry",
    "creativeReview",
    "repairAuthorization",
    "candidateApproval",
    "candidatePromotion",
    "targetRepositoryMutation",
    "gitMutation",
    "deployment",
    "publication",
  ]);
  return report;
}
function validateAdmissionRecord(input) {
  const record = selfHashed(input, "admissionRecordSha256", "candidate admission record");
  assert(record.schema === HMF_CANDIDATE_ADMISSION_RECORD_SCHEMA && record.protocolVersion === HMF_CANDIDATE_ADMISSION_PROTOCOL_VERSION, "candidate admission record schema or protocol drifted.");
  assert(record.projectId === "heavy-metal-fighting", "candidate admission record project drifted.");
  assert(SHA256.test(String(record.submissionManifestSha256 ?? "")), "candidate admission record lacks its provider submission manifest hash.");
  assert(SHA256.test(String(record.candidateSha256 ?? "")), "candidate admission record candidate SHA is invalid.");
  const receipt = validateProductionReceipt(record.receipt, "candidates-admitted", "candidate-admission receipt");
  assert(receipt.unitId === record.unitId && receipt.batchId === record.batchId && receipt.workOrderSha256 === record.workOrderSha256, "candidate-admission receipt is bound to another work order.");
  assert(receipt.attempt === record.attempt && receipt.candidateSha256 === record.candidateSha256, "candidate-admission receipt changed the attempt or candidate.");
  return record;
}

export async function validatedCreativeInputs(qaReportInput, workspaceRootInput, { completedReviewReceipt = null } = {}) {
  const report = validateQaReport(qaReportInput);
  const [order, policy] = await Promise.all([
    heavyMetalFightingProductionWorkOrder(report.unitId),
    loadPolicy(),
  ]);
  assert(order.assetContract.kind === policy.assetKind, "creative review policy is not bound to this work-order asset kind.");
  const allowedFailureCodes = new Set([...(order.failureCodes?.technical ?? []), ...(order.failureCodes?.style ?? [])]);
  assert(policy.criteria.every((criterion) => criterion.failureCodes.every((code) => allowedFailureCodes.has(code))), "creative review policy contains failure codes outside the immutable work order vocabulary.");
  assert(order.workOrderSha256 === report.workOrderSha256, "deterministic QA report is stale against the immutable work order.");
  assert(order.batchId === report.batchId && order.subjectId === report.frameId, "deterministic QA report identity drifted from the work order.");
  assert(Number.isInteger(report.bodySlot) && report.bodySlot >= 0, "deterministic QA report bodySlot is invalid.");
  const role = await heavyMetalFightingFrameBodyRole(report.frameId, report.bodySlot);
  assert(report.qaEvidence?.role?.semanticId === role.semanticId, "deterministic QA report semantic role drifted.");
  assert(report.qaEvidence?.role?.bankId === role.bankId && report.qaEvidence?.role?.phase === role.phase, "deterministic QA report role bank or phase drifted.");
  const root = await workspaceRoot(workspaceRootInput);
  const qaReportTarget = safeRelativePath(report.targets?.qaReport, "deterministic QA report target");
  const persistedReportFile = await stableWorkspaceJson(root, qaReportTarget, "persisted deterministic QA report");
  const persistedReport = validateQaReport(persistedReportFile.value);
  assert(persistedReport.qaReportSha256 === report.qaReportSha256 && canonical(persistedReport) === canonical(report), "supplied deterministic QA report differs from the persisted report.");
  const candidateTarget = safeRelativePath(report.targets?.candidate, "creative review candidate target");
  const candidate = await stableWorkspaceFile(root, candidateTarget, "QA-passed candidate");
  assert(candidate.sha256 === report.candidateSha256, "candidate bytes changed after deterministic QA.");
  const admissionTarget = safeRelativePath(report.targets?.admissionRecord, "candidate admission record target");
  const admissionFile = await stableWorkspaceJson(root, admissionTarget, "persisted candidate admission record");
  const admission = validateAdmissionRecord(admissionFile.value);
  assert(admission.admissionRecordSha256 === report.admissionRecordSha256, "candidate admission record changed after deterministic QA.");
  assert(admission.workOrderSha256 === order.workOrderSha256 && admission.unitId === order.unitId && admission.batchId === order.batchId, "candidate admission record is bound to another work order.");
  assert(admission.attempt === report.attempt && admission.candidateSha256 === candidate.sha256 && admission.candidateBytes === candidate.size, "candidate admission record no longer matches the reviewed candidate.");
  assert(report.candidateAdmissionReceiptSha256 === admission.receipt.receiptSha256, "deterministic QA report is bound to another candidate-admission receipt.");
  assert(report.qaEvidence.candidateBytes === candidate.size, "deterministic QA evidence candidate byte count drifted.");
  assert(admission.targets?.candidate === candidateTarget && admission.targets?.admissionRecord === admissionTarget, "candidate admission targets drifted.");
  const receiptTarget = safeRelativePath(report.targets?.receiptChain, "creative review receipt-chain target");
  assert(receiptTarget === order.executionPaths.receiptPath && admission.targets?.receiptChain === receiptTarget, "creative review receipt path drifted from the immutable work order.");
  const receiptFile = await stableWorkspaceJson(root, receiptTarget, "persisted production receipt chain");
  assert(Array.isArray(receiptFile.value), "persisted production receipt chain must be an array.");
  const receipts = freeze(receiptFile.value);
  const resume = await heavyMetalFightingProductionBatchResumePlan(order.batchId, receipts);
  const state = resume.unitStates.find((entry) => entry.unitId === order.unitId);
  const admittedReceipt = receipts.find((receipt) => receipt.receiptSha256 === admission.receipt.receiptSha256);
  assert(admittedReceipt && canonical(admittedReceipt) === canonical(admission.receipt), "candidate-admission receipt differs from the persisted receipt chain.");
  const head = receipts.at(-1);
  if (state?.currentState === "creative-review-passed") {
    assert(completedReviewReceipt, "production receipt chain already contains a creative review not authorized by this operation.");
    assert(state.nextAction === "select-or-request-repair", "completed creative review has an invalid next action.");
    assert(head?.receiptSha256 === completedReviewReceipt.receiptSha256 && canonical(head) === canonical(completedReviewReceipt), "persisted creative-review receipt differs from the governed decision.");
    const predecessor = receipts.at(-2);
    assert(predecessor?.receiptSha256 === report.receipt.receiptSha256 && canonical(predecessor) === canonical(report.receipt), "deterministic QA predecessor differs from the persisted chain.");
  } else {
    assert(state?.currentState === "deterministic-qa-passed" && state.nextAction === "run-creative-review", "production receipt chain is not ready for creative review.");
    assert(head?.receiptSha256 === report.receipt.receiptSha256 && canonical(head) === canonical(report.receipt), "deterministic QA receipt differs from the persisted chain head.");
  }
  assert(head.candidateSha256 === candidate.sha256 && head.attempt === report.attempt, "creative review receipt chain changed candidate or attempt.");
  return freeze({ root, report, order, role, policy, candidate, admission, receipts, receiptTarget, qaReportTarget });
}

function reviewContext(order, role) {
  const subject = order.subjectContract ?? {};
  return freeze({
    frameId: role.frameId,
    bodySlot: role.slot,
    bankId: role.bankId,
    bankPurpose: role.bankPurpose,
    semanticId: role.semanticId,
    roleId: role.roleId,
    phase: role.phase,
    hero: role.hero,
    contactRole: role.contactRole,
    holdPriority: role.holdPriority,
    motionIdentity: role.motionIdentity,
    motionCadence: role.motionCadence,
    bodyRules: role.bodyRules,
    recoveryRule: role.recoveryRule,
    fxSeparation: role.fxSeparation,
    frameCode: subject.code ?? null,
    frameEpithet: subject.epithet ?? null,
    silhouetteLocks: subject.silhouetteLocks ?? [],
    materialRamps: subject.materialRamps ?? [],
    motionRules: subject.motionRules ?? [],
    mirrorPolicy: subject.mirrorPolicy ?? null,
    forbiddenBodyEffectSubstitutions: subject.forbiddenBodyEffectSubstitutions ?? [],
    referenceBindings: order.referenceBindings,
  });
}

export async function compileHmfFrameBodyCreativeReviewPacket({ qaReport, workspaceRoot: workspaceRootInput } = {}) {
  const inputs = await validatedCreativeInputs(qaReport, workspaceRootInput);
  const target = creativeReviewPath(inputs.order, inputs.report.attempt);
  const body = {
    schema: HMF_FRAME_BODY_CREATIVE_REVIEW_PACKET_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_CREATIVE_REVIEW_PROTOCOL_VERSION,
    projectId: inputs.report.projectId,
    publicTitle: inputs.report.publicTitle,
    unitId: inputs.order.unitId,
    batchId: inputs.order.batchId,
    frameId: inputs.report.frameId,
    bodySlot: inputs.report.bodySlot,
    attempt: inputs.report.attempt,
    workspaceRoot: inputs.root,
    workOrderSha256: inputs.order.workOrderSha256,
    policySha256: inputs.policy.policySha256,
    qaReportSha256: inputs.report.qaReportSha256,
    qaEvidenceSha256: inputs.report.qaEvidenceSha256,
    admissionRecordSha256: inputs.admission.admissionRecordSha256,
    candidateAdmissionReceiptSha256: inputs.admission.receipt.receiptSha256,
    referenceManifestSha256: inputs.admission.submissionManifestSha256,
    candidate: freeze({ path: inputs.report.targets.candidate, sha256: inputs.candidate.sha256, bytes: inputs.candidate.size }),
    qaReport: inputs.report,
    previousReceipts: inputs.receipts,
    predecessorReceiptSha256: inputs.receipts.at(-1).receiptSha256,
    reviewContext: reviewContext(inputs.order, inputs.role),
    reviewModes: freeze(inputs.policy.reviewModes.map((mode) => freeze(structuredClone(mode)))),
    criteria: freeze(inputs.policy.criteria.map((criterion) => freeze(structuredClone(criterion)))),
    target: safeRelativePath(target, "creative review decision target"),
    nextLegalActionAfterCompletedReview: "select-or-request-repair",
    authority: freeze({
      packetCompilation: true,
      decisionCompilation: false,
      decisionPersistence: false,
      receiptPersistence: false,
      providerExecution: false,
      providerRetry: false,
      candidateMutation: false,
      automaticCreativeApproval: false,
      selection: false,
      repairAuthorization: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      namedHumanReviewerRequired: true,
      explicitWriteEnabledRuntimeRequired: true,
    }),
  };
  return freeze({ ...body, reviewPacketSha256: hashValue(body) });
}
