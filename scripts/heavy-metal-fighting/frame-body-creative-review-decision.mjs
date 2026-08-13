import { createHmfProductionReceipt } from "./work-orders.mjs";
import {
  HMF_FRAME_BODY_CREATIVE_REVIEW_DECISION_SCHEMA,
  HMF_FRAME_BODY_CREATIVE_REVIEW_PACKET_SCHEMA,
  HMF_FRAME_BODY_CREATIVE_REVIEW_PROTOCOL_VERSION,
  HMF_FRAME_BODY_CREATIVE_REVIEW_SELECTION_TEMPLATE_SCHEMA,
  HMF_FRAME_BODY_DETERMINISTIC_QA_REPORT_SCHEMA,
  SHA256,
  assert,
  assertForbiddenAuthorityFalse,
  boundedString,
  canonical,
  canonicalTimestamp,
  exactStringArray,
  freeze,
  hashValue,
  loadPolicy,
  safeActorId,
  sameStringSet,
  selfHashed,
} from "./frame-body-creative-review-common.mjs";

function normalizeCriterionResults(packet, rawResults, policy) {
  assert(Array.isArray(rawResults), "assessment.criterionResults must be an array.");
  assert(rawResults.length === packet.criteria.length, "assessment.criterionResults must cover every governed criterion exactly once.");
  const byId = new Map();
  for (const raw of rawResults) {
    assert(raw && typeof raw === "object" && !Array.isArray(raw), "each criterion result must be an object.");
    const id = boundedString(raw.id, "criterion result id", 3, 100);
    assert(!byId.has(id), `assessment.criterionResults contains duplicate ${id}.`);
    byId.set(id, raw);
  }
  return freeze(packet.criteria.map((criterion) => {
    const raw = byId.get(criterion.id);
    assert(raw, `assessment.criterionResults is missing ${criterion.id}.`);
    assert(policy.decisionRules.criterionStatuses.includes(raw.status), `${criterion.id} status must be pass or fail.`);
    const observation = boundedString(
      raw.observation,
      `${criterion.id}.observation`,
      policy.decisionRules.minimumObservationCharacters,
      policy.decisionRules.maximumObservationCharacters,
    );
    const failureCodes = exactStringArray(raw.failureCodes ?? [], `${criterion.id}.failureCodes`);
    const allowed = new Set(criterion.failureCodes);
    assert(failureCodes.every((code) => allowed.has(code)), `${criterion.id} contains a failure code outside its governed vocabulary.`);
    if (raw.status === "pass") assert(failureCodes.length === 0, `${criterion.id} pass may not carry failure codes.`);
    else assert(failureCodes.length >= 1, `${criterion.id} fail requires at least one governed failure code.`);
    return freeze({
      id: criterion.id,
      status: raw.status,
      observation,
      failureCodes: freeze([...failureCodes].sort()),
    });
  }));
}

export async function compileHmfFrameBodyCreativeReviewDecision({ packet: packetInput, assessment } = {}) {
  const packet = selfHashed(packetInput, "reviewPacketSha256", "creative review packet");
  assert(packet.schema === HMF_FRAME_BODY_CREATIVE_REVIEW_PACKET_SCHEMA && packet.protocolVersion === HMF_FRAME_BODY_CREATIVE_REVIEW_PROTOCOL_VERSION, "creative review packet schema or protocol drifted.");
  assert(packet.authority?.packetCompilation === true && packet.authority?.decisionCompilation === false && packet.authority?.namedHumanReviewerRequired === true, "creative review packet lost its compilation or named-human boundary.");
  assertForbiddenAuthorityFalse(packet.authority, "creative review packet");
  assert(packet.nextLegalActionAfterCompletedReview === "select-or-request-repair", "creative review packet next-action boundary drifted.");
  assert(packet.qaReport?.schema === HMF_FRAME_BODY_DETERMINISTIC_QA_REPORT_SCHEMA && packet.qaReport?.qaReportSha256 === packet.qaReportSha256, "creative review packet deterministic QA binding drifted.");
  assert(packet.qaReport?.candidateAdmissionReceiptSha256 === packet.candidateAdmissionReceiptSha256, "creative review packet candidate-admission receipt binding drifted.");
  assert(packet.qaReport?.candidateSha256 === packet.candidate?.sha256, "creative review packet candidate hash drifted from deterministic QA.");
  assert(SHA256.test(String(packet.referenceManifestSha256 ?? "")) && SHA256.test(String(packet.predecessorReceiptSha256 ?? "")), "creative review packet lineage hashes are invalid.");
  assert(Array.isArray(packet.previousReceipts) && packet.previousReceipts.at(-1)?.receiptSha256 === packet.predecessorReceiptSha256, "creative review packet predecessor receipt drifted from its supplied chain.");
  const policy = await loadPolicy();
  assert(packet.policySha256 === policy.policySha256, "creative review packet is stale against the governed policy.");
  assert(canonical(packet.reviewModes) === canonical(policy.reviewModes), "creative review packet review modes drifted from the governed policy.");
  assert(canonical(packet.criteria) === canonical(policy.criteria), "creative review packet criteria drifted from the governed policy.");
  assert(assessment && typeof assessment === "object" && !Array.isArray(assessment), "assessment must be an object.");
  const reviewerId = safeActorId(assessment.reviewerId, "assessment.reviewerId");
  const occurredAt = canonicalTimestamp(assessment.occurredAt, "assessment.occurredAt");
  assert(Date.parse(occurredAt) >= Date.parse(packet.qaReport.receipt.occurredAt), "creative review may not occur before deterministic QA passed.");
  const completedReviewModeIds = sameStringSet(
    assessment.completedReviewModeIds,
    packet.reviewModes.map((mode) => mode.id),
    "assessment.completedReviewModeIds",
  );
  const criterionResults = normalizeCriterionResults(packet, assessment.criterionResults, policy);
  const summary = boundedString(assessment.summary, "assessment.summary", policy.decisionRules.minimumObservationCharacters, policy.decisionRules.maximumSummaryCharacters);
  const attestations = assessment.attestations ?? {};
  assert(attestations.candidateSha256 === packet.candidate.sha256, "assessment attestation candidate SHA drifted.");
  assert(attestations.qaReportSha256 === packet.qaReportSha256, "assessment attestation QA report SHA drifted.");
  assert(attestations.referenceManifestSha256 === packet.referenceManifestSha256, "assessment attestation reference-manifest SHA drifted.");
  assert(attestations.independentNamedHumanReview === true, "assessment must attest an independent named-human review.");
  assert(attestations.noSelectionRepairAuthorizationOrPromotionPerformed === true, "assessment must preserve selection, repair-authorization and promotion boundaries.");
  const failedCriteria = freeze(criterionResults.filter((result) => result.status === "fail"));
  const failureCodes = freeze([...new Set(failedCriteria.flatMap((result) => result.failureCodes))].sort());
  const recommendedOutcome = failedCriteria.length === 0
    ? policy.decisionRules.recommendedOutcomeWhenAllPass
    : policy.decisionRules.recommendedOutcomeWhenAnyFail;
  assert(assessment.recommendedOutcome === recommendedOutcome, `assessment.recommendedOutcome must be ${recommendedOutcome} for these findings.`);
  const evidenceBody = {
    schema: "evavo.heavy-metal-fighting-frame-body-creative-review-evidence.v1",
    protocolVersion: HMF_FRAME_BODY_CREATIVE_REVIEW_PROTOCOL_VERSION,
    projectId: packet.projectId,
    unitId: packet.unitId,
    batchId: packet.batchId,
    frameId: packet.frameId,
    bodySlot: packet.bodySlot,
    attempt: packet.attempt,
    workOrderSha256: packet.workOrderSha256,
    policySha256: packet.policySha256,
    reviewPacketSha256: packet.reviewPacketSha256,
    qaReportSha256: packet.qaReportSha256,
    qaEvidenceSha256: packet.qaEvidenceSha256,
    admissionRecordSha256: packet.admissionRecordSha256,
    candidateAdmissionReceiptSha256: packet.candidateAdmissionReceiptSha256,
    referenceManifestSha256: packet.referenceManifestSha256,
    predecessorReceiptSha256: packet.predecessorReceiptSha256,
    candidateSha256: packet.candidate.sha256,
    reviewer: freeze({ actorClass: "human", actorId: reviewerId }),
    completedReviewModeIds,
    criterionResults,
    failedCriteria,
    failureCodes,
    summary,
    recommendedOutcome,
    attestations: freeze({
      candidateSha256: attestations.candidateSha256,
      qaReportSha256: attestations.qaReportSha256,
      referenceManifestSha256: attestations.referenceManifestSha256,
      independentNamedHumanReview: true,
      noSelectionRepairAuthorizationOrPromotionPerformed: true,
    }),
    occurredAt,
  };
  const reviewEvidenceSha256 = hashValue(evidenceBody);
  const receipt = await createHmfProductionReceipt({
    unitId: packet.unitId,
    state: policy.decisionRules.reviewCompletionReceiptState,
    attempt: packet.attempt,
    evidenceSha256: reviewEvidenceSha256,
    candidateSha256: packet.candidate.sha256,
    actorClass: "human",
    actorId: reviewerId,
    occurredAt,
  }, packet.previousReceipts.at(-1));
  const selectionTemplateBody = {
    schema: HMF_FRAME_BODY_CREATIVE_REVIEW_SELECTION_TEMPLATE_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_CREATIVE_REVIEW_PROTOCOL_VERSION,
    projectId: packet.projectId,
    unitId: packet.unitId,
    batchId: packet.batchId,
    attempt: packet.attempt,
    workOrderSha256: packet.workOrderSha256,
    candidateSha256: packet.candidate.sha256,
    candidateAdmissionReceiptSha256: packet.candidateAdmissionReceiptSha256,
    creativeReviewReceiptSha256: receipt.receiptSha256,
    reviewEvidenceSha256,
    recommendedOutcome,
    failureCodes,
    allowedOutcomes: freeze(["selected", "repair-requested"]),
    requiredActorClass: "human",
    nextReceiptState: "selected-or-repair-requested",
    authority: freeze({
      recommendationOnly: true,
      selection: false,
      repairAuthorization: false,
      receiptPersistence: false,
      candidateMutation: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      publication: false,
    }),
  };
  const selectionDecisionTemplate = freeze({ ...selectionTemplateBody, selectionDecisionTemplateSha256: hashValue(selectionTemplateBody) });
  const body = {
    schema: HMF_FRAME_BODY_CREATIVE_REVIEW_DECISION_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_CREATIVE_REVIEW_PROTOCOL_VERSION,
    projectId: packet.projectId,
    unitId: packet.unitId,
    batchId: packet.batchId,
    frameId: packet.frameId,
    bodySlot: packet.bodySlot,
    attempt: packet.attempt,
    workspaceRoot: packet.workspaceRoot,
    workOrderSha256: packet.workOrderSha256,
    policySha256: packet.policySha256,
    reviewPacket: packet,
    reviewEvidence: freeze(evidenceBody),
    reviewEvidenceSha256,
    receipt,
    selectionDecisionTemplate,
    target: packet.target,
    completedReviewState: "creative-review-passed",
    nextLegalAction: "select-or-request-repair",
    recommendedOutcome,
    authority: freeze({
      decisionCompilation: true,
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
  return freeze({ ...body, creativeReviewDecisionSha256: hashValue(body) });
}
