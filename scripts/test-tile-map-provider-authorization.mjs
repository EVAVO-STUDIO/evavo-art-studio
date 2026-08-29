#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  LocalRuntimeRepository,
} from '../packages/runtime/dist/index.js';
import {
  authorizeTileMapProviderRuntime,
  TILE_MAP_PROVIDER_EXECUTION_CAPABILITY,
} from './authorize-tile-map-provider-runtime.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-tile-map-auth-'));
  const runtimeRoot = path.join(root, 'runtime');
  const artifactRoot = path.join(root, 'artifacts');
  await mkdir(runtimeRoot);
  await mkdir(artifactRoot);
  const batch = {
    schema_version: 1,
    source_candidate_batch_sha256: '1'.repeat(64),
    source_candidate_batch_fingerprint: '2'.repeat(64),
    source_package_fingerprint: '3'.repeat(64),
    source_map_fingerprint: '4'.repeat(64),
    map_id: 'map',
    consumer_adapter: 'epochbound',
    projection: 'orthogonal',
    jobs: [
      {
        candidate_id: 'tile-map-candidate-0123456789abcdefabcd',
        task_id: 'tile-map-tile-grass',
        visual_family: 'epochbound:verdant:terrain:grass',
        provider_family_id: 'tile-map-family-0123456789abcdef0123456789abcdef01234567',
        output_path: 'candidates/grass/01.png',
        request_sha256: '5'.repeat(64),
        prompt_sha256: '6'.repeat(64),
        runtime_job_sha256: '7'.repeat(64),
        runtime_job: {
          queue: 'provider',
          kind: 'art.candidate.generate',
          idempotencyKey: 'provider:tile-map-candidate-0123456789abcdefabcd',
          payload: {
            schemaVersion: '1.0',
            operation: 'generate',
            assetKind: 'environment',
            continuityPhase: 'independent',
            assetId: 'tile-map-tile-grass',
            candidateFamilyId: 'tile-map-family-0123456789abcdef0123456789abcdef01234567',
            creativeIntent: 'Test candidate.',
            style: { styleName: 'test', intent: 'test' },
            shot: { subject: 'grass' },
            target: { width: 16, height: 16, transparency: 'preferred', outputFormat: 'png' },
            background: { strategy: 'provider-auto' },
            candidateCount: 1,
            metadata: {
              schema: 'evavo.tile-map-provider-metadata.v1',
              candidateId: 'tile-map-candidate-0123456789abcdefabcd',
              sourceMapFingerprint: '4'.repeat(64),
              providerAuthority: 'candidate-generation-only',
              reviewRequired: true,
              approvalAuthority: false,
            },
          },
          requiredCapabilities: [
            'provider.generate',
            'provider.candidate-store',
            'evidence.bundle',
          ],
          requiredCapabilityProfile: ['generate'],
          maximumAttempts: 3,
          leaseDurationMs: 300000,
          timeoutMs: 1800000,
          labels: {
            providerRequestId: 'tile-map-candidate-0123456789abcdefabcd',
            candidateFamilyId: 'tile-map-family-0123456789abcdef0123456789abcdef01234567',
            assetId: 'tile-map-tile-grass',
            continuityPhase: 'independent',
          },
        },
      },
    ],
    authority: {},
    status: 'ready-for-provider-runtime',
    provider_batch_fingerprint: '8'.repeat(64),
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
  assert.equal(authorization.execution.requiredCapability, TILE_MAP_PROVIDER_EXECUTION_CAPABILITY);
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
  assert.ok(job.spec.requiredCapabilities.includes(TILE_MAP_PROVIDER_EXECUTION_CAPABILITY));
});
