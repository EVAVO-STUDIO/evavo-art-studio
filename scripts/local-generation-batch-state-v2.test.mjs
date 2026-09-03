#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  LOCAL_GENERATION_BATCH_STATE_SCHEMA,
  checkpointBatchState,
  createBatchState,
  deterministicRunKey,
  hydrateBatchState,
  manifestFingerprint,
  planFingerprint,
  readBatchState,
  stableJson,
  validateBatchState,
  writeBatchStateAtomic,
} from './local-generation-batch-state-v2.mjs';

const artifactA = `artifact_${'a'.repeat(64)}`;
const artifactB = `artifact_${'b'.repeat(64)}`;

function manifest() {
  return {
    schema: 'evavo.local-generation-batch.v2',
    campaign_id: 'resume-test',
    batch_size: 2,
    shots: [{ id: 'anchor' }, { id: 'follow' }],
  };
}

function plan() {
  return {
    campaignId: 'resume-test',
    batchSize: 2,
    mode: 'sequential-anchor',
    consistencyMode: 'strict',
    qualityProfile: 'cinematic_stills',
    retryRules: { maxShotAttempts: 3, retryMissing: true },
    outputRules: { exactCount: true, requireUniqueHashes: true },
    frames: [
      {
        id: 'anchor', ordinal: 1, seed: 187100, candidateCount: 1,
        promptSha256: '1'.repeat(64), negativePromptSha256: '2'.repeat(64),
        continuityPhase: 'key-pose', shot: { referenceInputs: [] },
      },
      {
        id: 'follow', ordinal: 2, seed: 187101, candidateCount: 1,
        promptSha256: '3'.repeat(64), negativePromptSha256: '4'.repeat(64),
        continuityPhase: 'key-pose', shot: { referenceInputs: [{ sourceShotId: 'anchor', role: 'canonical-identity', required: true }] },
      },
    ],
  };
}

function referencePlan() {
  return { referenceGraph: { stages: [['anchor'], ['follow']] } };
}

function acceptedResult(artifactId, source = 'C:\\Temp\\candidate.png') {
  return {
    attempt: 1,
    stage: 1,
    candidates: [{
      artifactId,
      contentHash: artifactId.slice('artifact_'.length),
      fileName: 'candidate.png',
      source,
      qa: {
        ok: true,
        codes: [],
        bytes: 1234,
        sha256: '5'.repeat(64),
        dimensions: { format: 'png', width: 1024, height: 1024 },
      },
      route: { adapterId: 'comfyui:sdxl-base-local-cinematic_stills' },
    }],
    route: { adapterId: 'comfyui:sdxl-base-local-cinematic_stills' },
  };
}

test('stable fingerprints ignore object key insertion order but preserve material changes', () => {
  const first = { z: 1, nested: { b: 2, a: 1 } };
  const second = { nested: { a: 1, b: 2 }, z: 1 };
  assert.equal(stableJson(first), stableJson(second));
  assert.equal(manifestFingerprint(first), manifestFingerprint(second));
  assert.notEqual(manifestFingerprint(first), manifestFingerprint({ ...second, z: 2 }));
});

test('deterministic run key binds both authored manifest and compiled plan', () => {
  const key = deterministicRunKey(manifest(), plan());
  assert.match(key, /^[a-f0-9]{16}-[a-f0-9]{16}$/u);
  const changed = plan();
  changed.frames[1].seed += 1;
  assert.notEqual(key, deterministicRunKey(manifest(), changed));
});

test('checkpoint round-trip preserves accepted frame results, artifacts, attempts, and stage cursor', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-batch-state-'));
  try {
    const startedAt = '2026-09-03T12:00:00.000Z';
    const initial = createBatchState({ manifest: manifest(), plan: plan(), referencePlan: referencePlan(), runId: 'run_resume', startedAt });
    assert.equal(initial.schema, LOCAL_GENERATION_BATCH_STATE_SCHEMA);
    const frameResults = new Map([['anchor', acceptedResult(artifactA)]]);
    const artifactResults = new Map([['anchor', [artifactA, artifactB]]]);
    const attempts = [{ stage: 1, attempt: 1, manifests: ['chunk.json'], receipts: [{ campaignId: 'child' }] }];
    const checkpoint = checkpointBatchState(initial, { frameResults, artifactResults, attempts, completedStageCount: 1 });
    const statePath = path.join(root, 'state.json');
    await writeBatchStateAtomic(statePath, checkpoint);
    const loaded = await readBatchState(statePath, { manifest: manifest(), plan: plan(), referencePlan: referencePlan() });
    assert.equal(loaded.completedStageCount, 1);
    assert.equal(loaded.nextStageIndex, 1);
    const hydrated = hydrateBatchState(loaded);
    assert.equal(hydrated.frameResults.get('anchor').candidates[0].artifactId, artifactA);
    assert.deepEqual(hydrated.artifactResults.get('anchor'), [artifactA, artifactB]);
    assert.equal(hydrated.attempts.length, 1);
    const raw = await readFile(statePath, 'utf8');
    assert.equal(raw.endsWith('\n'), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('resume refuses manifest, plan, or reference graph drift', () => {
  const state = createBatchState({ manifest: manifest(), plan: plan(), referencePlan: referencePlan(), runId: 'run_resume', startedAt: '2026-09-03T12:00:00.000Z' });
  const changedManifest = manifest();
  changedManifest.batch_size = 3;
  assert.throws(() => validateBatchState(state, { manifest: changedManifest, plan: plan(), referencePlan: referencePlan() }), /manifest fingerprint differs/u);

  const changedPlan = plan();
  changedPlan.frames[0].seed += 10;
  assert.throws(() => validateBatchState(state, { manifest: manifest(), plan: changedPlan, referencePlan: referencePlan() }), /plan fingerprint differs/u);

  const changedGraph = { referenceGraph: { stages: [['anchor', 'follow']] } };
  assert.throws(() => validateBatchState(state, { manifest: manifest(), plan: plan(), referencePlan: changedGraph }), /reference stage graph differs/u);
});

test('state validation rejects malformed provider artifact IDs and candidate hashes', () => {
  const initial = createBatchState({ manifest: manifest(), plan: plan(), referencePlan: referencePlan(), runId: 'run_resume', startedAt: '2026-09-03T12:00:00.000Z' });
  const badArtifact = JSON.parse(JSON.stringify(initial));
  badArtifact.artifactResults.anchor = ['artifact_bad'];
  assert.throws(() => validateBatchState(badArtifact), /artifactResults\.anchor is invalid/u);

  const badCandidate = JSON.parse(JSON.stringify(initial));
  badCandidate.frameResults.anchor = acceptedResult(artifactA);
  badCandidate.frameResults.anchor.candidates[0].qa.sha256 = 'bad';
  assert.throws(() => validateBatchState(badCandidate), /qa\.sha256 is invalid/u);
});

test('read returns null for a missing checkpoint and atomic writer refuses malformed state', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-batch-state-'));
  try {
    assert.equal(await readBatchState(path.join(root, 'missing.json')), null);
    await assert.rejects(() => writeBatchStateAtomic(path.join(root, 'bad.json'), { schema: 'wrong' }), /must use/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
