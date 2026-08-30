import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { LocalArtifactStore } from '../packages/artifacts/dist/index.js';
import { compileCouncilAvatarDirectionMasterRuntimePackage } from './project-art/council-avatar-direction-master-runtime.mjs';
import { compileCouncilAvatarDirectionMasterReviewHandoff } from './project-art/council-avatar-direction-master-review-handoff.mjs';

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

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-direction-review-'));
  const artifactRoot = path.join(root, 'artifacts');
  const store = new LocalArtifactStore({ root: artifactRoot });
  const identities = [];
  for (const [characterId, seed] of [['council-critic', 'critic'], ['council-open-reviewer', 'reviewer']]) {
    const source = await store.put(Buffer.concat([tinyPng, Buffer.from(`identity-source-${seed}`)]), {
      mediaType: 'image/png',
      storageClass: 'intermediate',
      fileName: `${seed}-source.png`,
      labels: { artifactRole: 'provider-candidate', approvalState: 'unapproved' },
    });
    const mastered = await store.put(Buffer.concat([tinyPng, Buffer.from(`identity-master-${seed}`)]), {
      mediaType: 'image/png',
      storageClass: 'intermediate',
      fileName: `${seed}-master.png`,
      sourceArtifacts: [source.artifactId],
      labels: {
        artifactRole: 'provider-candidate-alpha-master',
        approvalState: 'unapproved',
        qualityState: 'passed',
        sourceCandidateArtifactId: source.artifactId,
      },
    });
    identities.push({ characterId, source, mastered });
  }
  const approvalBody = {
    schema: 'evavo.project-art-council-avatar-identity-lock-approval.v1',
    status: 'approved',
    approvedAt: '2026-08-30T03:00:00.000Z',
    approvedBy: 'test',
    reason: 'test',
    reviewer: { mode: 'hybrid', id: 'reviewer', reviewedAt: '2026-08-30T02:55:00.000Z' },
    source: {
      handoffSha256: '1'.repeat(64), planSha256: '2'.repeat(64), decisionSha256: '3'.repeat(64),
      receiptSha256: '4'.repeat(64), authorizationSha256: '5'.repeat(64), runtimePackageSha256: '6'.repeat(64),
    },
    requiredGates: ['technical', 'styleConsistency', 'identityContinuity', 'composition', 'runtimeReadiness'],
    locks: identities.map(({ characterId, source, mastered }) => ({
      characterId,
      reviewGroupId: `${characterId}-identity-candidates`,
      reviewItemId: `${characterId}-candidate-01`,
      sourceSha256: mastered.contentSha256,
      masteredArtifactId: mastered.artifactId,
      masteredDescriptorSha256: mastered.descriptorSha256,
      masteredContentSha256: mastered.contentSha256,
      sourceCandidateArtifactId: source.artifactId,
      identityLocked: true,
      promotionEligibleByThisApproval: false,
      runtimeActivationAllowedByThisApproval: false,
      websiteActivationAllowedByThisApproval: false,
    })),
    nextActions: [],
    authority: {
      identityLockApproval: true, candidateApproval: true, candidatePromotion: false,
      providerExecution: false, providerRetry: false, sourceMutation: false, repositoryMutation: false,
      gitCommit: false, gitPush: false, publication: false, runtimeActivation: false,
      websiteActivation: false, deployment: false, forcePush: false,
    },
  };
  const identityLockApproval = withHash(approvalBody, 'approvalSha256');
  const runtimePackage = compileCouncilAvatarDirectionMasterRuntimePackage({
    identityLockApproval,
    candidateCount: 2,
    preferredAdapterId: 'fixture-image',
    preferredModel: 'fixture-background-contract-v3',
  });
  const assuranceJobs = [];
  for (const job of runtimePackage.jobs) {
    for (let index = 0; index < 2; index += 1) {
      const candidate = await store.put(Buffer.concat([tinyPng, Buffer.from(`${job.characterId}:${job.viewId}:candidate:${index}`)]), {
        mediaType: 'image/png',
        storageClass: 'intermediate',
        fileName: `${job.characterId}-${job.viewId}-${index}-candidate.png`,
        labels: { artifactRole: 'provider-candidate', approvalState: 'unapproved' },
      });
      const mastered = await store.put(Buffer.concat([tinyPng, Buffer.from(`${job.characterId}:${job.viewId}:master:${index}`)]), {
        mediaType: 'image/png',
        storageClass: 'intermediate',
        fileName: `${job.characterId}-${job.viewId}-${index}-master.png`,
        sourceArtifacts: [candidate.artifactId],
        labels: {
          artifactRole: 'provider-candidate-alpha-master',
          approvalState: 'unapproved',
          qualityState: 'passed',
          sourceCandidateArtifactId: candidate.artifactId,
        },
      });
      assuranceJobs.push({
        characterId: job.characterId,
        viewId: job.viewId,
        sourceCandidateArtifactId: candidate.artifactId,
        jobId: `assurance-${job.characterId}-${job.viewId}-${index}`,
        state: 'succeeded',
        attempts: 1,
        failureCode: null,
        outputs: [{
          artifactId: mastered.artifactId,
          artifactRole: 'provider-candidate-alpha-master',
          approvalState: 'unapproved',
          qualityState: 'passed',
        }],
      });
    }
  }
  const execution = {
    schema: 'evavo.project-art-council-avatar-direction-master-execution-result.v1',
    authorizationSha256: '7'.repeat(64),
    identityApprovalSha256: identityLockApproval.approvalSha256,
    directionMasterPlanSha256: runtimePackage.directionMasterPlanSha256,
    runtimePackageSha256: runtimePackage.runtimePackageSha256,
    adapter: { id: 'fixture-image', model: 'fixture-background-contract-v3', fallbackAllowed: false },
    existingCanonicalIdentityArtifactStore: true,
    runtimeRoot: path.join(root, 'runtime'),
    artifactRoot,
    selectedCharacterId: null,
    selectedViewId: null,
    submittedJobCount: runtimePackage.jobs.length,
    maximumAttemptsPerJob: 1,
    fallbackAllowed: false,
    directionMasterApprovalEstablished: false,
    candidatePromotionEstablished: false,
    runtimeActivationAllowed: false,
    websiteActivationAllowed: false,
    provider: { claimed: 6, succeeded: 6, failed: 0, candidateArtifactsFound: 12 },
    technicalAssurance: {
      submitted: 12,
      claimed: 12,
      succeeded: 12,
      failed: 0,
      jobs: assuranceJobs,
    },
    independentVisualReviewRequired: true,
    jobs: runtimePackage.jobs.map((job, index) => ({
      characterId: job.characterId,
      viewId: job.viewId,
      jobId: `provider-job-${index}`,
      state: 'succeeded',
      attempts: 1,
      outputArtifactIds: [],
      failureCode: null,
    })),
  };
  const executionResultPath = path.join(root, 'execution.json');
  const identityApprovalPath = path.join(root, 'identity-approval.json');
  await writeFile(executionResultPath, `${JSON.stringify(execution, null, 2)}\n`, 'utf8');
  await writeFile(identityApprovalPath, `${JSON.stringify(identityLockApproval, null, 2)}\n`, 'utf8');
  return {
    root,
    artifactRoot,
    executionResultPath,
    identityApprovalPath,
    workspaceRoot: path.join(root, 'review-workspace'),
  };
}

test('direction review handoff requires and materializes two passed candidates for all six required views', async () => {
  const input = await fixture();
  const result = await compileCouncilAvatarDirectionMasterReviewHandoff({
    ...input,
    compiledAt: '2026-08-30T04:00:00.000Z',
  });
  assert.equal(result.candidateCountPerView, 2);
  assert.equal(result.requiredViews.length, 6);
  assert.equal(result.candidateCount, 12);
  assert.equal(result.materialized.length, 12);
  assert.equal(result.characterIds.length, 2);
  assert.equal(result.independentVisualReviewRequired, true);
  assert.equal(result.directionMasterApprovalPerformed, false);
  assert.equal(result.candidatePromotionPerformed, false);
  assert.equal(result.runtimeActivationPerformed, false);
  const request = JSON.parse(await readFile(result.requestPath, 'utf8'));
  const plan = JSON.parse(await readFile(result.planPath, 'utf8'));
  assert.equal(request.groups.length, 2);
  assert.ok(request.groups.every((group) => group.items.length === 6));
  assert.ok(request.groups.every((group) => group.requiredGates.includes('identityContinuity')));
  assert.equal(plan.sourceSummary.itemCount, 12);
});

test('direction review handoff rejects partial executions', async () => {
  const input = await fixture();
  const execution = JSON.parse(await readFile(input.executionResultPath, 'utf8'));
  execution.selectedCharacterId = 'council-critic';
  await writeFile(input.executionResultPath, `${JSON.stringify(execution, null, 2)}\n`, 'utf8');
  await assert.rejects(
    () => compileCouncilAvatarDirectionMasterReviewHandoff({
      ...input,
      compiledAt: '2026-08-30T04:00:00.000Z',
    }),
    /complete execution|complete-review eligible/u,
  );
});

test('direction review handoff rejects any view with fewer than two technically-passed candidates', async () => {
  const input = await fixture();
  const execution = JSON.parse(await readFile(input.executionResultPath, 'utf8'));
  execution.technicalAssurance.jobs = execution.technicalAssurance.jobs.slice(1);
  execution.technicalAssurance.submitted -= 1;
  execution.technicalAssurance.claimed -= 1;
  execution.technicalAssurance.succeeded -= 1;
  await writeFile(input.executionResultPath, `${JSON.stringify(execution, null, 2)}\n`, 'utf8');
  await assert.rejects(
    () => compileCouncilAvatarDirectionMasterReviewHandoff({
      ...input,
      compiledAt: '2026-08-30T04:00:00.000Z',
    }),
    /consistent candidate count|technical assurance is incomplete/u,
  );
});
