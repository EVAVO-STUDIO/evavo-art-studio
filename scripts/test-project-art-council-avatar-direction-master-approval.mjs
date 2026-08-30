import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  compileCouncilAvatarDirectionMasterApproval,
  validateCouncilAvatarDirectionMasterApproval,
} from './project-art/council-avatar-direction-master-approval.mjs';

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

const projectArtAuthority = Object.freeze({
  providerExecution: false,
  runtimeSubmission: false,
  candidateApproval: false,
  candidatePromotion: false,
  sourceMutation: false,
  sourceDeletion: false,
  targetRepositoryMutation: false,
  gitCommit: false,
  gitPush: false,
  deployment: false,
  publication: false,
  forcePush: false,
});
const gates = Object.freeze([
  'technical',
  'styleConsistency',
  'identityContinuity',
  'composition',
  'runtimeReadiness',
]);
const viewIds = Object.freeze(['full-body-right', 'full-body-left', 'neutral-bust']);
const characterIds = Object.freeze(['council-critic', 'council-open-reviewer']);

function fixture() {
  const materialized = [];
  const groups = [];
  let seed = 1;
  for (const characterId of characterIds) {
    const items = [];
    for (const viewId of viewIds) {
      for (let index = 1; index <= 2; index += 1) {
        const hex = seed.toString(16).padStart(2, '0').repeat(32);
        seed += 1;
        const candidate = {
          characterId,
          viewId,
          sourceCandidateArtifactId: `artifact_${'a'.repeat(64)}`,
          artifactId: `artifact_${hex}`,
          relativePath: `candidates/${characterId}/${viewId}/${index}.png`,
          descriptorSha256: 'd'.repeat(64),
          contentSha256: hex,
          sizeBytes: 100,
        };
        materialized.push(candidate);
        items.push({
          id: `${characterId}-${viewId}-candidate-${String(index).padStart(2, '0')}`,
          role: 'candidate',
          label: `${viewId} ${index}`,
          notes: '',
          source: candidate.relativePath,
          assetPath: `assets/${characterId}/${viewId}/${index}.png`,
          sha256: candidate.contentSha256,
          sizeBytes: 100,
          mediaType: 'image/png',
          previewable: true,
          frameIndex: null,
          image: { format: 'png', width: 1024, height: 1536, hasAlpha: true, animated: false },
        });
      }
    }
    groups.push({
      id: `${characterId}-direction-master-candidates`,
      kind: 'candidate-set',
      title: characterId,
      description: '',
      requiredGates: gates,
      playback: { frameDurationMs: 83, loop: true },
      items,
    });
  }
  const planBody = {
    schema: 'evavo.project-art-review-plan.v1',
    reviewId: 'direction-review-test',
    projectId: 'evavo-council-avatars',
    title: 'test',
    purpose: 'test',
    compiledAt: '2026-08-30T04:00:00.000Z',
    workspaceRoot: 'C:\\direction-review',
    sourceSummary: {
      groupCount: 2,
      itemCount: 12,
      totalBytes: 1200,
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
    authority: projectArtAuthority,
  };
  const plan = withHash(planBody, 'planSha256');
  const handoffBody = {
    schema: 'evavo.project-art-council-avatar-direction-master-review-handoff.v1',
    authorizationSha256: '1'.repeat(64),
    identityApprovalSha256: '2'.repeat(64),
    directionMasterPlanSha256: '3'.repeat(64),
    runtimePackageSha256: '4'.repeat(64),
    adapter: { id: 'fixture-image', model: 'fixture-background-contract-v3', fallbackAllowed: false },
    candidateCountPerView: 2,
    reviewId: plan.reviewId,
    planSha256: plan.planSha256,
    requestPath: 'C:\\direction-review\\review-request.json',
    planPath: 'C:\\direction-review\\review-plan.json',
    workspaceRoot: 'C:\\direction-review',
    characterIds,
    requiredViews: characterIds.flatMap((characterId) => viewIds.map((viewId) => ({ characterId, viewId }))),
    candidateCount: materialized.length,
    requiredGates: gates,
    technicalAssuranceRequired: true,
    independentVisualReviewRequired: true,
    directionMasterApprovalPerformed: false,
    candidatePromotionPerformed: false,
    runtimeActivationPerformed: false,
    websiteActivationPerformed: false,
    providerExecutionPerformedByHandoff: false,
    materialized,
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
  const decisionsEntries = groups.flatMap((group) => {
    const seen = new Set();
    return group.items.map((item) => {
      const material = materialized.find((candidate) => candidate.contentSha256 === item.sha256);
      const keep = !seen.has(material.viewId);
      seen.add(material.viewId);
      return {
        groupId: group.id,
        itemId: item.id,
        sourceSha256: item.sha256,
        disposition: keep ? 'keep' : 'reject',
        gates: { ...passGates },
        strengths: keep ? ['strong continuity'] : [],
        preserve: [],
        defects: keep ? [] : [{ id: 'defect-001', severity: 'major', summary: 'weaker continuity' }],
        requiredChanges: [],
        avoid: [],
        notes: keep ? '' : 'Reject weaker candidate.',
      };
    });
  });
  const decisionsBody = {
    schema: 'evavo.project-art-review-decisions.v1',
    reviewId: plan.reviewId,
    projectId: plan.projectId,
    planSha256: plan.planSha256,
    reviewer: {
      mode: 'hybrid',
      id: 'direction-reviewer',
      reviewedAt: '2026-08-30T04:20:00.000Z',
      reason: 'Independent continuity review.',
    },
    decisions: decisionsEntries,
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
    itemCount: 12,
    dispositionCounts: { keep: 6, edit: 0, recreate: 0, 'generate-variation': 0, 'reference-only': 0, reject: 6 },
    nextActions: {},
    authority: projectArtAuthority,
  };
  const receipt = withHash(receiptBody, 'receiptSha256');
  return { handoff, plan, decisions, receipt };
}

function compile(input = fixture()) {
  return compileCouncilAvatarDirectionMasterApproval({
    ...input,
    approvedBy: 'EVAVO direction approver',
    approvedAt: '2026-08-30T04:30:00.000Z',
    reason: 'Approve exactly one continuity-safe direction master for each required character view.',
  });
}

test('direction approval locks exactly six fully-passed character/view masters without animation authority', () => {
  const approval = compile();
  assert.equal(approval.status, 'approved');
  assert.equal(approval.locks.length, 6);
  assert.equal(new Set(approval.locks.map((lock) => `${lock.characterId}:${lock.viewId}`)).size, 6);
  assert.ok(approval.locks.every((lock) => lock.directionMasterLocked === true));
  assert.equal(approval.authority.directionMasterApproval, true);
  assert.equal(approval.authority.candidateApproval, true);
  assert.equal(approval.authority.animationProduction, false);
  assert.equal(approval.authority.candidatePromotion, false);
  assert.equal(approval.authority.runtimeActivation, false);
  assert.equal(approval.authority.websiteActivation, false);
  assert.equal(validateCouncilAvatarDirectionMasterApproval(approval), approval);
});

test('direction approval rejects agent-only review', () => {
  const input = fixture();
  const body = { ...input.decisions, reviewer: { ...input.decisions.reviewer, mode: 'agent-assisted' } };
  delete body.decisionSha256;
  input.decisions = withHash(body, 'decisionSha256');
  const receiptBody = { ...input.receipt, decisionSha256: input.decisions.decisionSha256, reviewerMode: 'agent-assisted' };
  delete receiptBody.receiptSha256;
  input.receipt = withHash(receiptBody, 'receiptSha256');
  assert.throws(() => compile(input), /human or hybrid/u);
});

test('direction approval rejects multiple kept candidates for one view', () => {
  const input = fixture();
  const entries = structuredClone(input.decisions.decisions);
  const target = entries.find((entry) => entry.itemId === 'council-critic-full-body-right-candidate-02');
  target.disposition = 'keep';
  target.defects = [];
  target.notes = '';
  const body = { ...input.decisions, decisions: entries };
  delete body.decisionSha256;
  input.decisions = withHash(body, 'decisionSha256');
  const receiptBody = { ...input.receipt, decisionSha256: input.decisions.decisionSha256 };
  delete receiptBody.receiptSha256;
  input.receipt = withHash(receiptBody, 'receiptSha256');
  assert.throws(() => compile(input), /exactly one kept candidate/u);
});

test('direction approval requires pass for every required gate on each kept view', () => {
  const input = fixture();
  const entries = structuredClone(input.decisions.decisions);
  entries.find((entry) => entry.itemId === 'council-open-reviewer-neutral-bust-candidate-01').gates.identityContinuity = 'fail';
  const body = { ...input.decisions, decisions: entries };
  delete body.decisionSha256;
  input.decisions = withHash(body, 'decisionSha256');
  const receiptBody = { ...input.receipt, decisionSha256: input.decisions.decisionSha256 };
  delete receiptBody.receiptSha256;
  input.receipt = withHash(receiptBody, 'receiptSha256');
  assert.throws(() => compile(input), /must pass required gate identityContinuity/u);
});

test('direction approval rejects incomplete Project Art authority contract', () => {
  const input = fixture();
  const body = { ...input.plan, authority: {} };
  delete body.planSha256;
  input.plan = withHash(body, 'planSha256');
  const handoffBody = { ...input.handoff, planSha256: input.plan.planSha256 };
  delete handoffBody.handoffSha256;
  input.handoff = withHash(handoffBody, 'handoffSha256');
  const decisionsBody = { ...input.decisions, planSha256: input.plan.planSha256 };
  delete decisionsBody.decisionSha256;
  input.decisions = withHash(decisionsBody, 'decisionSha256');
  const receiptBody = { ...input.receipt, planSha256: input.plan.planSha256, decisionSha256: input.decisions.decisionSha256 };
  delete receiptBody.receiptSha256;
  input.receipt = withHash(receiptBody, 'receiptSha256');
  assert.throws(() => compile(input), /exact explicit all-false Project Art authority contract/u);
});
