#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  AVATAR_FINAL_PASS_PROVIDER_BATCH_SCHEMA,
  ProjectArtAvatarFinalPassProviderError,
  compileProjectArtAvatarFinalPassProviderBatchFile,
} from './project-art/avatar-final-pass-provider.mjs';
import {
  admission,
  at,
  authorization,
  compile,
  hash,
  request,
  sealPlan,
} from './project-art/avatar-final-pass-provider-test-fixture.mjs';

test('compiles one-candidate redraw and anatomy-safe in-between provider submissions', () => {
  const plan = sealPlan();
  const batch = compile(plan, request(plan));
  assert.equal(batch.schema, AVATAR_FINAL_PASS_PROVIDER_BATCH_SCHEMA);
  assert.equal(batch.counts.requested, 2);
  assert.equal(batch.counts.ready, 2);
  assert.equal(batch.counts.blocked, 0);
  assert.equal(batch.counts.redraws, 1);
  assert.equal(batch.counts.inbetweens, 1);
  assert.equal(batch.readySubmissions.length, 2);
  assert.equal(batch.candidateCountPerJob, 1);
  assert.equal(batch.providerExecution, false);
  assert.equal(batch.candidateApproval, false);
  assert.equal(batch.runtimeActivationAllowed, false);
  assert.ok(Object.values(batch.authority).every((value) => value === false));
  assert.match(batch.batchSha256, /^[a-f0-9]{64}$/u);

  const redraw = batch.jobs.find((entry) => entry.jobId === 'redraw:talk-a');
  assert.equal(redraw.status, 'ready-for-explicit-provider-submission');
  assert.equal(redraw.providerRequestInput.operation, 'edit');
  assert.equal(redraw.providerRequestInput.candidateCount, 1);
  assert.equal(redraw.providerRequestInput.selection.allowFallback, false);
  assert.equal(redraw.providerRequestInput.references.length, 2);
  assert.match(redraw.composedPrompt, /Correct only these declared defects: hands, fingers/u);
  assert.equal(redraw.providerRequestInput.metadata.approvals.anatomy, false);

  const inbetween = batch.jobs.find((entry) => entry.jobId === 'inbetween:idle-mid');
  assert.equal(inbetween.providerRequestInput.operation, 'generate');
  assert.equal(inbetween.providerRequestInput.continuityPhase, 'in-between');
  assert.equal(inbetween.providerRequestInput.references.length, 3);
  assert.match(inbetween.composedPrompt, /not a cross-fade or double exposure/u);
  assert.equal(
    inbetween.candidateOutputPath,
    'scratch/avatar-final-pass/eva-final-pass-v1/idle-mid/candidate-01.png',
  );
});

test('missing authorization and artifact admission remain blocked without a submit object', () => {
  const plan = sealPlan();
  const batch = compile(plan, request(plan, { ready: false }));
  assert.equal(batch.counts.ready, 0);
  assert.equal(batch.counts.blocked, 2);
  for (const job of batch.jobs) {
    assert.equal(job.status, 'blocked');
    assert.equal(job.providerRequestInput, null);
    assert.equal(job.providerRequestSha256, null);
    assert.ok(job.blockers.includes('human-provider-authorization-required'));
    assert.ok(job.blockers.some((blocker) => blocker.startsWith('reference-artifact-required:')));
  }
});

test('in-betweens wait for final endpoint hashes instead of using unfinished repaired key frames', () => {
  const plan = sealPlan({
    sequenceMasteringRequestTemplate: {
      schema: 'evavo.project-art-avatar-sequence-request.v1',
      frames: [
        {
          id: 'idle-a',
          sourcePath: 'frames/idle-a.png',
          targetPath: 'assets/eva-female/reviewed/idle-a.png',
          expectedSha256: hash('b'),
          pendingOutput: false,
        },
        {
          id: 'idle-b',
          sourcePath: 'frames/idle-b.png',
          targetPath: 'assets/eva-female/reviewed/idle-b.png',
          expectedSha256: null,
          pendingOutput: true,
        },
        {
          id: 'talk-a',
          sourcePath: 'frames/talk-a.png',
          targetPath: 'assets/eva-female/reviewed/talk-a.png',
          expectedSha256: null,
          pendingOutput: true,
        },
        {
          id: 'idle-mid',
          sourcePath: null,
          targetPath: 'assets/eva-female/reviewed/idle-mid.png',
          expectedSha256: null,
          pendingOutput: true,
        },
      ],
    },
  });
  const input = request(plan);
  input.jobs[1].artifactBindings = input.jobs[1].artifactBindings.filter(
    (binding) => binding.bindingKey !== 'next-key-pose',
  );
  const batch = compile(plan, input);
  const inbetween = batch.jobs.find((entry) => entry.jobId === 'inbetween:idle-mid');
  assert.equal(inbetween.status, 'blocked');
  assert.ok(inbetween.blockers.includes('after-frame-final-output-required'));
  assert.equal(inbetween.providerRequestInput, null);
  assert.ok(
    !inbetween.requiredReferences.some(
      (entry) => entry.bindingKey === 'next-key-pose',
    ),
  );
});

test('plan tampering, false authority and non-human authorization fail closed', () => {
  const plan = sealPlan();
  const changed = structuredClone(plan);
  changed.canvas.width += 1;
  assert.throws(
    () => compile(changed, request(changed)),
    (error) =>
      error instanceof ProjectArtAvatarFinalPassProviderError &&
      error.code === 'AVATAR_FINAL_PASS_PROVIDER_PLAN_HASH_MISMATCH',
  );

  const falseAuthority = request(plan);
  falseAuthority.authority.providerExecution = true;
  assert.throws(
    () => compile(plan, falseAuthority),
    (error) => error.code === 'AVATAR_FINAL_PASS_PROVIDER_FALSE_AUTHORITY_REQUIRED',
  );

  const machine = request(plan);
  machine.jobs[0].authorization.actorClass = 'agent';
  assert.throws(
    () => compile(plan, machine),
    (error) => error.code === 'AVATAR_FINAL_PASS_PROVIDER_HUMAN_AUTHORIZATION_REQUIRED',
  );
});

test('artifact substitution, fallback and output-target collisions fail closed', () => {
  const plan = sealPlan();
  const substituted = request(plan);
  substituted.jobs[0].artifactBindings[1].sourceSha256 = hash('d');
  assert.throws(
    () => compile(plan, substituted),
    (error) => error.code === 'AVATAR_FINAL_PASS_PROVIDER_BINDING_SOURCE_MISMATCH',
  );

  const fallback = request(plan);
  fallback.jobs[0].selection.allowFallback = true;
  assert.throws(
    () => compile(plan, fallback),
    (error) => error.code === 'AVATAR_FINAL_PASS_PROVIDER_FALLBACK_FORBIDDEN',
  );

  const target = request(plan);
  target.jobs[0].candidateOutputPath =
    'assets/eva-female/reviewed/talk-a.png';
  assert.throws(
    () => compile(plan, target),
    (error) => error.code === 'AVATAR_FINAL_PASS_PROVIDER_CANDIDATE_PATH_INVALID',
  );
});

test('deterministic repairs and morph previews never become provider jobs', () => {
  const plan = sealPlan();
  const input = request(plan);
  input.jobs.push({
    ...structuredClone(input.jobs[0]),
    jobId: 'redraw:idle-b',
    candidateOutputPath:
      'scratch/avatar-final-pass/eva-final-pass-v1/idle-b/candidate-01.png',
  });
  assert.throws(
    () => compile(plan, input),
    (error) => error.code === 'AVATAR_FINAL_PASS_PROVIDER_REQUEST_JOB_UNKNOWN',
  );
});

test('file compilation is stable, private and create-only', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'evavo-avatar-provider-'));
  try {
    const plan = sealPlan();
    const input = request(plan);
    const planPath = path.join(root, 'plan.json');
    const requestPath = path.join(root, 'request.json');
    const outputPath = path.join(root, 'batch.json');
    writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
    writeFileSync(requestPath, `${JSON.stringify(input, null, 2)}\n`);
    const batch = compileProjectArtAvatarFinalPassProviderBatchFile({
      planPath,
      requestPath,
      outputPath,
      compiledAt: at,
    });
    assert.equal(
      JSON.parse(readFileSync(outputPath, 'utf8')).batchSha256,
      batch.batchSha256,
    );
    assert.throws(
      () =>
        compileProjectArtAvatarFinalPassProviderBatchFile({
          planPath,
          requestPath,
          outputPath,
          compiledAt: at,
        }),
      (error) => error.code === 'EEXIST',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

console.log('Project Art avatar final-pass provider regressions passed.');
