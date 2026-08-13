import { compileHmfFrameBodySelectionDecisionDocument } from "./frame-body-selection-decision-plan.mjs";
import {
  HMF_FRAME_BODY_SELECTION_DECISION_SCHEMA,
  HMF_FRAME_BODY_SELECTION_PROTOCOL_VERSION,
} from "./frame-body-selection-decision-common.mjs";
import {
  assert,
  canonical,
  canonicalTimestamp,
  freeze,
  hashValue,
  safeActorId,
  selfHashed,
} from "./frame-body-selected-candidate-mastering-common.mjs";

function assertSelectionAuthority(selection) {
  const authority = selection.authority ?? {};
  assert(
    authority.decisionCompilation === true
      && authority.explicitWriteEnabledRuntimeRequired === true
      && authority.namedHumanDecisionRequired === true,
    "selected candidate lost its governed named-human selection boundary.",
  );
  for (const key of [
    "providerExecution",
    "providerRetry",
    "candidateMutation",
    "automaticSelection",
    "automaticRepairAuthorization",
    "mastering",
    "candidatePromotion",
    "targetRepositoryMutation",
    "gitMutation",
    "deployment",
    "publication",
  ]) {
    assert(authority[key] === false, `selection decision gained forbidden authority: ${key}.`);
  }
}

export async function validateHmfFrameBodySelectedSelectionDecision(input) {
  const selection = selfHashed(
    input,
    "selectionDecisionSha256",
    "selected Frame body selection decision",
  );
  assert(
    selection.schema === HMF_FRAME_BODY_SELECTION_DECISION_SCHEMA
      && selection.protocolVersion === HMF_FRAME_BODY_SELECTION_PROTOCOL_VERSION,
    "selected Frame body selection decision schema or protocol drifted.",
  );
  assertSelectionAuthority(selection);
  assert(
    selection.completedSelectionState === "selected-or-repair-requested"
      && selection.outcome === "selected"
      && selection.nextLegalAction === "master-selected-candidate",
    "selection decision is not the selected branch ready for mastering.",
  );
  assert(selection.boundedRepairTemplate === null, "selected branch may not carry a repair template.");
  assert(
    hashValue(selection.selectionEvidence) === selection.selectionEvidenceSha256,
    "selected candidate evidence hash drifted.",
  );
  assert(
    selection.selectionEvidence?.outcome === "selected"
      && selection.selectionEvidence.candidateSha256
        === selection.creativeReviewDecision?.reviewPacket?.candidate?.sha256,
    "selected candidate evidence identity drifted.",
  );
  const receipt = selfHashed(selection.receipt, "receiptSha256", "selected candidate receipt");
  assert(
    receipt.state === "selected-or-repair-requested"
      && receipt.outcome === "selected"
      && receipt.actorClass === "human",
    "selected candidate receipt is not one named-human selected outcome.",
  );
  assert(
    receipt.evidenceSha256 === selection.selectionEvidenceSha256
      && receipt.candidateSha256 === selection.selectionEvidence.candidateSha256,
    "selected candidate receipt is not bound to its exact evidence and candidate.",
  );
  assert(
    receipt.previousReceiptSha256
      === selection.creativeReviewDecision.receipt.receiptSha256,
    "selected candidate receipt predecessor drifted from creative review.",
  );
  const reconstructed = await compileHmfFrameBodySelectionDecisionDocument({
    creativeReviewDecision: selection.creativeReviewDecision,
    previousReceipts: selection.previousReceipts,
    workspaceRoot: selection.workspaceRoot,
    humanDecision: {
      actorId: selection.selectionEvidence.decisionMaker.actorId,
      occurredAt: selection.selectionEvidence.occurredAt,
      outcome: selection.selectionEvidence.outcome,
      rationale: selection.selectionEvidence.rationale,
      attestations: selection.selectionEvidence.attestations,
    },
  });
  assert(
    reconstructed.selectionDecisionSha256 === selection.selectionDecisionSha256
      && canonical(reconstructed) === canonical(selection),
    "selected candidate decision does not recompile from its governed evidence.",
  );
  return freeze(selection);
}

export function normalizeHmfFrameBodyMasteringRequest(selection, raw, policy) {
  assert(raw && typeof raw === "object" && !Array.isArray(raw), "masteringRequest must be an object.");
  const actorId = safeActorId(raw.actorId, "masteringRequest.actorId");
  const occurredAt = canonicalTimestamp(raw.occurredAt, "masteringRequest.occurredAt");
  assert(
    Date.parse(occurredAt) >= Date.parse(selection.receipt.occurredAt),
    "mastering may not occur before the named-human selection completed.",
  );
  const attestations = raw.attestations ?? {};
  assert(
    attestations.candidateSha256 === selection.selectionEvidence.candidateSha256,
    "mastering attestation candidate SHA drifted.",
  );
  assert(
    attestations.selectionDecisionSha256 === selection.selectionDecisionSha256,
    "mastering attestation selection-decision SHA drifted.",
  );
  assert(
    attestations.selectionEvidenceSha256 === selection.selectionEvidenceSha256,
    "mastering attestation selection-evidence SHA drifted.",
  );
  assert(
    attestations.selectionReceiptSha256 === selection.receipt.receiptSha256,
    "mastering attestation selection-receipt SHA drifted.",
  );
  assert(
    attestations.exactByteMasteringOnly === true,
    "mastering must attest that no image transformation is permitted.",
  );
  assert(
    attestations.noNamedHumanApprovalGameRepositoryMutationOrPublicationPerformed === true,
    "mastering must preserve approval, game-repository mutation and publication boundaries.",
  );
  assert(
    policy.masteringRules.requiredActorClass === "system",
    "mastering policy lost its system-actor boundary.",
  );
  return freeze({
    actorClass: "system",
    actorId,
    occurredAt,
    attestations: freeze({
      candidateSha256: attestations.candidateSha256,
      selectionDecisionSha256: attestations.selectionDecisionSha256,
      selectionEvidenceSha256: attestations.selectionEvidenceSha256,
      selectionReceiptSha256: attestations.selectionReceiptSha256,
      exactByteMasteringOnly: true,
      noNamedHumanApprovalGameRepositoryMutationOrPublicationPerformed: true,
    }),
  });
}
