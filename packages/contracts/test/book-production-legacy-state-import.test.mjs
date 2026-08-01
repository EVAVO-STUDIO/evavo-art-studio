import assert from "node:assert/strict";
import test from "node:test";

import { importLegacyWebsiteBookArtState } from "../dist/index.js";

const sha = (character) => character.repeat(64);
const identity = { workspaceId: "workspace-1", projectId: "project-1", bookId: "book-1", editionId: "paperback-1", requestId: "request-legacy-1" };

function qualityAuthority() {
  return {
    outputKind: "book_cover_artwork_quality_authority",
    version: "book_cover_artwork_quality_authority_v1",
    status: "approved_for_composition",
    projectId: identity.projectId,
    artDirectionDigestSha256: sha("a"),
    candidate: {
      candidateId: "candidate-1",
      artifactReference: "book-cover-artifact://project-1/art/candidate-1.png",
      expectedSha256: sha("b"),
      provenance: {
        origin: "generative_assisted",
        creatorName: "Named art director",
        creatorRole: "art director",
        rightsStatus: "approved_commercial",
        rightsReference: "rights-record-1",
        sourceReference: "source-artifact-1",
        generation: {
          provider: "reviewed-provider",
          model: "reviewed-model",
          modelVersion: "1.0",
          runId: "run-1",
          promptRecordId: "prompt-1",
          promptSha256: sha("c"),
          referenceAssetSha256s: [sha("d")],
          humanEditSummary: ["Corrected anatomy and removed pseudo-text."],
        },
        c2pa: { status: "not_checked" },
        ingredientSha256s: [sha("d")],
      },
    },
    governedArtifact: {
      reference: "book-cover-artifact://project-1/art/candidate-1.png",
      checksumSha256: sha("b"),
      kind: "source_artwork",
      mimeType: "image/png",
      byteLength: 123456,
      widthPx: 3000,
      heightPx: 4800,
    },
    humanReview: {
      decision: "approve_for_composition",
      reviewerName: "Named art director",
      reviewerRole: "art director",
      reviewedAt: "2026-08-02T00:00:00.000Z",
      answers: { generated_text_contamination: "pass" },
    },
    hardErrors: [],
    warnings: [],
    requiredRevisions: [],
    authorityDigestSha256: sha("e"),
  };
}
function candidateSetAuthority() {
  return {
    outputKind: "book_cover_artwork_candidate_set_authority",
    version: "book_cover_artwork_candidate_set_authority_v1",
    status: "selected_for_composition",
    projectId: identity.projectId,
    artDirectionDigestSha256: sha("a"),
    selectedCandidateId: "candidate-1",
    selectedQualityAuthorityDigestSha256: sha("e"),
    hardErrors: [], warnings: [], authorityDigestSha256: sha("f"),
  };
}
function selectionBinding() {
  return {
    outputKind: "book_cover_artwork_selection_binding",
    version: "book_cover_artwork_selection_binding_v1",
    status: "selected_for_composition",
    projectId: identity.projectId,
    candidateId: "candidate-1",
    sourceArtifactReference: "book-cover-artifact://project-1/art/candidate-1.png",
    sourceArtifactSha256: sha("b"),
    artworkQualityAuthorityDigestSha256: sha("e"),
    candidateSetAuthorityDigestSha256: sha("f"),
    artDirectionDigestSha256: sha("a"),
    selectedBy: "Named art director",
    selectedByRole: "art director",
    selectedAt: "2026-08-02T00:00:00.000Z",
    bindingDigestSha256: sha("1"),
  };
}
function input() {
  return {
    outputKind: "evavo_legacy_website_book_art_state_import_input",
    schemaVersion: 1,
    identity,
    sourceBriefFingerprint: sha("a"),
    qualityAuthority: qualityAuthority(),
    candidateSetAuthority: candidateSetAuthority(),
    selectionBinding: selectionBinding(),
  };
}

test("imports exact Website selection evidence as review-required, never approved", () => {
  const result = importLegacyWebsiteBookArtState(input());
  assert.equal(result.status, "selection_evidence_imported", result.blockers.join("\n"));
  assert.equal(result.receipt?.status, "review_required");
  assert.equal(result.receipt?.artifactReference, "book-cover-artifact://project-1/art/candidate-1.png");
  assert.equal(result.receipt?.selectionReceiptSha256, sha("f"));
  assert.equal(result.receipt?.promotionReceiptSha256, undefined);
  assert.equal(result.promotionRequired, true);
  assert.equal(result.legacyApprovalPromotedAutomatically, false);
  assert.equal(result.artifactBytesRewritten, false);
  assert.ok(result.warnings.some((entry) => entry.includes("new Art Studio promotion")));
});

test("imports quality-only evidence as a candidate", () => {
  const value = input();
  delete value.candidateSetAuthority;
  delete value.selectionBinding;
  const result = importLegacyWebsiteBookArtState(value);
  assert.equal(result.status, "candidate_imported", result.blockers.join("\n"));
  assert.equal(result.receipt?.status, "candidate");
  assert.equal(result.receipt?.selectionReceiptSha256, undefined);
});

test("blocks mismatched legacy binding bytes", () => {
  const value = input();
  value.selectionBinding.sourceArtifactSha256 = sha("9");
  const result = importLegacyWebsiteBookArtState(value);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.includes("different artifact bytes")));
});

test("blocks unknown origin and missing rights evidence", () => {
  const value = input();
  value.qualityAuthority.candidate.provenance.origin = "unknown";
  value.qualityAuthority.candidate.provenance.rightsReference = "";
  const result = importLegacyWebsiteBookArtState(value);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.includes("not safely migratable")));
  assert.ok(result.blockers.some((entry) => entry.includes("rights reference is missing")));
});

test("blocks a legacy blocked quality authority", () => {
  const value = input();
  value.qualityAuthority.status = "blocked";
  value.qualityAuthority.hardErrors = ["Generated lettering remains in the source art."];
  const result = importLegacyWebsiteBookArtState(value);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((entry) => entry.includes("not eligible")));
  assert.ok(result.blockers.some((entry) => entry.includes("Generated lettering")));
});
