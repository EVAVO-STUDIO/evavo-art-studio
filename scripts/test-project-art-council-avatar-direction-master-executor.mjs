import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { LocalArtifactStore } from '../packages/artifacts/dist/index.js';
import { compileCouncilAvatarDirectionMasterExecutionAuthorization } from './project-art/council-avatar-direction-master-authorization.mjs';
import { executeAuthorizedCouncilAvatarDirectionMasterJobs } from './project-art/council-avatar-direction-master-executor.mjs';

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

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-direction-executor-'));
  const artifactRoot = path.join(root, 'artifacts');
  const store = new LocalArtifactStore({ root: artifactRoot });
  const identities = [];
  for (const [characterId, suffix] of [['council-critic', 'critic'], ['council-open-reviewer', 'reviewer']]) {
    const source = await store.put(Buffer.concat([tinyPng, Buffer.from(`source-${suffix}`)]), {
      mediaType: 'image/png',
      storageClass: 'intermediate',
      fileName: `${suffix}-source.png`,
      labels: { artifactRole: 'provider-candidate', approvalState: 'unapproved' },
    });
    const mastered = await store.put(Buffer.concat([tinyPng, Buffer.from(`master-${suffix}`)]), {
      mediaType: 'image/png',
      storageClass: 'intermediate',
      fileName: `${suffix}-master.png`,
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
    approvedBy: 'fixture-test',
    reason: 'Fixture identity approval for direction executor.',
    reviewer: { mode: 'hybrid', id: 'fixture-reviewer', reviewedAt: '2026-08-30T02:55:00.000Z' },
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
  const environment = Object.freeze({ EVAVO_ART_ENABLE_FIXTURE_PROVIDER: 'true' });
  const authorization = await compileCouncilAvatarDirectionMasterExecutionAuthorization({
    identityLockApproval,
    artifactRoot,
    authorizedAt: '2026-08-30T03:10:00.000Z',
    expiresAt: '2026-08-30T03:40:00.000Z',
    authorizedBy: 'fixture-test',
    reason: 'Authorize fixture direction execution.',
    candidateCount: 1,
    preferredAdapterId: 'fixture-image',
    preferredModel: 'fixture-background-contract-v3',
  });
  const identityApprovalPath = path.join(root, 'identity-approval.json');
  const authorizationPath = path.join(root, 'direction-authorization.json');
  await writeFile(identityApprovalPath, `${JSON.stringify(identityLockApproval, null, 2)}\n`, 'utf8');
  await writeFile(authorizationPath, `${JSON.stringify(authorization, null, 2)}\n`, 'utf8');
  return { root, artifactRoot, identityApprovalPath, authorizationPath, environment };
}

test('direction executor runs one explicitly selected governed view and technically masters its unapproved candidate', async () => {
  const input = await setup();
  const result = await executeAuthorizedCouncilAvatarDirectionMasterJobs({
    ...input,
    runtimeRoot: path.join(input.root, 'runtime'),
    characterId: 'council-critic',
    viewId: 'full-body-right',
  });
  assert.equal(result.schema, 'evavo.project-art-council-avatar-direction-master-execution-result.v1');
  assert.equal(result.existingCanonicalIdentityArtifactStore, true);
  assert.equal(result.submittedJobCount, 1);
  assert.equal(result.maximumAttemptsPerJob, 1);
  assert.equal(result.fallbackAllowed, false);
  assert.equal(result.provider.claimed, 1);
  assert.equal(result.provider.succeeded, 1);
  assert.equal(result.provider.failed, 0);
  assert.equal(result.provider.candidateArtifactsFound, 1);
  assert.equal(result.technicalAssurance.submitted, 1);
  assert.equal(result.technicalAssurance.succeeded, 1);
  assert.equal(result.directionMasterApprovalEstablished, false);
  assert.equal(result.candidatePromotionEstablished, false);
  assert.equal(result.runtimeActivationAllowed, false);
  assert.equal(result.websiteActivationAllowed, false);
  assert.equal(result.independentVisualReviewRequired, true);
  assert.equal(result.jobs[0].characterId, 'council-critic');
  assert.equal(result.jobs[0].viewId, 'full-body-right');
  const assurance = result.technicalAssurance.jobs[0];
  assert.equal(assurance.characterId, 'council-critic');
  assert.equal(assurance.viewId, 'full-body-right');
  assert.equal(assurance.state, 'succeeded');
  assert.equal(assurance.attempts, 1);
  assert.ok(assurance.outputs.some((entry) => entry.artifactRole === 'provider-candidate-alpha-master'));
  assert.ok(assurance.outputs.every((entry) => entry.approvalState !== 'approved'));
});
