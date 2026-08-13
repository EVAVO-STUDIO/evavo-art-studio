import { compileHmfFrameBodyCreativeReviewDecision } from "./frame-body-creative-review-decision.mjs";
import {
  HMF_FRAME_BODY_CREATIVE_REVIEW_DECISION_SCHEMA,
  HMF_FRAME_BODY_CREATIVE_REVIEW_PACKET_SCHEMA,
  HMF_FRAME_BODY_CREATIVE_REVIEW_PROTOCOL_VERSION,
  HMF_FRAME_BODY_CREATIVE_REVIEW_SELECTION_TEMPLATE_SCHEMA,
  assert,
  boundedString,
  canonical,
  canonicalTimestamp,
  freeze,
  hashValue,
  safeActorId,
  selfHashed,
} from "./frame-body-selection-decision-common.mjs";

function assertCreativeAuthority(decision) {
  const authority = decision.authority ?? {};
  for (const key of [
    "providerExecution", "providerRetry", "candidateMutation", "automaticCreativeApproval",
    "selection", "repairAuthorization", "candidatePromotion", "targetRepositoryMutation",
    "gitMutation", "deployment", "publication",
  ]) assert(authority[key] === false, `creative review decision gained forbidden authority: ${key}.`);
  assert(
    authority.decisionCompilation === true
      && authority.explicitWriteEnabledRuntimeRequired === true
      && authority.namedHumanReviewerRequired === true,
    "creative review decision lost its governed compilation boundary.",
  );
}
function assertTemplateAuthority(template) {
  const authority = template.authority ?? {};
  assert(authority.recommendationOnly === true, "selection decision template must remain recommendation-only.");
  for (const key of [
    "selection", "repairAuthorization", "receiptPersistence", "candidateMutation",
    "candidatePromotion", "targetRepositoryMutation", "gitMutation", "publication",
  ]) assert(authority[key] === false, `selection decision template gained forbidden authority: ${key}.`);
}

export async function validateHmfFrameBodyCreativeReviewDecision(input) {
  const decision = selfHashed(input, "creativeReviewDecisionSha256", "creative review decision");
  assert(
    decision.schema === HMF_FRAME_BODY_CREATIVE_REVIEW_DECISION_SCHEMA
      && decision.protocolVersion === HMF_FRAME_BODY_CREATIVE_REVIEW_PROTOCOL_VERSION,
    "creative review decision schema or protocol drifted.",
  );
  assertCreativeAuthority(decision);
  assert(
    decision.completedReviewState === "creative-review-passed"
      && decision.nextLegalAction === "select-or-request-repair",
    "creative review decision is not ready for selection.",
  );
  const packet = selfHashed(decision.reviewPacket, "reviewPacketSha256", "creative review packet");
  assert(
    packet.schema === HMF_FRAME_BODY_CREATIVE_REVIEW_PACKET_SCHEMA
      && packet.protocolVersion === HMF_FRAME_BODY_CREATIVE_REVIEW_PROTOCOL_VERSION,
    "creative review packet schema or protocol drifted.",
  );
  assert(
    packet.unitId === decision.unitId && packet.batchId === decision.batchId && packet.attempt === decision.attempt,
    "creative review packet identity drifted from its decision.",
  );
  assert(packet.candidate?.sha256 === decision.reviewEvidence?.candidateSha256, "creative review candidate hash drifted from its evidence.");
  assert(hashValue(decision.reviewEvidence) === decision.reviewEvidenceSha256, "creative review evidence hash drifted.");
  assert(
    decision.receipt?.state === "creative-review-passed" && decision.receipt.actorClass === "human",
    "creative review decision lacks its named-human completion receipt.",
  );
  assert(
    decision.receipt.evidenceSha256 === decision.reviewEvidenceSha256
      && decision.receipt.candidateSha256 === packet.candidate.sha256,
    "creative review receipt is not bound to the exact evidence and candidate.",
  );
  assert(decision.receipt.previousReceiptSha256 === packet.predecessorReceiptSha256, "creative review receipt predecessor drifted.");
  const template = selfHashed(
    decision.selectionDecisionTemplate,
    "selectionDecisionTemplateSha256",
    "selection decision template",
  );
  assert(
    template.schema === HMF_FRAME_BODY_CREATIVE_REVIEW_SELECTION_TEMPLATE_SCHEMA
      && template.protocolVersion === HMF_FRAME_BODY_CREATIVE_REVIEW_PROTOCOL_VERSION,
    "selection decision template schema or protocol drifted.",
  );
  assertTemplateAuthority(template);
  assert(
    template.unitId === decision.unitId && template.batchId === decision.batchId && template.attempt === decision.attempt,
    "selection decision template identity drifted.",
  );
  assert(template.candidateSha256 === packet.candidate.sha256, "selection decision template candidate drifted.");
  assert(
    template.creativeReviewReceiptSha256 === decision.receipt.receiptSha256
      && template.reviewEvidenceSha256 === decision.reviewEvidenceSha256,
    "selection template is not bound to the creative review evidence and receipt.",
  );
  assert(
    template.recommendedOutcome === decision.recommendedOutcome
      && template.nextReceiptState === "selected-or-repair-requested",
    "selection template outcome or lifecycle state drifted.",
  );
  assert(template.requiredActorClass === "human", "selection template must require a human actor.");
  const reconstructed = await compileHmfFrameBodyCreativeReviewDecision({
    packet,
    assessment: {
      reviewerId: decision.reviewEvidence.reviewer.actorId,
      occurredAt: decision.reviewEvidence.occurredAt,
      completedReviewModeIds: decision.reviewEvidence.completedReviewModeIds,
      criterionResults: decision.reviewEvidence.criterionResults,
      summary: decision.reviewEvidence.summary,
      recommendedOutcome: decision.reviewEvidence.recommendedOutcome,
      attestations: decision.reviewEvidence.attestations,
    },
  });
  assert(
    reconstructed.creativeReviewDecisionSha256 === decision.creativeReviewDecisionSha256
      && canonical(reconstructed) === canonical(decision),
    "creative review decision does not recompile from its governed evidence.",
  );
  return freeze(decision);
}

export function validateSelectionTemplateAgainstPolicy(template, policy, decision) {
  assert(
    template.allowedOutcomes.join("|") === policy.decisionRules.allowedOutcomes.join("|"),
    "selection template outcomes drifted from the governed policy.",
  );
  assert(template.nextReceiptState === policy.decisionRules.receiptState, "selection template receipt state drifted from the governed policy.");
  assert(
    template.requiredActorClass === "human" && policy.decisionRules.namedHumanDecisionRequired === true,
    "selection template lost the named-human gate.",
  );
  assert(template.recommendedOutcome === decision.recommendedOutcome, "selection template recommendation drifted from the creative review decision.");
  assert(
    Array.isArray(template.failureCodes)
      && canonical(template.failureCodes) === canonical(decision.reviewEvidence.failureCodes),
    "selection template failure codes drifted from the creative review evidence.",
  );
}

export function normalizeHmfFrameBodyHumanSelectionDecision(decision, raw, policy) {
  assert(raw && typeof raw === "object" && !Array.isArray(raw), "humanDecision must be an object.");
  const actorId = safeActorId(raw.actorId, "humanDecision.actorId");
  const occurredAt = canonicalTimestamp(raw.occurredAt, "humanDecision.occurredAt");
  assert(Date.parse(occurredAt) >= Date.parse(decision.receipt.occurredAt), "selection decision may not occur before creative review completed.");
  assert(policy.decisionRules.allowedOutcomes.includes(raw.outcome), "humanDecision.outcome must be selected or repair-requested.");
  if (policy.decisionRules.outcomeMustMatchCreativeRecommendation) {
    assert(
      raw.outcome === decision.recommendedOutcome,
      `humanDecision.outcome must match the completed creative recommendation ${decision.recommendedOutcome}.`,
    );
  }
  const rationale = boundedString(
    raw.rationale,
    "humanDecision.rationale",
    policy.decisionRules.minimumRationaleCharacters,
    policy.decisionRules.maximumRationaleCharacters,
  );
  const failureCodes = freeze([...decision.reviewEvidence.failureCodes].sort());
  if (raw.outcome === "selected") {
    assert(
      !policy.decisionRules.selectedRequiresZeroFailureCodes || failureCodes.length === 0,
      "a candidate with failed creative criteria may not be selected.",
    );
  } else {
    assert(
      !policy.decisionRules.repairRequiresAtLeastOneFailureCode || failureCodes.length >= 1,
      "repair-requested requires at least one governed creative-review failure code.",
    );
  }
  const attestations = raw.attestations ?? {};
  assert(attestations.candidateSha256 === decision.reviewPacket.candidate.sha256, "selection attestation candidate SHA drifted.");
  assert(attestations.creativeReviewDecisionSha256 === decision.creativeReviewDecisionSha256, "selection attestation creative-review decision SHA drifted.");
  assert(attestations.creativeReviewReceiptSha256 === decision.receipt.receiptSha256, "selection attestation creative-review receipt SHA drifted.");
  assert(attestations.reviewEvidenceSha256 === decision.reviewEvidenceSha256, "selection attestation review-evidence SHA drifted.");
  assert(attestations.recommendationConsidered === true, "selection must attest that the creative recommendation was considered.");
  assert(
    attestations.noCandidateMutationMasteringPromotionOrProviderExecutionPerformed === true,
    "selection must preserve mutation, mastering, promotion and provider boundaries.",
  );
  return freeze({
    actorId,
    occurredAt,
    outcome: raw.outcome,
    rationale,
    failureCodes,
    attestations: freeze({
      candidateSha256: attestations.candidateSha256,
      creativeReviewDecisionSha256: attestations.creativeReviewDecisionSha256,
      creativeReviewReceiptSha256: attestations.creativeReviewReceiptSha256,
      reviewEvidenceSha256: attestations.reviewEvidenceSha256,
      recommendationConsidered: true,
      noCandidateMutationMasteringPromotionOrProviderExecutionPerformed: true,
    }),
  });
}
