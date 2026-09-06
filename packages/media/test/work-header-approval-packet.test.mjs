import assert from "node:assert/strict";
import test from "node:test";

import { prepareWorkHeaderApprovalPacket } from "../dist/index.js";

function selection(overrides = {}) {
  return {
    contract: "evavo.work-header-selection-resolver.v1",
    candidateReviewEvidenceSha256: "a".repeat(64),
    recommendation: "candidate-recommended",
    recommendedCandidateId: "candidate-a",
    eligibleCandidateIds: ["candidate-a"],
    rejectedCandidateIds: [],
    reasons: ["candidate-proves-material-comparative-advantage:candidate-a"],
    currentHeaderBaselineProvided: true,
    semanticBriefProvided: true,
    currentHeaderVisualScore: 82,
    currentHeaderTechnicalScore: 90,
    critiqueHashBindingVerified: true,
    reviewEvidenceHashBindingVerified: true,
    automaticPublicationAllowed: false,
    automaticCloudOverwriteAllowed: false,
    automaticWebsiteMutationAllowed: false,
    finalHumanApprovalRequired: true,
    ...overrides,
  };
}

function page(overrides = {}) {
  return {
    pageSlug: "/work/opportunity-agent",
    pageTitle: "Opportunity Agent",
    candidateId: "candidate-a",
    candidateSha256: "b".repeat(64),
    currentDesktopSha256: "c".repeat(64),
    candidateDesktopSha256: "d".repeat(64),
    currentMobileSha256: "e".repeat(64),
    candidateMobileSha256: "f".repeat(64),
    visualScore: 91,
    disqualifiers: [],
    verdict: "page-shortlist",
    pageRenderReviewPerformed: true,
    exactScreenshotHashesBound: true,
    automaticPublicationAllowed: false,
    automaticWebsiteMutationAllowed: false,
    finalApprovalRequired: true,
    ...overrides,
  };
}

test("approval packet can become ready but never becomes approval", () => {
  const result = prepareWorkHeaderApprovalPacket({ selection: selection(), pageRender: page() });
  assert.equal(result.status, "ready-for-explicit-approval");
  assert.equal(result.candidateId, "candidate-a");
  assert.equal(result.explicitApprovalStillRequired, true);
  assert.equal(result.automaticPublicationAllowed, false);
  assert.equal(result.automaticWebsiteMutationAllowed, false);
});

test("approval packet blocks when resolver retained current header", () => {
  const result = prepareWorkHeaderApprovalPacket({
    selection: selection({ recommendation: "retain-current", recommendedCandidateId: null }),
    pageRender: page(),
  });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((item) => item.startsWith("selection-not-candidate-recommended")));
});

test("approval packet blocks failed page render", () => {
  const result = prepareWorkHeaderApprovalPacket({
    selection: selection(),
    pageRender: page({ verdict: "reject", disqualifiers: ["mobile-crop-failure"] }),
  });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((item) => item.startsWith("page-render-not-shortlisted")));
});
