#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  parseTopHatPoseBankCandidateMaterializationCampaignReceipt,
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

function campaignAuthority() {
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

function slotRecord(slotId, index) {
  const root = path.resolve('/tmp', 'top-hat-receipt-fixture', slotId);
  return Object.freeze({
    slotId,
    status: 'materialized-awaiting-frame-finisher',
    materializationId: `fixture:${slotId}`,
    materializationSha256: digest(String((index % 9) + 1)),
    finisherRequestSha256: digest(String(((index + 1) % 9) + 1)),
    candidatePath: `${root}.png`,
    materializationReceiptPath: `${root}.materialization.json`,
    finisherRequestPath: `${root}.finisher-request.json`,
  });
}

function receiptBody({ slotCount, status, failure }) {
  const slots = TOP_HAT_RUNTIME_EXPECTED_SLOTS.slice(0, slotCount).map(slotRecord);
  return {
    schema:
      TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_CAMPAIGN_RECEIPT_SCHEMA,
    protocolVersion:
      TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_CAMPAIGN_PROTOCOL_VERSION,
    status,
    completedAt: '2026-08-19T00:20:00.000Z',
    campaignPlanSha256: digest('a'),
    sourceAdapterSha256: digest('b'),
    slots,
    counts: Object.freeze({
      plannedSlots: TOP_HAT_RUNTIME_EXPECTED_SLOTS.length,
      attemptedSlots:
        status === 'failed' ? slotCount + 1 : TOP_HAT_RUNTIME_EXPECTED_SLOTS.length,
      materializedSlots: slotCount,
      remainingSlots: TOP_HAT_RUNTIME_EXPECTED_SLOTS.length - slotCount,
      humanReviewsCreated: 0,
      candidateAdmissionsCreated: 0,
    }),
    failure,
    nextRequiredStage:
      'deterministic-frame-finishing-then-named-human-review',
    effects: Object.freeze({
      candidateBundlesMaterialized: slotCount,
      frameFinisherRequestsCreated: slotCount,
      humanReviewsCreated: 0,
      candidateAdmissionsCreated: 0,
      poseSlotsFilled: 0,
      releasesCreated: 0,
      providerCallsPerformed: 0,
    }),
    authority: campaignAuthority(),
  };
}

function selfHash(body) {
  return Object.freeze({
    ...body,
    campaignExecutionSha256: sha256Document(body),
  });
}

test('accepts only a complete six-slot success receipt', () => {
  const receipt = selfHash(
    receiptBody({
      slotCount: TOP_HAT_RUNTIME_EXPECTED_SLOTS.length,
      status: 'succeeded-awaiting-frame-finishing-and-human-review',
      failure: null,
    }),
  );
  assert.equal(
    parseTopHatPoseBankCandidateMaterializationCampaignReceipt(receipt)
      .campaignExecutionSha256,
    receipt.campaignExecutionSha256,
  );
});

test('rejects a self-hashed success receipt with fewer than six slots', () => {
  const receipt = selfHash(
    receiptBody({
      slotCount: TOP_HAT_RUNTIME_EXPECTED_SLOTS.length - 1,
      status: 'succeeded-awaiting-frame-finishing-and-human-review',
      failure: null,
    }),
  );
  assert.throws(
    () => parseTopHatPoseBankCandidateMaterializationCampaignReceipt(receipt),
    (error) =>
      error?.code ===
      'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_RECEIPT_SUCCESS_INVALID',
  );
});

test('rejects a failed receipt that points at the wrong failed slot', () => {
  const slotCount = 2;
  const receipt = selfHash(
    receiptBody({
      slotCount,
      status: 'failed',
      failure: Object.freeze({
        slotId: TOP_HAT_RUNTIME_EXPECTED_SLOTS[slotCount + 1],
        code: 'FIXTURE_FAILURE',
        message: 'fixture failure',
      }),
    }),
  );
  assert.throws(
    () => parseTopHatPoseBankCandidateMaterializationCampaignReceipt(receipt),
    (error) =>
      error?.code ===
      'TOP_HAT_POSE_BANK_CANDIDATE_MATERIALIZATION_RECEIPT_FAILURE_INVALID',
  );
});

console.log(
  'Project Art Top Hat candidate materialization receipt regressions passed.',
);
