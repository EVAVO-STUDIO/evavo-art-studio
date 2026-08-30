import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import { compileReviewedApprovedSourcesManifest } from "../dist/tile-map-reviewed-approved-sources.js";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(",")}}`;
};
const hashObject = (value) => sha(Buffer.from(canonical(value), "utf8"));

async function writeJson(file, value) {
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  await writeFile(file, bytes);
  return bytes;
}

async function fixture({
  bypass = false,
  wrongReview = false,
  tamperResults = false,
  tamperMastering = false,
} = {}) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "evavo-tile-map-reviewed-approval-"),
  );
  const providerRoot = path.join(root, "provider");
  await mkdir(providerRoot, { recursive: true });
  const bytes = await sharp({
    create: {
      width: 16,
      height: 16,
      channels: 4,
      background: { r: 42, g: 130, b: 70, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  await writeFile(path.join(providerRoot, "candidate.png"), bytes);

  const sourcePackageBase = {
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
  };
  const sourcePackage = {
    ...sourcePackageBase,
    package_fingerprint: hashObject(sourcePackageBase),
  };
  const packagePath = path.join(root, "source-package.json");
  await writeJson(packagePath, sourcePackage);

  const providerBatchBase = {
    schema_version: 1,
    source_candidate_batch_sha256: "d".repeat(64),
    source_candidate_batch_fingerprint: "e".repeat(64),
    source_package_fingerprint: sourcePackage.package_fingerprint,
    source_map_fingerprint: sourcePackage.source_map_fingerprint,
    map_id: sourcePackage.map_id,
    consumer_adapter: sourcePackage.consumer_adapter,
    projection: sourcePackage.projection,
    jobs: [],
    authority: {},
    status: "ready-for-provider-runtime",
  };
  const providerBatch = {
    ...providerBatchBase,
    provider_batch_fingerprint: hashObject(providerBatchBase),
  };
  const providerBatchPath = path.join(root, "provider-batch.json");
  const providerBatchBytes = await writeJson(providerBatchPath, providerBatch);

  const executionBase = {
    schema: "evavo.tile-map-provider-execution-receipt.v1",
    status: "succeeded",
    completedAt: "2026-08-30T00:05:00.000Z",
    sourceMapFingerprint: sourcePackage.source_map_fingerprint,
    jobs: [],
    authority: {},
  };
  const executionSha256 = hashObject(executionBase);
  const execution = {
    ...executionBase,
    executionSha256,
    runId: executionSha256.slice(0, 20),
  };
  const executionPath = path.join(root, "execution.json");
  const executionBytes = await writeJson(executionPath, execution);

  const masteringBase = {
    schema: "evavo.tile-map-candidate-mastering-receipt.v1",
    status: "succeeded",
    completedAt: "2026-08-30T00:06:00.000Z",
    sourceProviderBatch: {
      path: providerBatchPath,
      fileSha256: sha(providerBatchBytes),
      documentSha256: providerBatch.provider_batch_fingerprint,
    },
    sourceProviderExecution: {
      path: executionPath,
      fileSha256: sha(executionBytes),
      documentSha256: execution.executionSha256,
    },
    sourceMapFingerprint: sourcePackage.source_map_fingerprint,
    jobs: [],
    authority: {},
  };
  const masteringSha256 = hashObject(masteringBase);
  const mastering = {
    ...masteringBase,
    masteringSha256,
    runId: masteringSha256.slice(0, 20),
  };
  const masteringPath = path.join(root, "mastering.json");
  const masteringBytes = await writeJson(masteringPath, mastering);

  const providerResultsBase = {
    schema_version: 2,
    source_batch_fingerprint: "e".repeat(64),
    source_provider_batch_path: providerBatchPath,
    source_provider_batch_sha256: sha(providerBatchBytes),
    source_provider_batch_fingerprint: providerBatch.provider_batch_fingerprint,
    source_execution_receipt_path: executionPath,
    source_execution_receipt_sha256: sha(executionBytes),
    source_execution_sha256: execution.executionSha256,
    source_mastering_receipt_path: masteringPath,
    source_mastering_receipt_sha256: sha(masteringBytes),
    source_mastering_sha256: mastering.masteringSha256,
    source_map_fingerprint: sourcePackage.source_map_fingerprint,
    candidates: [
      {
        candidate_id: "candidate-1",
        path: "candidate.png",
        sha256: sha(bytes),
      },
    ],
    authority: {
      provider_output_authority: "intermediate-only",
      deterministic_mastering_required: true,
      mastering_quality_required: true,
      review_required: true,
      approval_authority: false,
    },
  };
  const providerResults = {
    ...providerResultsBase,
    results_fingerprint: hashObject(providerResultsBase),
  };
  const providerResultsPath = path.join(providerRoot, "provider-results.json");
  const providerResultsBytes = await writeJson(
    providerResultsPath,
    providerResults,
  );

  const reviewBase = {
    schema_version: 1,
    source_batch_sha256: "f".repeat(64),
    source_batch_fingerprint: "e".repeat(64),
    source_package_fingerprint: sourcePackage.package_fingerprint,
    source_provider_batch_path: providerBatchPath,
    source_provider_batch_sha256: sha(providerBatchBytes),
    source_provider_batch_fingerprint: providerBatch.provider_batch_fingerprint,
    source_execution_receipt_path: executionPath,
    source_execution_receipt_sha256: sha(executionBytes),
    source_execution_sha256: execution.executionSha256,
    source_mastering_receipt_path: masteringPath,
    source_mastering_receipt_sha256: sha(masteringBytes),
    source_mastering_sha256: mastering.masteringSha256,
    source_map_fingerprint: sourcePackage.source_map_fingerprint,
    provider_results_path: providerResultsPath,
    provider_results_sha256: sha(providerResultsBytes),
    provider_results_fingerprint: providerResults.results_fingerprint,
    candidate_root: providerRoot,
    map_id: sourcePackage.map_id,
    projection: sourcePackage.projection,
    candidates: [
      {
        candidate_id: "candidate-1",
        task_id: "task-grass",
        visual_family: "epochbound:verdant:terrain:grass",
        path: "candidate.png",
        sha256: sha(bytes),
      },
    ],
    authority: {
      semantic_authority: "tile-map-studio",
      review_authority: "art-studio",
      provider_authority: "intermediate-only",
      execution_evidence_required: true,
      deterministic_mastering_required: true,
      mastering_quality_required: true,
    },
    status: "awaiting-review",
  };
  const review = {
    ...reviewBase,
    review_fingerprint: hashObject(reviewBase),
  };
  const reviewPath = path.join(root, "review.json");
  await writeJson(reviewPath, review);

  const approved = bypass ? "rejected" : "approved";
  const finalizationBase = {
    schema_version: 1,
    source_review_fingerprint: wrongReview
      ? "1".repeat(64)
      : review.review_fingerprint,
    source_package_fingerprint: sourcePackage.package_fingerprint,
    source_map_fingerprint: sourcePackage.source_map_fingerprint,
    map_id: sourcePackage.map_id,
    projection: sourcePackage.projection,
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
        sha256: sha(bytes),
        structural: "approved",
        visual: approved,
        creative: approved,
        notes: null,
      },
    ],
    tasks: [
      {
        task_id: "task-grass",
        visual_family: "epochbound:verdant:terrain:grass",
        approved_sources: [{ path: "candidate.png", sha256: sha(bytes) }],
      },
    ],
    authority: {},
    status: "review-finalized",
  };
  const finalization = {
    ...finalizationBase,
    finalization_fingerprint: hashObject(finalizationBase),
  };
  const finalizationPath = path.join(root, "finalization.json");
  await writeJson(finalizationPath, finalization);

  if (tamperResults) {
    await writeFile(
      providerResultsPath,
      JSON.stringify({ ...providerResults, tampered: true }),
    );
  }
  if (tamperMastering) {
    await writeFile(
      masteringPath,
      JSON.stringify({ ...mastering, tampered: true }),
    );
  }
  return { packagePath, reviewPath, finalizationPath };
}

test("exports only candidates that passed exact execution, mastering and review evidence", async () => {
  const input = await fixture();
  const result = await compileReviewedApprovedSourcesManifest(
    input.packagePath,
    input.reviewPath,
    input.finalizationPath,
  );
  assert.equal(result.eligible_for_sprite_studio, true);
  assert.match(result.source_review_fingerprint, /^[0-9a-f]{64}$/u);
  assert.match(result.source_provider_batch_fingerprint, /^[0-9a-f]{64}$/u);
  assert.match(result.source_execution_sha256, /^[0-9a-f]{64}$/u);
  assert.match(result.source_mastering_sha256, /^[0-9a-f]{64}$/u);
  assert.match(result.provider_results_fingerprint, /^[0-9a-f]{64}$/u);
  assert.match(result.review_finalization_fingerprint, /^[0-9a-f]{64}$/u);
  assert.equal(result.tasks[0].approved_sources[0].sha256.length, 64);
  assert.match(result.manifest_fingerprint, /^[0-9a-f]{64}$/u);
  assert.notEqual(
    result.manifest_fingerprint,
    result.pre_review_manifest_fingerprint,
  );
});

test("rejected candidate cannot be manually slipped into approved sources", async () => {
  const input = await fixture({ bypass: true });
  await assert.rejects(
    () =>
      compileReviewedApprovedSourcesManifest(
        input.packagePath,
        input.reviewPath,
        input.finalizationPath,
      ),
    /did not pass all three review gates/u,
  );
});

test("finalization from another review cannot approve candidate bytes", async () => {
  const input = await fixture({ wrongReview: true });
  await assert.rejects(
    () =>
      compileReviewedApprovedSourcesManifest(
        input.packagePath,
        input.reviewPath,
        input.finalizationPath,
      ),
    /does not target the exact review manifest/u,
  );
});

test("provider result manifest drift after review blocks approval", async () => {
  const input = await fixture({ tamperResults: true });
  await assert.rejects(
    () =>
      compileReviewedApprovedSourcesManifest(
        input.packagePath,
        input.reviewPath,
        input.finalizationPath,
      ),
    /provider results bytes changed/u,
  );
});

test("mastering receipt drift after review blocks approval", async () => {
  const input = await fixture({ tamperMastering: true });
  await assert.rejects(
    () =>
      compileReviewedApprovedSourcesManifest(
        input.packagePath,
        input.reviewPath,
        input.finalizationPath,
      ),
    /candidate mastering receipt bytes changed/u,
  );
});
