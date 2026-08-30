#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { LocalArtifactStore } from '../packages/artifacts/dist/index.js';
import { FixtureImageProviderAdapter } from '../packages/providers/dist/index.js';
import { runTileMapCandidateMastering } from './run-tile-map-candidate-mastering.mjs';

const execFileAsync = promisify(execFile);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`;
};
const hashObject = (value) => sha256(Buffer.from(canonical(value), 'utf8'));

async function writeJson(file, value) {
  const bytes = Buffer.from(JSON.stringify(value), 'utf8');
  await writeFile(file, bytes);
  return bytes;
}

async function fixtureProviderPng(width, height) {
  const adapter = new FixtureImageProviderAdapter();
  const request = {
    requestId: `mastering-source-fixture-${width}x${height}`,
    seed: 1234,
    candidateCount: 1,
    target: { width, height, transparency: 'opaque' },
    background: { strategy: 'opaque-source' },
  };
  const result = await adapter.execute(
    {
      request,
      requestSha256: '0'.repeat(64),
      compiledPrompt: 'Deterministic opaque mastering fixture.',
      compiledPromptSha256: '1'.repeat(64),
      references: [],
    },
    {
      signal: new AbortController().signal,
      requestedAt: new Date('2026-08-30T00:00:00.000Z'),
    },
  );
  return result.outputs[0].bytes;
}

async function fixture({ sourceWidth = 64, sourceHeight = 64 } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-tile-mastering-'));
  const runtimeRoot = path.join(root, 'runtime');
  const artifactRoot = path.join(root, 'artifacts');
  await mkdir(runtimeRoot);
  await mkdir(artifactRoot);
  const artifacts = new LocalArtifactStore({ root: artifactRoot });

  const candidateId = 'tile-map-candidate-mastering-fixture';
  const taskId = 'tile-map-tile-grass';
  const visualFamily = 'epochbound:verdant:terrain:grass';
  const requestSha256 = '2'.repeat(64);
  const sourceBytes = await fixtureProviderPng(sourceWidth, sourceHeight);
  const source = await artifacts.put(sourceBytes, {
    mediaType: 'image/png',
    storageClass: 'intermediate',
    fileName: 'provider-source.png',
    labels: {
      artifactRole: 'provider-candidate',
      approvalState: 'unapproved',
      providerRequestId: candidateId,
      candidateFamilyId: 'tile-map-family-fixture',
      candidateIndex: '1',
      assetId: taskId,
      continuityPhase: 'independent',
    },
    metadata: {
      finalDeliverable: false,
      requiresMastering: true,
      requiresBlockingQa: true,
      requestSha256,
    },
  });

  const providerBatchBase = {
    schema_version: 1,
    source_candidate_batch_sha256: '3'.repeat(64),
    source_candidate_batch_fingerprint: '4'.repeat(64),
    source_package_fingerprint: '5'.repeat(64),
    source_map_fingerprint: '6'.repeat(64),
    map_id: 'epochbound:mastering-fixture',
    consumer_adapter: 'epochbound',
    projection: 'orthogonal',
    jobs: [
      {
        candidate_id: candidateId,
        task_id: taskId,
        visual_family: visualFamily,
        provider_family_id: 'tile-map-family-fixture',
        output_path: 'candidates/grass/01.png',
        mastering: {
          source_canvas_policy: 'provider-adapter-derived',
          target_width: 16,
          target_height: 16,
          background_mode: 'opaque-preserve',
          matte_colour: null,
          matte_selection: null,
          resampling: 'lanczos3',
          delivery_profile_id: 'godot-sprite-lossless',
          require_meaningful_alpha: false,
          require_fake_transparency_rejection: true,
          approval_authority: false,
        },
        request_sha256: requestSha256,
        prompt_sha256: '7'.repeat(64),
        runtime_job_sha256: '8'.repeat(64),
        runtime_job: {},
      },
    ],
    authority: {
      semantic_authority: 'tile-map-studio',
      provider_authority: 'candidate-generation-only',
      mastering_authority: 'art-studio-deterministic-unapproved',
      review_authority: 'art-studio',
      approval_authority: 'art-studio-explicit-review-only',
    },
    status: 'ready-for-provider-runtime',
  };
  const providerBatch = {
    ...providerBatchBase,
    provider_batch_fingerprint: hashObject(providerBatchBase),
  };
  const providerBatchPath = path.join(root, 'provider-batch.json');
  const providerBatchBytes = await writeJson(providerBatchPath, providerBatch);

  const authorizationBase = {
    schema: 'evavo.tile-map-provider-execution-authorization.v1',
    status: 'authorized',
    runtimeProtocolVersion: 'fixture',
    authorizedAt: '2026-08-30T00:00:00.000Z',
    expiresAt: '2026-08-30T01:00:00.000Z',
    sourceProviderBatch: {
      path: providerBatchPath,
      fileSha256: sha256(providerBatchBytes),
      documentSha256: providerBatch.provider_batch_fingerprint,
    },
    sourceMapFingerprint: providerBatch.source_map_fingerprint,
    runtime: {
      root: runtimeRoot,
      rootSha256: sha256(Buffer.from(runtimeRoot, 'utf8')),
    },
    artifacts: {
      root: artifactRoot,
      rootSha256: sha256(Buffer.from(artifactRoot, 'utf8')),
    },
    jobs: [],
    authority: {},
  };
  const authorizationSha256 = hashObject(authorizationBase);
  const authorization = {
    ...authorizationBase,
    authorizationSha256,
    runId: authorizationSha256.slice(0, 20),
  };
  const authorizationPath = path.join(root, 'authorization.json');
  const authorizationBytes = await writeJson(authorizationPath, authorization);

  const executionBase = {
    schema: 'evavo.tile-map-provider-execution-receipt.v1',
    status: 'succeeded',
    completedAt: '2026-08-30T00:05:00.000Z',
    workerId: 'fixture-worker',
    sourceAuthorization: {
      path: authorizationPath,
      fileSha256: sha256(authorizationBytes),
      documentSha256: authorization.authorizationSha256,
      runId: authorization.runId,
    },
    sourceMapFingerprint: providerBatch.source_map_fingerprint,
    providerAdapters: [],
    runResult: {
      claimed: 1,
      succeeded: 1,
      failed: 0,
      cancelled: 0,
      paused: 0,
    },
    counts: {
      authorizedRuntimeJobs: 1,
      succeededRuntimeJobs: 1,
      failedRuntimeJobs: 0,
    },
    jobs: [
      {
        candidateId,
        taskId,
        visualFamily,
        providerRequestSha256: requestSha256,
        jobId: 'provider-job-fixture',
        specSha256: '9'.repeat(64),
        state: 'succeeded',
        attempts: 1,
        outputArtifacts: [
          {
            artifactId: source.artifactId,
            contentHash: source.contentHash,
            mediaType: source.mediaType,
            storageClass: source.storageClass,
            artifactRole: 'provider-candidate',
            approvalState: 'unapproved',
          },
        ],
      },
    ],
    authority: {
      providerExecution: true,
      candidateArtifactCreation: true,
      evidenceArtifactCreation: true,
      candidateApproval: false,
      candidatePromotion: false,
      repositoryMutation: false,
      publication: false,
    },
  };
  const executionSha256 = hashObject(executionBase);
  const execution = {
    ...executionBase,
    executionSha256,
    runId: executionSha256.slice(0, 20),
  };
  const executionPath = path.join(root, 'execution.json');
  await writeJson(executionPath, execution);

  return {
    root,
    artifacts,
    providerBatchPath,
    executionPath,
    receiptPath: path.join(root, 'mastering-receipt.json'),
  };
}

test('masters a larger same-ratio provider candidate to exact native tile size', async () => {
  const input = await fixture();
  const result = await runTileMapCandidateMastering([
    '--provider-batch',
    input.providerBatchPath,
    '--execution-receipt',
    input.executionPath,
    '--receipt',
    input.receiptPath,
    '--concurrency',
    '1',
  ]);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.counts.succeeded, 1);
  assert.equal(result.counts.failed, 0);

  const receipt = JSON.parse(await readFile(input.receiptPath, 'utf8'));
  assert.equal(
    receipt.schema,
    'evavo.tile-map-candidate-mastering-receipt.v1',
  );
  assert.equal(receipt.authority.aspectRatioPreservation, true);
  assert.equal(receipt.authority.maximumAspectRatioDrift, 0.02);
  assert.equal(receipt.jobs[0].policy.targetWidth, 16);
  assert.equal(receipt.jobs[0].policy.targetHeight, 16);
  assert.equal(receipt.jobs[0].policy.matteSelection, null);
  assert.equal(receipt.jobs[0].sourceGeometry.sourceWidth, 64);
  assert.equal(receipt.jobs[0].sourceGeometry.sourceHeight, 64);
  assert.equal(receipt.jobs[0].sourceGeometry.aspectRatioDrift, 0);
  assert.equal(receipt.jobs[0].qualityPassed, true);
  assert.equal(receipt.jobs[0].approvalState, 'unapproved');

  const mastered = await input.artifacts.get(
    receipt.jobs[0].masteredArtifactId,
  );
  const evidence = await input.artifacts.get(
    receipt.jobs[0].evidenceArtifactId,
  );
  assert.ok(mastered);
  assert.ok(evidence);
  assert.equal(mastered.storageClass, 'intermediate');
  assert.equal(mastered.labels.approvalState, 'unapproved');
  assert.equal(mastered.labels.qualityState, 'passed');
  const proof = JSON.parse(
    (await input.artifacts.read(evidence.artifactId)).toString('utf8'),
  );
  assert.equal(proof.geometry.sourceWidth, 64);
  assert.equal(proof.geometry.sourceHeight, 64);
  assert.equal(proof.geometry.targetWidth, 16);
  assert.equal(proof.geometry.targetHeight, 16);
  assert.equal(proof.blockingProof.qualityPassed, true);
  assert.equal(proof.promotionEligible, true);
  assert.equal(proof.approvalState, 'unapproved');

  const verifier = fileURLToPath(
    new URL('./verify-tile-map-candidate-mastering.mjs', import.meta.url),
  );
  const { stdout } = await execFileAsync(process.execPath, [
    verifier,
    input.receiptPath,
  ]);
  const verification = JSON.parse(stdout.trim());
  assert.equal(verification.status, 'verified');
  assert.equal(verification.candidates.length, 1);
  assert.equal(verification.candidates[0].target.width, 16);
  assert.equal(verification.candidates[0].target.height, 16);
});

test('rejects a provider canvas whose ratio would distort the semantic tile', async () => {
  const input = await fixture({ sourceWidth: 96, sourceHeight: 64 });
  await assert.rejects(
    () =>
      runTileMapCandidateMastering([
        '--provider-batch',
        input.providerBatchPath,
        '--execution-receipt',
        input.executionPath,
        '--receipt',
        input.receiptPath,
      ]),
    /provider source aspect ratio 96x64 would distort target 16x16/u,
  );
});
