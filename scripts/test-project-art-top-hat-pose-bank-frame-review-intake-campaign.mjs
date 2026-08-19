#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  compileTopHatPoseBankFrameReviewIntakePlan,
  parseTopHatPoseBankFrameReviewIntakePlan,
  parseTopHatPoseBankFrameReviewIntakeReceipt,
  runTopHatPoseBankFrameReviewIntakeCampaign,
} from './project-art/top-hat-pose-bank-frame-review-intake-campaign.mjs';
import {
  TOP_HAT_POSE_BANK_FRAME_FINISHING_CAMPAIGN_PROTOCOL_VERSION,
  TOP_HAT_POSE_BANK_FRAME_FINISHING_CAMPAIGN_RECEIPT_SCHEMA,
} from './project-art/top-hat-pose-bank-frame-finishing-campaign.mjs';
import {
  TOP_HAT_RUNTIME_EXPECTED_SLOTS,
} from './project-art/top-hat-pose-slot-provider-runtime-foundation.mjs';
import {
  sha256Document,
} from './project-art/avatar-final-pass-provider-runtime-common.mjs';

const digest = (character) => character.repeat(64);
const hashChars = ['1', '2', '3', '4', '5', '6'];

function finishingAuthority() {
  return Object.freeze({
    sourceRead: true,
    candidateMaterialization: false,
    deterministicPixelFinishing: true,
    finisherReportPersistence: true,
    reviewRequestPersistence: true,
    visiblePixelMutation: false,
    alphaMutation: false,
    canvasMutation: false,
    creativeReview: false,
    candidateApproval: false,
    candidatePromotion: false,
    dependentInbetweenAdmission: false,
    poseSlotFilling: false,
    sequenceAdmission: false,
    sequenceRelease: false,
    targetRepositoryMutation: false,
    gitMutation: false,
    deployment: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  });
}

function finishingReceipt(workspaceRoot) {
  const slots = TOP_HAT_RUNTIME_EXPECTED_SLOTS.map((slotId, index) => {
    const stem = path.join(workspaceRoot, 'top-hat', slotId);
    return Object.freeze({
      slotId,
      status: 'finished-awaiting-named-human-review',
      materializationSha256: digest(hashChars[index]),
      finisherRequestSha256: digest(hashChars[(index + 1) % 6]),
      finishedFrameSha256: digest(hashChars[(index + 2) % 6]),
      frameFinisherSha256: digest(hashChars[(index + 3) % 6]),
      reviewRequestSha256: digest(hashChars[(index + 4) % 6]),
      finishedFramePath: `${stem}.finished.png`,
      frameFinisherReportPath: `${stem}.frame-finisher.json`,
      frameReviewRequestPath: `${stem}.frame-review-request.json`,
    });
  });
  const body = {
    schema: TOP_HAT_POSE_BANK_FRAME_FINISHING_CAMPAIGN_RECEIPT_SCHEMA,
    protocolVersion: TOP_HAT_POSE_BANK_FRAME_FINISHING_CAMPAIGN_PROTOCOL_VERSION,
    status: 'succeeded-awaiting-named-human-review',
    finishedAt: '2026-08-19T00:30:00.000Z',
    campaignPlanSha256: digest('a'),
    sourceMaterializationCampaignSha256: digest('b'),
    slots: Object.freeze(slots),
    counts: Object.freeze({
      plannedSlots: 6,
      attemptedSlots: 6,
      finishedSlots: 6,
      remainingSlots: 0,
      humanReviewsCreated: 0,
      candidateAdmissionsCreated: 0,
    }),
    failure: null,
    nextRequiredStage: 'independent-named-human-frame-review',
    effects: Object.freeze({
      framesFinished: 6,
      finisherReportsCreated: 6,
      reviewRequestsCreated: 6,
      humanReviewsCreated: 0,
      candidateAdmissionsCreated: 0,
      poseSlotsFilled: 0,
      releasesCreated: 0,
      providerCallsPerformed: 0,
    }),
    authority: finishingAuthority(),
  };
  return Object.freeze({
    ...body,
    campaignExecutionSha256: sha256Document(body),
  });
}

function decisions(workspaceRoot) {
  return TOP_HAT_RUNTIME_EXPECTED_SLOTS.map((slotId) =>
    Object.freeze({
      slotId,
      decisionPath: path.join(workspaceRoot, `${slotId}.human-review-decision.json`),
    }),
  );
}

function preflightFactory(receipt, decisionKinds, calls, failSlotId = null) {
  const bySlot = new Map(receipt.slots.map((entry, index) => [entry.slotId, { entry, index }]));
  return async ({ frameReviewRequestPath }) => {
    const fixture = [...bySlot.values()].find(
      ({ entry }) => entry.frameReviewRequestPath === frameReviewRequestPath,
    );
    assert.ok(fixture);
    const { entry, index } = fixture;
    calls.push(entry.slotId);
    if (entry.slotId === failSlotId) {
      const error = new Error(`fixture review preflight failure for ${failSlotId}`);
      error.code = 'FIXTURE_REVIEW_PREFLIGHT_FAILURE';
      throw error;
    }
    const decision = decisionKinds[index];
    const status =
      decision === 'approve-final-frame'
        ? 'final-frame-admitted'
        : decision === 'repair-frame'
          ? 'frame-repair-required'
          : 'frame-rejected';
    const approved = status === 'final-frame-admitted';
    return Object.freeze({
      status: 'frame-review-preflight-ready',
      frameId: entry.slotId,
      decision,
      reviewer: Object.freeze({
        actorClass: 'human',
        actorId: `fixture-human-${index + 1}`,
        occurredAt: '2026-08-19T00:40:00.000Z',
        evidenceSha256: digest(hashChars[index]),
      }),
      decisionFileSha256: digest(hashChars[(index + 1) % 6]),
      decisionSha256: digest(hashChars[(index + 2) % 6]),
      frameFinisherSha256: entry.frameFinisherSha256,
      reviewRequestSha256: entry.reviewRequestSha256,
      finishedFrameSha256: entry.finishedFrameSha256,
      expectedOutcome: Object.freeze({
        status,
        reviewOutcomeSha256: digest(hashChars[(index + 3) % 6]),
        finalFrameSha256: approved ? entry.finishedFrameSha256 : null,
        dependentInbetweenEndpointAllowed: approved,
        sequenceDraftUseAllowed: approved,
        sequenceReleaseAllowed: false,
        runtimeActivationAllowed: false,
      }),
      outcomePath: Object.freeze({
        relative: `top-hat/${entry.slotId}.frame-review-outcome.json`,
        absolute: path.join(
          path.dirname(entry.finishedFramePath),
          `${entry.slotId}.frame-review-outcome.json`,
        ),
      }),
    });
  };
}

function persistFactory(receipt, decisionKinds, calls, options = {}) {
  const byRequest = new Map(
    receipt.slots.map((entry, index) => [entry.frameReviewRequestPath, { entry, index }]),
  );
  return async ({ frameReviewRequestPath }) => {
    const fixture = byRequest.get(frameReviewRequestPath);
    assert.ok(fixture);
    const { entry, index } = fixture;
    calls.push(entry.slotId);
    if (entry.slotId === options.failSlotId) {
      const error = new Error(`fixture persistence failure for ${entry.slotId}`);
      error.code = 'FIXTURE_REVIEW_PERSISTENCE_FAILURE';
      throw error;
    }
    const decision = decisionKinds[index];
    const status =
      decision === 'approve-final-frame'
        ? 'final-frame-admitted'
        : decision === 'repair-frame'
          ? 'frame-repair-required'
          : 'frame-rejected';
    const approved = status === 'final-frame-admitted';
    const reviewOutcomeSha256 =
      index === options.driftIndex
        ? digest('f')
        : digest(hashChars[(index + 3) % 6]);
    return Object.freeze({
      status,
      reused: false,
      outcomePath: path.join(
        path.dirname(entry.finishedFramePath),
        `${entry.slotId}.frame-review-outcome.json`,
      ),
      outcome: Object.freeze({
        frameId: entry.slotId,
        reviewOutcomeSha256,
        reviewDecisionSha256: digest(hashChars[(index + 2) % 6]),
        reviewer: Object.freeze({ actorClass: 'human' }),
        finalFrameSha256: approved ? entry.finishedFrameSha256 : null,
        dependentInbetweenEndpointAllowed: approved,
        sequenceDraftUseAllowed: approved,
        sequenceReleaseAllowed: false,
        runtimeActivationAllowed: false,
        authority: Object.freeze({
          candidatePromotion: false,
          sequenceRelease: false,
          publication: false,
          runtimeActivation: false,
        }),
      }),
    });
  };
}

async function withWorkspace(callback) {
  const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), 'top-hat-review-intake-'));
  try {
    return await callback(workspaceRoot);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
}

test('all six genuine human approvals are preserved and only then expose candidate admission as next stage', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const receipt = finishingReceipt(workspaceRoot);
    const humanDecisions = decisions(workspaceRoot);
    const kinds = TOP_HAT_RUNTIME_EXPECTED_SLOTS.map(() => 'approve-final-frame');
    const preflightCalls = [];
    const persistCalls = [];
    const input = {
      finishingCampaignReceipt: receipt,
      reviewDecisions: humanDecisions,
      workspaceRoot,
      reviewedAt: '2026-08-19T00:45:00.000Z',
      preflightReview: preflightFactory(receipt, kinds, preflightCalls),
    };
    const plan = await compileTopHatPoseBankFrameReviewIntakePlan(input);
    assert.equal(
      parseTopHatPoseBankFrameReviewIntakePlan(plan).reviewIntakePlanSha256,
      plan.reviewIntakePlanSha256,
    );
    assert.deepEqual(preflightCalls, TOP_HAT_RUNTIME_EXPECTED_SLOTS);
    assert.equal(plan.policy.automaticDecisionCreationAllowed, false);
    assert.equal(plan.policy.automaticCandidateAdmissionAllowed, false);
    assert.equal(plan.authority.humanDecisionCreation, false);
    assert.equal(plan.authority.humanDecisionVerification, true);

    preflightCalls.length = 0;
    const result = await runTopHatPoseBankFrameReviewIntakeCampaign({
      ...input,
      persistReview: persistFactory(receipt, kinds, persistCalls),
    });
    assert.deepEqual(preflightCalls, TOP_HAT_RUNTIME_EXPECTED_SLOTS);
    assert.deepEqual(persistCalls, TOP_HAT_RUNTIME_EXPECTED_SLOTS);
    assert.equal(result.receipt.status, 'succeeded-all-six-human-approved');
    assert.equal(result.receipt.counts.approved, 6);
    assert.equal(result.receipt.counts.humanDecisionsCreatedByAutomation, 0);
    assert.equal(result.receipt.counts.candidateAdmissionsCreated, 0);
    assert.equal(result.receipt.allSixHumanApproved, true);
    assert.equal(result.receipt.nextRequiredStage, 'six-slot-candidate-admission-preflight');
    assert.equal(result.receipt.effects.candidateAdmissionsCreated, 0);
    assert.equal(result.receipt.authority.candidateAdmission, false);
    assert.equal(
      parseTopHatPoseBankFrameReviewIntakeReceipt(result.receipt)
        .reviewIntakeExecutionSha256,
      result.receipt.reviewIntakeExecutionSha256,
    );
  });
});

test('mixed human approve repair and reject decisions are recorded faithfully and block candidate admission', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const receipt = finishingReceipt(workspaceRoot);
    const kinds = [
      'approve-final-frame',
      'repair-frame',
      'reject-frame',
      'approve-final-frame',
      'repair-frame',
      'approve-final-frame',
    ];
    const result = await runTopHatPoseBankFrameReviewIntakeCampaign({
      finishingCampaignReceipt: receipt,
      reviewDecisions: decisions(workspaceRoot),
      workspaceRoot,
      reviewedAt: '2026-08-19T00:45:00.000Z',
      preflightReview: preflightFactory(receipt, kinds, []),
      persistReview: persistFactory(receipt, kinds, []),
    });
    assert.equal(
      result.receipt.status,
      'succeeded-human-review-recorded-repair-or-rejection-present',
    );
    assert.equal(result.receipt.counts.approved, 3);
    assert.equal(result.receipt.counts.repair, 2);
    assert.equal(result.receipt.counts.rejected, 1);
    assert.equal(result.receipt.allSixHumanApproved, false);
    assert.equal(
      result.receipt.nextRequiredStage,
      'repair-or-replacement-required-before-candidate-admission',
    );
    assert.equal(result.receipt.effects.candidateAdmissionsCreated, 0);
  });
});

test('a later invalid human decision prevents every persistent review outcome', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const receipt = finishingReceipt(workspaceRoot);
    const kinds = TOP_HAT_RUNTIME_EXPECTED_SLOTS.map(() => 'approve-final-frame');
    const preflightCalls = [];
    const persistCalls = [];
    const failedSlot = TOP_HAT_RUNTIME_EXPECTED_SLOTS[4];
    await assert.rejects(
      runTopHatPoseBankFrameReviewIntakeCampaign({
        finishingCampaignReceipt: receipt,
        reviewDecisions: decisions(workspaceRoot),
        workspaceRoot,
        reviewedAt: '2026-08-19T00:45:00.000Z',
        preflightReview: preflightFactory(receipt, kinds, preflightCalls, failedSlot),
        persistReview: persistFactory(receipt, kinds, persistCalls),
      }),
      (error) => error?.code === 'FIXTURE_REVIEW_PREFLIGHT_FAILURE',
    );
    assert.deepEqual(preflightCalls, TOP_HAT_RUNTIME_EXPECTED_SLOTS.slice(0, 5));
    assert.deepEqual(persistCalls, []);
  });
});

test('a real outcome that drifts from shadow review evidence stops later persistence', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const receipt = finishingReceipt(workspaceRoot);
    const kinds = TOP_HAT_RUNTIME_EXPECTED_SLOTS.map(() => 'approve-final-frame');
    const persistCalls = [];
    const result = await runTopHatPoseBankFrameReviewIntakeCampaign({
      finishingCampaignReceipt: receipt,
      reviewDecisions: decisions(workspaceRoot),
      workspaceRoot,
      reviewedAt: '2026-08-19T00:45:00.000Z',
      preflightReview: preflightFactory(receipt, kinds, []),
      persistReview: persistFactory(receipt, kinds, persistCalls, { driftIndex: 1 }),
    });
    assert.equal(result.receipt.status, 'failed');
    assert.equal(result.receipt.failure.slotId, TOP_HAT_RUNTIME_EXPECTED_SLOTS[1]);
    assert.equal(
      result.receipt.failure.code,
      'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_RESULT_INVALID',
    );
    assert.deepEqual(persistCalls, TOP_HAT_RUNTIME_EXPECTED_SLOTS.slice(0, 2));
    assert.equal(result.receipt.effects.candidateAdmissionsCreated, 0);
  });
});

test('receipt parser rejects a self-hashed truncated all-approved success', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const receipt = finishingReceipt(workspaceRoot);
    const kinds = TOP_HAT_RUNTIME_EXPECTED_SLOTS.map(() => 'approve-final-frame');
    const result = await runTopHatPoseBankFrameReviewIntakeCampaign({
      finishingCampaignReceipt: receipt,
      reviewDecisions: decisions(workspaceRoot),
      workspaceRoot,
      reviewedAt: '2026-08-19T00:45:00.000Z',
      preflightReview: preflightFactory(receipt, kinds, []),
      persistReview: persistFactory(receipt, kinds, []),
    });
    const body = { ...result.receipt, slots: result.receipt.slots.slice(0, 5) };
    delete body.reviewIntakeExecutionSha256;
    body.counts = {
      ...body.counts,
      attemptedSlots: 5,
      persistedOutcomes: 5,
      remainingSlots: 1,
      approved: 5,
    };
    body.effects = { ...body.effects, reviewOutcomesPersisted: 5 };
    const forged = {
      ...body,
      reviewIntakeExecutionSha256: sha256Document(body),
    };
    assert.throws(
      () => parseTopHatPoseBankFrameReviewIntakeReceipt(forged),
      (error) =>
        error?.code === 'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_SUCCESS_INVALID',
    );
  });
});

test('campaign source cannot create human decisions or invoke Top Hat candidate admission', () => {
  const sourcePath = fileURLToPath(
    new URL(
      './project-art/top-hat-pose-bank-frame-review-intake-campaign.mjs',
      import.meta.url,
    ),
  );
  const source = readFileSync(sourcePath, 'utf8');
  for (const forbidden of [
    'writeProjectArtTopHatPoseSlotCandidateAdmission',
    'admitProjectArtTopHatPoseSlotCandidate',
    'humanDecisionCreation: true',
    'creativeReviewByAutomation: true',
    'candidateAdmission: true',
    'candidatePromotion: true',
    'sequenceRelease: true',
    'publication: true',
    'runtimeActivation: true',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

console.log('Project Art Top Hat six-slot named-human review intake regressions passed.');
