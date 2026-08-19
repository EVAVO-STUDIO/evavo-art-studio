#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CHARACTER_IDENTITY_PROVIDER_EXECUTION_SCHEMA,
  CHARACTER_IDENTITY_PROVIDER_PROTOCOL_VERSION,
  characterIdentityProviderContractCapabilities,
  characterIdentityProviderExecutionCapabilities,
  compileCharacterIdentityProviderAdmission,
  compileCharacterIdentityProviderAuthorization,
  compileCharacterIdentityProviderRuntimeAdapter,
  executeCharacterIdentityProvider,
  parseCharacterIdentityProviderRuntimeAdapter,
} from './project-art/character-identity-provider-runtime.mjs';

const CRITIC_REQUEST = JSON.parse(
  readFileSync(
    new URL(
      '../config/council-avatar-identities/council-critic.identity-request.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

function sha(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function selection(seed) {
  return Object.freeze({
    preferredAdapterId: 'fixture-image',
    preferredModel: 'fixture-transparent-v1',
    allowedAdapterIds: Object.freeze(['fixture-image']),
    allowFallback: false,
    requireSeed: true,
    seed,
  });
}

function times(offsetMs = 0) {
  const now = Date.now() + offsetMs;
  return Object.freeze({
    admissionAt: new Date(now - 120_000).toISOString(),
    authorizedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 60 * 60_000).toISOString(),
  });
}

function temporaryRoots() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'evavo-character-identity-provider-'));
  const runtimeRoot = path.join(root, 'runtime');
  const artifactRoot = path.join(root, 'artifacts');
  mkdirSync(runtimeRoot, { recursive: true, mode: 0o700 });
  mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });
  return { root, runtimeRoot, artifactRoot };
}

function compileJob({
  jobId,
  seed,
  anchorExecutionReceipt = null,
  time = times(),
}) {
  const admission = compileCharacterIdentityProviderAdmission({
    identityRequest: CRITIC_REQUEST,
    jobId,
    selection: selection(seed),
    actorId: 'character-identity-test-reviewer',
    occurredAt: time.admissionAt,
    evidenceSha256: sha(`admission:${jobId}:${time.admissionAt}`),
    anchorExecutionReceipt,
  });
  const authorization = compileCharacterIdentityProviderAuthorization({
    providerAdmission: admission,
    actorId: 'character-identity-test-reviewer',
    occurredAt: time.authorizedAt,
    expiresAt: time.expiresAt,
    evidenceSha256: sha(`authorization:${jobId}:${time.authorizedAt}`),
  });
  const adapter = compileCharacterIdentityProviderRuntimeAdapter({
    identityRequest: CRITIC_REQUEST,
    providerAdmission: admission,
    authorization,
    compiledAt: new Date(Date.parse(time.authorizedAt) + 1_000).toISOString(),
  });
  return { admission, authorization, adapter };
}

test('executes one Critic set anchor candidate with no approval or release authority', async () => {
  const roots = temporaryRoots();
  try {
    const { adapter } = compileJob({
      jobId: 'candidate-set-01-full-body-right',
      seed: 187101,
    });
    const parsed = parseCharacterIdentityProviderRuntimeAdapter(adapter);
    assert.equal(parsed.characterId, 'council-critic');
    assert.equal(parsed.setId, 'candidate-set-01');
    assert.equal(parsed.viewId, 'full-body-right');
    assert.equal(parsed.providerAdmission.identityAnchor, null);
    assert.deepEqual(parsed.genericRuntimeDispatch.providerCompiler.input.references, []);
    assert.equal(
      parsed.genericRuntimeDispatch.providerCompiler.input.target.transparency,
      'required',
    );
    assert.equal(
      parsed.genericRuntimeDispatch.providerCompiler.input.background.strategy,
      'native-alpha',
    );

    const result = await executeCharacterIdentityProvider({
      adapter,
      runtimeRoot: roots.runtimeRoot,
      artifactRoot: roots.artifactRoot,
      workerId: 'character-identity-anchor-test-worker',
      environment: { EVAVO_ART_ENABLE_FIXTURE_PROVIDER: 'true' },
    });
    assert.equal(result.receipt.schema, CHARACTER_IDENTITY_PROVIDER_EXECUTION_SCHEMA);
    assert.equal(result.receipt.protocolVersion, CHARACTER_IDENTITY_PROVIDER_PROTOCOL_VERSION);
    assert.equal(result.receipt.status, 'succeeded');
    assert.equal(result.receipt.provider.providerCallCount, 1);
    assert.equal(result.receipt.provider.providerCallCountVerified, true);
    assert.equal(result.receipt.provider.fallbackAllowed, false);
    assert.equal(result.receipt.effects.candidateArtifactCreated, true);
    assert.equal(result.receipt.effects.evidenceArtifactCreated, true);
    assert.equal(result.receipt.effects.candidateBytesMaterialized, false);
    assert.equal(result.receipt.effects.candidateApprovalPerformed, false);
    assert.equal(result.receipt.effects.identityApprovalPerformed, false);
    assert.equal(result.receipt.effects.animationProductionPerformed, false);
    assert.equal(result.receipt.effects.publicationPerformed, false);
    assert.equal(result.receipt.effects.runtimeActivationPerformed, false);
    assert.equal(result.receipt.artifacts.candidate.approvalState, 'unapproved');
    assert.equal(result.outcome.result.status, 'candidate-materialization-required');
    assert.ok(Object.values(result.receipt.authority).every((value) => value === false));
    assert.match(result.receipt.executionSha256, /^[a-f0-9]{64}$/u);
  } finally {
    rmSync(roots.root, { recursive: true, force: true });
  }
});

test('reserves one authorization against replay before a second provider call', async () => {
  const roots = temporaryRoots();
  try {
    const { adapter } = compileJob({
      jobId: 'candidate-set-01-full-body-right',
      seed: 187102,
    });
    const options = {
      adapter,
      runtimeRoot: roots.runtimeRoot,
      artifactRoot: roots.artifactRoot,
      workerId: 'character-identity-replay-test-worker',
      environment: { EVAVO_ART_ENABLE_FIXTURE_PROVIDER: 'true' },
    };
    const first = await executeCharacterIdentityProvider(options);
    assert.equal(first.receipt.status, 'succeeded');
    await assert.rejects(
      executeCharacterIdentityProvider(options),
      (error) =>
        error?.code === 'CHARACTER_IDENTITY_PROVIDER_AUTHORIZATION_ALREADY_RESERVED',
    );
  } finally {
    rmSync(roots.root, { recursive: true, force: true });
  }
});

test('dependent Critic views are generated from the exact same-set unapproved anchor artifact', async () => {
  const roots = temporaryRoots();
  try {
    const anchorJob = compileJob({
      jobId: 'candidate-set-01-full-body-right',
      seed: 187103,
    });
    const anchorExecution = await executeCharacterIdentityProvider({
      adapter: anchorJob.adapter,
      runtimeRoot: roots.runtimeRoot,
      artifactRoot: roots.artifactRoot,
      workerId: 'character-identity-continuity-anchor-worker',
      environment: { EVAVO_ART_ENABLE_FIXTURE_PROVIDER: 'true' },
    });
    const leftJob = compileJob({
      jobId: 'candidate-set-01-full-body-left',
      seed: 187104,
      anchorExecutionReceipt: anchorExecution.receipt,
    });
    assert.equal(
      leftJob.admission.identityAnchor.executionSha256,
      anchorExecution.receipt.executionSha256,
    );
    assert.equal(
      leftJob.admission.identityAnchor.candidateArtifactId,
      anchorExecution.receipt.artifacts.candidate.artifactId,
    );
    const references =
      leftJob.adapter.genericRuntimeDispatch.providerCompiler.input.references;
    assert.equal(references.length, 1);
    assert.equal(references[0].role, 'canonical-identity');
    assert.equal(references[0].required, true);
    assert.equal(
      references[0].artifactId,
      anchorExecution.receipt.artifacts.candidate.artifactId,
    );
    const leftExecution = await executeCharacterIdentityProvider({
      adapter: leftJob.adapter,
      runtimeRoot: roots.runtimeRoot,
      artifactRoot: roots.artifactRoot,
      workerId: 'character-identity-continuity-left-worker',
      environment: { EVAVO_ART_ENABLE_FIXTURE_PROVIDER: 'true' },
    });
    assert.equal(leftExecution.receipt.status, 'succeeded');
    assert.equal(leftExecution.receipt.setId, anchorExecution.receipt.setId);
    assert.equal(
      leftExecution.receipt.continuityKey,
      anchorExecution.receipt.continuityKey,
    );
    assert.equal(leftExecution.receipt.viewId, 'full-body-left');
    assert.equal(leftExecution.receipt.effects.identityApprovalPerformed, false);
  } finally {
    rmSync(roots.root, { recursive: true, force: true });
  }
});

test('rejects a successful anchor receipt from a different candidate set', async () => {
  const roots = temporaryRoots();
  try {
    const anchorJob = compileJob({
      jobId: 'candidate-set-01-full-body-right',
      seed: 187105,
    });
    const anchorExecution = await executeCharacterIdentityProvider({
      adapter: anchorJob.adapter,
      runtimeRoot: roots.runtimeRoot,
      artifactRoot: roots.artifactRoot,
      workerId: 'character-identity-cross-set-anchor-worker',
      environment: { EVAVO_ART_ENABLE_FIXTURE_PROVIDER: 'true' },
    });
    assert.throws(
      () =>
        compileCharacterIdentityProviderAdmission({
          identityRequest: CRITIC_REQUEST,
          jobId: 'candidate-set-02-full-body-left',
          selection: selection(187106),
          actorId: 'character-identity-test-reviewer',
          occurredAt: times().admissionAt,
          evidenceSha256: sha('cross-set-admission'),
          anchorExecutionReceipt: anchorExecution.receipt,
        }),
      (error) => error?.code === 'CHARACTER_IDENTITY_PROVIDER_ANCHOR_RECEIPT_INVALID',
    );
  } finally {
    rmSync(roots.root, { recursive: true, force: true });
  }
});

test('refuses provider authorization windows longer than 24 hours', () => {
  const time = times();
  const admission = compileCharacterIdentityProviderAdmission({
    identityRequest: CRITIC_REQUEST,
    jobId: 'candidate-set-01-full-body-right',
    selection: selection(187107),
    actorId: 'character-identity-test-reviewer',
    occurredAt: time.admissionAt,
    evidenceSha256: sha('long-window-admission'),
  });
  assert.throws(
    () =>
      compileCharacterIdentityProviderAuthorization({
        providerAdmission: admission,
        actorId: 'character-identity-test-reviewer',
        occurredAt: time.authorizedAt,
        expiresAt: new Date(Date.parse(time.authorizedAt) + 24 * 60 * 60 * 1000 + 1).toISOString(),
        evidenceSha256: sha('long-window-authorization'),
      }),
    (error) =>
      error?.code === 'CHARACTER_IDENTITY_PROVIDER_AUTHORIZATION_WINDOW_INVALID',
  );
});

test('runtime capabilities remain candidate-only and fail closed', () => {
  const contract = characterIdentityProviderContractCapabilities();
  const execution = characterIdentityProviderExecutionCapabilities();
  assert.deepEqual(contract.admittedCharacterIds, [
    'council-critic',
    'council-open-reviewer',
  ]);
  assert.equal(contract.candidateSetsPerCharacter, 4);
  assert.equal(contract.viewsPerCandidateSet, 3);
  assert.equal(contract.sameSetAnchorReceiptRequiredForDependentViews, true);
  assert.equal(contract.maximumProviderCallsPerJob, 1);
  assert.equal(contract.maximumAuthorizationHours, 24);
  assert.equal(contract.providerFallbackAllowed, false);
  assert.equal(execution.genericProviderWorkerReused, true);
  assert.equal(execution.genericCandidateMaterializerCompatible, true);
  assert.equal(execution.maximumRuntimeAttempts, 1);
  assert.equal(execution.authorizationReservationPerDurableRuntimeRoot, true);
  for (const capabilities of [contract, execution]) {
    for (const key of [
      'candidateApproval',
      'identityApproval',
      'animationProduction',
      'publication',
      'runtimeActivation',
      'websiteActivation',
      'forcePush',
    ]) {
      assert.equal(capabilities[key], false, key);
    }
  }
});
