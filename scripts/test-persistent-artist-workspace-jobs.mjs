#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  JOB_REQUEST_SCHEMA,
  claimWorkspaceJob,
  compileWorkspaceJob,
  completeWorkspaceJobStep,
  createWorkspaceJob,
  failWorkspaceJobStep,
  inspectWorkspaceJob,
  releaseWorkspaceJob,
  startWorkspaceJobStep,
} from './project-art/persistent-workspace-jobs.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-art-job-test-'));
await mkdir(path.join(root, 'sources'), { recursive: true });
await mkdir(path.join(root, 'working'), { recursive: true });
await mkdir(path.join(root, 'exports'), { recursive: true });
await writeFile(path.join(root, 'sources', 'source.txt'), 'source-v1\n');

const request = {
  schema: JOB_REQUEST_SCHEMA,
  workspaceId: 'workspace-test',
  projectId: 'project-test',
  title: 'Resumable production test',
  steps: [
    {
      id: 'prepare',
      kind: 'workspace-operation',
      description: 'Prepare governed working source.',
      inputs: ['sources/source.txt'],
      outputs: ['working/prepared.txt'],
    },
    {
      id: 'review',
      kind: 'visual-review',
      description: 'Record explicit review checkpoint.',
      requires: ['prepare'],
      outputs: [],
    },
    {
      id: 'export',
      kind: 'storage-handoff',
      description: 'Prepare final export evidence.',
      requires: ['review'],
      outputs: ['exports/final.txt'],
    },
  ],
};

try {
  const requestBytes = Buffer.from(`${JSON.stringify(request)}\n`);
  const plan = await compileWorkspaceJob({
    workspaceRoot: root,
    request,
    requestBytes,
    compiledAt: '2026-08-12T04:10:00.000Z',
  });
  assert.equal(plan.schema, 'evavo.persistent-artist-workspace-job-plan.v1');
  assert.equal(plan.steps.length, 3);
  assert.equal(plan.steps[0].inputFingerprints[0].path, 'sources/source.txt');
  assert.equal(plan.steps[0].inputFingerprints[0].bytes, 10);
  assert.equal(plan.execution.compareAndAppendEvents, true);

  let state = await createWorkspaceJob({ workspaceRoot: root, plan });
  assert.equal(state.status, 'ready');
  assert.equal(state.nextStepId, 'prepare');
  assert.equal(state.eventCount, 1);

  await assert.rejects(
    createWorkspaceJob({ workspaceRoot: root, plan }),
    (error) => error?.code === 'ARTIST_WORKSPACE_JOB_COLLISION',
  );

  state = await claimWorkspaceJob({
    workspaceRoot: root,
    jobId: plan.jobId,
    actor: 'agent-a',
    leaseSeconds: 60,
    now: '2026-08-12T04:11:00.000Z',
  });
  assert.equal(state.activeLease.actor, 'agent-a');

  state = await startWorkspaceJobStep({
    workspaceRoot: root,
    jobId: plan.jobId,
    actor: 'agent-a',
    stepId: 'prepare',
    now: '2026-08-12T04:11:01.000Z',
  });
  assert.equal(state.status, 'in-progress');
  assert.equal(state.nextStepId, 'prepare');

  await writeFile(path.join(root, 'working', 'prepared.txt'), 'prepared-v1\n');
  state = await completeWorkspaceJobStep({
    workspaceRoot: root,
    jobId: plan.jobId,
    actor: 'agent-a',
    stepId: 'prepare',
    now: '2026-08-12T04:11:02.000Z',
  });
  assert.equal(state.status, 'ready');
  assert.equal(state.nextStepId, 'review');
  assert.equal(state.steps.find((step) => step.id === 'prepare').state.evidence.length, 1);

  // A crashed actor lease expires. A different agent can safely resume from the exact next checkpoint.
  state = await claimWorkspaceJob({
    workspaceRoot: root,
    jobId: plan.jobId,
    actor: 'agent-b',
    leaseSeconds: 300,
    now: '2026-08-12T04:12:30.000Z',
  });
  assert.equal(state.activeLease.actor, 'agent-b');
  assert.equal(state.nextStepId, 'review');

  state = await startWorkspaceJobStep({ workspaceRoot: root, jobId: plan.jobId, actor: 'agent-b', stepId: 'review', now: '2026-08-12T04:12:31.000Z' });
  state = await completeWorkspaceJobStep({ workspaceRoot: root, jobId: plan.jobId, actor: 'agent-b', stepId: 'review', now: '2026-08-12T04:12:32.000Z' });
  assert.equal(state.nextStepId, 'export');

  state = await startWorkspaceJobStep({ workspaceRoot: root, jobId: plan.jobId, actor: 'agent-b', stepId: 'export', now: '2026-08-12T04:12:33.000Z' });
  await writeFile(path.join(root, 'exports', 'final.txt'), 'final-v1\n');
  state = await completeWorkspaceJobStep({ workspaceRoot: root, jobId: plan.jobId, actor: 'agent-b', stepId: 'export', now: '2026-08-12T04:12:34.000Z' });
  assert.equal(state.status, 'completed');
  assert.equal(state.nextStepId, null);

  await releaseWorkspaceJob({ workspaceRoot: root, jobId: plan.jobId, actor: 'agent-b', now: '2026-08-12T04:12:35.000Z' });

  // Exact output evidence makes later drift visible instead of silently accepting altered files.
  await writeFile(path.join(root, 'exports', 'final.txt'), 'tampered\n');
  state = await inspectWorkspaceJob({ workspaceRoot: root, jobId: plan.jobId, now: '2026-08-12T04:13:00.000Z' });
  assert.equal(state.evidenceDrift.length, 1);
  assert.equal(state.evidenceDrift[0].stepId, 'export');

  // A fresh job blocks execution if its compiled input identity changes.
  const driftRequest = structuredClone(request);
  driftRequest.jobId = 'job-input-drift';
  const driftPlan = await compileWorkspaceJob({ workspaceRoot: root, request: driftRequest, compiledAt: '2026-08-12T04:14:00.000Z' });
  await createWorkspaceJob({ workspaceRoot: root, plan: driftPlan });
  await claimWorkspaceJob({ workspaceRoot: root, jobId: driftPlan.jobId, actor: 'agent-c', leaseSeconds: 300, now: '2026-08-12T04:14:01.000Z' });
  await writeFile(path.join(root, 'sources', 'source.txt'), 'source-v2\n');
  await assert.rejects(
    startWorkspaceJobStep({ workspaceRoot: root, jobId: driftPlan.jobId, actor: 'agent-c', stepId: 'prepare', now: '2026-08-12T04:14:02.000Z' }),
    (error) => error?.code === 'ARTIST_WORKSPACE_JOB_INPUT_DRIFT',
  );

  // Failed steps are resumable: the same step becomes the next actionable checkpoint.
  await writeFile(path.join(root, 'sources', 'source.txt'), 'source-v2\n');
  const retryRequest = structuredClone(request);
  retryRequest.jobId = 'job-retry';
  const retryPlan = await compileWorkspaceJob({ workspaceRoot: root, request: retryRequest, compiledAt: '2026-08-12T04:15:00.000Z' });
  await createWorkspaceJob({ workspaceRoot: root, plan: retryPlan });
  await claimWorkspaceJob({ workspaceRoot: root, jobId: retryPlan.jobId, actor: 'agent-d', leaseSeconds: 300, now: '2026-08-12T04:15:01.000Z' });
  await startWorkspaceJobStep({ workspaceRoot: root, jobId: retryPlan.jobId, actor: 'agent-d', stepId: 'prepare', now: '2026-08-12T04:15:02.000Z' });
  state = await failWorkspaceJobStep({ workspaceRoot: root, jobId: retryPlan.jobId, actor: 'agent-d', stepId: 'prepare', message: 'bounded tool failure', now: '2026-08-12T04:15:03.000Z' });
  assert.equal(state.nextStepId, 'prepare');
  assert.equal(state.steps.find((step) => step.id === 'prepare').state.status, 'failed');

  // Concurrent checkpoint intents are compare-and-append: only one competing actor may win each observed state.
  // Repeat the race enough times to exercise both precondition and exclusive-create collision paths.
  for (let index = 0; index < 16; index += 1) {
    const concurrentRequest = structuredClone(request);
    concurrentRequest.jobId = `job-concurrent-${String(index).padStart(2, '0')}`;
    const concurrentPlan = await compileWorkspaceJob({
      workspaceRoot: root,
      request: concurrentRequest,
      compiledAt: `2026-08-12T04:${String(20 + index).padStart(2, '0')}:00.000Z`,
    });
    await createWorkspaceJob({ workspaceRoot: root, plan: concurrentPlan });
    const competingClaims = await Promise.allSettled([
      claimWorkspaceJob({ workspaceRoot: root, jobId: concurrentPlan.jobId, actor: `race-a-${index}`, leaseSeconds: 300, now: '2026-08-12T05:00:00.000Z' }),
      claimWorkspaceJob({ workspaceRoot: root, jobId: concurrentPlan.jobId, actor: `race-b-${index}`, leaseSeconds: 300, now: '2026-08-12T05:00:00.000Z' }),
    ]);
    const fulfilled = competingClaims.filter((entry) => entry.status === 'fulfilled');
    const rejected = competingClaims.filter((entry) => entry.status === 'rejected');
    assert.equal(fulfilled.length, 1, `exactly one concurrent claim must win for ${concurrentPlan.jobId}`);
    assert.equal(rejected.length, 1, `exactly one concurrent claim must be rejected for ${concurrentPlan.jobId}`);
    assert.equal(
      ['ARTIST_WORKSPACE_JOB_CONCURRENCY', 'ARTIST_WORKSPACE_JOB_ALREADY_CLAIMED'].includes(rejected[0].reason?.code),
      true,
      `unexpected concurrent-claim rejection for ${concurrentPlan.jobId}: ${rejected[0].reason?.code}`,
    );
    const concurrentState = await inspectWorkspaceJob({ workspaceRoot: root, jobId: concurrentPlan.jobId, now: '2026-08-12T05:00:01.000Z' });
    assert.equal(concurrentState.eventCount, 2, `stale competing claim must not become a second durable event for ${concurrentPlan.jobId}`);
    assert.ok(concurrentState.activeLease?.actor.startsWith('race-'));
  }


  // Job journals are not trusted forever after creation: a later parent-directory symlink substitution fails closed.
  const pathChainRequest = structuredClone(request);
  pathChainRequest.jobId = 'job-path-chain';
  const pathChainPlan = await compileWorkspaceJob({ workspaceRoot: root, request: pathChainRequest, compiledAt: '2026-08-12T05:10:00.000Z' });
  await createWorkspaceJob({ workspaceRoot: root, plan: pathChainPlan });
  const pathChainJobRoot = path.join(root, 'journals', 'jobs', pathChainPlan.jobId);
  const relocatedParent = path.join(root, 'scratch-job-journal');
  await mkdir(relocatedParent, { recursive: true });
  const relocatedJobRoot = path.join(relocatedParent, pathChainPlan.jobId);
  await rename(pathChainJobRoot, relocatedJobRoot);
  await symlink(relocatedJobRoot, pathChainJobRoot, 'dir');
  await assert.rejects(
    inspectWorkspaceJob({ workspaceRoot: root, jobId: pathChainPlan.jobId, now: '2026-08-12T05:10:01.000Z' }),
    (error) => error?.code === 'ARTIST_WORKSPACE_JOB_PATH_INVALID',
  );
  await assert.rejects(
    claimWorkspaceJob({ workspaceRoot: root, jobId: pathChainPlan.jobId, actor: 'path-race-agent', leaseSeconds: 300, now: '2026-08-12T05:10:02.000Z' }),
    (error) => error?.code === 'ARTIST_WORKSPACE_JOB_PATH_INVALID',
  );

  // Dependency cycles are rejected at compilation time.
  const cycle = {
    schema: JOB_REQUEST_SCHEMA,
    workspaceId: 'workspace-test',
    projectId: 'project-test',
    title: 'cycle',
    steps: [
      { id: 'a', kind: 'manual-checkpoint', description: 'a', requires: ['b'] },
      { id: 'b', kind: 'manual-checkpoint', description: 'b', requires: ['a'] },
    ],
  };
  await assert.rejects(compileWorkspaceJob({ workspaceRoot: root, request: cycle }), (error) => error?.code === 'ARTIST_WORKSPACE_JOB_INVALID');

  // Symbolic inputs are rejected before a plan can become durable authority.
  await writeFile(path.join(root, 'sources', 'real.txt'), 'real\n');
  await symlink(path.join(root, 'sources', 'real.txt'), path.join(root, 'sources', 'linked.txt'));
  const linked = {
    schema: JOB_REQUEST_SCHEMA,
    workspaceId: 'workspace-test',
    projectId: 'project-test',
    title: 'symlink',
    steps: [{ id: 'one', kind: 'workspace-operation', description: 'one', inputs: ['sources/linked.txt'] }],
  };
  await assert.rejects(compileWorkspaceJob({ workspaceRoot: root, request: linked }), (error) => error?.code === 'ARTIST_WORKSPACE_JOB_PATH_INVALID');

  // Event-chain tampering is detected.
  const eventPath = path.join(root, 'journals', 'jobs', retryPlan.jobId, 'events', '000002.json');
  const event = JSON.parse(await readFile(eventPath, 'utf8'));
  event.actor = 'tampered-agent';
  await writeFile(eventPath, `${JSON.stringify(event)}\n`);
  await assert.rejects(inspectWorkspaceJob({ workspaceRoot: root, jobId: retryPlan.jobId }), (error) => error?.code === 'ARTIST_WORKSPACE_JOB_HASH_MISMATCH');

  console.log('Persistent Artist Workspace job regressions passed.');
  console.log('- append-only hash-chained checkpoints survive actor interruption');
  console.log('- stale leases allow bounded takeover without guessing the next step');
  console.log('- competing checkpoint intents use compare-and-append semantics and cannot serialize stale state');
  console.log('- exact compiled inputs are revalidated before execution');
  console.log('- exact succeeded outputs remain drift-verifiable after completion');
  console.log('- failed steps remain resumable and dependency cycles are rejected');
  console.log('- symbolic inputs, post-creation journal path substitution and tampered events are rejected');
} finally {
  await rm(root, { recursive: true, force: true });
}
