import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  compileCouncilAvatarIdentityLockApproval,
  validateCouncilAvatarIdentityLockApproval,
} from './project-art/council-avatar-identity-lock-approval.mjs';

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

function hash(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function withHash(body, field) {
  return Object.freeze({ ...body, [field]: hash(body) });
}

const gates = Object.freeze([
  'technical',
  'styleConsistency',
  'identityContinuity',
  'composition',
  'runtimeReadiness',
]);

function fixture() {
  const candidates = [
    ['council-critic', '01', 'a'],
    ['council-critic', '02', 'b'],
    ['council-open-reviewer', '01', 'c'],
    ['council-open-reviewer', '02', 'd'],
  ].map(([characterId, index, seed]) => ({
    characterId,
    index,
    contentSha256: seed.repeat(64),
    descriptorSha256: seed.toUpperCase().toLowerCase().repeat(64),
    artifactId: `artifact_${seed.repeat(64)}`,
    sourceCandidateArtifactId: `artifact_${String.fromCharCode(seed.charCodeAt(0) + 4).repeat(64)}`,
    relativePath: `candidates/${characterId}/${index}.png`,
  }));

  const groups = ['council-critic', 'council-open-reviewer'].map((characterId) => ({
    id: `${characterId}-identity-candidates`,
    kind: 'candidate-set',
    title: characterId,
    description: '',
    requiredGates: gates,
    playback: { frameDurationMs: 83, loop: true },
    items: candidates
      .filter((candidate) => candidate.characterId === characterId)
      .map((candidate) => ({
        id: `${characterId}-candidate-${candidate.index}`,
        role: 'candidate',
        label: candidate.index,
        notes: '',
        source: candidate.relativePath,
        assetPath: `assets/${candidate.characterId}/${candidate.index}.png`,
        sha256: candidate.contentSha256,
        sizeBytes: 100,
        mediaType: 'image/png',
        previewable: true,
        frameIndex: null,
        image: { format: 'png', width: 1024, height: 1536, hasAlpha: true, animated: false },
      })),
  }));

  const planBody = {
    schema: 'evavo.project-art-review-plan.v1',
    reviewId: 'council-avatar-identity-test',
    projectId: 'evavo-council-avatars',
    title: 'test',
    purpose: 'test',
    compiledAt: '2026-08-29T10:00:00.000Z',
    workspaceRoot: 'C:\\review',
    sourceSummary: {
      groupCount: 2,
      itemCount: 4,
      totalBytes: 400,
      maximumFileBytes: 1000,
      maximumTotalBytes: 10000,
    },
    ui: {
      defaultBackground: 'checker',
      defaultFit: 'contain',
      defaultMode: 'grid',
      showPixelGrid: false,
      allowLinearSampling: true,
    },
    groups,
    authority: {},
  };
  const plan = withHash(planBody, 'planSha256');

  const handoffBody = {
    schema: 'evavo.project-art-council-avatar-review-handoff.v1',
    authorizationSha256: '1'.repeat(64),
    runtimePackageSha256: '2'.repeat(64),
    reviewId: plan.reviewId,
    planSha256: plan.planSha256,
    requestPath: 'C:\\review\\review-request.json',
    planPath: 'C:\\review\\review-plan.json',
    workspaceRoot: 'C:\\review',
    characterIds: ['council-critic', 'council-open-reviewer'],
    candidateCount: 4,
    requiredGates: gates,
    technicalAssuranceRequired: true,
    independentVisualReviewRequired: true,
    candidateApprovalPerformed: false,
    candidatePromotionPerformed: false,
    runtimeActivationPerformed: false,
    websiteActivationPerformed: false,
    providerExecutionPerformedByHandoff: false,
    materialized: candidates,
    nextActions: [],
  };
  const handoff = withHash(handoffBody, 'handoffSha256');

  const passGates = {
    technical: 'pass',
    styleConsistency: 'pass',
    identityContinuity: 'pass',
    animationContinuity: 'not-applicable',
    historicalAccuracy: 'not-applicable',
    composition: 'pass',
    gameplayReadability: 'not-applicable',
    runtimeReadiness: 'pass',
  };
  const decisionEntries = groups.flatMap((group) =>
    group.items.map((item, index) => ({
      groupId: group.id,
      itemId: item.id,
      sourceSha256: item.sha256,
      disposition: index === 0 ? 'keep' : 'reject',
      gates: { ...passGates },
      strengths: index === 0 ? ['strong identity'] : [],
      preserve: [],
      defects: index === 0 ? [] : [{ id: 'defect-001', severity: 'major', summary: 'weaker identity' }],
      requiredChanges: [],
      avoid: [],
      notes: index === 0 ? '' : 'Reject weaker candidate.',
    })),
  );
  const decisionsBody = {
    schema: 'evavo.project-art-review-decisions.v1',
    reviewId: plan.reviewId,
    projectId: plan.projectId,
    planSha256: plan.planSha256,
    reviewer: {
      mode: 'hybrid',
      id: 'reviewer-1',
      reviewedAt: '2026-08-29T10:15:00.000Z',
      reason: 'Independent visual review.',
    },
    decisions: decisionEntries,
    independentApprovalPerformed: false,
    candidatePromotionPerformed: false,
    repositoryMutationPerformed: false,
    publicationPerformed: false,
  };
  const decisions = withHash(decisionsBody, 'decisionSha256');
  const receiptBody = {
    schema: 'evavo.project-art-review-receipt.v1',
    reviewId: plan.reviewId,
    projectId: plan.projectId,
    planSha256: plan.planSha256,
    decisionSha256: decisions.decisionSha256,
    reviewedAt: decisions.reviewer.reviewedAt,
    reviewerMode: decisions.reviewer.mode,
    itemCount: 4,
    dispositionCounts: { keep: 2, edit: 0, recreate: 0, 'generate-variation': 0, 'reference-only': 0, reject: 2 },
    nextActions: {},
    authority: {},
  };
  const receipt = withHash(receiptBody, 'receiptSha256');
  return { handoff, plan, decisions, receipt };
}

function compile(input = fixture()) {
  return compileCouncilAvatarIdentityLockApproval({
    ...input,
    approvedBy: 'EVAVO Council identity approver',
    approvedAt: '2026-08-29T10:20:00.000Z',
    reason: 'Approve exactly the reviewed identity masters for downstream direction-master production.',
  });
}

test('identity lock approval accepts exactly one fully passed keep per Council identity', () => {
  const approval = compile();
  assert.equal(approval.status, 'approved');
  assert.equal(approval.locks.length, 2);
  assert.deepEqual(
    approval.locks.map((lock) => lock.characterId),
    ['council-critic', 'council-open-reviewer'],
  );
  assert.ok(approval.locks.every((lock) => lock.identityLocked === true));
  assert.equal(approval.authority.candidateApproval, true);
  assert.equal(approval.authority.candidatePromotion, false);
  assert.equal(approval.authority.runtimeActivation, false);
  assert.equal(approval.authority.websiteActivation, false);
  assert.equal(validateCouncilAvatarIdentityLockApproval(approval), approval);
});

test('identity lock approval rejects agent-only review', () => {
  const input = fixture();
  const body = { ...input.decisions, reviewer: { ...input.decisions.reviewer, mode: 'agent-assisted' } };
  delete body.decisionSha256;
  input.decisions = withHash(body, 'decisionSha256');
  const receiptBody = { ...input.receipt, decisionSha256: input.decisions.decisionSha256, reviewerMode: 'agent-assisted' };
  delete receiptBody.receiptSha256;
  input.receipt = withHash(receiptBody, 'receiptSha256');
  assert.throws(() => compile(input), /human or hybrid/u);
});

test('identity lock approval rejects ambiguous multiple keeps', () => {
  const input = fixture();
  const entries = structuredClone(input.decisions.decisions);
  entries[1].disposition = 'keep';
  entries[1].defects = [];
  entries[1].notes = '';
  const body = { ...input.decisions, decisions: entries };
  delete body.decisionSha256;
  input.decisions = withHash(body, 'decisionSha256');
  const receiptBody = { ...input.receipt, decisionSha256: input.decisions.decisionSha256 };
  delete receiptBody.receiptSha256;
  input.receipt = withHash(receiptBody, 'receiptSha256');
  assert.throws(() => compile(input), /exactly one kept candidate/u);
});

test('identity lock approval requires pass, not merely completed, for every required gate', () => {
  const input = fixture();
  const entries = structuredClone(input.decisions.decisions);
  entries[0].gates.runtimeReadiness = 'not-applicable';
  const body = { ...input.decisions, decisions: entries };
  delete body.decisionSha256;
  input.decisions = withHash(body, 'decisionSha256');
  const receiptBody = { ...input.receipt, decisionSha256: input.decisions.decisionSha256 };
  delete receiptBody.receiptSha256;
  input.receipt = withHash(receiptBody, 'receiptSha256');
  assert.throws(() => compile(input), /must pass required gate runtimeReadiness/u);
});

test('identity lock approval rejects stale or tampered source hashes', () => {
  const input = fixture();
  input.handoff = structuredClone(input.handoff);
  input.handoff.materialized[0].contentSha256 = 'f'.repeat(64);
  assert.throws(() => compile(input), /handoffSha256 mismatch/u);
});
