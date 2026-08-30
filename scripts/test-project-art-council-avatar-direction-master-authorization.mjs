import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { LocalArtifactStore } from '../packages/artifacts/dist/index.js';
import {
  compileCouncilAvatarDirectionMasterExecutionAuthorization,
  validateCouncilAvatarDirectionMasterExecutionAuthorization,
} from './project-art/council-avatar-direction-master-authorization.mjs';
import { compileCouncilAvatarDirectionMasterRuntimePackage } from './project-art/council-avatar-direction-master-runtime.mjs';

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFklEQVR4nGNgoBo4YaPxHxkPhAKyAQDgPyKxKv0aXwAAAABJRU5ErkJggg==',
  'base64',
);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

const hash = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const withHash = (body, field) => Object.freeze({ ...body, [field]: hash(body) });

function approvalFromArtifacts(critic, reviewer) {
  const body = {
    schema: 'evavo.project-art-council-avatar-identity-lock-approval.v1',
    status: 'approved',
    approvedAt: '2026-08-30T03:00:00.000Z',
    approvedBy: 'test-approver',
    reason: 'Approve exact technically-passed identity masters for direction authorization tests.',
    reviewer: {
      mode: 'hybrid',
      id: 'reviewer-1',
      reviewedAt: '2026-08-30T02:50:00.000Z',
    },
    source: {
      handoffSha256: '1'.repeat(64),
      planSha256: '2'.repeat(64),
      decisionSha256: '3'.repeat(64),
      receiptSha256: '4'.repeat(64),
      authorizationSha256: '5'.repeat(64),
      runtimePackageSha256: '6'.repeat(64),
    },
    requiredGates: [
      'technical',
      'styleConsistency',
      'identityContinuity',
      'composition',
      'runtimeReadiness',
    ],
    locks: [
      {
        characterId: 'council-critic',
        reviewGroupId: 'council-critic-identity-candidates',
        reviewItemId: 'council-critic-candidate-01',
        sourceSha256: critic.contentSha256,
        masteredArtifactId: critic.artifactId,
        masteredDescriptorSha256: critic.descriptorSha256,
        masteredContentSha256: critic.contentSha256,
        sourceCandidateArtifactId: `artifact_${'a'.repeat(64)}`,
        identityLocked: true,
        promotionEligibleByThisApproval: false,
        runtimeActivationAllowedByThisApproval: false,
        websiteActivationAllowedByThisApproval: false,
      },
      {
        characterId: 'council-open-reviewer',
        reviewGroupId: 'council-open-reviewer-identity-candidates',
        reviewItemId: 'council-open-reviewer-candidate-01',
        sourceSha256: reviewer.contentSha256,
        masteredArtifactId: reviewer.artifactId,
        masteredDescriptorSha256: reviewer.descriptorSha256,
        masteredContentSha256: reviewer.contentSha256,
        sourceCandidateArtifactId: `artifact_${'b'.repeat(64)}`,
        identityLocked: true,
        promotionEligibleByThisApproval: false,
        runtimeActivationAllowedByThisApproval: false,
        websiteActivationAllowedByThisApproval: false,
      },
    ],
    nextActions: [],
    authority: {
      identityLockApproval: true,
      candidateApproval: true,
      candidatePromotion: false,
      providerExecution: false,
      providerRetry: false,
      sourceMutation: false,
      repositoryMutation: false,
      gitCommit: false,
      gitPush: false,
      publication: false,
      runtimeActivation: false,
      websiteActivation: false,
      deployment: false,
      forcePush: false,
    },
  };
  return withHash(body, 'approvalSha256');
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-council-direction-auth-'));
  const artifactRoot = path.join(root, 'artifacts');
  const store = new LocalArtifactStore({ root: artifactRoot });
  const critic = await store.put(Buffer.concat([tinyPng, Buffer.from('critic')]), {
    mediaType: 'image/png',
    storageClass: 'intermediate',
    fileName: 'critic-master.png',
    labels: {
      artifactRole: 'provider-candidate-alpha-master',
      qualityState: 'passed',
      approvalState: 'unapproved',
    },
  });
  const reviewer = await store.put(Buffer.concat([tinyPng, Buffer.from('reviewer')]), {
    mediaType: 'image/png',
    storageClass: 'intermediate',
    fileName: 'reviewer-master.png',
    labels: {
      artifactRole: 'provider-candidate-alpha-master',
      qualityState: 'passed',
      approvalState: 'unapproved',
    },
  });
  return {
    root,
    artifactRoot,
    store,
    identityLockApproval: approvalFromArtifacts(critic, reviewer),
    critic,
    reviewer,
  };
}

async function compile(input) {
  return compileCouncilAvatarDirectionMasterExecutionAuthorization({
    identityLockApproval: input.identityLockApproval,
    artifactRoot: input.artifactRoot,
    authorizedAt: '2026-08-30T03:10:00.000Z',
    expiresAt: '2026-08-30T03:40:00.000Z',
    authorizedBy: 'Council direction authorization test',
    reason: 'Authorize only the exact continuity-locked direction-master runtime jobs.',
  });
}

test('direction authorization binds six one-attempt jobs and preserves unpromoted identity artifacts', async () => {
  const input = await fixture();
  const authorization = await compile(input);
  assert.equal(authorization.status, 'authorized');
  assert.equal(authorization.jobs.length, 6);
  assert.equal(authorization.budget.maximumProviderJobs, 6);
  assert.equal(authorization.budget.maximumCandidateOutputs, 12);
  assert.equal(authorization.budget.maximumAttemptsPerJob, 1);
  assert.equal(authorization.budget.retriesAuthorized, 0);
  assert.equal(authorization.budget.fallbackAuthorized, false);
  assert.equal(authorization.authority.providerExecution, true);
  assert.equal(authorization.authority.directionMasterApproval, false);
  assert.equal(authorization.authority.candidatePromotion, false);
  assert.equal(authorization.authority.runtimeActivation, false);
  assert.equal(authorization.authority.websiteActivation, false);
  assert.equal(authorization.canonicalIdentities.length, 2);
  assert.ok(authorization.canonicalIdentities.every((entry) => entry.artifactRole === 'provider-candidate-alpha-master'));
  assert.ok(authorization.canonicalIdentities.every((entry) => entry.qualityState === 'passed'));
  assert.ok(authorization.canonicalIdentities.every((entry) => entry.artifactApprovalState === 'unapproved'));
  assert.ok(authorization.canonicalIdentities.every((entry) => entry.identityLockApprovedBySeparateRecord === true));
  assert.ok(authorization.canonicalIdentities.every((entry) => entry.promotedByAuthorization === false));
});

test('direction authorization validates before expiry and fails closed at expiry', async () => {
  const input = await fixture();
  const authorization = await compile(input);
  const runtimePackage = compileCouncilAvatarDirectionMasterRuntimePackage({
    identityLockApproval: input.identityLockApproval,
  });
  assert.equal(
    validateCouncilAvatarDirectionMasterExecutionAuthorization(authorization, {
      now: new Date('2026-08-30T03:20:00.000Z'),
      runtimePackage,
    }),
    authorization,
  );
  assert.throws(
    () => validateCouncilAvatarDirectionMasterExecutionAuthorization(authorization, {
      now: new Date('2026-08-30T03:40:00.000Z'),
      runtimePackage,
    }),
    /expired/u,
  );
});

test('direction authorization rejects runtime binding tampering', async () => {
  const input = await fixture();
  const authorization = structuredClone(await compile(input));
  authorization.jobs[0].runtimeSpecSha256 = 'f'.repeat(64);
  const runtimePackage = compileCouncilAvatarDirectionMasterRuntimePackage({
    identityLockApproval: input.identityLockApproval,
  });
  assert.throws(
    () => validateCouncilAvatarDirectionMasterExecutionAuthorization(authorization, { runtimePackage }),
    /hash mismatch/u,
  );
});

test('direction authorization refuses missing or changed canonical identity bytes', async () => {
  const input = await fixture();
  const changedApproval = structuredClone(input.identityLockApproval);
  changedApproval.locks[0].masteredContentSha256 = 'f'.repeat(64);
  delete changedApproval.approvalSha256;
  input.identityLockApproval = withHash(changedApproval, 'approvalSha256');
  await assert.rejects(() => compile(input), /COUNCIL_DIRECTION_CANONICAL_IDENTITY_INVALID/u);
});

test('direction authorization cannot exceed one hour', async () => {
  const input = await fixture();
  await assert.rejects(
    () => compileCouncilAvatarDirectionMasterExecutionAuthorization({
      identityLockApproval: input.identityLockApproval,
      artifactRoot: input.artifactRoot,
      authorizedAt: '2026-08-30T03:10:00.000Z',
      expiresAt: '2026-08-30T04:10:00.001Z',
      authorizedBy: 'test',
      reason: 'test',
    }),
    /within one hour/u,
  );
});
