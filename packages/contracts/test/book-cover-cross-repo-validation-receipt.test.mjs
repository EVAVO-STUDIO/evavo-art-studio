import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT_V2,
  compileBookCoverCommercialReleaseAuthorityV2,
} from "../dist/book-cover-commercial-release-v2.js";
import {
  BOOK_COVER_MANUSCRIPT_AUTHORITY_CONTRACT,
  compileBookCoverManuscriptAuthority,
} from "../dist/book-cover-manuscript-authority.js";
import {
  BOOK_COVER_CROSS_REPO_VALIDATION_RECEIPT_CONTRACT,
  compileBookCoverCrossRepoValidationReceipt,
  validateBookCoverCrossRepoValidationReceipt,
} from "../dist/book-cover-cross-repo-validation-receipt.js";

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

function commercialInput() {
  const artProofIds = ["grayscale", "blur_squint", "retailer_light_dark", "full_size"];
  const deferredProofIds = ["thumbnail_60px", "spine_shelf", "full_wrap", "physical_print"];
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
      recognitionSignals: ["strong title hierarchy"],
      saturationRisks: ["generic hooded figure"],
      differentiators: ["law beneath law motif"],
      prohibitedImitations: ["no copied layout"],
      researchLimitations: ["rank snapshots are contextual"],
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
        ],
        retailProofPlan: {
          requiredProofs: [...artProofIds, ...deferredProofIds].map((proofId) => ({
            proofId,
            passCondition: "Passes exact proof condition.",
            humanDecisionRequired: true,
          })),
        },
        directionFingerprint: digest("2"),
      },
      blockers: [],
      warnings: [],
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
      selectionRationale: ["Most manuscript-specific route."],
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
      notes: ["Passed."],
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
      notes: [],
    },
    approval: {
      decision: "approve_for_docs_composition",
      reviewerName: "Jordan Vale",
      reviewerRole: "Senior Art Director",
      reviewedAt: "2026-08-28T06:00:00.000Z",
      rationale: ["Specific to the manuscript."],
      acknowledgedWarnings: [],
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

function manuscriptInput() {
  return {
    outputKind: "evavo_art_book_cover_manuscript_authority_input",
    schemaVersion: 1,
    contract: BOOK_COVER_MANUSCRIPT_AUTHORITY_CONTRACT,
    projectId: "project-daos",
    bookId: "book-law-under-law",
    manuscriptRevisionId: "rev-440",
    manuscriptSha256: digest("a"),
    canonSnapshotFingerprint: digest("b"),
    seriesContextFingerprint: digest("c"),
    sourcePlanFingerprint: digest("d"),
    title: "The Law Under the Law",
    authorDisplayName: "Greg Parker",
    evidence: [{
      evidenceId: "bell",
      kind: "motif",
      label: "Iron bell",
      sourceLocationIds: ["book-one:page-6"],
      sourceExcerptSha256: digest("e"),
      canonFactIds: ["canon:bell"],
      spoilerLevel: "none",
      approvedForCoverUse: true,
    }],
    approvedSpoilerCeiling: "minor",
    approvedAt: "2026-08-28T02:00:00Z",
    approvedBy: "named-editor",
    approvedByKind: "human",
  };
}

test("emits a receipt only after both exact Art authorities validate", () => {
  const commercial = compileBookCoverCommercialReleaseAuthorityV2(commercialInput()).authority;
  const manuscript = compileBookCoverManuscriptAuthority(manuscriptInput());
  const receipt = compileBookCoverCrossRepoValidationReceipt({
    outputKind: "evavo_art_book_cover_cross_repo_validation_receipt_input",
    schemaVersion: 1,
    contract: BOOK_COVER_CROSS_REPO_VALIDATION_RECEIPT_CONTRACT,
    commercialAuthority: commercial,
    manuscriptAuthority: manuscript,
    validatedAt: "2026-08-29T07:00:00Z",
    validatorId: "art-studio-contracts-v1",
  });
  assert.equal(receipt.commercialAuthorityDigestSha256, commercial.authorityDigestSha256);
  assert.equal(receipt.manuscriptAuthorityFingerprint, manuscript.authorityFingerprint);
  assert.deepEqual(validateBookCoverCrossRepoValidationReceipt(receipt), { valid: true, issues: [] });
});

test("receipt validation detects post-validation tampering", () => {
  const commercial = compileBookCoverCommercialReleaseAuthorityV2(commercialInput()).authority;
  const manuscript = compileBookCoverManuscriptAuthority(manuscriptInput());
  const receipt = compileBookCoverCrossRepoValidationReceipt({
    outputKind: "evavo_art_book_cover_cross_repo_validation_receipt_input",
    schemaVersion: 1,
    contract: BOOK_COVER_CROSS_REPO_VALIDATION_RECEIPT_CONTRACT,
    commercialAuthority: commercial,
    manuscriptAuthority: manuscript,
    validatedAt: "2026-08-29T07:00:00Z",
    validatorId: "art-studio-contracts-v1",
  });
  const forged = structuredClone(receipt);
  forged.bookId = "other-book";
  assert.equal(validateBookCoverCrossRepoValidationReceipt(forged).valid, false);
});
