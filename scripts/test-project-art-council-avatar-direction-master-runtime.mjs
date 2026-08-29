import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  compileCouncilAvatarDirectionMasterRuntimePackage,
} from './project-art/council-avatar-direction-master-runtime.mjs';

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

function approval() {
  const body = {
    schema: 'evavo.project-art-council-avatar-identity-lock-approval.v1',
    status: 'approved',
    approvedAt: '2026-08-29T10:20:00.000Z',
    approvedBy: 'test',
    reason: 'test',
    reviewer: { mode: 'hybrid', id: 'reviewer', reviewedAt: '2026-08-29T10:15:00.000Z' },
    source: {
      handoffSha256: '1'.repeat(64),
      planSha256: '2'.repeat(64),
      decisionSha256: '3'.repeat(64),
      receiptSha256: '4'.repeat(64),
      authorizationSha256: '5'.repeat(64),
      runtimePackageSha256: '6'.repeat(64),
    },
    requiredGates: ['technical', 'styleConsistency', 'identityContinuity', 'composition', 'runtimeReadiness'],
    locks: [
      {
        characterId: 'council-critic',
        reviewGroupId: 'council-critic-identity-candidates',
        reviewItemId: 'council-critic-candidate-01',
        sourceSha256: 'a'.repeat(64),
        masteredArtifactId: `artifact_${'a'.repeat(64)}`,
        masteredDescriptorSha256: 'b'.repeat(64),
        masteredContentSha256: 'c'.repeat(64),
        sourceCandidateArtifactId: `artifact_${'d'.repeat(64)}`,
        identityLocked: true,
        promotionEligibleByThisApproval: false,
        runtimeActivationAllowedByThisApproval: false,
        websiteActivationAllowedByThisApproval: false,
      },
      {
        characterId: 'council-open-reviewer',
        reviewGroupId: 'council-open-reviewer-identity-candidates',
        reviewItemId: 'council-open-reviewer-candidate-01',
        sourceSha256: 'e'.repeat(64),
        masteredArtifactId: `artifact_${'e'.repeat(64)}`,
        masteredDescriptorSha256: 'f'.repeat(64),
        masteredContentSha256: '1'.repeat(64),
        sourceCandidateArtifactId: `artifact_${'2'.repeat(64)}`,
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

test('direction runtime produces one governed runtime job per direction view', () => {
  const runtime = compileCouncilAvatarDirectionMasterRuntimePackage({ identityLockApproval: approval() });
  assert.equal(runtime.jobs.length, 6);
  assert.equal(runtime.providerCallBudget.maximumJobs, 6);
  assert.equal(runtime.providerCallBudget.maximumCandidatesPerJob, 2);
  assert.equal(runtime.providerCallBudget.maximumCandidateOutputs, 12);
  assert.equal(runtime.providerCallBudget.maximumAttemptsPerJob, 1);
  assert.equal(runtime.providerCallBudget.retriesAuthorized, 0);
  assert.equal(runtime.providerCallBudget.fallbackAuthorized, false);
  assert.equal(runtime.executionPolicy.genericProviderWorkerMayClaim, false);
});

test('direction runtime binds canonical identity reference into provider request and runtime input artifacts', () => {
  const runtime = compileCouncilAvatarDirectionMasterRuntimePackage({ identityLockApproval: approval() });
  for (const job of runtime.jobs) {
    assert.equal(job.runtimeJob.maximumAttempts, 1);
    assert.equal(job.normalizedRuntimeSpec.maximumAttempts, 1);
    assert.ok(job.runtimeJob.requiredCapabilities.includes('council-avatar.execution-authorized'));
    assert.ok(job.runtimeJob.requiredCapabilities.includes('provider.reference-lock'));
    assert.ok(job.canonicalContract.requiredAdapterCapabilities.includes('identity-reference'));
    assert.deepEqual(job.runtimeJob.inputArtifacts, [job.identityMasteredArtifactId]);
    assert.deepEqual(job.normalizedRuntimeSpec.inputArtifacts, [job.identityMasteredArtifactId]);
    assert.equal(job.canonicalContract.request.references.length, 1);
    assert.equal(job.canonicalContract.request.references[0].artifactId, job.identityMasteredArtifactId);
    assert.equal(job.canonicalContract.request.references[0].role, 'canonical-identity');
    assert.equal(job.canonicalContract.request.references[0].required, true);
    assert.equal(job.canonicalContract.request.references[0].strength, 1);
    assert.match(job.runtimeSpecSha256, /^[a-f0-9]{64}$/u);
  }
});

test('direction runtime preserves canonical generic retry evidence while governed job disables retries', () => {
  const runtime = compileCouncilAvatarDirectionMasterRuntimePackage({ identityLockApproval: approval() });
  for (const job of runtime.jobs) {
    assert.equal(job.canonicalContract.runtimeJob.maximumAttempts, 3);
    assert.equal(job.runtimeJob.maximumAttempts, 1);
    assert.equal(job.providerExecution, false);
    assert.equal(job.directionMasterApproval, false);
    assert.equal(job.candidatePromotion, false);
    assert.equal(job.runtimeActivationAllowed, false);
    assert.equal(job.websiteActivationAllowed, false);
  }
});

test('direction runtime package is deterministic', () => {
  const identityLockApproval = approval();
  const left = compileCouncilAvatarDirectionMasterRuntimePackage({ identityLockApproval });
  const right = compileCouncilAvatarDirectionMasterRuntimePackage({ identityLockApproval });
  assert.equal(left.runtimePackageSha256, right.runtimePackageSha256);
  assert.deepEqual(left, right);
});
