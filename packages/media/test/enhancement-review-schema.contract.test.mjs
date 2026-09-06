import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaUrl = new URL("../../../contracts/art-studio-enhancement-review-v1.schema.json", import.meta.url);
const bridgeUrl = new URL("../src/enhancement-review-bridge.ts", import.meta.url);

const REQUIRED = [
  "contract",
  "source_path",
  "source_sha256",
  "source_width",
  "source_height",
  "candidate_path",
  "candidate_sha256",
  "candidate_width",
  "candidate_height",
  "enhancement_profile",
  "art_studio_review_profile",
  "intended_role",
  "learned_candidate",
  "comparison",
  "mandatory_art_studio_tools",
  "mandatory_visual_checks",
  "approval_state",
  "source_immutable",
  "candidate_is_review_only",
  "art_studio_visual_review_required",
  "durable_image_review_session_required",
  "page_context_review_required",
  "comparative_candidate_review_required",
  "current_header_baseline_required",
  "semantic_review_brief_required",
  "candidate_preview_admission_required",
  "candidate_page_render_review_required",
  "approval_packet_required",
  "publication_allowed",
  "cloud_overwrite_allowed",
  "automatic_creative_approval",
  "automatic_release_approval",
];

test("enhancement handoff schema fails closed and preserves authority boundaries", async () => {
  const schema = JSON.parse(await readFile(schemaUrl, "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.contract.const, "evavo.enhancement-art-review.v1");
  for (const key of REQUIRED) {
    assert.ok(schema.required.includes(key), `schema no longer requires ${key}`);
    assert.ok(Object.hasOwn(schema.properties, key), `schema no longer defines ${key}`);
  }
  for (const key of ["publication_allowed", "cloud_overwrite_allowed", "automatic_creative_approval", "automatic_release_approval"]) {
    assert.equal(schema.properties[key].const, false, `${key} authority boundary drifted`);
  }
  for (const key of ["source_immutable", "candidate_is_review_only", "art_studio_visual_review_required", "durable_image_review_session_required"]) {
    assert.equal(schema.properties[key].const, true, `${key} preservation boundary drifted`);
  }
});

test("TypeScript enhancement admission still implements schema-critical fields", async () => {
  const bridge = await readFile(bridgeUrl, "utf8");
  for (const token of [
    "durable_image_review_session_required",
    "page_context_review_required",
    "comparative_candidate_review_required",
    "current_header_baseline_required",
    "semantic_review_brief_required",
    "candidate_preview_admission_required",
    "candidate_page_render_review_required",
    "approval_packet_required",
    "publication_allowed",
    "cloud_overwrite_allowed",
    "automatic_creative_approval",
    "automatic_release_approval",
    "candidateAspectRatioRelativeDrift",
    "maximumAspectRatioRelativeDrift",
  ]) assert.ok(bridge.includes(token), `TypeScript admission missing schema-critical token ${token}`);
});
