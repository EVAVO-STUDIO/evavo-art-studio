import { validateBookNarrativeCraftPacket } from "./book-studio-narrative-craft-packet";
import {
  BOOK_NARRATIVE_CRAFT_CONTRACT,
  type BookNarrativeCraftEvaluationResultV1,
  type BookNarrativeCraftEvaluationV1,
  type BookNarrativeCraftPacketV1,
  type BookNarrativeCriterionEvidenceV1,
} from "./book-studio-narrative-craft-types";
import {
  canonicalReviewCraftJson,
  duplicateReviewCraftValues,
  rejectReviewCraftUnknown,
  reviewCraftArray,
  reviewCraftBool,
  reviewCraftDigest,
  reviewCraftFinite,
  reviewCraftId,
  reviewCraftIds,
  reviewCraftRecord,
  roundReviewCraft,
  sha256ReviewCraftText,
  uniqueReviewCraft,
} from "./book-studio-review-craft-shared";

const INPUT_KEYS = new Set(["outputKind", "schemaVersion", "packet", "candidateId", "candidateTextSha256", "criterionEvidence", "phraseOverlapAccepted", "phraseOverlapScanFingerprint", "independentReviewIds", "unresolvedFindingIds", "evidenceIds"]);
const CRITERION_KEYS = new Set(["criterionId", "score", "evidenceIds", "findingIds", "independentlyReviewed"]);

export async function evaluateBookNarrativeCraftEvidence(input: unknown): Promise<BookNarrativeCraftEvaluationResultV1> {
  const blockers: string[] = [];
  const requiredActions: string[] = [];
  const source = reviewCraftRecord(input, "Narrative craft evaluation input", blockers);
  rejectReviewCraftUnknown(source, INPUT_KEYS, "Narrative craft evaluation input", blockers);
  if (source.outputKind !== "evavo_docs_book_narrative_craft_evaluation_input") blockers.push("Narrative craft evaluation outputKind is invalid.");
  if (source.schemaVersion !== 1) blockers.push("Narrative craft evaluation schemaVersion is invalid.");
  const packetBlockers = await validateBookNarrativeCraftPacket(source.packet);
  blockers.push(...packetBlockers.map((item) => `Packet: ${item}`));
  if (blockers.length) return blocked(blockers);
  const packet = source.packet as BookNarrativeCraftPacketV1;
  const candidateId = reviewCraftId(source.candidateId, "candidateId", blockers);
  const candidateTextSha256 = reviewCraftDigest(source.candidateTextSha256, "candidateTextSha256", blockers);
  const phraseOverlapAccepted = reviewCraftBool(source.phraseOverlapAccepted, "phraseOverlapAccepted", blockers);
  const phraseOverlapScanFingerprint = reviewCraftDigest(source.phraseOverlapScanFingerprint, "phraseOverlapScanFingerprint", blockers);
  const independentReviewIds = reviewCraftIds(source.independentReviewIds, "independentReviewIds", blockers, 64, false);
  const unresolvedFindingIds = reviewCraftIds(source.unresolvedFindingIds, "unresolvedFindingIds", blockers, 4_096, false);
  const evidenceIds = reviewCraftIds(source.evidenceIds, "evidenceIds", blockers, 8_192, true);
  const criterionEvidence = parseCriterionEvidence(source.criterionEvidence, blockers);
  if (blockers.length) return blocked(blockers);

  const evidenceById = new Map(criterionEvidence.map((item) => [item.criterionId, item]));
  const rubricIds = packet.qualityRubric.map((item) => item.criterionId);
  const unknownCriterionIds = criterionEvidence.map((item) => item.criterionId).filter((id) => !rubricIds.includes(id));
  if (unknownCriterionIds.length) blockers.push(`Criterion evidence includes unsupported criteria: ${unknownCriterionIds.join(", ")}.`);
  if (blockers.length) return blocked(blockers);

  const missingCriterionIds = rubricIds.filter((criterionId) => !evidenceById.has(criterionId));
  const failedCriterionIds = packet.qualityRubric.filter((criterion) => {
    const evidence = evidenceById.get(criterion.criterionId);
    return evidence !== undefined && (evidence.score < 70 || (criterion.mandatory && evidence.score < 80));
  }).map((criterion) => criterion.criterionId);
  const totalWeight = packet.qualityRubric.reduce((sum, criterion) => sum + criterion.weight, 0);
  const weightedScore = roundReviewCraft(packet.qualityRubric.reduce((sum, criterion) => {
    const evidence = evidenceById.get(criterion.criterionId);
    return sum + (evidence?.score ?? 0) * criterion.weight;
  }, 0) / Math.max(totalWeight, 1), 2);
  const mandatoryReviewMissing = packet.qualityRubric.filter((criterion) => criterion.mandatory && !evidenceById.get(criterion.criterionId)?.independentlyReviewed).map((criterion) => criterion.criterionId);
  const independentReviewComplete = independentReviewIds.length >= packet.minimumIndependentReviewIds && !mandatoryReviewMissing.length;

  if (missingCriterionIds.length) requiredActions.push(`Supply evidence for criteria: ${missingCriterionIds.join(", ")}.`);
  if (failedCriterionIds.length) requiredActions.push(`Revise and re-evaluate failed criteria: ${failedCriterionIds.join(", ")}.`);
  if (weightedScore < packet.minimumPassingScore) requiredActions.push(`Raise weighted narrative score from ${weightedScore} to at least ${packet.minimumPassingScore}.`);
  if (!phraseOverlapAccepted) requiredActions.push("Resolve blocking phrase-overlap findings and run a fresh rights-tracked scan.");
  if (!independentReviewComplete) requiredActions.push(`Complete at least ${packet.minimumIndependentReviewIds} independent reviews, including all mandatory criteria.`);
  if (unresolvedFindingIds.length) requiredActions.push(`Resolve findings: ${unresolvedFindingIds.join(", ")}.`);

  const status: BookNarrativeCraftEvaluationV1["status"] = !missingCriterionIds.length
    && !failedCriterionIds.length
    && weightedScore >= packet.minimumPassingScore
    && phraseOverlapAccepted
    && independentReviewComplete
    && !unresolvedFindingIds.length
    ? "ready_for_review"
    : "needs_work";
  const unsigned: Omit<BookNarrativeCraftEvaluationV1, "evaluationFingerprint"> = {
    outputKind: "evavo_docs_book_narrative_craft_evaluation",
    schemaVersion: 1,
    contract: BOOK_NARRATIVE_CRAFT_CONTRACT,
    status,
    packetFingerprint: packet.packetFingerprint,
    candidateId,
    candidateTextSha256,
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
  const evaluationFingerprint = await sha256ReviewCraftText(canonicalReviewCraftJson({ ...unsigned, phraseOverlapScanFingerprint }));
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

function parseCriterionEvidence(value: unknown, blockers: string[]): BookNarrativeCriterionEvidenceV1[] {
  const records = reviewCraftArray(value, "criterionEvidence", blockers, 1, 128);
  const result = records.map((item, index) => {
    const source = reviewCraftRecord(item, `criterion evidence ${index + 1}`, blockers);
    rejectReviewCraftUnknown(source, CRITERION_KEYS, `criterion evidence ${index + 1}`, blockers);
    return {
      criterionId: reviewCraftId(source.criterionId, `criterion evidence ${index + 1} criterionId`, blockers),
      score: reviewCraftFinite(source.score, `criterion evidence ${index + 1} score`, blockers, 0, 100),
      evidenceIds: reviewCraftIds(source.evidenceIds, `criterion evidence ${index + 1} evidenceIds`, blockers, 512, true),
      findingIds: reviewCraftIds(source.findingIds, `criterion evidence ${index + 1} findingIds`, blockers, 512, false),
      independentlyReviewed: reviewCraftBool(source.independentlyReviewed, `criterion evidence ${index + 1} independentlyReviewed`, blockers),
    };
  }).sort((left, right) => left.criterionId.localeCompare(right.criterionId));
  const duplicates = duplicateReviewCraftValues(result.map((item) => item.criterionId));
  if (duplicates.length) blockers.push(`Criterion evidence IDs are duplicated: ${duplicates.join(", ")}.`);
  return result;
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
