import { validateBookNarrativeCraftPacket } from "./book-studio-narrative-craft-packet";
import {
  BOOK_NARRATIVE_CRAFT_CONTRACT,
  type BookNarrativeCraftEvaluationResultV1,
  type BookNarrativeCraftEvaluationV1,
  type BookNarrativeCraftPacketV1,
} from "./book-studio-narrative-craft-types";
import { validateBookPhraseOverlapScanIntegrity } from "./book-studio-phrase-overlap-integrity";
import type { BookPhraseOverlapScanV1 } from "./book-studio-review-craft-types";
import {
  duplicateReviewCraftValues,
  rejectReviewCraftUnknown,
  reviewCraftDigest,
  reviewCraftId,
  reviewCraftIds,
  reviewCraftRecord,
  roundReviewCraft,
  uniqueReviewCraft,
} from "./book-studio-review-craft-shared";
import { parseNarrativeCriterionEvidence } from "./book-studio-narrative-craft-evaluate-evidence";
import { fingerprintBookNarrativeCraftEvaluation } from "./book-studio-narrative-craft-evaluate-validate";

const INPUT_KEYS = new Set(["outputKind", "schemaVersion", "packet", "candidateId", "candidateProducerId", "candidateTextSha256", "criterionEvidence", "phraseOverlapScan", "unresolvedFindingIds", "evidenceIds"]);

export async function evaluateBookNarrativeCraftEvidence(input: unknown): Promise<BookNarrativeCraftEvaluationResultV1> {
  const blockers: string[] = [];
  const requiredActions: string[] = [];
  const source = reviewCraftRecord(input, "Narrative craft evaluation input", blockers);
  rejectReviewCraftUnknown(source, INPUT_KEYS, "Narrative craft evaluation input", blockers);
  if (source.outputKind !== "evavo_docs_book_narrative_craft_evaluation_input") blockers.push("Narrative craft evaluation outputKind is invalid.");
  if (source.schemaVersion !== 1) blockers.push("Narrative craft evaluation schemaVersion is invalid.");
  const packetBlockers = await validateBookNarrativeCraftPacket(source.packet);
  blockers.push(...packetBlockers.map((item) => `Packet: ${item}`));
  const packet = source.packet as BookNarrativeCraftPacketV1;
  const candidateId = reviewCraftId(source.candidateId, "candidateId", blockers);
  const candidateProducerId = reviewCraftId(source.candidateProducerId, "candidateProducerId", blockers);
  const candidateTextSha256 = reviewCraftDigest(source.candidateTextSha256, "candidateTextSha256", blockers);
  const unresolvedFindingIds = reviewCraftIds(source.unresolvedFindingIds, "unresolvedFindingIds", blockers, 4_096, false);
  const evidenceIds = reviewCraftIds(source.evidenceIds, "evidenceIds", blockers, 8_192, true);
  const criterionEvidence = await parseNarrativeCriterionEvidence(
    source.criterionEvidence,
    packet?.packetFingerprint ?? `sha256:${"0".repeat(64)}`,
    candidateId,
    candidateProducerId,
    candidateTextSha256,
    blockers,
  );
  const phraseOverlapScan = source.phraseOverlapScan as BookPhraseOverlapScanV1;
  const scanBlockers = await validateBookPhraseOverlapScanIntegrity(phraseOverlapScan);
  blockers.push(...scanBlockers.map((item) => `Phrase overlap: ${item}`));
  if (phraseOverlapScan?.candidateId !== candidateId) blockers.push("Phrase-overlap scan candidateId differs from the evaluated candidate.");
  if (phraseOverlapScan?.candidateTextSha256 !== candidateTextSha256) blockers.push("Phrase-overlap scan candidate text digest differs from the evaluated candidate.");
  if (blockers.length) return blocked(blockers);

  const evidenceById = new Map(criterionEvidence.map((item) => [item.criterionId, item]));
  const rubricIds = packet.qualityRubric.map((item) => item.criterionId);
  const unknownCriterionIds = criterionEvidence.map((item) => item.criterionId).filter((id) => !rubricIds.includes(id));
  if (unknownCriterionIds.length) blockers.push(`Criterion evidence includes unsupported or non-applicable criteria: ${unknownCriterionIds.join(", ")}.`);
  const allReviews = criterionEvidence.flatMap((item) => item.independentReviews);
  const duplicateReviewIds = duplicateReviewCraftValues(allReviews.map((review) => review.reviewId));
  const duplicateReviewFingerprints = duplicateReviewCraftValues(allReviews.map((review) => review.reviewFingerprint));
  if (duplicateReviewIds.length) blockers.push(`Independent review IDs are reused across criteria: ${duplicateReviewIds.join(", ")}.`);
  if (duplicateReviewFingerprints.length) blockers.push("Independent review fingerprints are reused across criteria.");
  if (blockers.length) return blocked(blockers);

  const missingCriterionIds = rubricIds.filter((criterionId) => !evidenceById.has(criterionId));
  const failedCriterionIds = packet.qualityRubric.filter((criterion) => {
    const evidence = evidenceById.get(criterion.criterionId);
    if (!evidence) return false;
    const threshold = criterion.mandatory
      ? packet.policy.minimumMandatoryCriterionScore
      : packet.policy.minimumCriterionScore;
    return evidence.score < threshold;
  }).map((criterion) => criterion.criterionId);
  const totalWeight = packet.qualityRubric.reduce((sum, criterion) => sum + criterion.weight, 0);
  const weightedScore = roundReviewCraft(packet.qualityRubric.reduce((sum, criterion) => {
    const evidence = evidenceById.get(criterion.criterionId);
    return sum + (evidence?.score ?? 0) * criterion.weight;
  }, 0) / Math.max(totalWeight, 1), 2);

  const independentReviewIds = uniqueReviewCraft(allReviews.map((review) => review.reviewerProducerId)).sort();
  if (independentReviewIds.includes(candidateProducerId)) blockers.push("The candidate producer cannot be counted as an independent reviewer.");
  const mandatoryReviewMissing = packet.qualityRubric.filter((criterion) => {
    if (!criterion.mandatory) return false;
    const qualifying = (evidenceById.get(criterion.criterionId)?.independentReviews ?? []).filter((review) =>
      review.decision === "pass" && review.score >= packet.policy.minimumMandatoryCriterionScore,
    );
    return new Set(qualifying.map((review) => review.reviewerProducerId)).size < packet.minimumIndependentReviewIds;
  }).map((criterion) => criterion.criterionId);
  const criteriaWithoutAnyIndependentReview = packet.qualityRubric
    .filter((criterion) => !(evidenceById.get(criterion.criterionId)?.independentReviews.length))
    .map((criterion) => criterion.criterionId);
  const independentReviewComplete =
    independentReviewIds.length >= packet.minimumIndependentReviewIds &&
    !mandatoryReviewMissing.length &&
    !criteriaWithoutAnyIndependentReview.length &&
    !independentReviewIds.includes(candidateProducerId);
  const phraseOverlapAccepted =
    phraseOverlapScan.accepted === true &&
    phraseOverlapScan.blockingFindingIds.length === 0;

  if (missingCriterionIds.length) requiredActions.push(`Supply evidence for criteria: ${missingCriterionIds.join(", ")}.`);
  if (failedCriterionIds.length) requiredActions.push(`Revise and re-evaluate failed criteria: ${failedCriterionIds.join(", ")}.`);
  if (weightedScore < packet.minimumPassingScore) requiredActions.push(`Raise weighted narrative score from ${weightedScore} to at least ${packet.minimumPassingScore}.`);
  if (!phraseOverlapAccepted) requiredActions.push("Resolve blocking phrase-overlap findings and run a fresh rights-tracked scan over the exact candidate bytes.");
  if (criteriaWithoutAnyIndependentReview.length) requiredActions.push(`Add at least one exact independent review receipt for criteria: ${criteriaWithoutAnyIndependentReview.join(", ")}.`);
  if (!independentReviewComplete) requiredActions.push(`Complete at least ${packet.minimumIndependentReviewIds} distinct passing review receipts for every mandatory criterion; the candidate producer cannot self-review.`);
  if (unresolvedFindingIds.length) requiredActions.push(`Resolve findings: ${unresolvedFindingIds.join(", ")}.`);
  if (blockers.length) return blocked(blockers);

  const status: BookNarrativeCraftEvaluationV1["status"] =
    !missingCriterionIds.length &&
    !failedCriterionIds.length &&
    weightedScore >= packet.minimumPassingScore &&
    phraseOverlapAccepted &&
    independentReviewComplete &&
    !unresolvedFindingIds.length
      ? "ready_for_review"
      : "needs_work";
  const unsigned: Omit<BookNarrativeCraftEvaluationV1, "evaluationFingerprint"> = {
    outputKind: "evavo_docs_book_narrative_craft_evaluation",
    schemaVersion: 1,
    contract: BOOK_NARRATIVE_CRAFT_CONTRACT,
    status,
    packet,
    packetFingerprint: packet.packetFingerprint,
    candidateId,
    candidateProducerId,
    candidateTextSha256,
    criterionEvidence,
    phraseOverlapScan,
    phraseOverlapScanFingerprint: phraseOverlapScan.scanFingerprint,
    weightedScore,
    minimumPassingScore: packet.minimumPassingScore,
    failedCriterionIds,
    missingCriterionIds,
    unresolvedFindingIds,
    independentReviewIds,
    requiredActions: uniqueReviewCraft(requiredActions),
    evidenceIds,
    phraseOverlapAccepted,
    independentReviewComplete,
    canonicalAdmissionAllowed: false,
    canonicalManuscriptMutationPerformed: false,
    publicationPerformed: false,
  };
  const evaluationFingerprint = await fingerprintBookNarrativeCraftEvaluation(unsigned);
  const evaluation: BookNarrativeCraftEvaluationV1 = { ...unsigned, evaluationFingerprint };
  return {
    outputKind: "evavo_docs_book_narrative_craft_evaluation_result",
    schemaVersion: 1,
    status,
    evaluation,
    blockers: [],
    requiredActions: evaluation.requiredActions,
    canonicalAdmissionAllowed: false,
    canonicalManuscriptMutationPerformed: false,
    publicationPerformed: false,
  };
}

function blocked(blockers: string[]): BookNarrativeCraftEvaluationResultV1 {
  return {
    outputKind: "evavo_docs_book_narrative_craft_evaluation_result",
    schemaVersion: 1,
    status: "blocked",
    blockers: uniqueReviewCraft(blockers),
    requiredActions: ["Correct the malformed or unauthorised narrative-craft evaluation input."],
    canonicalAdmissionAllowed: false,
    canonicalManuscriptMutationPerformed: false,
    publicationPerformed: false,
  };
}
