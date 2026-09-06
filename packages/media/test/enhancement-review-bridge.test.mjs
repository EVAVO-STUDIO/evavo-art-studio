import assert from "node:assert/strict";
import test from "node:test";

import { admitEnhancementStudioReviewManifest } from "../dist/index.js";

function manifest(overrides = {}) {
  return {
    contract: "evavo.enhancement-art-review.v1",
    source_path: "C:/EVAVO/source.png",
    source_sha256: "a".repeat(64),
    source_width: 800,
    source_height: 450,
    candidate_path: "C:/EVAVO/candidate.png",
    candidate_sha256: "b".repeat(64),
    candidate_width: 1600,
    candidate_height: 900,
    enhancement_profile: "continuous-tone",
    art_studio_review_profile: "web-hero",
    intended_role: "work-header",
    learned_candidate: true,
    mandatory_art_studio_tools: [
      "evavo_review_existing_image_quality",
      "evavo_review_existing_image_edit",
      "evavo_create_existing_image_inspection_proof",
      "evavo_review_work_header_image",
      "evavo_review_image_for_intended_use",
      "evavo_compare_work_header_candidates",
      "evavo_record_work_header_visual_critique",
      "evavo_resolve_work_header_selection",
    ],
    mandatory_visual_checks: ["inspect source vs candidate", "inspect actual page crops", "compare viable header options side-by-side", "retain current header unless replacement proves material advantage", "require semantic project brief"],
    approval_state: "unapproved",
    source_immutable: true,
    candidate_is_review_only: true,
    art_studio_visual_review_required: true,
    page_context_review_required: true,
    comparative_candidate_review_required: true,
    current_header_baseline_required: true,
    semantic_review_brief_required: true,
    publication_allowed: false,
    cloud_overwrite_allowed: false,
    automatic_creative_approval: false,
    automatic_release_approval: false,
    ...overrides,
  };
}

test("admits a source-bound Work header enhancement only as review material", () => {
  const admitted = admitEnhancementStudioReviewManifest(manifest());
  assert.equal(admitted.profile, "web-hero");
  assert.equal(admitted.intendedRole, "work-header");
  assert.equal(admitted.learnedCandidate, true);
  assert.equal(admitted.pageContextReviewRequired, true);
  assert.equal(admitted.comparativeCandidateReviewRequired, true);
  assert.equal(admitted.currentHeaderBaselineRequired, true);
  assert.equal(admitted.semanticReviewBriefRequired, true);
  assert.equal(admitted.publicationAllowed, false);
  assert.equal(admitted.cloudOverwriteAllowed, false);
  assert.equal(admitted.finalApprovalRequired, true);
});

test("rejects enhancement manifests that try to carry publication authority", () => {
  assert.throws(() => admitEnhancementStudioReviewManifest(manifest({ publication_allowed: true })), /forbidden publication\/approval authority/u);
});

test("rejects Work header manifests that omit page-context review", () => {
  assert.throws(() => admitEnhancementStudioReviewManifest(manifest({ page_context_review_required: false })), /page-context review/u);
});

test("rejects Work header manifests that omit comparative candidate review", () => {
  assert.throws(() => admitEnhancementStudioReviewManifest(manifest({ comparative_candidate_review_required: false })), /comparative candidate review/u);
});

test("rejects Work header manifests that omit current-header baseline review", () => {
  assert.throws(() => admitEnhancementStudioReviewManifest(manifest({ current_header_baseline_required: false })), /current-header baseline review/u);
});

test("rejects Work header manifests that omit semantic project review brief", () => {
  assert.throws(() => admitEnhancementStudioReviewManifest(manifest({ semantic_review_brief_required: false })), /semantic project review brief/u);
});

test("rejects Work header manifests with a weaker review profile", () => {
  assert.throws(() => admitEnhancementStudioReviewManifest(manifest({ art_studio_review_profile: "illustration" })), /requires Art Studio profile web-hero/u);
});

test("rejects enhancement candidates smaller than the immutable source", () => {
  assert.throws(() => admitEnhancementStudioReviewManifest(manifest({ candidate_width: 640, candidate_height: 360 })), /cannot be smaller than the immutable source/u);
});

test("rejects Work header manifests missing the visual critique tool", () => {
  const tools = manifest().mandatory_art_studio_tools.filter((tool) => tool !== "evavo_record_work_header_visual_critique");
  assert.throws(() => admitEnhancementStudioReviewManifest(manifest({ mandatory_art_studio_tools: tools })), /must require evavo_record_work_header_visual_critique/u);
});

test("rejects Work header manifests missing the conservative selection resolver", () => {
  const tools = manifest().mandatory_art_studio_tools.filter((tool) => tool !== "evavo_resolve_work_header_selection");
  assert.throws(() => admitEnhancementStudioReviewManifest(manifest({ mandatory_art_studio_tools: tools })), /must require evavo_resolve_work_header_selection/u);
});
