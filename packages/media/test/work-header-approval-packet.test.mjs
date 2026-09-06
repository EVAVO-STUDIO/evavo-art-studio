import assert from "node:assert/strict";
import test from "node:test";

import { prepareWorkHeaderApprovalPacket } from "../dist/index.js";

function selection(overrides = {}) {
  return {
    contract: "evavo.work-header-selection-resolver.v1",
    candidateReviewEvidenceSha256: "a".repeat(64),
    recommendation: "candidate-recommended",
    recommendedCandidateId: "candidate-a",
    recommendedCandidateSha256: "b".repeat(64),
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
    desktopViewport: { currentWidth: 1440, currentHeight: 900, candidateWidth: 1440, candidateHeight: 900, dimensionsMatch: true, screenshotsDiffer: true },
    mobileViewport: { currentWidth: 390, currentHeight: 844, candidateWidth: 390, candidateHeight: 844, dimensionsMatch: true, screenshotsDiffer: true },
    currentPageQuality: 4.0,
    candidatePageQuality: 4.5,
    pageQualityAdvantage: 0.5,
    minimumPageQualityAdvantage: 0.25,
    materialPageQualityAdvantageVerified: true,
    visualScore: 91,
    disqualifiers: [],
    verdict: "page-shortlist",
    pageRenderReviewPerformed: true,
    exactScreenshotHashesBound: true,
    comparableViewportGeometryVerified: true,
    candidateRenderDifferenceVerified: true,
    automaticPublicationAllowed: false,
    automaticWebsiteMutationAllowed: false,
    finalApprovalRequired: true,
    ...overrides,
  };
}

test("approval packet can become ready but never becomes approval", () => {
  const result = prepareWorkHeaderApprovalPacket({ selection: selection(), pageRender: page() });
  assert.equal(result.contract, "evavo.work-header-approval-packet.v2");
  assert.equal(result.status, "ready-for-explicit-approval");
  assert.equal(result.candidateId, "candidate-a");
  assert.equal(result.candidateSha256, "b".repeat(64));
  assert.equal(result.verified.candidateHashMatchesPageRender, true);
  assert.equal(result.verified.comparableViewportGeometryVerified, true);
  assert.equal(result.verified.candidateRenderDifferenceVerified, true);
  assert.equal(result.verified.materialPageQualityAdvantageVerified, true);
  assert.equal(result.explicitApprovalStillRequired, true);
  assert.equal(result.automaticPublicationAllowed, false);
  assert.equal(result.automaticWebsiteMutationAllowed, false);
});

test("approval packet blocks when resolver retained current header", () => {
  const result = prepareWorkHeaderApprovalPacket({
    selection: selection({ recommendation: "retain-current", recommendedCandidateId: null, recommendedCandidateSha256: null }),
    pageRender: page(),
  });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((item) => item.startsWith("selection-not-candidate-recommended")));
});

test("approval packet blocks failed page render", () => {
  const result = prepareWorkHeaderApprovalPacket({ selection: selection(), pageRender: page({ verdict: "reject", disqualifiers: ["mobile-crop-failure"] }) });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((item) => item.startsWith("page-render-not-shortlisted")));
});

test("approval packet blocks page render from different candidate bytes", () => {
  const result = prepareWorkHeaderApprovalPacket({ selection: selection(), pageRender: page({ candidateSha256: "9".repeat(64) }) });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.includes("page-render-candidate-hash-does-not-match-selection"));
});

test("approval packet blocks viewport-mismatched comparison", () => {
  const result = prepareWorkHeaderApprovalPacket({ selection: selection(), pageRender: page({ comparableViewportGeometryVerified: false }) });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.includes("page-render-current-candidate-viewports-not-comparable"));
});

test("approval packet blocks when screenshots do not prove candidate render changed", () => {
  const result = prepareWorkHeaderApprovalPacket({ selection: selection(), pageRender: page({ candidateRenderDifferenceVerified: false }) });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.includes("page-render-does-not-prove-candidate-was-visible-in-both-viewports"));
});

test("approval packet blocks a candidate that did not materially beat current page quality", () => {
  const result = prepareWorkHeaderApprovalPacket({
    selection: selection(),
    pageRender: page({ materialPageQualityAdvantageVerified: false, pageQualityAdvantage: 0.1 }),
  });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.includes("page-render-does-not-prove-material-quality-advantage-over-current"));
});
