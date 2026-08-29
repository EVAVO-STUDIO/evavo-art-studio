import assert from "node:assert/strict";
import test from "node:test";
import {
  BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT_V2,
  compileBookCoverCommercialReleaseAuthorityV2,
  validateBookCoverCommercialReleaseAuthorityV2,
} from "../dist/book-cover-commercial-release-v2.js";

const digest = (character = "a") => `sha256:${character.repeat(64)}`;
const execution = {
  mode: "local_first_zero_cost",
  localValidationCommand: "node scripts/run-book-cover-commercial-release-v2-local.mjs",
  githubHostedActionsRequired: false,
  paidCiRequired: false,
  paidCrawlerRequired: false,
  paidImageApiRequiredForValidation: false,
  vercelBackgroundWorkerRequired: false,
  requestTimeMarketplaceBrowsingAllowed: false,
  networkRequiredForValidation: false,
  workflowFilesAuthoritative: false,
};

function baseInput() {
  const artProofIds = ["grayscale", "blur_squint", "retailer_light_dark", "full_size"];
  const deferredProofIds = ["thumbnail_60px", "thumbnail_100px", "spine_shelf", "full_wrap", "physical_print"];
  const requiredProofIds = [...artProofIds, ...deferredProofIds];
  return {
    outputKind: "evavo_art_book_cover_commercial_release_input",
    schemaVersion: 2,
    contract: BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT_V2,
    projectId: "project-daos",
    bookId: "book-law-under-law",
    editionId: "paperback-v1",
    compiledAt: "2026-08-29T06:00:00.000Z",
    marketAuthority: {
      sourceRepository: "EVAVO-STUDIO/Website",
      sourceOutputKind: "book_cover_genre_market_authority",
      sourceSchemaVersion: "book_cover_genre_market_authority_v1",
      status: "ready_for_production",
      projectId: "project-daos",
      bookId: "book-law-under-law",
      evaluatedAt: "2026-08-20T00:00:00.000Z",
      authorityDigestSha256: "1".repeat(64),
      evidencePolicyVersion: "book_cover_market_evidence_policy_v2",
      currentComparableCount: 15,
      categoryLeaderCount: 5,
      recentReleaseCount: 5,
      adjacentOpportunityCount: 5,
      categoryPathCount: 3,
      distinctAuthorCount: 12,
      visualModeCount: 4,
      titleStyleCount: 3,
      paletteFamilyCount: 4,
      sourceHostCount: 3,
      coverSnapshotDigestCount: 12,
      recognitionSignals: ["strong title hierarchy", "single ownable symbol"],
      saturationRisks: ["generic hooded figure"],
      differentiators: ["law beneath law motif", "institutional dread"],
      prohibitedImitations: ["no copied layout", "no copied palette", "no copied lettering"],
      researchLimitations: ["rank snapshots are contextual and not sales attribution"],
      salesGuaranteeAllowed: false,
      competitorImitationAllowed: false,
      machineAutoApprovalAllowed: false,
      zeroCostExecution: execution,
    },
    designIntelligence: {
      outputKind: "evavo_art_book_cover_design_intelligence_result",
      schemaVersion: 1,
      contract: "evavo_art_book_cover_design_intelligence_v1",
      status: "ready",
      bookId: "book-law-under-law",
      editionId: "paperback-v1",
      direction: {
        typography: {
          exactTitle: "The Law Under the Law",
          exactAuthorDisplayName: "Greg Parker",
          authority: "evavo-docs-suite",
          artworkTextPolicy: "text_free",
        },
        routes: [
          { routeId: "route-seal", kind: "documentary_artifact", label: "The broken seal" },
          { routeId: "route-void", kind: "relational_negative_space", label: "Law as absence" },
          { routeId: "route-stone", kind: "cropped_material_evidence", label: "Law in stone" },
        ],
        retailProofPlan: {
          requiredProofs: requiredProofIds.map((proofId) => ({
            proofId,
            passCondition: "Passes exact proof condition.",
            humanDecisionRequired: true,
          })),
        },
        directionFingerprint: digest("2"),
      },
      blockers: [],
      warnings: ["human_market_and_craft_review_remains_required"],
      providerCallPerformed: false,
      selectionPerformed: false,
      promotionPerformed: false,
      publicationPerformed: false,
    },
    selection: {
      routeId: "route-seal",
      candidateSetAuthorityDigestSha256: digest("3"),
      selectedCandidateId: "candidate-seal-03",
      selectedCandidateArtifactSha256: digest("4"),
      finalTextFreeArtworkSha256: digest("5"),
      selectedBy: "Avery Reed",
      selectedAt: "2026-08-28T04:00:00.000Z",
      selectionRationale: ["Most manuscript-specific route.", "Best title field and shelf distinction."],
      independentCandidatesReviewed: 4,
      pairwiseOriginalityReviewCompleted: true,
      candidateArtworkTextFree: true,
      editableTypographyDeferredToDocsSuite: true,
      humanFinishingCompleted: true,
      humanFinisherName: "Mara Chen",
      humanFinishingEvidenceSha256: digest("6"),
      automaticSelectionAllowed: false,
    },
    proofResults: artProofIds.map((proofId) => ({
      proofId,
      status: "pass",
      reviewedBy: "Rowan Price",
      reviewedAt: "2026-08-28T05:00:00.000Z",
      evidenceSha256: digest("7"),
      notes: ["Proof passed against the governed condition."],
    })),
    rightsAndProvenance: {
      sourceManifestSha256: digest("8"),
      rightsReviewStatus: "cleared",
      sourceProvenanceStatus: "complete",
      humanCraftEvidenceStatus: "complete",
      aiContentClassification: "ai_assisted",
      kdpDisclosureAction: "confirm_before_upload",
      providerAndModelRecorded: true,
      sourceLicencesRecorded: true,
      finalArtworkRightsCleared: true,
      reviewedBy: "Alex Morgan",
      reviewedAt: "2026-08-28T03:00:00.000Z",
      notes: ["All source and transformation records retained."],
    },
    approval: {
      decision: "approve_for_docs_composition",
      reviewerName: "Jordan Vale",
      reviewerRole: "Senior Art Director",
      reviewedAt: "2026-08-28T06:00:00.000Z",
      rationale: ["The cover is category-legible without copying.", "The final art is specific to the manuscript."],
      acknowledgedWarnings: ["human_market_and_craft_review_remains_required"],
      confirmsMarketFitWithoutImitation: true,
      confirmsManuscriptSpecificity: true,
      confirmsTextFreeArtwork: true,
      confirmsNamedHumanFinishing: true,
    },
    execution,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    publicationAllowed: false,
  };
}

test("authorizes only a fully evidenced local-first Docs Suite handoff", () => {
  const result = compileBookCoverCommercialReleaseAuthorityV2(baseInput());
  assert.equal(result.status, "ready_for_docs_composition");
  assert.equal(result.docsSuiteCompositionAuthorized, true);
  assert.equal(result.authority.execution.githubHostedActionsRequired, false);
  assert.equal(result.authority.execution.vercelBackgroundWorkerRequired, false);
  assert.equal(result.authority.exactMetadataHandoff.artworkTextPolicy, "text_free");
  assert.deepEqual(result.authority.proofSummary.requiredArtStageProofIds, ["blur_squint", "full_size", "grayscale", "retailer_light_dark"]);
  assert.deepEqual(result.authority.proofSummary.deferredToDocsSuiteProofIds, ["full_wrap", "physical_print", "spine_shelf", "thumbnail_100px", "thumbnail_60px"]);
  assert.deepEqual(validateBookCoverCommercialReleaseAuthorityV2(result.authority), { valid: true, issues: [] });
});

test("is deterministic for identical retained evidence", () => {
  const first = compileBookCoverCommercialReleaseAuthorityV2(baseInput());
  const second = compileBookCoverCommercialReleaseAuthorityV2(baseInput());
  assert.equal(first.authority.authorityDigestSha256, second.authority.authorityDigestSha256);
  assert.deepEqual(first, second);
});

test("requires current market evidence", () => {
  const input = baseInput();
  input.marketAuthority.evaluatedAt = "2025-12-01T00:00:00.000Z";
  const result = compileBookCoverCommercialReleaseAuthorityV2(input);
  assert.equal(result.status, "needs_market_research");
  assert.equal(result.docsSuiteCompositionAuthorized, false);
});

test("requires every governed Art-stage proof to pass", () => {
  const input = baseInput();
  input.proofResults[0].status = "fail";
  const result = compileBookCoverCommercialReleaseAuthorityV2(input);
  assert.equal(result.status, "needs_retail_proofs");
  assert.equal(result.authority.proofSummary.failedArtStageProofCount, 1);
});

test("rejects post-composition proof evidence before Docs Suite composition", () => {
  const input = baseInput();
  input.proofResults.push({
    proofId: "full_wrap",
    status: "pass",
    reviewedBy: "Rowan Price",
    reviewedAt: "2026-08-28T05:00:00.000Z",
    evidenceSha256: digest("9"),
    notes: ["This proof cannot exist before exact wrap composition."],
  });
  const result = compileBookCoverCommercialReleaseAuthorityV2(input);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join(" "), /cannot be accepted before Docs Suite/);
});

test("blocks generated or baked-in cover typography", () => {
  const input = baseInput();
  input.selection.candidateArtworkTextFree = false;
  const result = compileBookCoverCommercialReleaseAuthorityV2(input);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join(" "), /candidateArtworkTextFree/);
});

test("blocks paid or workflow-authoritative execution dependencies", () => {
  const input = baseInput();
  input.execution.githubHostedActionsRequired = true;
  input.marketAuthority.zeroCostExecution.githubHostedActionsRequired = true;
  const result = compileBookCoverCommercialReleaseAuthorityV2(input);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join(" "), /githubHostedActionsRequired/);
});

test("blocks automatic selection", () => {
  const input = baseInput();
  input.selection.automaticSelectionAllowed = true;
  const result = compileBookCoverCommercialReleaseAuthorityV2(input);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join(" "), /automaticSelectionAllowed/);
});

test("detects authority tampering", () => {
  const result = compileBookCoverCommercialReleaseAuthorityV2(baseInput());
  const tampered = structuredClone(result.authority);
  tampered.exactMetadataHandoff.title = "A Different Title";
  const validation = validateBookCoverCommercialReleaseAuthorityV2(tampered);
  assert.equal(validation.valid, false);
  assert.match(validation.issues.join(" "), /canonical contents/);
});
