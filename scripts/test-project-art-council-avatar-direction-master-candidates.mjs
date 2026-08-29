import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  compileCouncilAvatarDirectionMasterPlan,
} from './project-art/council-avatar-direction-master-candidates.mjs';

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
    approvedBy: 'test-approver',
    reason: 'Approved for direction-master contract tests.',
    reviewer: {
      mode: 'hybrid',
      id: 'reviewer-1',
      reviewedAt: '2026-08-29T10:15:00.000Z',
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

test('direction-master plan compiles all exact configured continuity views from approved identities', () => {
  const identityApproval = approval();
  const plan = compileCouncilAvatarDirectionMasterPlan({ identityLockApproval: identityApproval });

  assert.equal(plan.approvedCharacterIds.length, 2);
  assert.equal(plan.viewCount, 6);
  assert.equal(plan.candidateCountPerView, 2);
  assert.equal(plan.maximumCandidateOutputs, 12);
  assert.deepEqual(
    plan.jobs.map((job) => `${job.characterId}:${job.viewId}`),
    [
      'council-critic:full-body-right',
      'council-critic:full-body-left',
      'council-critic:neutral-bust',
      'council-open-reviewer:full-body-right',
      'council-open-reviewer:full-body-left',
      'council-open-reviewer:neutral-bust',
    ],
  );
  assert.equal(plan.providerExecution, false);
  assert.equal(plan.directionMasterApproval, false);
  assert.equal(plan.candidatePromotion, false);
  assert.equal(plan.runtimeActivationAllowed, false);
  assert.equal(plan.websiteActivationAllowed, false);
});

test('every direction-master request is hard-bound to the correct approved canonical identity', () => {
  const identityApproval = approval();
  const plan = compileCouncilAvatarDirectionMasterPlan({ identityLockApproval: identityApproval });
  const locks = new Map(identityApproval.locks.map((lock) => [lock.characterId, lock]));

  for (const job of plan.jobs) {
    const lock = locks.get(job.characterId);
    assert.ok(lock);
    assert.equal(job.request.continuityPhase, 'direction-master');
    assert.equal(job.request.operation, 'generate');
    assert.equal(job.request.assetKind, 'illustration');
    assert.equal(job.request.quality, 'high');
    assert.equal(job.request.target.width, 1024);
    assert.equal(job.request.target.height, 1536);
    assert.equal(job.request.target.transparency, 'required');
    assert.equal(job.request.selection.preferredAdapterId, 'openai-gpt-image');
    assert.equal(job.request.selection.preferredModel, 'gpt-image-2');
    assert.equal(job.request.selection.allowFallback, false);
    assert.equal(job.request.references.length, 1);
    assert.equal(job.request.references[0].role, 'canonical-identity');
    assert.equal(job.request.references[0].artifactId, lock.masteredArtifactId);
    assert.equal(job.request.references[0].strength, 1);
    assert.equal(job.request.references[0].required, true);
    assert.equal(job.request.metadata.identityApprovalSha256, identityApproval.approvalSha256);
    assert.equal(job.request.metadata.identityMasteredArtifactId, lock.masteredArtifactId);
    assert.equal(job.request.metadata.identityMasteredContentSha256, lock.masteredContentSha256);
    assert.equal(job.request.metadata.providerExecutionAuthorized, false);
    assert.equal(job.request.metadata.directionMasterApprovalEstablished, false);
  }
});

test('Veyra and Moro direction requests preserve their distinct anatomy locks', () => {
  const plan = compileCouncilAvatarDirectionMasterPlan({ identityLockApproval: approval() });
  const veyra = plan.jobs.filter((job) => job.characterId === 'council-critic');
  const moro = plan.jobs.filter((job) => job.characterId === 'council-open-reviewer');

  assert.ok(veyra.every((job) => job.request.creativeIntent.includes('four independently readable eyes')));
  assert.ok(veyra.every((job) => job.request.creativeIntent.includes('four-digit hand anatomy')));
  assert.ok(veyra.every((job) => job.request.creativeIntent.includes('cranial-sail')));
  assert.ok(moro.every((job) => job.request.creativeIntent.includes('three-eye placement')));
  assert.ok(moro.every((job) => job.request.creativeIntent.includes('throat-membrane')));
  assert.ok(moro.every((job) => job.request.creativeIntent.includes('four-digit hand anatomy')));
});

test('direction-master plan is deterministic for the exact identity lock', () => {
  const identityApproval = approval();
  const left = compileCouncilAvatarDirectionMasterPlan({ identityLockApproval: identityApproval });
  const right = compileCouncilAvatarDirectionMasterPlan({ identityLockApproval: identityApproval });
  assert.equal(left.planSha256, right.planSha256);
  assert.deepEqual(left, right);
});

test('direction-master plan fails closed on an invalid identity-lock approval', () => {
  const invalid = structuredClone(approval());
  invalid.locks[0].identityLocked = false;
  assert.throws(
    () => compileCouncilAvatarDirectionMasterPlan({ identityLockApproval: invalid }),
    /approvalSha256 mismatch|authority\/binding drift/u,
  );
});

test('direction-master candidate count is bounded', () => {
  assert.throws(
    () => compileCouncilAvatarDirectionMasterPlan({ identityLockApproval: approval(), candidateCount: 5 }),
    /candidateCount must be an integer between 1 and 4/u,
  );
});
