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
      "evavo_review_work_header_candidate_page_render",
      "evavo_prepare_work_header_approval_packet",
    ],
    mandatory_visual_checks: ["inspect source vs candidate", "compare responsive page renders", "retain current unless replacement proves material advantage"],
    approval_state: "unapproved",
    source_immutable: true,
    candidate_is_review_only: true,
    art_studio_visual_review_required: true,
    page_context_review_required: true,
    comparative_candidate_review_required: true,
    current_header_baseline_required: true,
    semantic_review_brief_required: true,
    candidate_page_render_review_required: true,
    approval_packet_required: true,
    publication_allowed: false,
    cloud_overwrite_allowed: false,
    automatic_creative_approval: false,
    automatic_release_approval: false,
    ...overrides,
  };
}

test("admits Work header enhancement only with complete review boundary", () => {
  const admitted = admitEnhancementStudioReviewManifest(manifest());
  assert.equal(admitted.profile, "web-hero");
  assert.equal(admitted.semanticReviewBriefRequired, true);
  assert.equal(admitted.candidatePageRenderReviewRequired, true);
  assert.equal(admitted.approvalPacketRequired, true);
  assert.equal(admitted.publicationAllowed, false);
  assert.equal(admitted.cloudOverwriteAllowed, false);
  assert.equal(admitted.finalApprovalRequired, true);
});

test("rejects publication authority", () => {
  assert.throws(() => admitEnhancementStudioReviewManifest(manifest({ publication_allowed: true })), /forbidden publication\/approval authority/u);
});

test("rejects missing candidate page-render review", () => {
  assert.throws(() => admitEnhancementStudioReviewManifest(manifest({ candidate_page_render_review_required: false })), /candidate-specific desktop\/mobile page-render review/u);
});

test("rejects missing approval packet boundary", () => {
  assert.throws(() => admitEnhancementStudioReviewManifest(manifest({ approval_packet_required: false })), /pre-approval packet/u);
});

test("rejects missing page-render review tool", () => {
  const tools = manifest().mandatory_art_studio_tools.filter((tool) => tool !== "evavo_review_work_header_candidate_page_render");
  assert.throws(() => admitEnhancementStudioReviewManifest(manifest({ mandatory_art_studio_tools: tools })), /must require evavo_review_work_header_candidate_page_render/u);
});

test("rejects missing approval packet tool", () => {
  const tools = manifest().mandatory_art_studio_tools.filter((tool) => tool !== "evavo_prepare_work_header_approval_packet");
  assert.throws(() => admitEnhancementStudioReviewManifest(manifest({ mandatory_art_studio_tools: tools })), /must require evavo_prepare_work_header_approval_packet/u);
});
