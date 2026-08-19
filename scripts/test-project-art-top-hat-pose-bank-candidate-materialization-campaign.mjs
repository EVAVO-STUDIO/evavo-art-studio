#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  compileTopHatPoseBankCandidateMaterializationCampaignPlan,
  parseTopHatPoseBankCandidateMaterializationCampaignPlan,
  parseTopHatPoseBankCandidateMaterializationCampaignReceipt,
  runTopHatPoseBankCandidateMaterializationCampaign,
} from './project-art/top-hat-pose-bank-candidate-materialization-campaign.mjs';
import {
  createTopHatPoseSlotCandidateAdmissionFixture,
} from './project-art/top-hat-pose-slot-candidate-admission-fixture.mjs';
import {
  parseAvatarProviderCandidateSourceChain,
} from './project-art/avatar-final-pass-provider-candidate-source.mjs';
import {
  TOP_HAT_RUNTIME_EXPECTED_SLOTS,
} from './project-art/top-hat-pose-slot-provider-runtime-foundation.mjs';

const sha = (character) => character.repeat(64);
const authorization = Object.freeze({
  action: 'materialize-unapproved-provider-candidate',
  actorClass: 'agent',
  actorId: 'fixture-materializer',
  occurredAt: '2026-08-16T12:32:30.000Z',
  evidenceSha256: sha('c'),
});

function fixtures() {
  return TOP_HAT_RUNTIME_EXPECTED_SLOTS.map((slotId) =>
    createTopHatPoseSlotCandidateAdmissionFixture(slotId),
  );
}

function sourceOf(fixture) {
  return parseAvatarProviderCandidateSourceChain({
    dispatch: fixture.dispatch,
    binding: fixture.binding,
    outcome: fixture.outcome,
  });
}

function slotInputs(values = fixtures()) {
  return values.map((fixture) => ({
    slotId: fixture.slotId,
    dispatch: fixture.dispatch,
    binding: fixture.binding,
    outcome: fixture.outcome,
  }));
}

function fakeArtifactStore(values = fixtures(), failId = null) {
  const descriptors = new Map();
  for (const fixture of values) {
    const source = sourceOf(fixture);
    descriptors.set(source.candidateArtifactId, {
      artifactId: source.candidateArtifactId,
      mediaType: 'image/png',
    });
    descriptors.set(source.evidenceArtifactId, {
      artifactId: source.evidenceArtifactId,
      mediaType: 'application/json',
    });
  }
  return {
    async verify(id) {
      return {
        exists: descriptors.has(id),
        descriptorValid: descriptors.has(id) && id !== failId,
        contentValid: descriptors.has(id) && id !== failId,
      };
    },
    async get(id) {
      return descriptors.get(id) ?? null;
    },
    async read() {
      return Buffer.from('fixture');
    },
  };
}

function fakeMaterializer(calls, failSlotId = null) {
  return async ({ dispatch, workspaceRoot }) => {
    const slotId = dispatch.frameId;
    calls.push(slotId);
    if (slotId === failSlotId) {
      const error = new Error(`fixture failure for ${slotId}`);
      error.code = 'FIXTURE_MATERIALIZATION_FAILURE';
      throw error;
    }
    const candidatePath = path.resolve(
      workspaceRoot,
      ...dispatch.candidateAdmission.candidateOutputPath.split('/'),
    );
    const stem = candidatePath.slice(0, -4);
    return Object.freeze({
      status: 'candidate-materialized-awaiting-frame-finisher',
      reused: false,
      materializationId: `fixture:${slotId}`,
      candidatePath,
      receiptPath: `${stem}.materialization.json`,
      finisherRequestPath: `${stem}.finisher-request.json`,
      receipt: Object.freeze({
        materializationSha256: sha('a'),
        output: Object.freeze({ unapproved: true }),
      }),
      finisherRequest: Object.freeze({
        finisherRequestSha256: sha('b'),
        candidateApproval: false,
        candidatePromotion: false,
        runtimeActivationAllowed: false,
      }),
    });
  };
}

function withWorkspace(callback) {
  const workspaceRoot = mkdtempSync(
    path.join(os.tmpdir(), 'top-hat-candidate-materialization-'),
  );
  try {
    return callback(workspaceRoot);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
}

test('preflights and materializes the exact six slots in canonical order', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const values = fixtures();
    const calls = [];
    const input = {
      adapter: values[0].adapter,
      slots: slotInputs(values),
      artifactStore: fakeArtifactStore(values),
      workspaceRoot,
      authorization,
      plannedAt: '2026-08-16T12:32:40.000Z',
    };
    const plan = await compileTopHatPoseBankCandidateMaterializationCampaignPlan(
      input,
    );
    assert.equal(
      parseTopHatPoseBankCandidateMaterializationCampaignPlan(plan)
        .campaignPlanSha256,
      plan.campaignPlanSha256,
    );
    assert.deepEqual(
      plan.slots.map((entry) => entry.slotId),
      TOP_HAT_RUNTIME_EXPECTED_SLOTS,
    );
    assert.equal(plan.policy.preflightAllSlotsBeforeFirstWrite, true);
    assert.equal(plan.policy.providerExecutionAllowed, false);
    assert.equal(plan.policy.automaticReviewAllowed, false);
    assert.equal(plan.policy.automaticAdmissionAllowed, false);
    assert.equal(plan.authority.candidateMaterialization, true);
    assert.equal(plan.authority.candidateApproval, false);

    let tick = 0;
    const result = await runTopHatPoseBankCandidateMaterializationCampaign({
      ...input,
      materialize: fakeMaterializer(calls),
      clock: () =>
        `2026-08-16T12:${String(33 + tick++).padStart(2, '0')}:00.000Z`,
    });
    assert.deepEqual(calls, TOP_HAT_RUNTIME_EXPECTED_SLOTS);
    assert.equal(
      result.receipt.status,
      'succeeded-awaiting-frame-finishing-and-human-review',
    );
    assert.equal(result.receipt.counts.plannedSlots, 6);
    assert.equal(result.receipt.counts.attemptedSlots, 6);
    assert.equal(result.receipt.counts.materializedSlots, 6);
    assert.equal(result.receipt.counts.humanReviewsCreated, 0);
    assert.equal(result.receipt.counts.candidateAdmissionsCreated, 0);
    assert.equal(result.receipt.effects.providerCallsPerformed, 0);
    assert.equal(result.receipt.effects.frameFinisherRequestsCreated, 6);
    assert.equal(result.receipt.effects.poseSlotsFilled, 0);
    assert.equal(result.receipt.effects.releasesCreated, 0);
    assert.equal(result.receipt.authority.candidateMaterialization, true);
    assert.equal(result.receipt.authority.creativeReview, false);
    assert.equal(result.receipt.authority.candidateApproval, false);
    assert.equal(result.receipt.authority.publication, false);
    assert.equal(result.receipt.authority.runtimeActivation, false);
    assert.equal(
      parseTopHatPoseBankCandidateMaterializationCampaignReceipt(
        result.receipt,
      ).campaignExecutionSha256,
      result.receipt.campaignExecutionSha256,
    );
  });
});

test('rejects wrong slot order before the first candidate write', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const values = fixtures();
    const inputs = slotInputs(values);
    [inputs[0], inputs[1]] = [inputs[1], inputs[0]];
    const calls = [];
    await assert.rejects(
      runTopHatPoseBankCandidateMaterializationCampaign({
        adapter: values[0].adapter,
        slots: inputs,
        artifactStore: fakeArtifactStore(values),
        workspaceRoot,
        authorization,
        materialize: fakeMaterializer(calls),
      }),
      (error) =>
        error?.code ===
        'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_SLOTS_INVALID',
    );
    assert.deepEqual(calls, []);
  });
});

test('preflights all immutable artifacts before the first candidate write', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const values = fixtures();
    const blockedSource = sourceOf(values[3]);
    const calls = [];
    await assert.rejects(
      runTopHatPoseBankCandidateMaterializationCampaign({
        adapter: values[0].adapter,
        slots: slotInputs(values),
        artifactStore: fakeArtifactStore(
          values,
          blockedSource.candidateArtifactId,
        ),
        workspaceRoot,
        authorization,
        materialize: fakeMaterializer(calls),
      }),
      (error) =>
        error?.code ===
        'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_ARTIFACT_INVALID',
    );
    assert.deepEqual(calls, []);
  });
});

test('blocks replay or partial-existing bundles during all-six preflight', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const values = fixtures();
    const laterSource = sourceOf(values[4]);
    const existing = path.resolve(
      workspaceRoot,
      ...laterSource.candidateOutputPath.split('/'),
    );
    mkdirSync(path.dirname(existing), { recursive: true });
    writeFileSync(existing, Buffer.from('existing'));
    const calls = [];
    await assert.rejects(
      runTopHatPoseBankCandidateMaterializationCampaign({
        adapter: values[0].adapter,
        slots: slotInputs(values),
        artifactStore: fakeArtifactStore(values),
        workspaceRoot,
        authorization,
        materialize: fakeMaterializer(calls),
      }),
      (error) =>
        error?.code ===
        'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_REPLAY_BLOCKED',
    );
    assert.deepEqual(calls, []);
  });
});

test('stops on the first materialization failure and never attempts later slots', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const values = fixtures();
    const calls = [];
    const failedSlot = TOP_HAT_RUNTIME_EXPECTED_SLOTS[2];
    const result = await runTopHatPoseBankCandidateMaterializationCampaign({
      adapter: values[0].adapter,
      slots: slotInputs(values),
      artifactStore: fakeArtifactStore(values),
      workspaceRoot,
      authorization,
      materialize: fakeMaterializer(calls, failedSlot),
      clock: () => '2026-08-16T12:40:00.000Z',
    });
    assert.deepEqual(calls, TOP_HAT_RUNTIME_EXPECTED_SLOTS.slice(0, 3));
    assert.equal(result.receipt.status, 'failed');
    assert.equal(result.receipt.failure.slotId, failedSlot);
    assert.equal(result.receipt.failure.code, 'FIXTURE_MATERIALIZATION_FAILURE');
    assert.equal(result.receipt.counts.attemptedSlots, 3);
    assert.equal(result.receipt.counts.materializedSlots, 2);
    assert.equal(result.receipt.effects.providerCallsPerformed, 0);
    assert.equal(result.receipt.effects.humanReviewsCreated, 0);
    assert.equal(result.receipt.effects.candidateAdmissionsCreated, 0);
  });
});

test('source contains no automatic review, final admission, release or publication path', () => {
  const sourcePath = fileURLToPath(
    new URL(
      './project-art/top-hat-pose-bank-candidate-materialization-campaign.mjs',
      import.meta.url,
    ),
  );
  const source = readFileSync(sourcePath, 'utf8');
  for (const forbidden of [
    'write-project-art-top-hat-pose-slot-candidate-admission',
    'admitProjectArtTopHatPoseSlotCandidate',
    'frameReviewDecision',
    'candidateApproval: true',
    'candidatePromotion: true',
    'poseSlotFilling: true',
    'sequenceRelease: true',
    'publication: true',
    'runtimeActivation: true',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

console.log(
  'Project Art Top Hat pose-bank candidate materialization campaign regressions passed.',
);
