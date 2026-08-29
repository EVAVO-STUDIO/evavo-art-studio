import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compileCouncilAvatarProviderExecutionAuthorization,
  validateCouncilAvatarProviderExecutionAuthorization,
} from './project-art/council-avatar-provider-authorization.mjs';

const FAKE_SECRET = 'sk-test-council-avatar-auth-never-print-this';
const AUTHORIZED_AT = '2026-08-29T10:00:00.000Z';
const EXPIRES_AT = '2026-08-29T10:30:00.000Z';

function environment() {
  return Object.freeze({
    OPENAI_API_KEY: FAKE_SECRET,
    EVAVO_ART_OPENAI_IMAGE_MODEL: 'gpt-image-2',
    EVAVO_ART_OPENAI_IMAGE_MODELS: 'gpt-image-2,gpt-image-2-2026-04-21',
  });
}

async function authorization() {
  return compileCouncilAvatarProviderExecutionAuthorization({
    environment: environment(),
    authorizedAt: AUTHORIZED_AT,
    expiresAt: EXPIRES_AT,
    authorizedBy: 'Council avatar production test',
    reason: 'Generate isolated identity-master candidates only.',
  });
}

test('bounded authorization grants provider execution only for exact Council jobs', async () => {
  const value = await authorization();

  assert.equal(value.status, 'authorized');
  assert.equal(value.adapter.id, 'openai-gpt-image');
  assert.equal(value.adapter.model, 'gpt-image-2');
  assert.equal(value.adapter.fallbackAllowed, false);
  assert.equal(value.budget.maximumProviderJobs, 2);
  assert.equal(value.budget.maximumCandidateOutputs, 8);
  assert.equal(value.budget.maximumAttemptsPerJob, 1);
  assert.equal(value.budget.retriesAuthorized, 0);
  assert.equal(value.budget.fallbackAuthorized, false);
  assert.equal(value.jobs.length, 2);
  assert.ok(value.jobs.every((job) => job.maximumAttempts === 1));
  assert.equal(value.authority.providerExecution, true);
  assert.equal(value.authority.candidateArtifactCreation, true);
  assert.equal(value.authority.evidenceArtifactCreation, true);
  assert.equal(value.authority.candidateApproval, false);
  assert.equal(value.authority.candidatePromotion, false);
  assert.equal(value.authority.runtimeActivation, false);
  assert.equal(value.authority.websiteActivation, false);
  assert.equal(value.executionPolicy.genericProviderWorkerMayClaim, false);
  assert.equal(value.executionPolicy.automaticRetryAllowed, false);
  assert.equal(value.executionPolicy.fallbackAllowed, false);
  assert.equal(JSON.stringify(value).includes(FAKE_SECRET), false);
});

test('authorization validates before expiry and fails closed after expiry', async () => {
  const value = await authorization();

  assert.equal(
    validateCouncilAvatarProviderExecutionAuthorization(value, {
      now: new Date('2026-08-29T10:15:00.000Z'),
    }),
    value,
  );
  assert.throws(
    () =>
      validateCouncilAvatarProviderExecutionAuthorization(value, {
        now: new Date(EXPIRES_AT),
      }),
    /expired/u,
  );
});

test('authorization fails closed on runtime job tampering', async () => {
  const value = await authorization();
  const tampered = structuredClone(value);
  tampered.jobs[0].maximumAttempts = 2;

  assert.throws(
    () =>
      validateCouncilAvatarProviderExecutionAuthorization(tampered, {
        now: new Date('2026-08-29T10:15:00.000Z'),
      }),
    /hash mismatch|drift/u,
  );
});

test('authorization cannot exceed one hour', async () => {
  await assert.rejects(
    () =>
      compileCouncilAvatarProviderExecutionAuthorization({
        environment: environment(),
        authorizedAt: AUTHORIZED_AT,
        expiresAt: '2026-08-29T11:00:00.001Z',
        authorizedBy: 'test',
        reason: 'test',
      }),
    /within one hour/u,
  );
});

test('authorization cannot be compiled when provider readiness is blocked', async () => {
  await assert.rejects(
    () =>
      compileCouncilAvatarProviderExecutionAuthorization({
        environment: Object.freeze({}),
        authorizedAt: AUTHORIZED_AT,
        expiresAt: EXPIRES_AT,
        authorizedBy: 'test',
        reason: 'test',
      }),
    /COUNCIL_AVATAR_PROVIDER_NOT_READY/u,
  );
});
