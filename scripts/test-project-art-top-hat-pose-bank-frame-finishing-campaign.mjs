#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  compileTopHatPoseBankFrameFinishingCampaignPlan,
  parseTopHatPoseBankFrameFinishingCampaignPlan,
  parseTopHatPoseBankFrameFinishingCampaignReceipt,
  runTopHatPoseBankFrameFinishingCampaign,
} from './project-art/top-hat-pose-bank-frame-finishing-campaign.mjs';
import {
  TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_CAMPAIGN_PROTOCOL_VERSION,
  TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_CAMPAIGN_RECEIPT_SCHEMA,
} from './project-art/top-hat-pose-bank-candidate-materialization-campaign.mjs';
import {
  TOP_HAT_RUNTIME_EXPECTED_SLOTS,
} from './project-art/top-hat-pose-slot-provider-runtime-foundation.mjs';
import {
  sha256Document,
} from './project-art/avatar-final-pass-provider-runtime-common.mjs';

const digest = (character) => character.repeat(64);
const hashCharacters = ['1', '2', '3', '4', '5', '6'];

function materializationAuthority() {
  return Object.freeze({
    providerExecution: false,
    candidateMaterialization: true,
    deterministicQa: false,
    creativeReview: false,
    candidateApproval: false,
    candidatePromotion: false,
    poseSlotFilling: false,
    sequenceRelease: false,
    targetRepositoryMutation: false,
    gitMutation: false,
    deployment: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  });
}

function materializationReceipt(workspaceRoot) {
  const slots = TOP_HAT_RUNTIME_EXPECTED_SLOTS.map((slotId, index) => {
    const stem = path.join(workspaceRoot, 'top-hat', slotId);
    return Object.freeze({
      slotId,
      status: 'materialized-awaiting-frame-finisher',
      materializationId: `fixture-materialization:${slotId}`,
      materializationSha256: digest(hashCharacters[index]),
      finisherRequestSha256: digest(hashCharacters[(index + 1) % 6]),
      candidatePath: `${stem}.png`,
      materializationReceiptPath: `${stem}.materialization.json`,
      finisherRequestPath: `${stem}.finisher-request.json`,
    });
  });
  const body = {
    schema:
      TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_CAMPAIGN_RECEIPT_SCHEMA,
    protocolVersion:
      TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_CAMPAIGN_PROTOCOL_VERSION,
    status: 'succeeded-awaiting-frame-finishing-and-human-review',
    completedAt: '2026-08-19T00:20:00.000Z',
    campaignPlanSha256: digest('a'),
    sourceAdapterSha256: digest('b'),
    slots: Object.freeze(slots),
    counts: Object.freeze({
      plannedSlots: 6,
      attemptedSlots: 6,
      materializedSlots: 6,
      remainingSlots: 0,
      humanReviewsCreated: 0,
      candidateAdmissionsCreated: 0,
    }),
    failure: null,
    nextRequiredStage:
      'deterministic-frame-finishing-then-named-human-review',
    effects: Object.freeze({
      candidateBundlesMaterialized: 6,
      frameFinisherRequestsCreated: 6,
      humanReviewsCreated: 0,
      candidateAdmissionsCreated: 0,
      poseSlotsFilled: 0,
      releasesCreated: 0,
      providerCallsPerformed: 0,
    }),
    authority: materializationAuthority(),
  };
  return Object.freeze({
    ...body,
    campaignExecutionSha256: sha256Document(body),
  });
}

function fixturePreflight(entry, workspaceRoot, index) {
  const relative = path.relative(workspaceRoot, entry.candidatePath).split(path.sep).join('/');
  const stem = relative.slice(0, -4);
  const absolute = Object.freeze({
    finished: path.join(workspaceRoot, ...`${stem}.finished.png`.split('/')),
    report: path.join(workspaceRoot, ...`${stem}.frame-finisher.json`.split('/')),
    reviewRequest: path.join(
      workspaceRoot,
      ...`${stem}.frame-review-request.json`.split('/'),
    ),
    reviewOutcome: path.join(
      workspaceRoot,
      ...`${stem}.frame-review-outcome.json`.split('/'),
    ),
  });
  return Object.freeze({
    status: 'frame-finisher-preflight-ready',
    frameId: entry.slotId,
    characterId: 'top-hat',
    materializationSha256: entry.materializationSha256,
    finisherRequestSha256: entry.finisherRequestSha256,
    sourceCandidate: Object.freeze({
      path: relative,
      sha256: digest(hashCharacters[index]),
      bytes: 100 + index,
    }),
    expectedFinishedFrame: Object.freeze({
      path: `${stem}.finished.png`,
      sha256: digest(hashCharacters[(index + 2) % 6]),
      bytes: 200 + index,
      width: 1024,
      height: 1536,
      visibleBounds: Object.freeze({ x: 100, y: 100, width: 800, height: 1300 }),
      visiblePixelSha256: digest(hashCharacters[(index + 3) % 6]),
      alphaSha256: digest(hashCharacters[(index + 4) % 6]),
    }),
    expectedFrameFinisherSha256: digest(hashCharacters[(index + 4) % 6]),
    expectedReviewRequestSha256: digest(hashCharacters[(index + 5) % 6]),
    outputs: Object.freeze({
      relative: Object.freeze({
        finished: `${stem}.finished.png`,
        report: `${stem}.frame-finisher.json`,
        reviewRequest: `${stem}.frame-review-request.json`,
        reviewOutcome: `${stem}.frame-review-outcome.json`,
      }),
      absolute,
    }),
  });
}

function preflightFactory(receipt, calls, failSlotId = null) {
  const byRequest = new Map(
    receipt.slots.map((entry, index) => [entry.finisherRequestPath, { entry, index }]),
  );
  return async ({ workspaceRoot, finisherRequestPath }) => {
    const fixture = byRequest.get(finisherRequestPath);
    assert.ok(fixture);
    calls.push(fixture.entry.slotId);
    if (fixture.entry.slotId === failSlotId) {
      const error = new Error(`fixture preflight failure for ${failSlotId}`);
      error.code = 'FIXTURE_PREFLIGHT_FAILURE';
      throw error;
    }
    return fixturePreflight(fixture.entry, workspaceRoot, fixture.index);
  };
}

function finishFactory(receipt, workspaceRoot, calls, failSlotId = null) {
  const byRequest = new Map(
    receipt.slots.map((entry, index) => [entry.finisherRequestPath, { entry, index }]),
  );
  return async ({ finisherRequestPath }) => {
    const fixture = byRequest.get(finisherRequestPath);
    assert.ok(fixture);
    const { entry, index } = fixture;
    calls.push(entry.slotId);
    if (entry.slotId === failSlotId) {
      const error = new Error(`fixture finish failure for ${failSlotId}`);
      error.code = 'FIXTURE_FINISH_FAILURE';
      throw error;
    }
    const preflight = fixturePreflight(entry, workspaceRoot, index);
    return Object.freeze({
      status: 'frame-finished-awaiting-human-review',
      reused: false,
      finishedFramePath: preflight.outputs.absolute.finished,
      reportPath: preflight.outputs.absolute.report,
      reviewRequestPath: preflight.outputs.absolute.reviewRequest,
      report: Object.freeze({
        frameId: entry.slotId,
        source: Object.freeze({
          materializationSha256: entry.materializationSha256,
          finisherRequestSha256: entry.finisherRequestSha256,
        }),
        output: Object.freeze({
          sha256: preflight.expectedFinishedFrame.sha256,
          visiblePixelSha256:
            preflight.expectedFinishedFrame.visiblePixelSha256,
          alphaSha256: preflight.expectedFinishedFrame.alphaSha256,
          approvalState: 'unapproved',
        }),
        frameFinisherSha256: preflight.expectedFrameFinisherSha256,
        preservation: Object.freeze({
          visiblePixelsUnchanged: true,
          alphaUnchanged: true,
          canvasUnchanged: true,
          visibleBoundsUnchanged: true,
        }),
        authority: Object.freeze({
          creativeReview: false,
          candidateApproval: false,
          candidatePromotion: false,
          publication: false,
          runtimeActivation: false,
        }),
      }),
      reviewRequest: Object.freeze({
        reviewRequestSha256: preflight.expectedReviewRequestSha256,
        sequenceReleaseAllowed: false,
        runtimeActivationAllowed: false,
      }),
    });
  };
}

async function withWorkspace(callback) {
  const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), 'top-hat-frame-finishing-'));
  try {
    return await callback(workspaceRoot);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
}

test('shadow-preflights all six before deterministic finishing and reproduces exact hashes', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const receipt = materializationReceipt(workspaceRoot);
    const preflightCalls = [];
    const finishCalls = [];
    const input = {
      materializationCampaignReceipt: receipt,
      workspaceRoot,
      finishedAt: '2026-08-19T00:30:00.000Z',
      preflightFrame: preflightFactory(receipt, preflightCalls),
    };
    const plan = await compileTopHatPoseBankFrameFinishingCampaignPlan(input);
    assert.equal(
      parseTopHatPoseBankFrameFinishingCampaignPlan(plan).campaignPlanSha256,
      plan.campaignPlanSha256,
    );
    assert.deepEqual(preflightCalls, TOP_HAT_RUNTIME_EXPECTED_SLOTS);
    assert.equal(plan.policy.shadowPreflightAllSlotsBeforeFirstWrite, true);
    assert.equal(plan.policy.exactPreflightHashReproductionRequired, true);
    assert.equal(plan.authority.deterministicPixelFinishing, true);
    assert.equal(plan.authority.creativeReview, false);

    preflightCalls.length = 0;
    const result = await runTopHatPoseBankFrameFinishingCampaign({
      ...input,
      finishFrame: finishFactory(receipt, workspaceRoot, finishCalls),
    });
    assert.deepEqual(preflightCalls, TOP_HAT_RUNTIME_EXPECTED_SLOTS);
    assert.deepEqual(finishCalls, TOP_HAT_RUNTIME_EXPECTED_SLOTS);
    assert.equal(result.receipt.status, 'succeeded-awaiting-named-human-review');
    assert.equal(result.receipt.counts.finishedSlots, 6);
    assert.equal(result.receipt.effects.reviewRequestsCreated, 6);
    assert.equal(result.receipt.effects.humanReviewsCreated, 0);
    assert.equal(result.receipt.effects.candidateAdmissionsCreated, 0);
    assert.equal(result.receipt.effects.providerCallsPerformed, 0);
    assert.equal(result.receipt.authority.creativeReview, false);
    assert.equal(result.receipt.authority.sequenceRelease, false);
    assert.equal(result.receipt.authority.runtimeActivation, false);
    assert.equal(
      parseTopHatPoseBankFrameFinishingCampaignReceipt(result.receipt)
        .campaignExecutionSha256,
      result.receipt.campaignExecutionSha256,
    );
  });
});

test('a later-slot preflight failure prevents every real finish', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const receipt = materializationReceipt(workspaceRoot);
    const preflightCalls = [];
    const finishCalls = [];
    const failedSlot = TOP_HAT_RUNTIME_EXPECTED_SLOTS[3];
    await assert.rejects(
      runTopHatPoseBankFrameFinishingCampaign({
        materializationCampaignReceipt: receipt,
        workspaceRoot,
        finishedAt: '2026-08-19T00:30:00.000Z',
        preflightFrame: preflightFactory(receipt, preflightCalls, failedSlot),
        finishFrame: finishFactory(receipt, workspaceRoot, finishCalls),
      }),
      (error) => error?.code === 'FIXTURE_PREFLIGHT_FAILURE',
    );
    assert.deepEqual(
      preflightCalls,
      TOP_HAT_RUNTIME_EXPECTED_SLOTS.slice(0, 4),
    );
    assert.deepEqual(finishCalls, []);
  });
});

test('stops on the first real finish failure and never touches later slots', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const receipt = materializationReceipt(workspaceRoot);
    const preflightCalls = [];
    const finishCalls = [];
    const failedSlot = TOP_HAT_RUNTIME_EXPECTED_SLOTS[2];
    const result = await runTopHatPoseBankFrameFinishingCampaign({
      materializationCampaignReceipt: receipt,
      workspaceRoot,
      finishedAt: '2026-08-19T00:30:00.000Z',
      preflightFrame: preflightFactory(receipt, preflightCalls),
      finishFrame: finishFactory(receipt, workspaceRoot, finishCalls, failedSlot),
    });
    assert.deepEqual(preflightCalls, TOP_HAT_RUNTIME_EXPECTED_SLOTS);
    assert.deepEqual(finishCalls, TOP_HAT_RUNTIME_EXPECTED_SLOTS.slice(0, 3));
    assert.equal(result.receipt.status, 'failed');
    assert.equal(result.receipt.failure.slotId, failedSlot);
    assert.equal(result.receipt.counts.finishedSlots, 2);
    assert.equal(result.receipt.counts.attemptedSlots, 3);
    assert.equal(result.receipt.effects.humanReviewsCreated, 0);
  });
});

test('rejects a finish that does not reproduce the shadow-preflight hash contract', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const receipt = materializationReceipt(workspaceRoot);
    const preflightCalls = [];
    const finishCalls = [];
    const ordinaryFinish = finishFactory(receipt, workspaceRoot, finishCalls);
    let index = 0;
    const result = await runTopHatPoseBankFrameFinishingCampaign({
      materializationCampaignReceipt: receipt,
      workspaceRoot,
      finishedAt: '2026-08-19T00:30:00.000Z',
      preflightFrame: preflightFactory(receipt, preflightCalls),
      finishFrame: async (input) => {
        const value = await ordinaryFinish(input);
        const current = index++;
        if (current !== 1) return value;
        return {
          ...value,
          report: {
            ...value.report,
            output: {
              ...value.report.output,
              sha256: digest('f'),
            },
          },
        };
      },
    });
    assert.equal(result.receipt.status, 'failed');
    assert.equal(result.receipt.failure.slotId, TOP_HAT_RUNTIME_EXPECTED_SLOTS[1]);
    assert.equal(
      result.receipt.failure.code,
      'TOP_HAT_POSE_BANK_FRAME_FINISHING_RESULT_INVALID',
    );
    assert.deepEqual(finishCalls, TOP_HAT_RUNTIME_EXPECTED_SLOTS.slice(0, 2));
  });
});

test('receipt parser rejects a self-hashed truncated success', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const receipt = materializationReceipt(workspaceRoot);
    const preflightCalls = [];
    const finishCalls = [];
    const result = await runTopHatPoseBankFrameFinishingCampaign({
      materializationCampaignReceipt: receipt,
      workspaceRoot,
      finishedAt: '2026-08-19T00:30:00.000Z',
      preflightFrame: preflightFactory(receipt, preflightCalls),
      finishFrame: finishFactory(receipt, workspaceRoot, finishCalls),
    });
    const body = { ...result.receipt, slots: result.receipt.slots.slice(0, 5) };
    delete body.campaignExecutionSha256;
    body.counts = {
      ...body.counts,
      attemptedSlots: 5,
      finishedSlots: 5,
      remainingSlots: 1,
    };
    body.effects = {
      ...body.effects,
      framesFinished: 5,
      finisherReportsCreated: 5,
      reviewRequestsCreated: 5,
    };
    const forged = {
      ...body,
      campaignExecutionSha256: sha256Document(body),
    };
    assert.throws(
      () => parseTopHatPoseBankFrameFinishingCampaignReceipt(forged),
      (error) =>
        error?.code === 'TOP_HAT_POSE_BANK_FRAME_FINISHING_RECEIPT_SUCCESS_INVALID',
    );
  });
});

test('campaign source exposes no human-review or candidate-admission execution path', () => {
  const sourcePath = fileURLToPath(
    new URL('./project-art/top-hat-pose-bank-frame-finishing-campaign.mjs', import.meta.url),
  );
  const source = readFileSync(sourcePath, 'utf8');
  for (const forbidden of [
    'processAvatarFinalPassProviderFrameReviewFiles',
    'admitProjectArtTopHatPoseSlotCandidate',
    'creativeReview: true',
    'candidateApproval: true',
    'candidatePromotion: true',
    'sequenceRelease: true',
    'publication: true',
    'runtimeActivation: true',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

console.log('Project Art Top Hat six-slot frame-finishing campaign regressions passed.');
