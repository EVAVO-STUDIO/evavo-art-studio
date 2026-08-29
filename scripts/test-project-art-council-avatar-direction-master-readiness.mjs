import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { LocalArtifactStore } from '../packages/artifacts/dist/index.js';
import { inspectCouncilAvatarDirectionMasterReadiness } from './project-art/council-avatar-direction-master-readiness.mjs';

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
const SECRET = 'sk-test-direction-readiness-never-print';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-direction-readiness-'));
  const artifactRoot = path.join(root, 'artifacts');
  const store = new LocalArtifactStore({ root: artifactRoot });
  const descriptors = [];
  for (const [characterId, byte] of [['council-critic', 17], ['council-open-reviewer', 29]]) {
    const source = await store.put(Buffer.alloc(32, byte), {
      mediaType: 'image/png',
      storageClass: 'intermediate',
      fileName: `${characterId}-source.png`,
      labels: { artifactRole: 'provider-candidate', approvalState: 'unapproved' },
    });
    const mastered = await store.put(Buffer.alloc(64, byte), {
      mediaType: 'image/png',
      storageClass: 'intermediate',
      fileName: `${characterId}-mastered.png`,
      sourceArtifacts: [source.artifactId],
      labels: {
        artifactRole: 'provider-candidate-alpha-master',
        approvalState: 'unapproved',
        qualityState: 'passed',
        sourceCandidateArtifactId: source.artifactId,
      },
    });
    descriptors.push({ characterId, source, mastered });
  }
  const body = {
    schema: 'evavo.project-art-council-avatar-identity-lock-approval.v1',
    status: 'approved',
    approvedAt: '2026-08-29T10:20:00.000Z',
    approvedBy: 'test',
    reason: 'test',
    reviewer: { mode: 'hybrid', id: 'reviewer', reviewedAt: '2026-08-29T10:15:00.000Z' },
    source: {
      handoffSha256: '1'.repeat(64), planSha256: '2'.repeat(64), decisionSha256: '3'.repeat(64),
      receiptSha256: '4'.repeat(64), authorizationSha256: '5'.repeat(64), runtimePackageSha256: '6'.repeat(64),
    },
    requiredGates: ['technical', 'styleConsistency', 'identityContinuity', 'composition', 'runtimeReadiness'],
    locks: descriptors.map(({ characterId, source, mastered }) => ({
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
  return {
    artifactRoot,
    identityLockApproval: withHash(body, 'approvalSha256'),
    environment: Object.freeze({
      OPENAI_API_KEY: SECRET,
      EVAVO_ART_OPENAI_IMAGE_MODEL: 'gpt-image-2',
      EVAVO_ART_OPENAI_IMAGE_MODELS: 'gpt-image-2,gpt-image-2-2026-04-21',
    }),
  };
}

test('direction readiness verifies exact approved identity artifacts and provider capability without a remote call', async () => {
  const input = await fixture();
  const readiness = await inspectCouncilAvatarDirectionMasterReadiness(input);
  assert.equal(readiness.zeroSpendInspection, true);
  assert.equal(readiness.remoteProviderCallPerformed, false);
  assert.equal(readiness.providerExecutionAuthorized, false);
  assert.equal(readiness.identityArtifacts.length, 2);
  assert.ok(readiness.identityArtifacts.every((entry) => entry.ready));
  assert.equal(readiness.readiness.identityArtifactsReady, true);
  assert.equal(readiness.readiness.adapterRegistered, true);
  assert.equal(readiness.readiness.modelRegistered, true);
  assert.equal(readiness.readiness.adapterCapabilityReady, true);
  assert.equal(readiness.readiness.readyForBoundedExecutionAuthorization, true);
  assert.ok(readiness.desired.requiredAdapterCapabilities.includes('identity-reference'));
  assert.equal(JSON.stringify(readiness).includes(SECRET), false);
});

test('direction readiness blocks when approved identity artifact id is absent from the execution store', async () => {
  const input = await fixture();
  const approval = structuredClone(input.identityLockApproval);
  approval.locks[0].masteredArtifactId = `artifact_${'f'.repeat(64)}`;
  const body = { ...approval };
  delete body.approvalSha256;
  input.identityLockApproval = withHash(body, 'approvalSha256');
  const readiness = await inspectCouncilAvatarDirectionMasterReadiness(input);
  assert.equal(readiness.readiness.identityArtifactsReady, false);
  assert.equal(readiness.readiness.readyForBoundedExecutionAuthorization, false);
  assert.ok(readiness.blockers.includes('identity-artifact-not-ready:council-critic'));
});

test('direction readiness blocks when approval descriptor/content hashes no longer match store evidence', async () => {
  const input = await fixture();
  const approval = structuredClone(input.identityLockApproval);
  approval.locks[1].masteredContentSha256 = 'f'.repeat(64);
  const body = { ...approval };
  delete body.approvalSha256;
  input.identityLockApproval = withHash(body, 'approvalSha256');
  const readiness = await inspectCouncilAvatarDirectionMasterReadiness(input);
  const reviewer = readiness.identityArtifacts.find((entry) => entry.characterId === 'council-open-reviewer');
  assert.equal(reviewer.contentMatchesApproval, false);
  assert.equal(reviewer.ready, false);
  assert.equal(readiness.readiness.readyForBoundedExecutionAuthorization, false);
});

test('direction readiness with no provider credential stays zero-spend and reports a blocker', async () => {
  const input = await fixture();
  input.environment = Object.freeze({});
  const readiness = await inspectCouncilAvatarDirectionMasterReadiness(input);
  assert.equal(readiness.remoteProviderCallPerformed, false);
  assert.equal(readiness.readiness.readyForBoundedExecutionAuthorization, false);
  assert.ok(readiness.blockers.includes('openai-api-key-not-configured'));
});
