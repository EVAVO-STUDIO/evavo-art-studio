import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import { compileTechnicallyReviewedApprovedSourcesManifest } from "../dist/tile-map-technically-reviewed-approved-sources.js";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
};

async function fixture({ technicalStatus = "passed", corruptQaHash = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-tile-map-strict-approval-"));
  const candidateRoot = path.join(root, "provider-results");
  const candidatePath = "candidates/grass/01.png";
  const absoluteCandidate = path.join(candidateRoot, ...candidatePath.split("/"));
  await mkdir(path.dirname(absoluteCandidate), { recursive: true });
  const image = await sharp({
    create: {
      width: 16,
      height: 16,
      channels: 4,
      background: { r: 45, g: 125, b: 65, alpha: 1 },
    },
  }).png().toBuffer();
  await writeFile(absoluteCandidate, image);

  const sourcePackageBody = {
    schema_version: 1,
    source_plan_sha256: "5".repeat(64),
    source_plan_fingerprint: "6".repeat(64),
    source_map_fingerprint: "4".repeat(64),
    map_id: "map",
    consumer_adapter: "epochbound",
    production_profile: "snes-topdown-rpg",
    projection: "orthogonal",
    tasks: [{
      task_id: "task-grass",
      visual_family: "epochbound:verdant:terrain:grass",
      task_kind: "tile-family",
      projection: "orthogonal",
      dimensions: { width: 16, height: 16 },
      required_approved_variants: 1,
      candidate_count: 1,
      alpha_required: false,
      semantic_source_ids: ["grass"],
      immutable_semantic_rules: ["Preserve gameplay semantics."],
      creative_direction: ["Authored SNES terrain."],
      topology: null,
      feature_kind: null,
    }],
    authority: {},
    promotion_policy: {},
    status: "ready-for-candidate-authoring",
  };
  const sourcePackage = { ...sourcePackageBody, package_fingerprint: sha(Buffer.from(canonical(sourcePackageBody))) };
  const packagePath = path.join(root, "source-package.json");
  await writeFile(packagePath, JSON.stringify(sourcePackage));

  const providerBatchBody = {
    schema_version: 1,
    source_candidate_batch_sha256: "d".repeat(64),
    source_candidate_batch_fingerprint: "1".repeat(64),
    source_package_fingerprint: sourcePackage.package_fingerprint,
    source_map_fingerprint: "4".repeat(64),
    map_id: "map", consumer_adapter: "epochbound", projection: "orthogonal",
    jobs: [], authority: {}, status: "ready-for-provider-runtime",
  };
  const providerBatch = { ...providerBatchBody, provider_batch_fingerprint: sha(Buffer.from(canonical(providerBatchBody))) };
  const providerBatchPath = path.join(root, "provider-batch.json");
  await writeFile(providerBatchPath, JSON.stringify(providerBatch));
  const providerBatchBytes = await readFile(providerBatchPath);
  const executionBody = { schema: "evavo.tile-map-provider-execution-receipt.v1", status: "succeeded", completedAt: "2026-08-30T00:05:00.000Z", sourceMapFingerprint: "4".repeat(64), jobs: [], authority: {} };
  const executionSha256 = sha(Buffer.from(canonical(executionBody)));
  const execution = { ...executionBody, executionSha256, runId: executionSha256.slice(0, 20) };
  const executionPath = path.join(root, "execution.json");
  await writeFile(executionPath, JSON.stringify(execution));
  const executionBytes = await readFile(executionPath);
  const masteringBody = {
    schema: "evavo.tile-map-candidate-mastering-receipt.v1", status: "succeeded", completedAt: "2026-08-30T00:06:00.000Z",
    sourceProviderBatch: { path: providerBatchPath, fileSha256: sha(providerBatchBytes), documentSha256: providerBatch.provider_batch_fingerprint },
    sourceProviderExecution: { path: executionPath, fileSha256: sha(executionBytes), documentSha256: execution.executionSha256 },
    sourceMapFingerprint: "4".repeat(64), jobs: [], authority: {},
  };
  const masteringSha256 = sha(Buffer.from(canonical(masteringBody)));
  const mastering = { ...masteringBody, masteringSha256, runId: masteringSha256.slice(0, 20) };
  const masteringPath = path.join(root, "mastering.json");
  await writeFile(masteringPath, JSON.stringify(mastering));
  const masteringBytes = await readFile(masteringPath);
  const providerResultsBody = {
    schema_version: 2, source_batch_fingerprint: "1".repeat(64),
    source_provider_batch_path: providerBatchPath, source_provider_batch_sha256: sha(providerBatchBytes), source_provider_batch_fingerprint: providerBatch.provider_batch_fingerprint,
    source_execution_receipt_path: executionPath, source_execution_receipt_sha256: sha(executionBytes), source_execution_sha256: execution.executionSha256,
    source_mastering_receipt_path: masteringPath, source_mastering_receipt_sha256: sha(masteringBytes), source_mastering_sha256: mastering.masteringSha256,
    source_map_fingerprint: "4".repeat(64),
    candidates: [{ candidate_id: "candidate-1", path: candidatePath, sha256: sha(image) }],
    authority: { provider_output_authority: "intermediate-only", deterministic_mastering_required: true, mastering_quality_required: true, review_required: true, approval_authority: false },
  };
  const providerResults = { ...providerResultsBody, results_fingerprint: sha(Buffer.from(canonical(providerResultsBody))) };
  const providerResultsPath = path.join(candidateRoot, "provider-results.json");
  await writeFile(providerResultsPath, JSON.stringify(providerResults));
  const providerResultsBytes = await readFile(providerResultsPath);

  const reviewBody = {
    schema_version: 1,
    source_batch_sha256: "8".repeat(64),
    source_batch_fingerprint: "1".repeat(64),
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
    source_map_fingerprint: "4".repeat(64),
    provider_results_path: providerResultsPath,
    provider_results_sha256: sha(providerResultsBytes),
    provider_results_fingerprint: providerResults.results_fingerprint,
    candidate_root: candidateRoot,
    map_id: "map",
    projection: "orthogonal",
    candidates: [{
      candidate_id: "candidate-1",
      task_id: "task-grass",
      visual_family: "epochbound:verdant:terrain:grass",
      path: candidatePath,
      sha256: sha(image),
      bytes: image.length,
      width: 16,
      height: 16,
      has_alpha: true,
      structural_review: "pending",
      visual_review: "pending",
      creative_review: "pending",
      promotion_eligible: false,
    }],
    authority: { semantic_authority: "tile-map-studio", review_authority: "art-studio", provider_authority: "intermediate-only", execution_evidence_required: true, deterministic_mastering_required: true, mastering_quality_required: true },
    status: "awaiting-review",
  };
  const review = { ...reviewBody, review_fingerprint: sha(Buffer.from(canonical(reviewBody))) };
  const reviewPath = path.join(root, "review.json");
  await writeFile(reviewPath, JSON.stringify(review));

  const qaBody = {
    schema_version: 1,
    policy_version: "2026-08-30.1",
    source_package_path: packagePath,
    source_package_sha256: sha(Buffer.from(JSON.stringify(sourcePackage))),
    source_package_fingerprint: sourcePackage.package_fingerprint,
    source_review_path: reviewPath,
    source_review_sha256: sha(Buffer.from(JSON.stringify(review))),
    source_review_fingerprint: review.review_fingerprint,
    source_provider_batch_fingerprint: providerBatch.provider_batch_fingerprint,
    source_execution_sha256: execution.executionSha256,
    source_map_fingerprint: "4".repeat(64),
    candidate_root: candidateRoot,
    map_id: "map",
    consumer_adapter: "epochbound",
    production_profile: "snes-topdown-rpg",
    projection: "orthogonal",
    thresholds: {},
    candidates: [{
      candidate_id: "candidate-1",
      task_id: "task-grass",
      visual_family: "epochbound:verdant:terrain:grass",
      path: candidatePath,
      sha256: sha(image),
      technical_status: technicalStatus,
      metrics: {},
      issues: technicalStatus === "passed" ? [] : [{ code: "BLOCKED", severity: "error", message: "blocked" }],
    }],
    families: [{
      task_id: "task-grass",
      visual_family: "epochbound:verdant:terrain:grass",
      required_approved_variants: 1,
      candidate_count: 1,
      passed_candidates: technicalStatus === "passed" ? 1 : 0,
      blocked_candidates: technicalStatus === "passed" ? 0 : 1,
      technical_status: technicalStatus,
      issues: [],
    }],
    authority: {},
    status: technicalStatus,
  };
  const qa = {
    ...qaBody,
    qa_fingerprint: corruptQaHash
      ? "a".repeat(64)
      : sha(Buffer.from(canonical(qaBody))),
  };
  const qaPath = path.join(root, "technical-qa.json");
  await writeFile(qaPath, JSON.stringify(qa));

  const finalizationBody = {
    schema_version: 1,
    source_review_fingerprint: review.review_fingerprint,
    source_package_fingerprint: sourcePackage.package_fingerprint,
    source_map_fingerprint: "4".repeat(64),
    map_id: "map",
    projection: "orthogonal",
    creative_approval: {
      decision: "approved",
      approved_by: "EVAVO creative review",
      approved_at: "2026-08-30T00:00:00Z",
    },
    candidates: [{
      candidate_id: "candidate-1",
      task_id: "task-grass",
      visual_family: "epochbound:verdant:terrain:grass",
      path: candidatePath,
      sha256: sha(image),
      structural: "approved",
      visual: "approved",
      creative: "approved",
      notes: null,
    }],
    tasks: [{
      task_id: "task-grass",
      visual_family: "epochbound:verdant:terrain:grass",
      approved_sources: [{ path: candidatePath, sha256: sha(image) }],
    }],
    authority: {},
    status: "review-finalized",
  };
  const finalization = { ...finalizationBody, finalization_fingerprint: sha(Buffer.from(canonical(finalizationBody))) };
  const finalizationPath = path.join(root, "finalization.json");
  await writeFile(finalizationPath, JSON.stringify(finalization));
  return { packagePath, reviewPath, qaPath, finalizationPath };
}

test("exports schema v2 approval only after exact technical admission", async () => {
  const input = await fixture();
  const result = await compileTechnicallyReviewedApprovedSourcesManifest(
    input.packagePath,
    input.reviewPath,
    input.qaPath,
    input.finalizationPath,
  );
  assert.equal(result.schema_version, 2);
  assert.equal(result.technical_qa_required, true);
  assert.equal(result.technical_policy_version, "2026-08-30.1");
  assert.match(result.source_technical_qa_fingerprint, /^[0-9a-f]{64}$/u);
  assert.match(result.manifest_fingerprint, /^[0-9a-f]{64}$/u);
});

test("human approval cannot bypass a technically blocked candidate", async () => {
  const input = await fixture({ technicalStatus: "blocked" });
  await assert.rejects(
    () => compileTechnicallyReviewedApprovedSourcesManifest(
      input.packagePath,
      input.reviewPath,
      input.qaPath,
      input.finalizationPath,
    ),
    /technical QA must be schema v1 with status passed/u,
  );
});

test("tampered technical QA self fingerprint blocks approval", async () => {
  const input = await fixture({ corruptQaHash: true });
  await assert.rejects(
    () => compileTechnicallyReviewedApprovedSourcesManifest(
      input.packagePath,
      input.reviewPath,
      input.qaPath,
      input.finalizationPath,
    ),
    /technical QA self fingerprint is invalid/u,
  );
});
