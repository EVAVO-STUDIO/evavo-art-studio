import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import { compileQaReviewedApprovedSourcesManifest } from "../dist/tile-map-qa-approved-sources.js";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(",")}}`;
};
const fingerprint = (value) => sha(Buffer.from(canonical(value), "utf8"));

async function fixture({ candidateClear = true, familyClear = true, wrongReview = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-tile-map-qa-approval-"));
  const candidateBytes = await sharp({
    create: {
      width: 16,
      height: 16,
      channels: 4,
      background: { r: 42, g: 132, b: 70, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  const candidatePath = path.join(root, "candidate.png");
  await writeFile(candidatePath, candidateBytes);

  const packagePayload = {
    schema_version: 1,
    source_plan_sha256: "a".repeat(64),
    source_plan_fingerprint: "b".repeat(64),
    source_map_fingerprint: "c".repeat(64),
    map_id: "map",
    consumer_adapter: "epochbound",
    production_profile: "snes-topdown-rpg",
    projection: "orthogonal",
    tasks: [
      {
        task_id: "task-grass",
        visual_family: "epochbound:verdant:terrain:grass",
        task_kind: "tile-family",
        projection: "orthogonal",
        dimensions: { width: 16, height: 16 },
        required_approved_variants: 1,
        candidate_count: 4,
        alpha_required: false,
        semantic_source_ids: ["grass"],
        immutable_semantic_rules: ["Preserve gameplay semantics."],
        creative_direction: ["SNES terrain."],
        topology: null,
        feature_kind: null,
      },
    ],
    authority: {},
    promotion_policy: {},
    status: "ready-for-candidate-authoring",
    package_fingerprint: "d".repeat(64),
  };
  const packagePath = path.join(root, "source-package.json");
  await writeFile(packagePath, JSON.stringify(packagePayload));

  const providerResults = {
    schema_version: 1,
    source_batch_fingerprint: "e".repeat(64),
    source_provider_batch_fingerprint: "f".repeat(64),
    source_execution_sha256: "1".repeat(64),
    source_map_fingerprint: "c".repeat(64),
    authority: {
      provider_output_authority: "intermediate-only",
      review_required: true,
      approval_authority: false,
    },
    candidates: [
      {
        candidate_id: "candidate-1",
        path: "candidate.png",
        sha256: sha(candidateBytes),
      },
    ],
  };
  const providerResultsPath = path.join(root, "provider-results.json");
  await writeFile(providerResultsPath, JSON.stringify(providerResults));
  const providerResultsBytes = await readFile(providerResultsPath);

  const review = {
    schema_version: 1,
    source_batch_sha256: "2".repeat(64),
    source_batch_fingerprint: "e".repeat(64),
    source_package_fingerprint: "d".repeat(64),
    source_provider_batch_fingerprint: "f".repeat(64),
    source_execution_sha256: "1".repeat(64),
    source_map_fingerprint: "c".repeat(64),
    provider_results_path: providerResultsPath,
    provider_results_sha256: sha(providerResultsBytes),
    candidate_root: root,
    map_id: "map",
    projection: "orthogonal",
    candidates: [
      {
        candidate_id: "candidate-1",
        task_id: "task-grass",
        visual_family: "epochbound:verdant:terrain:grass",
        path: "candidate.png",
        sha256: sha(candidateBytes),
        bytes: candidateBytes.length,
        width: 16,
        height: 16,
        has_alpha: true,
        structural_review: "pending",
        visual_review: "pending",
        creative_review: "pending",
        promotion_eligible: false,
      },
    ],
    authority: {
      semantic_authority: "tile-map-studio",
      review_authority: "art-studio",
      provider_authority: "intermediate-only",
      execution_evidence_required: true,
    },
    status: "awaiting-review",
    review_fingerprint: "3".repeat(64),
  };
  const reviewPath = path.join(root, "review.json");
  await writeFile(reviewPath, JSON.stringify(review));

  const qaBase = {
    schema_version: 1,
    source_package_path: packagePath,
    source_package_sha256: sha(await readFile(packagePath)),
    source_package_fingerprint: "d".repeat(64),
    source_review_path: reviewPath,
    source_review_sha256: sha(await readFile(reviewPath)),
    source_review_fingerprint: wrongReview ? "4".repeat(64) : "3".repeat(64),
    source_provider_batch_fingerprint: "f".repeat(64),
    source_execution_sha256: "1".repeat(64),
    source_map_fingerprint: "c".repeat(64),
    map_id: "map",
    consumer_adapter: "epochbound",
    production_profile: "snes-topdown-rpg",
    projection: "orthogonal",
    policy: {},
    policy_source: { kind: "profile-default", path: null, sha256: null },
    candidates: [
      {
        candidate_id: "candidate-1",
        task_id: "task-grass",
        visual_family: "epochbound:verdant:terrain:grass",
        metrics: {},
        findings: candidateClear
          ? []
          : [
              {
                code: "TILE_MAP_QA_NEAR_BLANK",
                severity: "error",
                message: "candidate is blank",
              },
            ],
        technically_clear: candidateClear,
        creative_approval: false,
      },
    ],
    families: [
      {
        visual_family: "epochbound:verdant:terrain:grass",
        task_id: "task-grass",
        required_approved_variants: 1,
        candidate_count: 1,
        effective_visual_variants: familyClear ? 1 : 0,
        pairwise_comparisons: [],
        findings: familyClear
          ? []
          : [
              {
                code: "TILE_MAP_QA_EFFECTIVE_VARIANTS",
                severity: "error",
                message: "not enough useful variants",
              },
            ],
        technically_clear: familyClear,
        creative_approval: false,
      },
    ],
    summary: {
      candidates: 1,
      candidate_errors: candidateClear ? 0 : 1,
      candidate_warnings: 0,
      family_errors: familyClear ? 0 : 1,
      family_warnings: 0,
      technically_clear_candidates: candidateClear ? 1 : 0,
    },
    authority: {
      semantic_authority: "tile-map-studio",
      automated_technical_qa: true,
      structural_review_decision: false,
      visual_review_decision: false,
      creative_approval: false,
      provider_execution: false,
      candidate_promotion: false,
    },
    status: candidateClear && familyClear ? "passed" : "blocked",
  };
  const qa = { ...qaBase, qa_fingerprint: fingerprint(qaBase) };
  const qaPath = path.join(root, "candidate-qa.json");
  await writeFile(qaPath, JSON.stringify(qa));

  const finalization = {
    schema_version: 1,
    source_review_fingerprint: "3".repeat(64),
    source_package_fingerprint: "d".repeat(64),
    source_map_fingerprint: "c".repeat(64),
    map_id: "map",
    projection: "orthogonal",
    creative_approval: {
      decision: "approved",
      approved_by: "EVAVO creative review",
      approved_at: "2026-08-30T00:00:00Z",
    },
    candidates: [
      {
        candidate_id: "candidate-1",
        task_id: "task-grass",
        visual_family: "epochbound:verdant:terrain:grass",
        path: "candidate.png",
        sha256: sha(candidateBytes),
        structural: "approved",
        visual: "approved",
        creative: "approved",
        notes: null,
      },
    ],
    tasks: [
      {
        task_id: "task-grass",
        visual_family: "epochbound:verdant:terrain:grass",
        approved_sources: [{ path: "candidate.png", sha256: sha(candidateBytes) }],
      },
    ],
    authority: {},
    status: "review-finalized",
    finalization_fingerprint: "5".repeat(64),
  };
  const finalizationPath = path.join(root, "finalization.json");
  await writeFile(finalizationPath, JSON.stringify(finalization));
  return { packagePath, reviewPath, qaPath, finalizationPath };
}

test("QA-cleared reviewed sources retain blocking QA provenance", async () => {
  const input = await fixture();
  const result = await compileQaReviewedApprovedSourcesManifest(
    input.packagePath,
    input.reviewPath,
    input.qaPath,
    input.finalizationPath,
  );
  assert.equal(result.eligible_for_sprite_studio, true);
  assert.equal(result.candidate_qa_authority, "blocking-technical-evidence-only");
  assert.equal(result.source_candidate_qa_fingerprint.length, 64);
  assert.equal(result.pre_candidate_qa_manifest_fingerprint.length, 64);
  assert.notEqual(result.manifest_fingerprint, result.pre_candidate_qa_manifest_fingerprint);
});

test("technically blocked candidate cannot be creatively promoted", async () => {
  const input = await fixture({ candidateClear: false });
  await assert.rejects(
    () =>
      compileQaReviewedApprovedSourcesManifest(
        input.packagePath,
        input.reviewPath,
        input.qaPath,
        input.finalizationPath,
      ),
    /automated technical QA has blocking findings/u,
  );
});

test("family-level effective-variant failure blocks source export", async () => {
  const input = await fixture({ familyClear: false });
  await assert.rejects(
    () =>
      compileQaReviewedApprovedSourcesManifest(
        input.packagePath,
        input.reviewPath,
        input.qaPath,
        input.finalizationPath,
      ),
    /fails effective-variant QA/u,
  );
});

test("candidate QA from another review cannot be reused", async () => {
  const input = await fixture({ wrongReview: true });
  await assert.rejects(
    () =>
      compileQaReviewedApprovedSourcesManifest(
        input.packagePath,
        input.reviewPath,
        input.qaPath,
        input.finalizationPath,
      ),
    /does not target the exact review manifest/u,
  );
});
