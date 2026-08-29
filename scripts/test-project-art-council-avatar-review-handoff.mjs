import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { LocalArtifactStore } from '../packages/artifacts/dist/index.js';
import { COUNCIL_AVATAR_PROVIDER_EXECUTION_RESULT_SCHEMA } from './project-art/council-avatar-provider-executor.mjs';
import { compileCouncilAvatarReviewHandoff } from './project-art/council-avatar-review-handoff.mjs';

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFklEQVR4nGNgoBo4YaPxHxkPhAKyAQDgPyKxKv0aXwAAAABJRU5ErkJggg==',
  'base64',
);

async function masteredCandidate(store, characterId, index, qualityState = 'passed') {
  const source = await store.put(Buffer.concat([tinyPng, Buffer.from(String(index))]), {
    mediaType: 'image/png',
    storageClass: 'intermediate',
    fileName: `${characterId}-${index}-provider.png`,
    labels: {
      artifactRole: 'provider-candidate',
      approvalState: 'unapproved',
      candidateFamilyId: `${characterId}-identity`,
    },
  });
  const mastered = await store.put(Buffer.concat([tinyPng, Buffer.from(`master-${index}`)]), {
    mediaType: 'image/png',
    storageClass: 'intermediate',
    fileName: `${characterId}-${index}-mastered.png`,
    sourceArtifacts: [source.artifactId],
    labels: {
      artifactRole: 'provider-candidate-alpha-master',
      approvalState: 'unapproved',
      qualityState,
      sourceCandidateArtifactId: source.artifactId,
    },
  });
  return { source, mastered };
}

async function fixture({ critic = 2, reviewer = 2, rejected = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-council-review-handoff-'));
  const artifactRoot = path.join(root, 'artifacts');
  const store = new LocalArtifactStore({ root: artifactRoot });
  const jobs = [];
  for (const [characterId, count] of [
    ['council-critic', critic],
    ['council-open-reviewer', reviewer],
  ]) {
    for (let index = 0; index < count; index += 1) {
      const { source, mastered } = await masteredCandidate(
        store,
        characterId,
        index,
        rejected && index === 0 ? 'rejected' : 'passed',
      );
      jobs.push({
        characterId,
        sourceCandidateArtifactId: source.artifactId,
        jobId: `assurance-${characterId}-${index}`,
        state: 'succeeded',
        attempts: 1,
        failureCode: null,
        outputs: [
          {
            artifactId: mastered.artifactId,
            artifactRole: 'provider-candidate-alpha-master',
            approvalState: 'unapproved',
            qualityState: mastered.labels.qualityState,
          },
        ],
      });
    }
  }
  const execution = {
    schema: COUNCIL_AVATAR_PROVIDER_EXECUTION_RESULT_SCHEMA,
    authorizationSha256: 'a'.repeat(64),
    runtimePackageSha256: 'b'.repeat(64),
    candidateApprovalEstablished: false,
    candidatePromotionEstablished: false,
    runtimeActivationAllowed: false,
    independentVisualReviewRequired: true,
    technicalAssurance: { jobs },
  };
  const executionResultPath = path.join(root, 'execution-result.json');
  await writeFile(executionResultPath, `${JSON.stringify(execution, null, 2)}\n`, 'utf8');
  return {
    root,
    artifactRoot,
    executionResultPath,
    workspaceRoot: path.join(root, 'review-workspace'),
  };
}

test('Council review handoff materializes only verified passed mastered candidates', async () => {
  const input = await fixture();
  const result = await compileCouncilAvatarReviewHandoff({
    ...input,
    compiledAt: '2026-08-29T12:00:00.000Z',
  });

  assert.equal(result.candidateCount, 4);
  assert.deepEqual(result.characterIds, ['council-critic', 'council-open-reviewer']);
  assert.equal(result.independentVisualReviewRequired, true);
  assert.equal(result.candidateApprovalPerformed, false);
  assert.equal(result.candidatePromotionPerformed, false);
  assert.equal(result.runtimeActivationPerformed, false);
  assert.equal(result.providerExecutionPerformedByHandoff, false);
  assert.deepEqual(result.requiredGates, [
    'technical',
    'styleConsistency',
    'identityContinuity',
    'composition',
    'runtimeReadiness',
  ]);

  const request = JSON.parse(await readFile(result.requestPath, 'utf8'));
  const plan = JSON.parse(await readFile(result.planPath, 'utf8'));
  assert.equal(request.groups.length, 2);
  assert.ok(request.groups.every((group) => group.kind === 'candidate-set'));
  assert.ok(request.groups.every((group) => group.items.length === 2));
  assert.equal(plan.sourceSummary.itemCount, 4);
  assert.equal(plan.authority.candidateApproval, false);
  assert.equal(plan.authority.candidatePromotion, false);
  assert.equal(plan.authority.providerExecution, false);
  for (const item of plan.groups.flatMap((group) => group.items)) {
    assert.equal(item.role, 'candidate');
    assert.equal(item.mediaType, 'image/png');
    assert.equal(item.previewable, true);
    assert.match(item.sha256, /^[a-f0-9]{64}$/u);
  }
});

test('technically rejected candidates are excluded from identity review', async () => {
  const input = await fixture({ critic: 3, reviewer: 3, rejected: true });
  const result = await compileCouncilAvatarReviewHandoff({
    ...input,
    compiledAt: '2026-08-29T12:00:00.000Z',
  });
  assert.equal(result.candidateCount, 4);
  assert.ok(result.materialized.every((entry) => entry.contentSha256));
});

test('one passed candidate is insufficient for a character candidate-set review', async () => {
  const input = await fixture({ critic: 1, reviewer: 0 });
  await assert.rejects(
    () =>
      compileCouncilAvatarReviewHandoff({
        ...input,
        compiledAt: '2026-08-29T12:00:00.000Z',
      }),
    /at least two technically-passed candidates/u,
  );
});

test('review handoff refuses execution results that imply prior approval', async () => {
  const input = await fixture();
  const execution = JSON.parse(await readFile(input.executionResultPath, 'utf8'));
  execution.candidateApprovalEstablished = true;
  await writeFile(input.executionResultPath, `${JSON.stringify(execution, null, 2)}\n`, 'utf8');
  await assert.rejects(
    () =>
      compileCouncilAvatarReviewHandoff({
        ...input,
        compiledAt: '2026-08-29T12:00:00.000Z',
      }),
    /not review-handoff eligible/u,
  );
});
