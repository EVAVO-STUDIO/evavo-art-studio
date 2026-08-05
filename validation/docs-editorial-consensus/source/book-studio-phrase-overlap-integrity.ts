import type { BookPhraseOverlapFindingV1, BookPhraseOverlapScanV1 } from "../docs-narrative-craft/src/book-studio-review-craft-types";
import { BOOK_REVIEW_CRAFT_CONTRACT } from "../docs-narrative-craft/src/book-studio-review-craft-types";
import {
  canonicalReviewCraftJson,
  duplicateReviewCraftValues,
  rejectReviewCraftUnknown,
  reviewCraftArray,
  reviewCraftBool,
  reviewCraftDigest,
  reviewCraftEnum,
  reviewCraftId,
  reviewCraftInteger,
  reviewCraftRecord,
  sha256ReviewCraftText,
  uniqueReviewCraft,
} from "../docs-narrative-craft/src/book-studio-review-craft-shared";

const SCAN_KEYS = new Set([
  "outputKind", "schemaVersion", "contract", "scanId", "candidateId", "candidateTextSha256",
  "warningNgram", "blockingNgram", "referenceFingerprints", "findings", "blockingFindingIds",
  "accepted", "scanFingerprint", "rawReferenceTextPersisted", "rawCandidateTextPersisted",
  "canonicalAdmissionAllowed", "publicationPerformed",
]);
const REFERENCE_FINGERPRINT_KEYS = new Set(["referenceId", "textSha256"]);
const FINDING_KEYS = new Set(["findingId", "referenceId", "overlapWords", "candidateTokenIndex", "referenceTokenIndex", "matchSha256", "severity", "allowedQuotedUse"]);
const FINDING_SEVERITIES = new Set<BookPhraseOverlapFindingV1["severity"]>(["warning", "blocking"]);
const MAX_CANDIDATE_TOKENS = 100_000;
const MAX_TOTAL_REFERENCE_TOKENS = 300_000;
const MAX_FINDINGS = 256;

export async function validateBookPhraseOverlapScanIntegrity(scan: unknown): Promise<string[]> {
  const blockers: string[] = [];
  const source = reviewCraftRecord(scan, "Book phrase-overlap scan", blockers);
  rejectReviewCraftUnknown(source, SCAN_KEYS, "Book phrase-overlap scan", blockers);
  if (source.outputKind !== "evavo_docs_book_phrase_overlap_scan" || source.schemaVersion !== 1 || source.contract !== BOOK_REVIEW_CRAFT_CONTRACT) blockers.push("Book phrase-overlap scan identity is invalid.");
  if (source.rawReferenceTextPersisted !== false || source.rawCandidateTextPersisted !== false || source.canonicalAdmissionAllowed !== false || source.publicationPerformed !== false) blockers.push("Book phrase-overlap scan authority or privacy flags are invalid.");
  const scanId = reviewCraftId(source.scanId, "scanId", blockers);
  const candidateId = reviewCraftId(source.candidateId, "candidateId", blockers);
  const candidateTextSha256 = reviewCraftDigest(source.candidateTextSha256, "candidateTextSha256", blockers);
  const warningNgram = reviewCraftInteger(source.warningNgram, "warningNgram", blockers, 5, 20);
  const blockingNgram = reviewCraftInteger(source.blockingNgram, "blockingNgram", blockers, 6, 40);
  if (blockingNgram <= warningNgram) blockers.push("Book phrase-overlap scan blockingNgram must be greater than warningNgram.");

  const referenceFingerprints = reviewCraftArray(source.referenceFingerprints, "referenceFingerprints", blockers, 1, 64).map((item, index) => {
    const reference = reviewCraftRecord(item, `reference fingerprint ${index + 1}`, blockers);
    rejectReviewCraftUnknown(reference, REFERENCE_FINGERPRINT_KEYS, `reference fingerprint ${index + 1}`, blockers);
    return {
      referenceId: reviewCraftId(reference.referenceId, `reference fingerprint ${index + 1} referenceId`, blockers),
      textSha256: reviewCraftDigest(reference.textSha256, `reference fingerprint ${index + 1} textSha256`, blockers),
    };
  }).sort((left, right) => left.referenceId.localeCompare(right.referenceId));
  const duplicateReferenceIds = duplicateReviewCraftValues(referenceFingerprints.map((item) => item.referenceId));
  if (duplicateReferenceIds.length) blockers.push(`Book phrase-overlap scan repeats reference IDs: ${duplicateReferenceIds.join(", ")}.`);
  const referenceIdSet = new Set(referenceFingerprints.map((item) => item.referenceId));

  const findings = reviewCraftArray(source.findings, "findings", blockers, 0, MAX_FINDINGS).map((item, index) => {
    const finding = reviewCraftRecord(item, `finding ${index + 1}`, blockers);
    rejectReviewCraftUnknown(finding, FINDING_KEYS, `finding ${index + 1}`, blockers);
    const referenceId = reviewCraftId(finding.referenceId, `finding ${index + 1} referenceId`, blockers);
    const overlapWords = reviewCraftInteger(finding.overlapWords, `finding ${index + 1} overlapWords`, blockers, warningNgram, MAX_CANDIDATE_TOKENS);
    const candidateTokenIndex = reviewCraftInteger(finding.candidateTokenIndex, `finding ${index + 1} candidateTokenIndex`, blockers, 0, MAX_CANDIDATE_TOKENS);
    const referenceTokenIndex = reviewCraftInteger(finding.referenceTokenIndex, `finding ${index + 1} referenceTokenIndex`, blockers, 0, MAX_TOTAL_REFERENCE_TOKENS);
    const severity = reviewCraftEnum(finding.severity, FINDING_SEVERITIES, `finding ${index + 1} severity`, blockers, "warning");
    const allowedQuotedUse = reviewCraftBool(finding.allowedQuotedUse, `finding ${index + 1} allowedQuotedUse`, blockers);
    const normalized: BookPhraseOverlapFindingV1 = {
      findingId: phraseFindingId(finding.findingId, `finding ${index + 1} findingId`, blockers),
      referenceId,
      overlapWords,
      candidateTokenIndex,
      referenceTokenIndex,
      matchSha256: reviewCraftDigest(finding.matchSha256, `finding ${index + 1} matchSha256`, blockers),
      severity,
      allowedQuotedUse,
    };
    if (!referenceIdSet.has(referenceId)) blockers.push(`Finding ${normalized.findingId} references an unknown comparison source.`);
    const expectedFindingId = `overlap:${referenceId}:${candidateTokenIndex}:${referenceTokenIndex}:${overlapWords}`;
    if (normalized.findingId !== expectedFindingId) blockers.push(`Finding ${normalized.findingId} identity differs from its exact location and length.`);
    const expectedSeverity = overlapWords >= blockingNgram ? "blocking" : "warning";
    if (severity !== expectedSeverity) blockers.push(`Finding ${normalized.findingId} severity differs from the configured n-gram thresholds.`);
    return normalized;
  }).sort((left, right) => right.overlapWords - left.overlapWords || left.findingId.localeCompare(right.findingId));
  const duplicateFindingIds = duplicateReviewCraftValues(findings.map((item) => item.findingId));
  if (duplicateFindingIds.length) blockers.push(`Book phrase-overlap scan repeats finding IDs: ${duplicateFindingIds.join(", ")}.`);
  const expectedBlockingFindingIds = findings.filter((item) => item.severity === "blocking" && !item.allowedQuotedUse).map((item) => item.findingId);
  const blockingFindingIds = phraseFindingIds(source.blockingFindingIds, "blockingFindingIds", blockers);
  if (canonicalReviewCraftJson(blockingFindingIds) !== canonicalReviewCraftJson([...expectedBlockingFindingIds].sort())) blockers.push("Book phrase-overlap scan blockingFindingIds differ from its exact blocking findings.");
  const accepted = reviewCraftBool(source.accepted, "accepted", blockers);
  if (accepted !== (expectedBlockingFindingIds.length === 0)) blockers.push("Book phrase-overlap scan accepted state disagrees with its blocking findings.");

  const unsigned: Omit<BookPhraseOverlapScanV1, "scanFingerprint"> = {
    outputKind: "evavo_docs_book_phrase_overlap_scan",
    schemaVersion: 1,
    contract: BOOK_REVIEW_CRAFT_CONTRACT,
    scanId,
    candidateId,
    candidateTextSha256,
    warningNgram,
    blockingNgram,
    referenceFingerprints,
    findings,
    blockingFindingIds: expectedBlockingFindingIds,
    accepted,
    rawReferenceTextPersisted: false,
    rawCandidateTextPersisted: false,
    canonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
  const fingerprint = reviewCraftDigest(source.scanFingerprint, "scanFingerprint", blockers);
  if (fingerprint !== await sha256ReviewCraftText(canonicalReviewCraftJson(unsigned))) blockers.push("Book phrase-overlap scan fingerprint does not match its exact contents.");
  const normalized: BookPhraseOverlapScanV1 = { ...unsigned, scanFingerprint: fingerprint };
  if (canonicalReviewCraftJson(source) !== canonicalReviewCraftJson(normalized)) blockers.push("Book phrase-overlap scan is not in exact canonical normalized form.");
  return uniqueReviewCraft(blockers);
}

function phraseFindingId(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 512 || /[\u0000-\u001f\u007f]/.test(value)) {
    blockers.push(`${label} is invalid.`);
    return "invalid-overlap-finding";
  }
  return value;
}

function phraseFindingIds(value: unknown, label: string, blockers: string[]): string[] {
  if (!Array.isArray(value) || value.length > MAX_FINDINGS) {
    blockers.push(`${label} is invalid or unbounded.`);
    return [];
  }
  const result = value.map((item, index) => phraseFindingId(item, `${label} ${index + 1}`, blockers));
  const duplicates = duplicateReviewCraftValues(result);
  if (duplicates.length) blockers.push(`${label} contains duplicates: ${duplicates.join(", ")}.`);
  return uniqueReviewCraft(result).sort();
}
