#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  compileProviderCandidateRuntimeContract,
} from '../packages/providers/dist/index.js';
import {
  LocalRuntimeRepository,
} from '../packages/runtime/dist/index.js';
import {
  authorizeTileMapProviderRuntime,
  TILE_MAP_PROVIDER_EXECUTION_CAPABILITY,
} from './authorize-tile-map-provider-runtime.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
};
const hashObject = (value) => sha256(Buffer.from(canonical(value), 'utf8'));

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-tile-map-auth-'));
  const runtimeRoot = path.join(root, 'runtime');
  const artifactRoot = path.join(root, 'artifacts');
  await mkdir(runtimeRoot);
  await mkdir(artifactRoot);

  const candidateId = 'tile-map-candidate-0123456789abcdefabcd';
  const sourceMapFingerprint = '4'.repeat(64);
  const request = {
    schemaVersion: '1.0',
    requestId: candidateId,
    operation: 'generate',
    assetKind: 'environment',
    continuityPhase: 'independent',
    assetId: 'tile-map-tile-grass',
    candidateFamilyId: 'tile-map-family-0123456789abcdef0123456789abcdef01234567',
    creativeIntent: 'Test candidate.',
    style: {
      styleName: 'Tile Map Studio test grass',
      intent: 'Test candidate.',
      mustHave: ['Preserve gameplay semantics.'],
      mustAvoid: ['Do not add gameplay semantics.'],
    },
    shot: { subject: 'grass' },
    target: {
      width: 16,
      height: 16,
      transparency: 'preferred',
      outputFormat: 'png',
    },
    background: { strategy: 'provider-auto' },
    quality: 'high',
    candidateCount: 1,
    seed: 1,
    selection: { allowFallback: true, requireSeed: true },
    metadata: {
      schema: 'evavo.tile-map-provider-metadata.v1',
      candidateId,
      sourceMapFingerprint,
      providerAuthority: 'candidate-generation-only',
      reviewRequired: true,
      approvalAuthority: false,
    },
  };
  const contract = compileProviderCandidateRuntimeContract(request);
  const batchBody = {
    schema_version: 1,
    source_candidate_batch_sha256: '1'.repeat(64),
    source_candidate_batch_fingerprint: '2'.repeat(64),
    source_package_fingerprint: '3'.repeat(64),
    source_map_fingerprint: sourceMapFingerprint,
    map_id: 'map',
    consumer_adapter: 'epochbound',
    projection: 'orthogonal',
    jobs: [
      {
        candidate_id: candidateId,
        task_id: 'tile-map-tile-grass',
        visual_family: 'epochbound:verdant:terrain:grass',
        provider_family_id: request.candidateFamilyId,
        output_path: 'candidates/grass/01.png',
        request_sha256: contract.requestSha256,
        prompt_sha256: contract.compiledPromptSha256,
        runtime_job_sha256: hashObject(contract.runtimeJob),
        runtime_job: contract.runtimeJob,
      },
    ],
    authority: {
      semantic_authority: 'tile-map-studio',
      provider_authority: 'candidate-generation-only',
      review_authority: 'art-studio',
      approval_authority: 'art-studio-explicit-review-only',
    },
    status: 'ready-for-provider-runtime',
  };
  const batch = {
    ...batchBody,
    provider_batch_fingerprint: hashObject(batchBody),
  };
  const batchPath = path.join(root, 'provider-batch.json');
  const authorizationPath = path.join(root, 'authorization.json');
  await writeFile(batchPath, JSON.stringify(batch));
  return { root, runtimeRoot, artifactRoot, batchPath, authorizationPath };
}

test('authorizes isolated pristine Tile Map runtime jobs without executing providers', async () => {
  const input = await fixture();
  const result = await authorizeTileMapProviderRuntime([
    '--provider-batch', input.batchPath,
    '--runtime-root', input.runtimeRoot,
    '--artifact-root', input.artifactRoot,
    '--output', input.authorizationPath,
    '--allowed-adapters', 'fixture-image',
    '--authorized-by', 'test-suite',
    '--reason', 'authorization contract test',
    '--authorized-at', '2026-08-30T00:00:00.000Z',
    '--expires-at', '2026-08-30T01:00:00.000Z',
  ]);
  assert.equal(result.status, 'authorized');
  assert.equal(result.jobs, 1);
  const authorization = JSON.parse(await readFile(input.authorizationPath, 'utf8'));
  assert.equal(
    authorization.execution.requiredCapability,
    TILE_MAP_PROVIDER_EXECUTION_CAPABILITY,
  );
  assert.equal(authorization.execution.maximumAttempts, 1);
  assert.equal(authorization.execution.genericProviderWorkerMayClaim, false);
  assert.deepEqual(authorization.allowedAdapterIds, ['fixture-image']);
  const runtime = new LocalRuntimeRepository({ root: input.runtimeRoot });
  const job = await runtime.get(authorization.jobs[0].jobId);
  assert.equal(job.state, 'queued');
  assert.equal(job.spec.maximumAttempts, 1);
  assert.equal(job.attempts.length, 0);
  assert.equal(job.redriveCount, 0);
  assert.equal(job.spec.queue, authorization.execution.queues[0]);
  assert.ok(
    job.spec.requiredCapabilities.includes(
      TILE_MAP_PROVIDER_EXECUTION_CAPABILITY,
    ),
  );
});
