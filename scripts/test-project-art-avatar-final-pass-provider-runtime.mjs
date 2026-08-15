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
  AVATAR_FINAL_PASS_PROVIDER_RUNTIME_BINDING_SCHEMA,
  AVATAR_FINAL_PASS_PROVIDER_RUNTIME_DISPATCH_SCHEMA,
  AVATAR_FINAL_PASS_PROVIDER_RUNTIME_OUTCOME_SCHEMA,
  ProjectArtAvatarFinalPassProviderRuntimeError,
  bindAvatarFinalPassProviderRuntimeContractFile,
  compileAvatarFinalPassProviderRuntimeDispatch,
  compileAvatarFinalPassProviderRuntimeDispatchFile,
  compileAvatarFinalPassProviderRuntimeOutcome,
  compileAvatarFinalPassProviderRuntimeOutcomeFile,
  validateAvatarFinalPassCompiledProviderRuntimeContract,
} from './project-art/avatar-final-pass-provider-runtime.mjs';
import {
  candidateRunOutcome,
  compiledRuntimeContract,
  completeFixture,
  fixtureTime,
  providerBatch,
  providerFailureOutcome,
} from './project-art/avatar-final-pass-provider-runtime-fixture.mjs';

test('binds one ready redraw to the generic provider runtime contract', () => {
  const batch = providerBatch();
  const dispatch = compileAvatarFinalPassProviderRuntimeDispatch({
    batch,
    jobId: 'redraw:talk-a',
    compiledAt: fixtureTime,
  });
  assert.equal(
    dispatch.schema,
    AVATAR_FINAL_PASS_PROVIDER_RUNTIME_DISPATCH_SCHEMA,
  );
  assert.equal(dispatch.operation, 'edit');
  assert.equal(dispatch.expectedRuntimeContract.kind, 'art.candidate.edit');
  assert.equal(dispatch.expectedRuntimeContract.candidateCount, 1);
  for (const capability of [
    'edit',
    'cancellation',
    'reference-images',
    'multiple-reference-images',
    'identity-reference',
    'native-alpha',
    'custom-size',
  ]) {
    assert.ok(
      dispatch.expectedRuntimeContract.requiredCapabilityProfile.includes(
        capability,
      ),
    );
  }
  assert.equal(dispatch.authority.providerExecution, false);
  assert.equal(dispatch.authority.explicitWriteEnabledRuntimeRequired, true);
  const compiled = compiledRuntimeContract(dispatch);
  const binding = validateAvatarFinalPassCompiledProviderRuntimeContract(
    dispatch,
    compiled,
  );
  assert.equal(
    binding.schema,
    AVATAR_FINAL_PASS_PROVIDER_RUNTIME_BINDING_SCHEMA,
  );
  assert.equal(binding.runtimeJob.kind, 'art.candidate.edit');
  assert.equal(binding.runtimeJob.maximumAttempts, 3);
  assert.equal(binding.authority.runtimeEnqueue, false);
  assert.match(binding.runtimeBindingSha256, /^[a-f0-9]{64}$/u);
});

test('generated in-between dispatch retains temporal reference capabilities', () => {
  const batch = providerBatch();
  const dispatch = compileAvatarFinalPassProviderRuntimeDispatch({
    batch,
    jobId: 'inbetween:idle-mid',
    compiledAt: fixtureTime,
  });
  assert.equal(dispatch.operation, 'generate');
  assert.equal(dispatch.continuityPhase, 'in-between');
  assert.equal(dispatch.expectedRuntimeContract.kind, 'art.candidate.generate');
  assert.ok(
    dispatch.expectedRuntimeContract.requiredCapabilityProfile.includes(
      'temporal-reference',
    ),
  );
  assert.ok(
    dispatch.expectedRuntimeContract.requiredCapabilityProfile.includes(
      'identity-reference',
    ),
  );
  assert.ok(
    dispatch.providerCompiler.input.references.some(
      (entry) => entry.role === 'previous-key-pose',
    ),
  );
  assert.ok(
    dispatch.providerCompiler.input.references.some(
      (entry) => entry.role === 'next-key-pose',
    ),
  );
  const binding = validateAvatarFinalPassCompiledProviderRuntimeContract(
    dispatch,
    compiledRuntimeContract(dispatch),
  );
  assert.equal(binding.runtimeJob.kind, 'art.candidate.generate');
});

test('successful runtime result becomes a create-only candidate materialization plan', () => {
  const fixture = completeFixture();
  assert.equal(
    fixture.outcome.schema,
    AVATAR_FINAL_PASS_PROVIDER_RUNTIME_OUTCOME_SCHEMA,
  );
  assert.equal(
    fixture.outcome.result.status,
    'candidate-materialization-required',
  );
  assert.equal(fixture.outcome.result.candidateCount, 1);
  assert.equal(
    fixture.outcome.result.materializationRequest.targetPath,
    fixture.dispatch.candidateAdmission.candidateOutputPath,
  );
  assert.equal(
    fixture.outcome.result.materializationRequest.reviewedTargetPath,
    fixture.dispatch.candidateAdmission.reviewedTargetPath,
  );
  assert.equal(fixture.outcome.result.materializationRequest.createOnly, true);
  assert.equal(fixture.outcome.result.approvals.anatomy, false);
  assert.equal(fixture.outcome.authority.candidateMaterialization, false);
  assert.equal(fixture.outcome.authority.runtimeActivation, false);
});

test('provider failure records zero candidates and requires fresh human authorization', () => {
  const batch = providerBatch();
  const dispatch = compileAvatarFinalPassProviderRuntimeDispatch({
    batch,
    jobId: 'redraw:talk-a',
    compiledAt: fixtureTime,
  });
  const binding = validateAvatarFinalPassCompiledProviderRuntimeContract(
    dispatch,
    compiledRuntimeContract(dispatch),
  );
  const outcome = compileAvatarFinalPassProviderRuntimeOutcome(
    dispatch,
    binding,
    providerFailureOutcome(dispatch),
  );
  assert.equal(outcome.result.status, 'provider-failure-record-required');
  assert.equal(outcome.result.candidateCount, 0);
  assert.equal(
    outcome.result.failureRecordTemplate.retryRequiresFreshHumanRunOnceAuthorization,
    true,
  );
  assert.equal(
    outcome.result.failureRecordTemplate.previousProviderBatchRemainsImmutable,
    true,
  );
});

test('blocked jobs, tampered hashes and provider fallback fail closed', () => {
  const batch = structuredClone(providerBatch());
  batch.jobs[0].status = 'blocked';
  batch.jobs[0].blockers = ['human-provider-authorization-required'];
  assert.throws(
    () =>
      compileAvatarFinalPassProviderRuntimeDispatch({
        batch,
        jobId: 'redraw:talk-a',
        compiledAt: fixtureTime,
      }),
    (error) =>
      error instanceof ProjectArtAvatarFinalPassProviderRuntimeError &&
      error.code === 'AVATAR_PROVIDER_RUNTIME_SELF_HASH_MISMATCH',
  );

  const valid = providerBatch();
  const dispatch = compileAvatarFinalPassProviderRuntimeDispatch({
    batch: valid,
    jobId: 'redraw:talk-a',
    compiledAt: fixtureTime,
  });
  const compiled = structuredClone(compiledRuntimeContract(dispatch));
  compiled.request.selection.allowFallback = true;
  compiled.runtimeJob.payload.selection.allowFallback = true;
  assert.throws(
    () =>
      validateAvatarFinalPassCompiledProviderRuntimeContract(
        dispatch,
        compiled,
      ),
    (error) => error.code === 'AVATAR_PROVIDER_RUNTIME_COMPILED_REQUEST_INVALID',
  );
});

test('multiple provider attempts and multiple candidates are rejected', () => {
  const batch = providerBatch();
  const dispatch = compileAvatarFinalPassProviderRuntimeDispatch({
    batch,
    jobId: 'redraw:talk-a',
    compiledAt: fixtureTime,
  });
  const binding = validateAvatarFinalPassCompiledProviderRuntimeContract(
    dispatch,
    compiledRuntimeContract(dispatch),
  );
  const multipleAttempts = structuredClone(candidateRunOutcome(dispatch, binding));
  multipleAttempts.result.attempts.push({
    ...multipleAttempts.result.attempts[0],
  });
  assert.throws(
    () =>
      compileAvatarFinalPassProviderRuntimeOutcome(
        dispatch,
        binding,
        multipleAttempts,
      ),
    (error) => error.code === 'AVATAR_PROVIDER_RUNTIME_ATTEMPT_INVALID',
  );

  const multipleCandidates = structuredClone(
    candidateRunOutcome(dispatch, binding),
  );
  multipleCandidates.result.candidateArtifacts.push(
    `artifact_${'6'.repeat(64)}`,
  );
  assert.throws(
    () =>
      compileAvatarFinalPassProviderRuntimeOutcome(
        dispatch,
        binding,
        multipleCandidates,
      ),
    (error) =>
      error.code === 'AVATAR_PROVIDER_RUNTIME_CANDIDATE_ARTIFACT_INVALID',
  );
});

test('file operations are stable, private and create-only across dispatch, bind and outcome', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'evavo-avatar-runtime-'));
  try {
    const batch = providerBatch();
    const batchPath = path.join(root, 'batch.json');
    const dispatchPath = path.join(root, 'dispatch.json');
    const compiledPath = path.join(root, 'compiled.json');
    const bindingPath = path.join(root, 'binding.json');
    const runtimeOutcomePath = path.join(root, 'runtime-outcome.json');
    const normalizedOutcomePath = path.join(root, 'normalized-outcome.json');
    writeFileSync(batchPath, `${JSON.stringify(batch, null, 2)}\n`);
    const { dispatch } = compileAvatarFinalPassProviderRuntimeDispatchFile({
      batchPath,
      jobId: 'redraw:talk-a',
      outputPath: dispatchPath,
      compiledAt: fixtureTime,
    });
    writeFileSync(
      compiledPath,
      `${JSON.stringify(compiledRuntimeContract(dispatch), null, 2)}\n`,
    );
    const { binding } = bindAvatarFinalPassProviderRuntimeContractFile({
      dispatchPath,
      compiledRuntimeContractPath: compiledPath,
      outputPath: bindingPath,
    });
    writeFileSync(
      runtimeOutcomePath,
      `${JSON.stringify(candidateRunOutcome(dispatch, binding), null, 2)}\n`,
    );
    const { outcome } = compileAvatarFinalPassProviderRuntimeOutcomeFile({
      dispatchPath,
      bindingPath,
      runtimeOutcomePath,
      outputPath: normalizedOutcomePath,
    });
    assert.equal(
      JSON.parse(readFileSync(normalizedOutcomePath, 'utf8')).runtimeOutcomeSha256,
      outcome.runtimeOutcomeSha256,
    );
    assert.throws(
      () =>
        compileAvatarFinalPassProviderRuntimeDispatchFile({
          batchPath,
          jobId: 'redraw:talk-a',
          outputPath: dispatchPath,
          compiledAt: fixtureTime,
        }),
      (error) => error.code === 'EEXIST',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

console.log('Project Art avatar final-pass provider runtime regressions passed.');
