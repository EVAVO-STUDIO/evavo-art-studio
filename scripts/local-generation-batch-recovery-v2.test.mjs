#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  firstInvalidRecoveredStage,
  recoverBatchExecution,
  recoveryStatePath,
} from './local-generation-batch-recovery-v2.mjs';
import {
  checkpointBatchState,
  createBatchState,
  writeBatchStateAtomic,
} from './local-generation-batch-state-v2.mjs';

const artifactA = `artifact_${'a'.repeat(64)}`;
const artifactB = `artifact_${'b'.repeat(64)}`;
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function manifest() { return { schema: 'evavo.local-generation-batch.v2', campaign_id: 'recover-test', batch_size: 2, shots: [{ id: 'anchor' }, { id: 'follow' }] }; }
function plan() {
  return {
    campaignId: 'recover-test', batchSize: 2, mode: 'sequential-anchor', consistencyMode: 'strict', qualityProfile: 'cinematic_stills',
    retryRules: { maxShotAttempts: 3 }, outputRules: { exactCount: true },
    frames: [
      { id: 'anchor', ordinal: 1, seed: 1, candidateCount: 1, promptSha256: '1'.repeat(64), negativePromptSha256: '2'.repeat(64), continuityPhase: 'key-pose', shot: { referenceInputs: [] } },
      { id: 'follow', ordinal: 2, seed: 2, candidateCount: 1, promptSha256: '3'.repeat(64), negativePromptSha256: '4'.repeat(64), continuityPhase: 'key-pose', shot: { referenceInputs: [{ sourceShotId: 'anchor', candidateIndex: 0, role: 'canonical-identity', required: true }] } },
    ],
  };
}
function referencePlan() { return { frames: plan().frames, referenceGraph: { stages: [['anchor'], ['follow']] } }; }
async function candidate(root, name, artifactId, contents = `bytes-${name}`) {
  const file = path.join(root, `${name}.png`);
  const bytes = Buffer.from(contents);
  await writeFile(file, bytes);
  return { artifactId, source: file, qa: { ok: true, sha256: sha(bytes), codes: [], bytes: bytes.length, dimensions: { format: 'png', width: 1, height: 1 } } };
}

test('recovery state path is deterministic for the authored manifest and compiled plan', () => {
  const one = recoveryStatePath('C:\\Temp\\ArtStudio', 'recover-test', manifest(), plan());
  const two = recoveryStatePath('C:\\Temp\\ArtStudio', 'recover-test', manifest(), plan());
  assert.equal(one, two);
  assert.match(one.replaceAll('\\', '/'), /recover-test\/\.resume\/[a-f0-9]{16}-[a-f0-9]{16}\/state\.json$/u);
});

test('fresh recovery creates an empty execution without trusting existing filesystem output', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-recovery-fresh-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const result = await recoverBatchExecution({
    statePath: path.join(root, 'missing-state.json'), manifest: manifest(), plan: plan(), referencePlan: referencePlan(),
    runId: 'run_fresh', startedAt: '2026-09-04T00:00:00.000Z',
  });
  assert.equal(result.recovered, false);
  assert.equal(result.nextStageIndex, 0);
  assert.equal(result.frameResults.size, 0);
  assert.equal(result.artifactResults.size, 0);
});

test('fully valid recovered stages preserve accepted artifact IDs and resume after the completed stage', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-recovery-valid-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const anchor = await candidate(root, 'anchor', artifactA);
  const state = createBatchState({ manifest: manifest(), plan: plan(), referencePlan: referencePlan(), runId: 'run_valid', startedAt: '2026-09-04T00:00:00.000Z' });
  const checkpoint = checkpointBatchState(state, {
    frameResults: new Map([['anchor', { attempt: 1, stage: 1, candidates: [anchor] }]]),
    artifactResults: new Map([['anchor', [artifactA]]), attempts: [{ stage: 1, attempt: 1 }], completedStageCount: 1,
  });
  const statePath = path.join(root, 'state.json');
  await writeBatchStateAtomic(statePath, checkpoint);
  const recovered = await recoverBatchExecution({ statePath, manifest: manifest(), plan: plan(), referencePlan: referencePlan(), runId: 'ignored', startedAt: 'ignored' });
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.nextStageIndex, 1);
  assert.equal(recovered.invalidated, null);
  assert.deepEqual(recovered.artifactResults.get('anchor'), [artifactA]);
});

test('recovery invalidates a tampered upstream artifact and every dependent stage', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-recovery-tamper-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const anchor = await candidate(root, 'anchor', artifactA, 'accepted-anchor');
  const follow = await candidate(root, 'follow', artifactB, 'accepted-follow');
  const state = createBatchState({ manifest: manifest(), plan: plan(), referencePlan: referencePlan(), runId: 'run_tamper', startedAt: '2026-09-04T00:00:00.000Z' });
  const checkpoint = checkpointBatchState(state, {
    frameResults: new Map([
      ['anchor', { attempt: 1, stage: 1, candidates: [anchor] }],
      ['follow', { attempt: 1, stage: 2, candidates: [follow] }],
    ]),
    artifactResults: new Map([['anchor', [artifactA]], ['follow', [artifactB]]),
    attempts: [{ stage: 1, attempt: 1 }, { stage: 2, attempt: 1 }], completedStageCount: 2,
  });
  const statePath = path.join(root, 'state.json');
  await writeBatchStateAtomic(statePath, checkpoint);
  await writeFile(anchor.source, Buffer.from('tampered-anchor'));
  const recovered = await recoverBatchExecution({ statePath, manifest: manifest(), plan: plan(), referencePlan: referencePlan(), runId: 'ignored', startedAt: 'ignored' });
  assert.equal(recovered.nextStageIndex, 0);
  assert.equal(recovered.invalidated.stageIndex, 0);
  assert.match(recovered.invalidated.reason, /SHA-256 differs/u);
  assert.equal(recovered.frameResults.size, 0);
  assert.equal(recovered.artifactResults.size, 0);
  assert.equal(recovered.attempts.length, 0);
});

test('a stale downstream file invalidates only that stage while keeping the accepted anchor reusable', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-recovery-downstream-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const anchor = await candidate(root, 'anchor', artifactA, 'accepted-anchor');
  const follow = await candidate(root, 'follow', artifactB, 'accepted-follow');
  const state = createBatchState({ manifest: manifest(), plan: plan(), referencePlan: referencePlan(), runId: 'run_downstream', startedAt: '2026-09-04T00:00:00.000Z' });
  const checkpoint = checkpointBatchState(state, {
    frameResults: new Map([
      ['anchor', { attempt: 1, stage: 1, candidates: [anchor] }],
      ['follow', { attempt: 1, stage: 2, candidates: [follow] }],
    ]),
    artifactResults: new Map([['anchor', [artifactA]], ['follow', [artifactB]]),
    attempts: [{ stage: 1, attempt: 1 }, { stage: 2, attempt: 1 }], completedStageCount: 2,
  });
  const statePath = path.join(root, 'state.json');
  await writeBatchStateAtomic(statePath, checkpoint);
  await rm(follow.source);
  const recovered = await recoverBatchExecution({ statePath, manifest: manifest(), plan: plan(), referencePlan: referencePlan(), runId: 'ignored', startedAt: 'ignored' });
  assert.equal(recovered.nextStageIndex, 1);
  assert.equal(recovered.invalidated.stageIndex, 1);
  assert.equal(recovered.frameResults.has('anchor'), true);
  assert.equal(recovered.artifactResults.has('anchor'), true);
  assert.equal(recovered.frameResults.has('follow'), false);
  assert.equal(recovered.artifactResults.has('follow'), false);
  assert.deepEqual(recovered.attempts, [{ stage: 1, attempt: 1 }]);
});

test('recovery validation refuses failed QA even when the source bytes and hash are present', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-recovery-qa-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const anchor = await candidate(root, 'anchor', artifactA);
  anchor.qa.ok = false;
  const invalid = await firstInvalidRecoveredStage(referencePlan(), new Map([['anchor', { candidates: [anchor] }]]), 1);
  assert.equal(invalid.stageIndex, 0);
  assert.match(invalid.reason, /not QA-accepted/u);
});
