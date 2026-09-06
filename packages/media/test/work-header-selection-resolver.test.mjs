import assert from "node:assert/strict";
import test from "node:test";

import { resolveWorkHeaderSelection } from "../dist/index.js";

function candidateReview(overrides = {}) {
  return {
    currentHeader: {
      technicalScore: 90,
      technicalGrade: "pass",
      technicalIssues: [],
      minimumCropRetainedRatio: 0.74,
      maximumUpscaleRatio: 1,
    },
    candidates: [
      {
        id: "a",
        provenance: "cloudinary:a",
        technicalScore: 91,
        technicalGrade: "pass",
        technicalIssues: [],
        minimumCropRetainedRatio: 0.72,
        maximumUpscaleRatio: 1,
        similarityToCurrentHeader: 0.4,
        similarityToSupportImage: 0.3,
        similarityToTileImage: 0.2,
        exactDuplicateOfSupport: false,
        nearDuplicateOfSupport: false,
        technicallyEligibleForVisualReview: true,
      },
      {
        id: "b",
        provenance: "cloudinary:b",
        technicalScore: 88,
        technicalGrade: "pass",
        technicalIssues: [],
        minimumCropRetainedRatio: 0.70,
        maximumUpscaleRatio: 1,
        similarityToCurrentHeader: 0.5,
        similarityToSupportImage: 0.4,
        similarityToTileImage: 0.3,
        exactDuplicateOfSupport: false,
        nearDuplicateOfSupport: false,
        technicallyEligibleForVisualReview: true,
      },
    ],
    technicalShortlist: ["a", "b"],
    creativeWinner: null,
    finalSelectionAllowed: false,
    visualCritiqueRequired: true,
    currentHeaderBaselineRequiredForReplacement: true,
    visualCritiqueDimensions: ["semantic relevance"],
    ...overrides,
  };
}

function critique(candidateId, visualScore, overrides = {}) {
  return {
    contract: "evavo.work-header-visual-critique.v1",
    candidateId,
    visualScore,
    disqualifiers: [],
    weaknesses: [],
    strengths: ["good"],
    verdict: "visual-shortlist",
    eligibleForFinalSelection: true,
    humanOrVisionReviewPerformed: true,
    automaticPublicationAllowed: false,
    automaticCloudOverwriteAllowed: false,
    finalSelectionStillRequiresComparativeReview: true,
    ...overrides,
  };
}

test("requires both current-header technical and visual baselines by default", () => {
  const result = resolveWorkHeaderSelection({
    candidateReview: candidateReview({ currentHeader: null }),
    critiques: [critique("a", 91), critique("b", 86)],
  });
  assert.equal(result.recommendation, "needs-current-baseline");
  assert.equal(result.recommendedCandidateId, null);
  assert.equal(result.currentHeaderTechnicalScore, null);
  assert.equal(result.automaticWebsiteMutationAllowed, false);
});

test("retains current header when best candidate does not beat it by required visual margin", () => {
  const result = resolveWorkHeaderSelection({
    candidateReview: candidateReview(),
    critiques: [critique("a", 90), critique("b", 86)],
    currentHeaderCritique: critique("current", 87),
    minimumAdvantageOverCurrent: 5,
  });
  assert.equal(result.recommendation, "retain-current");
  assert.equal(result.recommendedCandidateId, null);
});

test("recommends candidate only after material comparative advantage", () => {
  const result = resolveWorkHeaderSelection({
    candidateReview: candidateReview(),
    critiques: [critique("a", 94), critique("b", 86)],
    currentHeaderCritique: critique("current", 86),
    minimumAdvantageOverCurrent: 5,
  });
  assert.equal(result.recommendation, "candidate-recommended");
  assert.equal(result.recommendedCandidateId, "a");
  assert.equal(result.currentHeaderTechnicalScore, 90);
  assert.equal(result.finalHumanApprovalRequired, true);
  assert.equal(result.automaticPublicationAllowed, false);
});

test("rejects candidate that is materially technically worse than the current header", () => {
  const review = candidateReview();
  review.candidates[0].technicalScore = 82;
  const result = resolveWorkHeaderSelection({
    candidateReview: review,
    critiques: [critique("a", 98), critique("b", 86)],
    currentHeaderCritique: critique("current", 80),
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
    critiques: [critique("a", 96), critique("b", 83)],
    currentHeaderCritique: critique("current", 80),
  });
  assert.notEqual(result.recommendedCandidateId, "a");
  assert.ok(result.rejectedCandidateIds.includes("a"));
});
