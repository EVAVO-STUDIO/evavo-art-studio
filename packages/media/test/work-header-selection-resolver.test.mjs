import assert from "node:assert/strict";
import test from "node:test";

import { digestWorkHeaderCandidateReviewEvidence, resolveWorkHeaderSelection } from "../dist/index.js";

const HASH_CURRENT = "c".repeat(64);
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function candidateReview(overrides = {}) {
  return {
    reviewBrief: { pageTitle: "Support Agent", projectSummary: "AI support product case study for EVAVO Work.", visualIntent: "Show the product/service clearly without generic AI imagery." },
    semanticBriefRequiredForReplacement: true,
    currentHeader: {
      imageSha256: HASH_CURRENT,
      technicalScore: 90,
      technicalGrade: "pass",
      technicalIssues: [],
      minimumCropRetainedRatio: 0.74,
      maximumUpscaleRatio: 1,
    },
    supportImageSha256: "d".repeat(64),
    tileImageSha256: "e".repeat(64),
    candidates: [
      { id: "a", imageSha256: HASH_A, provenance: "cloudinary:a", technicalScore: 91, technicalGrade: "pass", technicalIssues: [], minimumCropRetainedRatio: 0.72, maximumUpscaleRatio: 1, similarityToCurrentHeader: 0.4, similarityToSupportImage: 0.3, similarityToTileImage: 0.2, exactDuplicateOfSupport: false, nearDuplicateOfSupport: false, technicallyEligibleForVisualReview: true },
      { id: "b", imageSha256: HASH_B, provenance: "cloudinary:b", technicalScore: 88, technicalGrade: "pass", technicalIssues: [], minimumCropRetainedRatio: 0.70, maximumUpscaleRatio: 1, similarityToCurrentHeader: 0.5, similarityToSupportImage: 0.4, similarityToTileImage: 0.3, exactDuplicateOfSupport: false, nearDuplicateOfSupport: false, technicallyEligibleForVisualReview: true },
    ],
    technicalShortlist: ["a", "b"],
    creativeWinner: null,
    finalSelectionAllowed: false,
    visualCritiqueRequired: true,
    currentHeaderBaselineRequiredForReplacement: true,
    critiqueHashBindingRequired: true,
    surroundingMediaHashBindingRequired: true,
    visualCritiqueDimensions: ["semantic relevance"],
    ...overrides,
  };
}

function critique(review, candidateId, visualScore, candidateSha256, overrides = {}) {
  return {
    contract: "evavo.work-header-visual-critique.v1",
    candidateId,
    candidateSha256,
    candidateReviewEvidenceSha256: digestWorkHeaderCandidateReviewEvidence(review),
    visualScore,
    disqualifiers: [],
    weaknesses: [],
    strengths: ["good"],
    verdict: "visual-shortlist",
    eligibleForFinalSelection: true,
    humanOrVisionReviewPerformed: true,
    exactImageHashBound: true,
    exactReviewEvidenceHashBound: true,
    automaticPublicationAllowed: false,
    automaticCloudOverwriteAllowed: false,
    finalSelectionStillRequiresComparativeReview: true,
    ...overrides,
  };
}

test("requires semantic project brief before replacement recommendation", () => {
  const review = candidateReview({ reviewBrief: null });
  const result = resolveWorkHeaderSelection({
    candidateReview: review,
    critiques: [critique(review, "a", 94, HASH_A)],
    currentHeaderCritique: critique(review, "current-header", 80, HASH_CURRENT),
  });
  assert.equal(result.recommendation, "needs-review-brief");
  assert.equal(result.semanticBriefProvided, false);
  assert.equal(result.recommendedCandidateId, null);
});

test("requires both current-header technical and visual baselines by default", () => {
  const review = candidateReview({ currentHeader: null });
  const result = resolveWorkHeaderSelection({
    candidateReview: review,
    critiques: [critique(review, "a", 91, HASH_A), critique(review, "b", 86, HASH_B)],
  });
  assert.equal(result.recommendation, "needs-current-baseline");
  assert.equal(result.recommendedCandidateId, null);
  assert.equal(result.currentHeaderTechnicalScore, null);
  assert.equal(result.critiqueHashBindingVerified, true);
  assert.equal(result.reviewEvidenceHashBindingVerified, true);
  assert.equal(result.automaticWebsiteMutationAllowed, false);
});

test("retains current header when best candidate does not beat it by required visual margin", () => {
  const review = candidateReview();
  const result = resolveWorkHeaderSelection({
    candidateReview: review,
    critiques: [critique(review, "a", 90, HASH_A), critique(review, "b", 86, HASH_B)],
    currentHeaderCritique: critique(review, "current-header", 87, HASH_CURRENT),
    minimumAdvantageOverCurrent: 5,
  });
  assert.equal(result.recommendation, "retain-current");
  assert.equal(result.recommendedCandidateId, null);
});

test("recommends candidate only after material comparative advantage", () => {
  const review = candidateReview();
  const result = resolveWorkHeaderSelection({
    candidateReview: review,
    critiques: [critique(review, "a", 94, HASH_A), critique(review, "b", 86, HASH_B)],
    currentHeaderCritique: critique(review, "current-header", 86, HASH_CURRENT),
    minimumAdvantageOverCurrent: 5,
  });
  assert.equal(result.recommendation, "candidate-recommended");
  assert.equal(result.recommendedCandidateId, "a");
  assert.equal(result.semanticBriefProvided, true);
  assert.equal(result.currentHeaderTechnicalScore, 90);
  assert.match(result.candidateReviewEvidenceSha256, /^[0-9a-f]{64}$/u);
  assert.equal(result.finalHumanApprovalRequired, true);
  assert.equal(result.automaticPublicationAllowed, false);
});

test("rejects candidate that is materially technically worse than the current header", () => {
  const review = candidateReview();
  review.candidates[0].technicalScore = 82;
  const result = resolveWorkHeaderSelection({
    candidateReview: review,
    critiques: [critique(review, "a", 98, HASH_A), critique(review, "b", 86, HASH_B)],
    currentHeaderCritique: critique(review, "current-header", 80, HASH_CURRENT),
    maximumTechnicalDeficitToCurrent: 3,
  });
  assert.ok(result.rejectedCandidateIds.includes("a"));
  assert.ok(result.reasons.some((reason) => reason.startsWith("candidate-technically-worse-than-current:a")));
});

test("rejects near-duplicate support imagery even when visually strong", () => {
  const review = candidateReview();
  review.candidates[0].nearDuplicateOfSupport = true;
  const result = resolveWorkHeaderSelection({
    candidateReview: review,
    critiques: [critique(review, "a", 96, HASH_A), critique(review, "b", 83, HASH_B)],
    currentHeaderCritique: critique(review, "current-header", 80, HASH_CURRENT),
  });
  assert.notEqual(result.recommendedCandidateId, "a");
  assert.ok(result.rejectedCandidateIds.includes("a"));
});

test("rejects stale visual critique bound to different candidate bytes", () => {
  const review = candidateReview();
  assert.throws(
    () => resolveWorkHeaderSelection({
      candidateReview: review,
      critiques: [critique(review, "a", 96, "f".repeat(64))],
      currentHeaderCritique: critique(review, "current-header", 80, HASH_CURRENT),
    }),
    /Critique hash mismatch/u,
  );
});

test("rejects critique bound to older comparison evidence after board evidence changes", () => {
  const review = candidateReview();
  const oldCritique = critique(review, "a", 96, HASH_A);
  review.candidates[0].technicalScore = 89;
  assert.throws(
    () => resolveWorkHeaderSelection({ candidateReview: review, critiques: [oldCritique] }),
    /review-evidence hash mismatch/u,
  );
});
