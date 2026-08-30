import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import { compileTileMapCandidateReview } from "../dist/tile-map-candidate-review.js";

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
const artifactId = (value) => `artifact_${sha(Buffer.from(value, "utf8"))}`;

async function writeJson(file, value) {
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  await writeFile(file, bytes);
  return bytes;
}

async function fixture({
  duplicate = false,
  wrongFingerprint = false,
  wrongSize = false,
  badAuthority = false,
  missingMastering = false,
  tamperMastering = false,
  forgedResultsFingerprint = false,
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-tile-map-review-"));
  const jobs = [];
  const candidates = [];
  const masteringJobs = [];
  for (let index = 0; index < 2; index += 1) {
    const candidateId = `candidate-${index}`;
    const output = `candidates/grass/${String(index + 1).padStart(2, "0")}.png`;
    const absolute = path.join(root, ...output.split("/"));
    await mkdir(path.dirname(absolute), { recursive: true });
    const bytes = duplicate && index === 1
      ? await readFile(path.join(root, "candidates", "grass", "01.png"))
      : await sharp({
          create: {
            width: wrongSize && index === 0 ? 17 : 16,
            height: 16,
            channels: 4,
            background: { r: 30 + index * 20, g: 120, b: 60, alpha: 1 },
          },
        })
          .png()
          .toBuffer();
    await writeFile(absolute, bytes);

    const sourceProviderArtifactId = artifactId(`provider-${candidateId}`);
    const masteredArtifactId = artifactId(`mastered-${candidateId}`);
    const masteringEvidenceArtifactId = artifactId(`evidence-${candidateId}`);
    const masteredContentHash = `sha256:${sha(bytes)}`;
    const evidenceContentHash = `sha256:${sha(Buffer.from(`evidence-${candidateId}`))}`;
    const masteringJobId = `runtime-master-${candidateId}`;
    const masteringSpecSha256 = sha(Buffer.from(`spec-${candidateId}`));

    jobs.push({
      candidate_id: candidateId,
      task_id: "grass-task",
      visual_family: "epochbound:verdant:terrain:grass",
      candidate_index: index,
      projection: "orthogonal",
      dimensions: { width: 16, height: 16 },
      alpha_required: false,
      output_path: output,
    });
    masteringJobs.push({
      candidateId,
      taskId: "grass-task",
      visualFamily: "epochbound:verdant:terrain:grass",
      outputPath: output,
      sourceCandidateArtifactId: sourceProviderArtifactId,
      policy: {
        targetWidth: 16,
        targetHeight: 16,
        backgroundMode: "opaque-preserve",
        resampling: "lanczos3",
        deliveryProfileId: "godot-sprite-lossless",
        requireMeaningfulAlpha: false,
        requireFakeTransparencyRejection: true,
      },
      masteringJobId,
      masteringSpecSha256,
      state: "succeeded",
      attempts: 1,
      masteredArtifactId,
      masteredContentHash,
      masteredContentSha256: sha(bytes),
      evidenceArtifactId: masteringEvidenceArtifactId,
      evidenceContentHash,
      evidenceContentSha256: sha(Buffer.from(`evidence-${candidateId}`)),
      qualityPassed: true,
      approvalState: "unapproved",
    });
    candidates.push({
      candidate_id: candidateId,
      path: output,
      sha256: sha(bytes),
      source_provider_artifact_id: sourceProviderArtifactId,
      mastered_artifact_id: masteredArtifactId,
      mastered_artifact_content_hash: masteredContentHash,
      mastering_evidence_artifact_id: masteringEvidenceArtifactId,
      mastering_evidence_content_hash: evidenceContentHash,
      mastering_job_id: masteringJobId,
      mastering_spec_sha256: masteringSpecSha256,
    });
  }

  const batchBase = {
    schema_version: 1,
    source_package_sha256: "a".repeat(64),
    source_package_fingerprint: "b".repeat(64),
    source_map_fingerprint: "c".repeat(64),
    map_id: "epochbound:bellweather:verdant",
    consumer_adapter: "epochbound",
    projection: "orthogonal",
    jobs,
    authority: {},
    status: "ready-for-provider-candidates",
  };
  const batch = { ...batchBase, batch_fingerprint: hashObject(batchBase) };
  const batchPath = path.join(root, "batch.json");
  const batchBytes = await writeJson(batchPath, batch);

  const providerBase = {
    schema_version: 1,
    source_candidate_batch_sha256: sha(batchBytes),
    source_candidate_batch_fingerprint: batch.batch_fingerprint,
    source_package_fingerprint: batch.source_package_fingerprint,
    source_map_fingerprint: batch.source_map_fingerprint,
    map_id: batch.map_id,
    consumer_adapter: batch.consumer_adapter,
    projection: batch.projection,
    jobs: [],
    authority: {},
    status: "ready-for-provider-runtime",
  };
  const providerBatch = {
    ...providerBase,
    provider_batch_fingerprint: hashObject(providerBase),
  };
  const providerBatchPath = path.join(root, "provider-batch.json");
  const providerBatchBytes = await writeJson(providerBatchPath, providerBatch);

  const authorizationBase = {
    schema: "evavo.tile-map-provider-execution-authorization.v1",
    status: "authorized",
    runtimeProtocolVersion: "fixture",
    authorizedAt: "2026-08-30T00:00:00.000Z",
    expiresAt: "2026-08-30T01:00:00.000Z",
    sourceProviderBatch: {
      path: providerBatchPath,
      fileSha256: sha(providerBatchBytes),
      documentSha256: providerBatch.provider_batch_fingerprint,
    },
    sourceMapFingerprint: batch.source_map_fingerprint,
    jobs: [],
    authority: {},
  };
  const authorizationSha256 = hashObject(authorizationBase);
  const authorization = {
    ...authorizationBase,
    authorizationSha256,
    runId: authorizationSha256.slice(0, 20),
  };
  const authorizationPath = path.join(root, "authorization.json");
  const authorizationBytes = await writeJson(authorizationPath, authorization);

  const executionBase = {
    schema: "evavo.tile-map-provider-execution-receipt.v1",
    status: "succeeded",
    completedAt: "2026-08-30T00:10:00.000Z",
    sourceAuthorization: {
      path: authorizationPath,
      fileSha256: sha(authorizationBytes),
      documentSha256: authorization.authorizationSha256,
      runId: authorization.runId,
    },
    sourceMapFingerprint: batch.source_map_fingerprint,
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
    completedAt: "2026-08-30T00:12:00.000Z",
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
    sourceMapFingerprint: batch.source_map_fingerprint,
    jobs: masteringJobs,
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

  const resultsBase = {
    schema_version: 2,
    source_batch_fingerprint: wrongFingerprint
      ? "e".repeat(64)
      : batch.batch_fingerprint,
    source_provider_batch_path: providerBatchPath,
    source_provider_batch_sha256: sha(providerBatchBytes),
    source_provider_batch_fingerprint: providerBatch.provider_batch_fingerprint,
    source_execution_receipt_path: executionPath,
    source_execution_receipt_sha256: sha(executionBytes),
    source_execution_sha256: execution.executionSha256,
    source_mastering_receipt_path: masteringPath,
    source_mastering_receipt_sha256: sha(masteringBytes),
    source_mastering_sha256: mastering.masteringSha256,
    source_map_fingerprint: batch.source_map_fingerprint,
    candidates,
    authority: {
      provider_output_authority: badAuthority ? "approved" : "intermediate-only",
      deterministic_mastering_required: true,
      mastering_quality_required: true,
      review_required: true,
      approval_authority: false,
    },
  };
  if (missingMastering) {
    delete resultsBase.source_mastering_receipt_path;
  }
  const results = {
    ...resultsBase,
    results_fingerprint: hashObject(resultsBase),
  };
  if (forgedResultsFingerprint) {
    results.results_fingerprint = "f".repeat(64);
  }
  const resultsPath = path.join(root, "provider-results.json");
  await writeJson(resultsPath, results);
  if (tamperMastering) {
    await writeFile(masteringPath, JSON.stringify({ ...mastering, tampered: true }));
  }
  return { batchPath, resultsPath };
}

test("admits exact mastered provider outputs with all approval states pending", async () => {
  const input = await fixture();
  const result = await compileTileMapCandidateReview(
    input.batchPath,
    input.resultsPath,
  );
  assert.equal(result.status, "awaiting-review");
  assert.equal(result.candidates.length, 2);
  assert.match(result.source_provider_batch_fingerprint, /^[0-9a-f]{64}$/u);
  assert.match(result.source_execution_sha256, /^[0-9a-f]{64}$/u);
  assert.match(result.source_mastering_sha256, /^[0-9a-f]{64}$/u);
  assert.match(result.provider_results_fingerprint, /^[0-9a-f]{64}$/u);
  assert.equal(result.authority.execution_evidence_required, true);
  assert.equal(result.authority.deterministic_mastering_required, true);
  assert.equal(result.authority.mastering_quality_required, true);
  assert.match(result.candidates[0].mastered_artifact_id, /^artifact_[0-9a-f]{64}$/u);
  assert.equal(result.candidates[0].structural_review, "pending");
  assert.equal(result.candidates[0].visual_review, "pending");
  assert.equal(result.candidates[0].creative_review, "pending");
  assert.equal(result.candidates[0].promotion_eligible, false);
  assert.match(result.review_fingerprint, /^[0-9a-f]{64}$/u);
});

test("rejects candidate results from a different candidate batch", async () => {
  const input = await fixture({ wrongFingerprint: true });
  await assert.rejects(
    () => compileTileMapCandidateReview(input.batchPath, input.resultsPath),
    /do not target this exact batch fingerprint/u,
  );
});

test("rejects results that claim provider approval authority", async () => {
  const input = await fixture({ badAuthority: true });
  await assert.rejects(
    () => compileTileMapCandidateReview(input.batchPath, input.resultsPath),
    /do not preserve provider\/mastering\/review authority boundaries/u,
  );
});

test("rejects results without deterministic mastering provenance", async () => {
  const input = await fixture({ missingMastering: true });
  await assert.rejects(
    () => compileTileMapCandidateReview(input.batchPath, input.resultsPath),
    /must be non-empty string/u,
  );
});

test("rejects a mastering receipt changed after materialization", async () => {
  const input = await fixture({ tamperMastering: true });
  await assert.rejects(
    () => compileTileMapCandidateReview(input.batchPath, input.resultsPath),
    /mastering receipt bytes no longer match/u,
  );
});

test("rejects a forged provider-results self fingerprint", async () => {
  const input = await fixture({ forgedResultsFingerprint: true });
  await assert.rejects(
    () => compileTileMapCandidateReview(input.batchPath, input.resultsPath),
    /candidate results self fingerprint is invalid/u,
  );
});

test("rejects duplicate mastered candidate pixels", async () => {
  const input = await fixture({ duplicate: true });
  await assert.rejects(
    () => compileTileMapCandidateReview(input.batchPath, input.resultsPath),
    /duplicates another candidate's exact mastered bytes/u,
  );
});

test("rejects mastered output with wrong final canvas", async () => {
  const input = await fixture({ wrongSize: true });
  await assert.rejects(
    () => compileTileMapCandidateReview(input.batchPath, input.resultsPath),
    /is 17x16; expected mastered 16x16/u,
  );
});
