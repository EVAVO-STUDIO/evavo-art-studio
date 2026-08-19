import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';

import {
  reviewAvatarFinalPassProviderFrameFilesPinned,
} from './avatar-final-pass-provider-frame-review-pinned.mjs';
import {
  preflightAvatarFinalPassProviderFrameReviewFiles,
} from './avatar-final-pass-provider-frame-review-preflight.mjs';
import {
  parseTopHatPoseBankFrameFinishingCampaignReceipt,
} from './top-hat-pose-bank-frame-finishing-campaign.mjs';
import {
  TOP_HAT_RUNTIME_EXPECTED_SLOTS,
} from './top-hat-pose-slot-provider-runtime-foundation.mjs';
import {
  assert,
  deepFreeze,
  digest,
  isRecord,
  sha256Document,
  timestamp,
  verifySelfHash,
} from './avatar-final-pass-provider-runtime-common.mjs';

export const TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_PLAN_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-frame-review-intake-plan.v1';
export const TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_RECEIPT_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-frame-review-intake-receipt.v1';
export const TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_PROTOCOL_VERSION =
  '2026-08-19.1';

const AUTHORITY_KEYS = Object.freeze([
  'sourceRead',
  'humanDecisionCreation',
  'humanDecisionVerification',
  'reviewOutcomePersistence',
  'creativeReviewByAutomation',
  'candidateAdmission',
  'candidatePromotion',
  'dependentInbetweenGeneration',
  'poseSlotFilling',
  'sequenceAdmission',
  'sequenceRelease',
  'targetRepositoryMutation',
  'gitMutation',
  'deployment',
  'publication',
  'runtimeActivation',
  'forcePush',
]);

function authority() {
  return Object.freeze({
    sourceRead: true,
    humanDecisionCreation: false,
    humanDecisionVerification: true,
    reviewOutcomePersistence: true,
    creativeReviewByAutomation: false,
    candidateAdmission: false,
    candidatePromotion: false,
    dependentInbetweenGeneration: false,
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

function realDirectory(value, label) {
  assert(
    typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0'),
    'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_ROOT_INVALID',
    `${label} must be an absolute path.`,
  );
  const normalized = path.normalize(value);
  const metadata = lstatSync(normalized);
  assert(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      realpathSync(normalized) === normalized,
    'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_ROOT_INVALID',
    `${label} must be a real ordinary directory.`,
  );
  return normalized;
}

function exactDecisionInputs(inputs) {
  assert(
    Array.isArray(inputs) &&
      inputs.length === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      inputs.every(
        (entry, index) =>
          isRecord(entry) &&
          entry.slotId === TOP_HAT_RUNTIME_EXPECTED_SLOTS[index] &&
          typeof entry.decisionPath === 'string' &&
          path.isAbsolute(entry.decisionPath) &&
          path.normalize(entry.decisionPath) === entry.decisionPath,
      ),
    'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_DECISIONS_INVALID',
    'Review intake requires exactly six canonical slot decision paths in canonical order.',
  );
}

function exactFinishingSuccess(receiptInput) {
  const receipt = parseTopHatPoseBankFrameFinishingCampaignReceipt(receiptInput);
  assert(
    receipt.status === 'succeeded-awaiting-named-human-review' &&
      receipt.counts?.plannedSlots === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      receipt.counts?.finishedSlots === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      receipt.counts?.remainingSlots === 0 &&
      receipt.failure === null &&
      receipt.effects?.framesFinished === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      receipt.effects?.reviewRequestsCreated === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      receipt.effects?.humanReviewsCreated === 0 &&
      receipt.effects?.candidateAdmissionsCreated === 0,
    'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_FINISHING_INCOMPLETE',
  );
  return receipt;
}

function validatePreflight(entry, decisionInput, preflight) {
  assert(
    isRecord(preflight) &&
      preflight.status === 'frame-review-preflight-ready' &&
      preflight.frameId === entry.slotId &&
      preflight.frameFinisherSha256 === entry.frameFinisherSha256 &&
      preflight.reviewRequestSha256 === entry.reviewRequestSha256 &&
      preflight.finishedFrameSha256 === entry.finishedFrameSha256 &&
      preflight.reviewer?.actorClass === 'human' &&
      typeof preflight.reviewer?.actorId === 'string' &&
      preflight.reviewer.actorId.length > 0 &&
      digest(preflight.reviewer.evidenceSha256, `${entry.slotId}.reviewerEvidenceSha256`) &&
      digest(preflight.decisionFileSha256, `${entry.slotId}.decisionFileSha256`) &&
      digest(preflight.decisionSha256, `${entry.slotId}.decisionSha256`) &&
      ['approve-final-frame', 'repair-frame', 'reject-frame'].includes(
        preflight.decision,
      ) &&
      isRecord(preflight.expectedOutcome) &&
      ['final-frame-admitted', 'frame-repair-required', 'frame-rejected'].includes(
        preflight.expectedOutcome.status,
      ) &&
      digest(
        preflight.expectedOutcome.reviewOutcomeSha256,
        `${entry.slotId}.reviewOutcomeSha256`,
      ) &&
      preflight.expectedOutcome.sequenceReleaseAllowed === false &&
      preflight.expectedOutcome.runtimeActivationAllowed === false &&
      preflight.outcomePath?.absolute &&
      path.isAbsolute(preflight.outcomePath.absolute) &&
      decisionInput.slotId === entry.slotId,
    'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_PREFLIGHT_INVALID',
  );
}

function validateRealOutcome(entry, preflight, result) {
  assert(
    isRecord(result) &&
      result.reused === false &&
      result.status === preflight.expectedOutcome.status &&
      result.outcome?.frameId === entry.slotId &&
      result.outcome?.reviewOutcomeSha256 ===
        preflight.expectedOutcome.reviewOutcomeSha256 &&
      result.outcome?.reviewDecisionSha256 === preflight.decisionSha256 &&
      result.outcome?.reviewer?.actorClass === 'human' &&
      result.outcome?.finalFrameSha256 ===
        preflight.expectedOutcome.finalFrameSha256 &&
      result.outcome?.dependentInbetweenEndpointAllowed ===
        preflight.expectedOutcome.dependentInbetweenEndpointAllowed &&
      result.outcome?.sequenceDraftUseAllowed ===
        preflight.expectedOutcome.sequenceDraftUseAllowed &&
      result.outcome?.sequenceReleaseAllowed === false &&
      result.outcome?.runtimeActivationAllowed === false &&
      result.outcome?.authority?.candidatePromotion === false &&
      result.outcome?.authority?.sequenceRelease === false &&
      result.outcome?.authority?.publication === false &&
      result.outcome?.authority?.runtimeActivation === false,
    'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_RESULT_INVALID',
  );
}

async function prepareCampaign({
  finishingCampaignReceipt: receiptInput,
  reviewDecisions,
  workspaceRoot: workspaceRootInput,
  reviewedAt: reviewedAtInput,
  preflightReview = preflightAvatarFinalPassProviderFrameReviewFiles,
}) {
  assert(
    typeof preflightReview === 'function',
    'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_PREFLIGHT_EXECUTOR_INVALID',
  );
  const receipt = exactFinishingSuccess(receiptInput);
  exactDecisionInputs(reviewDecisions);
  const workspaceRoot = realDirectory(workspaceRootInput, 'workspaceRoot');
  const reviewedAt = timestamp(
    reviewedAtInput ?? new Date().toISOString(),
    'reviewedAt',
  );
  const prepared = [];

  for (let index = 0; index < receipt.slots.length; index += 1) {
    const entry = receipt.slots[index];
    const decisionInput = reviewDecisions[index];
    assert(
      entry.slotId === TOP_HAT_RUNTIME_EXPECTED_SLOTS[index] &&
        typeof entry.frameFinisherReportPath === 'string' &&
        path.isAbsolute(entry.frameFinisherReportPath) &&
        typeof entry.frameReviewRequestPath === 'string' &&
        path.isAbsolute(entry.frameReviewRequestPath) &&
        typeof entry.finishedFramePath === 'string' &&
        path.isAbsolute(entry.finishedFramePath),
      'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_SLOT_INPUT_INVALID',
    );
    const preflight = await preflightReview({
      workspaceRoot,
      frameFinisherReportPath: entry.frameFinisherReportPath,
      frameReviewRequestPath: entry.frameReviewRequestPath,
      frameReviewDecisionPath: decisionInput.decisionPath,
      reviewedAt,
    });
    validatePreflight(entry, decisionInput, preflight);
    prepared.push(Object.freeze({ entry, decisionInput, preflight }));
  }

  const slots = prepared.map(({ entry, decisionInput, preflight }) =>
    Object.freeze({
      slotId: entry.slotId,
      frameFinisherSha256: entry.frameFinisherSha256,
      reviewRequestSha256: entry.reviewRequestSha256,
      finishedFrameSha256: entry.finishedFrameSha256,
      decisionPath: decisionInput.decisionPath,
      decisionFileSha256: preflight.decisionFileSha256,
      decisionSha256: preflight.decisionSha256,
      decision: preflight.decision,
      reviewer: preflight.reviewer,
      expectedOutcome: preflight.expectedOutcome,
      reviewOutcomePath: preflight.outcomePath.absolute,
    }),
  );
  const body = {
    schema: TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_PLAN_SCHEMA,
    protocolVersion: TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_PROTOCOL_VERSION,
    status: 'ready-to-persist-six-named-human-review-outcomes',
    reviewedAt,
    sourceFinishingCampaignSha256: receipt.campaignExecutionSha256,
    sourceFinishingPlanSha256: receipt.campaignPlanSha256,
    workspaceRoot,
    slots: Object.freeze(slots),
    policy: Object.freeze({
      exactSixCanonicalSlots: true,
      allSixShadowReviewedBeforeFirstPersistentOutcome: true,
      decisionsMustBeExternallyAuthoredNamedHumanEvidence: true,
      automaticDecisionCreationAllowed: false,
      exactDecisionFileShaPinnedAfterPreflight: true,
      exactShadowOutcomeHashReproductionRequired: true,
      mixedHumanDecisionsPreserved: true,
      sequentialPersistence: true,
      stopOnFirstFailure: true,
      createOnlyReviewOutcomes: true,
      automaticCandidateAdmissionAllowed: false,
      automaticPromotionAllowed: false,
      sequenceReleaseAllowed: false,
      runtimeActivationAllowed: false,
    }),
    effects: Object.freeze({
      humanDecisionsCreated: 0,
      reviewOutcomesPersisted: 0,
      candidateAdmissionsCreated: 0,
      poseSlotsFilled: 0,
      releasesCreated: 0,
    }),
    authority: authority(),
  };
  const plan = deepFreeze({
    ...body,
    reviewIntakePlanSha256: sha256Document(body),
  });
  return Object.freeze({ receipt, workspaceRoot, reviewedAt, prepared, plan });
}

export async function compileTopHatPoseBankFrameReviewIntakePlan(input) {
  return (await prepareCampaign(input)).plan;
}

export function parseTopHatPoseBankFrameReviewIntakePlan(input) {
  const plan = verifySelfHash(
    input,
    'reviewIntakePlanSha256',
    'Top Hat frame-review intake plan',
  );
  assert(
    plan.schema === TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_PLAN_SCHEMA &&
      plan.protocolVersion === TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_PROTOCOL_VERSION &&
      plan.status === 'ready-to-persist-six-named-human-review-outcomes' &&
      Array.isArray(plan.slots) &&
      plan.slots.length === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      plan.slots.every(
        (entry, index) =>
          isRecord(entry) &&
          entry.slotId === TOP_HAT_RUNTIME_EXPECTED_SLOTS[index] &&
          digest(entry.frameFinisherSha256, `${entry.slotId}.frameFinisherSha256`) &&
          digest(entry.reviewRequestSha256, `${entry.slotId}.reviewRequestSha256`) &&
          digest(entry.finishedFrameSha256, `${entry.slotId}.finishedFrameSha256`) &&
          digest(entry.decisionFileSha256, `${entry.slotId}.decisionFileSha256`) &&
          digest(entry.decisionSha256, `${entry.slotId}.decisionSha256`) &&
          entry.reviewer?.actorClass === 'human' &&
          digest(
            entry.expectedOutcome?.reviewOutcomeSha256,
            `${entry.slotId}.reviewOutcomeSha256`,
          ),
      ) &&
      plan.policy?.allSixShadowReviewedBeforeFirstPersistentOutcome === true &&
      plan.policy?.decisionsMustBeExternallyAuthoredNamedHumanEvidence === true &&
      plan.policy?.automaticDecisionCreationAllowed === false &&
      plan.policy?.exactDecisionFileShaPinnedAfterPreflight === true &&
      plan.policy?.exactShadowOutcomeHashReproductionRequired === true &&
      plan.policy?.mixedHumanDecisionsPreserved === true &&
      plan.policy?.stopOnFirstFailure === true &&
      plan.policy?.createOnlyReviewOutcomes === true &&
      plan.policy?.automaticCandidateAdmissionAllowed === false &&
      plan.policy?.automaticPromotionAllowed === false &&
      plan.policy?.sequenceReleaseAllowed === false &&
      plan.policy?.runtimeActivationAllowed === false &&
      isRecord(plan.effects) &&
      Object.values(plan.effects).every((value) => value === 0) &&
      plan.authority?.sourceRead === true &&
      plan.authority?.humanDecisionVerification === true &&
      plan.authority?.reviewOutcomePersistence === true &&
      AUTHORITY_KEYS.filter(
        (key) =>
          !['sourceRead', 'humanDecisionVerification', 'reviewOutcomePersistence'].includes(
            key,
          ),
      ).every((key) => plan.authority?.[key] === false),
    'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_PLAN_INVALID',
  );
  return plan;
}

export async function runTopHatPoseBankFrameReviewIntakeCampaign({
  persistReview = reviewAvatarFinalPassProviderFrameFilesPinned,
  ...input
}) {
  assert(
    typeof persistReview === 'function',
    'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_EXECUTOR_INVALID',
  );
  const preparedCampaign = await prepareCampaign(input);
  const slots = [];
  let failure = null;

  for (const { entry, decisionInput, preflight } of preparedCampaign.prepared) {
    try {
      const result = await persistReview({
        workspaceRoot: preparedCampaign.workspaceRoot,
        frameFinisherReportPath: entry.frameFinisherReportPath,
        frameReviewRequestPath: entry.frameReviewRequestPath,
        frameReviewDecisionPath: decisionInput.decisionPath,
        expectedDecisionFileSha256: preflight.decisionFileSha256,
        reviewedAt: preparedCampaign.reviewedAt,
      });
      validateRealOutcome(entry, preflight, result);
      slots.push(
        Object.freeze({
          slotId: entry.slotId,
          decision: preflight.decision,
          reviewerActorId: preflight.reviewer.actorId,
          decisionSha256: preflight.decisionSha256,
          reviewOutcomeSha256: result.outcome.reviewOutcomeSha256,
          status: result.outcome.status,
          finalFrameSha256: result.outcome.finalFrameSha256,
          dependentInbetweenEndpointAllowed:
            result.outcome.dependentInbetweenEndpointAllowed,
          sequenceDraftUseAllowed: result.outcome.sequenceDraftUseAllowed,
          reviewOutcomePath: result.outcomePath,
        }),
      );
    } catch (error) {
      failure = Object.freeze({
        slotId: entry.slotId,
        code:
          typeof error?.code === 'string'
            ? error.code
            : 'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_SLOT_FAILED',
        message: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }

  const approved = slots.filter((entry) => entry.status === 'final-frame-admitted').length;
  const repair = slots.filter((entry) => entry.status === 'frame-repair-required').length;
  const rejected = slots.filter((entry) => entry.status === 'frame-rejected').length;
  const complete = failure === null && slots.length === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length;
  const allApproved = complete && approved === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length;
  const body = {
    schema: TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_RECEIPT_SCHEMA,
    protocolVersion: TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_PROTOCOL_VERSION,
    status: complete
      ? allApproved
        ? 'succeeded-all-six-human-approved'
        : 'succeeded-human-review-recorded-repair-or-rejection-present'
      : 'failed',
    reviewedAt: preparedCampaign.reviewedAt,
    reviewIntakePlanSha256: preparedCampaign.plan.reviewIntakePlanSha256,
    sourceFinishingCampaignSha256:
      preparedCampaign.receipt.campaignExecutionSha256,
    slots: Object.freeze(slots),
    counts: Object.freeze({
      plannedSlots: TOP_HAT_RUNTIME_EXPECTED_SLOTS.length,
      attemptedSlots: slots.length + (failure === null ? 0 : 1),
      persistedOutcomes: slots.length,
      remainingSlots: TOP_HAT_RUNTIME_EXPECTED_SLOTS.length - slots.length,
      approved,
      repair,
      rejected,
      humanDecisionsCreatedByAutomation: 0,
      candidateAdmissionsCreated: 0,
    }),
    failure,
    allSixHumanApproved: allApproved,
    nextRequiredStage: allApproved
      ? 'six-slot-candidate-admission-preflight'
      : complete
        ? 'repair-or-replacement-required-before-candidate-admission'
        : 'resolve-intake-failure-before-any-further-review-persistence',
    effects: Object.freeze({
      humanDecisionsCreated: 0,
      reviewOutcomesPersisted: slots.length,
      candidateAdmissionsCreated: 0,
      poseSlotsFilled: 0,
      releasesCreated: 0,
    }),
    authority: authority(),
  };
  const receipt = deepFreeze({
    ...body,
    reviewIntakeExecutionSha256: sha256Document(body),
  });
  return deepFreeze({ plan: preparedCampaign.plan, receipt });
}

export function parseTopHatPoseBankFrameReviewIntakeReceipt(input) {
  const receipt = verifySelfHash(
    input,
    'reviewIntakeExecutionSha256',
    'Top Hat frame-review intake receipt',
  );
  const successApproved = receipt.status === 'succeeded-all-six-human-approved';
  const successMixed =
    receipt.status === 'succeeded-human-review-recorded-repair-or-rejection-present';
  const failed = receipt.status === 'failed';
  const slotCount = Array.isArray(receipt.slots) ? receipt.slots.length : -1;
  assert(
    receipt.schema === TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_RECEIPT_SCHEMA &&
      receipt.protocolVersion === TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_PROTOCOL_VERSION &&
      (successApproved || successMixed || failed) &&
      slotCount >= 0 &&
      slotCount <= TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      receipt.slots.every(
        (entry, index) =>
          isRecord(entry) &&
          entry.slotId === TOP_HAT_RUNTIME_EXPECTED_SLOTS[index] &&
          ['final-frame-admitted', 'frame-repair-required', 'frame-rejected'].includes(
            entry.status,
          ) &&
          digest(entry.decisionSha256, `${entry.slotId}.decisionSha256`) &&
          digest(entry.reviewOutcomeSha256, `${entry.slotId}.reviewOutcomeSha256`) &&
          typeof entry.reviewerActorId === 'string' &&
          entry.reviewerActorId.length > 0,
      ) &&
      receipt.counts?.plannedSlots === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      receipt.counts?.persistedOutcomes === slotCount &&
      receipt.counts?.remainingSlots === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length - slotCount &&
      receipt.counts?.approved + receipt.counts?.repair + receipt.counts?.rejected ===
        slotCount &&
      receipt.counts?.humanDecisionsCreatedByAutomation === 0 &&
      receipt.counts?.candidateAdmissionsCreated === 0 &&
      receipt.effects?.humanDecisionsCreated === 0 &&
      receipt.effects?.reviewOutcomesPersisted === slotCount &&
      receipt.effects?.candidateAdmissionsCreated === 0 &&
      receipt.effects?.poseSlotsFilled === 0 &&
      receipt.effects?.releasesCreated === 0 &&
      receipt.authority?.sourceRead === true &&
      receipt.authority?.humanDecisionVerification === true &&
      receipt.authority?.reviewOutcomePersistence === true &&
      AUTHORITY_KEYS.filter(
        (key) =>
          !['sourceRead', 'humanDecisionVerification', 'reviewOutcomePersistence'].includes(
            key,
          ),
      ).every((key) => receipt.authority?.[key] === false),
    'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_RECEIPT_INVALID',
  );

  if (successApproved) {
    assert(
      slotCount === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
        receipt.counts.approved === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
        receipt.counts.repair === 0 &&
        receipt.counts.rejected === 0 &&
        receipt.counts.attemptedSlots === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
        receipt.allSixHumanApproved === true &&
        receipt.failure === null &&
        receipt.nextRequiredStage === 'six-slot-candidate-admission-preflight',
      'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_SUCCESS_INVALID',
    );
  } else if (successMixed) {
    assert(
      slotCount === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
        receipt.counts.approved < TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
        receipt.counts.repair + receipt.counts.rejected > 0 &&
        receipt.counts.attemptedSlots === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
        receipt.allSixHumanApproved === false &&
        receipt.failure === null &&
        receipt.nextRequiredStage ===
          'repair-or-replacement-required-before-candidate-admission',
      'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_MIXED_INVALID',
    );
  } else {
    assert(
      slotCount < TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
        receipt.counts.attemptedSlots === slotCount + 1 &&
        receipt.allSixHumanApproved === false &&
        isRecord(receipt.failure) &&
        receipt.failure.slotId === TOP_HAT_RUNTIME_EXPECTED_SLOTS[slotCount] &&
        typeof receipt.failure.code === 'string' &&
        receipt.failure.code.length > 0 &&
        typeof receipt.failure.message === 'string' &&
        receipt.failure.message.length > 0,
      'TOP_HAT_POSE_BANK_FRAME_REVIEW_INTAKE_FAILURE_INVALID',
    );
  }
  return receipt;
}
