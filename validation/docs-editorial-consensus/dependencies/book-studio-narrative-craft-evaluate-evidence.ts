import { validateBookNarrativeCraftPacket } from "./book-studio-narrative-craft-packet";
import {
  BOOK_NARRATIVE_CRAFT_CONTRACT,
  type BookNarrativeCraftEvaluationResultV1,
  type BookNarrativeCraftEvaluationV1,
  type BookNarrativeCraftPacketV1,
  type BookNarrativeCriterionEvidenceV1,
  type BookNarrativeIndependentReviewReceiptV1,
  type BookNarrativeReviewerProvider,
} from "./book-studio-narrative-craft-types";
import { validateBookPhraseOverlapScanIntegrity } from "./book-studio-phrase-overlap-integrity";
import type { BookPhraseOverlapScanV1 } from "./book-studio-review-craft-types";
import {
  canonicalReviewCraftJson,
  duplicateReviewCraftValues,
  rejectReviewCraftUnknown,
  reviewCraftArray,
  reviewCraftDigest,
  reviewCraftEnum,
  reviewCraftFinite,
  reviewCraftId,
  reviewCraftIds,
  reviewCraftRecord,
  reviewCraftText,
  reviewCraftTimestamp,
  roundReviewCraft,
  sameReviewCraftSet,
  sha256ReviewCraftText,
  uniqueReviewCraft,
} from "./book-studio-review-craft-shared";


const CRITERION_KEYS = new Set(["criterionId", "score", "evidenceIds", "findingIds", "independentReviews"]);
const REVIEW_KEYS = new Set([
  "outputKind", "schemaVersion", "reviewId", "packetFingerprint", "candidateId", "candidateTextSha256", "criterionId",
  "reviewerProducerId", "reviewerProvider", "reviewerModel", "score", "decision", "evidenceIds", "findingIds",
  "reviewedAt", "reviewFingerprint", "reviewerWasCandidateProducer", "canonicalAdmissionAllowed", "publicationPerformed",
]);
const REVIEWER_PROVIDERS = new Set<BookNarrativeReviewerProvider>(["chatgpt", "claude", "other_compatible_model", "human"]);
const REVIEW_DECISIONS = new Set<BookNarrativeIndependentReviewReceiptV1["decision"]>(["pass", "needs_work", "blocked"]);

export async function fingerprintBookNarrativeIndependentReviewReceipt(
  value: Omit<BookNarrativeIndependentReviewReceiptV1, "reviewFingerprint"> | BookNarrativeIndependentReviewReceiptV1,
): Promise<string> {
  const { reviewFingerprint: _discarded, ...unsigned } = value as BookNarrativeIndependentReviewReceiptV1;
  return sha256ReviewCraftText(canonicalReviewCraftJson(unsigned));
}

export async function parseNarrativeCriterionEvidence(
  value: unknown,
  packetFingerprint: string,
  candidateId: string,
  candidateProducerId: string,
  candidateTextSha256: string,
  blockers: string[],
): Promise<BookNarrativeCriterionEvidenceV1[]> {
  const records = reviewCraftArray(value, "criterionEvidence", blockers, 1, 128);
  const result: BookNarrativeCriterionEvidenceV1[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const source = reviewCraftRecord(records[index], `criterion evidence ${index + 1}`, blockers);
    rejectReviewCraftUnknown(source, CRITERION_KEYS, `criterion evidence ${index + 1}`, blockers);
    const criterionId = reviewCraftId(source.criterionId, `criterion evidence ${index + 1} criterionId`, blockers);
    const independentReviews = await parseIndependentReviews(
      source.independentReviews,
      index,
      criterionId,
      packetFingerprint,
      candidateId,
      candidateProducerId,
      candidateTextSha256,
      blockers,
    );
    const score = reviewCraftFinite(source.score, `criterion evidence ${index + 1} score`, blockers, 0, 100);
    const expectedScore = independentReviews.length
      ? roundReviewCraft(independentReviews.reduce((sum, review) => sum + review.score, 0) / independentReviews.length, 2)
      : 0;
    if (score !== expectedScore) blockers.push(`Criterion ${criterionId} score ${score} differs from the exact independent-review mean ${expectedScore}.`);
    const evidenceIds = reviewCraftIds(source.evidenceIds, `criterion evidence ${index + 1} evidenceIds`, blockers, 4_096, independentReviews.length > 0);
    const findingIds = reviewCraftIds(source.findingIds, `criterion evidence ${index + 1} findingIds`, blockers, 4_096, false);
    const reviewEvidenceIds = uniqueReviewCraft(independentReviews.flatMap((review) => review.evidenceIds)).sort();
    const reviewFindingIds = uniqueReviewCraft(independentReviews.flatMap((review) => review.findingIds)).sort();
    if (!sameReviewCraftSet(evidenceIds, reviewEvidenceIds)) blockers.push(`Criterion ${criterionId} evidence IDs differ from its exact independent review receipts.`);
    if (!sameReviewCraftSet(findingIds, reviewFindingIds)) blockers.push(`Criterion ${criterionId} finding IDs differ from its exact independent review receipts.`);
    result.push({ criterionId, score, evidenceIds, findingIds, independentReviews });
  }
  result.sort((left, right) => left.criterionId.localeCompare(right.criterionId));
  const duplicates = duplicateReviewCraftValues(result.map((item) => item.criterionId));
  if (duplicates.length) blockers.push(`Criterion evidence IDs are duplicated: ${duplicates.join(", ")}.`);
  return result;
}

async function parseIndependentReviews(
  value: unknown,
  criterionIndex: number,
  criterionId: string,
  packetFingerprint: string,
  candidateId: string,
  candidateProducerId: string,
  candidateTextSha256: string,
  blockers: string[],
): Promise<BookNarrativeIndependentReviewReceiptV1[]> {
  const records = reviewCraftArray(value, `criterion evidence ${criterionIndex + 1} independentReviews`, blockers, 0, 16);
  const result: BookNarrativeIndependentReviewReceiptV1[] = [];
  for (let reviewIndex = 0; reviewIndex < records.length; reviewIndex += 1) {
    const source = reviewCraftRecord(records[reviewIndex], `criterion evidence ${criterionIndex + 1} review ${reviewIndex + 1}`, blockers);
    rejectReviewCraftUnknown(source, REVIEW_KEYS, `criterion evidence ${criterionIndex + 1} review ${reviewIndex + 1}`, blockers);
    if (source.outputKind !== "evavo_docs_book_narrative_independent_review_receipt" || source.schemaVersion !== 1) blockers.push(`Criterion ${criterionId} independent review identity is invalid.`);
    const reviewId = reviewCraftId(source.reviewId, `criterion ${criterionId} reviewId`, blockers);
    const normalizedPacketFingerprint = reviewCraftDigest(source.packetFingerprint, `criterion ${criterionId} packetFingerprint`, blockers);
    const normalizedCandidateId = reviewCraftId(source.candidateId, `criterion ${criterionId} candidateId`, blockers);
    const normalizedCandidateTextSha256 = reviewCraftDigest(source.candidateTextSha256, `criterion ${criterionId} candidateTextSha256`, blockers);
    const normalizedCriterionId = reviewCraftId(source.criterionId, `criterion ${criterionId} criterionId`, blockers);
    const reviewerProducerId = reviewCraftId(source.reviewerProducerId, `criterion ${criterionId} reviewerProducerId`, blockers);
    const reviewerProvider = reviewCraftEnum(source.reviewerProvider, REVIEWER_PROVIDERS, `criterion ${criterionId} reviewerProvider`, blockers, "human");
    const reviewerModel = reviewCraftText(source.reviewerModel, `criterion ${criterionId} reviewerModel`, blockers, 300);
    const score = reviewCraftFinite(source.score, `criterion ${criterionId} review score`, blockers, 0, 100);
    const decision = reviewCraftEnum(source.decision, REVIEW_DECISIONS, `criterion ${criterionId} decision`, blockers, "blocked");
    const evidenceIds = reviewCraftIds(source.evidenceIds, `criterion ${criterionId} review evidenceIds`, blockers, 2_048, true);
    const findingIds = reviewCraftIds(source.findingIds, `criterion ${criterionId} review findingIds`, blockers, 2_048, false);
    const reviewedAt = reviewCraftTimestamp(source.reviewedAt, `criterion ${criterionId} reviewedAt`, blockers);
    if (new Date(Date.parse(reviewedAt)).toISOString() !== reviewedAt) blockers.push(`Criterion ${criterionId} reviewedAt is not canonical UTC ISO-8601.`);
    if (source.reviewerWasCandidateProducer !== false || source.canonicalAdmissionAllowed !== false || source.publicationPerformed !== false) blockers.push(`Criterion ${criterionId} review authority flags are invalid.`);
    if (normalizedPacketFingerprint !== packetFingerprint || normalizedCandidateId !== candidateId || normalizedCandidateTextSha256 !== candidateTextSha256 || normalizedCriterionId !== criterionId) blockers.push(`Criterion ${criterionId} review is bound to different packet, candidate or criterion evidence.`);
    if (reviewerProducerId === candidateProducerId) blockers.push(`Criterion ${criterionId} review is not independent from the candidate producer.`);
    const unsigned: Omit<BookNarrativeIndependentReviewReceiptV1, "reviewFingerprint"> = {
      outputKind: "evavo_docs_book_narrative_independent_review_receipt",
      schemaVersion: 1,
      reviewId,
      packetFingerprint: normalizedPacketFingerprint,
      candidateId: normalizedCandidateId,
      candidateTextSha256: normalizedCandidateTextSha256,
      criterionId: normalizedCriterionId,
      reviewerProducerId,
      reviewerProvider,
      reviewerModel,
      score,
      decision,
      evidenceIds,
      findingIds,
      reviewedAt,
      reviewerWasCandidateProducer: false,
      canonicalAdmissionAllowed: false,
      publicationPerformed: false,
    };
    const reviewFingerprint = reviewCraftDigest(source.reviewFingerprint, `criterion ${criterionId} reviewFingerprint`, blockers);
    if (reviewFingerprint !== await fingerprintBookNarrativeIndependentReviewReceipt(unsigned)) blockers.push(`Criterion ${criterionId} review fingerprint differs from its exact contents.`);
    const normalized: BookNarrativeIndependentReviewReceiptV1 = { ...unsigned, reviewFingerprint };
    if (canonicalReviewCraftJson(source) !== canonicalReviewCraftJson(normalized)) blockers.push(`Criterion ${criterionId} review is not in exact canonical form.`);
    result.push(normalized);
  }
  result.sort((left, right) => left.reviewerProducerId.localeCompare(right.reviewerProducerId) || left.reviewId.localeCompare(right.reviewId));
  const duplicateReviewers = duplicateReviewCraftValues(result.map((item) => item.reviewerProducerId));
  const duplicateReviewIds = duplicateReviewCraftValues(result.map((item) => item.reviewId));
  const duplicateFingerprints = duplicateReviewCraftValues(result.map((item) => item.reviewFingerprint));
  if (duplicateReviewers.length) blockers.push(`Criterion ${criterionId} repeats reviewer producers: ${duplicateReviewers.join(", ")}.`);
  if (duplicateReviewIds.length) blockers.push(`Criterion ${criterionId} repeats review IDs: ${duplicateReviewIds.join(", ")}.`);
  if (duplicateFingerprints.length) blockers.push(`Criterion ${criterionId} repeats review fingerprints.`);
  return result;
}
