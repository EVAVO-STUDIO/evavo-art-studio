import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';

import {
  finishAvatarFinalPassProviderFrameFiles,
} from './avatar-final-pass-provider-frame-finisher.mjs';
import {
  preflightAvatarFinalPassProviderFrameFiles,
} from './avatar-final-pass-provider-frame-finisher-preflight.mjs';
import {
  parseTopHatPoseBankCandidateMaterializationCampaignReceipt,
} from './top-hat-pose-bank-candidate-materialization-campaign.mjs';
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

export const TOP_HAT_POSE_BANK_FRAME_FINISHING_CAMPAIGN_PLAN_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-frame-finishing-campaign-plan.v1';
export const TOP_HAT_POSE_BANK_FRAME_FINISHING_CAMPAIGN_RECEIPT_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-frame-finishing-campaign-receipt.v1';
export const TOP_HAT_POSE_BANK_FRAME_FINISHING_CAMPAIGN_PROTOCOL_VERSION =
  '2026-08-19.1';

const AUTHORITY_KEYS = Object.freeze([
  'sourceRead',
  'candidateMaterialization',
  'deterministicPixelFinishing',
  'finisherReportPersistence',
  'reviewRequestPersistence',
  'visiblePixelMutation',
  'alphaMutation',
  'canvasMutation',
  'creativeReview',
  'candidateApproval',
  'candidatePromotion',
  'dependentInbetweenAdmission',
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

function realDirectory(value, label) {
  assert(
    typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0'),
    'TOP_HAT_POSE_BANK_FRAME_FINISHING_ROOT_INVALID',
    `${label} must be an absolute path.`,
  );
  const normalized = path.normalize(value);
  assert(
    normalized === value,
    'TOP_HAT_POSE_BANK_FRAME_FINISHING_ROOT_INVALID',
    `${label} must be normalized.`,
  );
  const real = realpathSync(normalized);
  const metadata = lstatSync(real);
  assert(
    real === normalized && metadata.isDirectory() && !metadata.isSymbolicLink(),
    'TOP_HAT_POSE_BANK_FRAME_FINISHING_ROOT_INVALID',
    `${label} must be a real ordinary directory.`,
  );
  return real;
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative !== '' &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative)
  );
}

function exactMaterializationSuccess(receiptInput) {
  const receipt =
    parseTopHatPoseBankCandidateMaterializationCampaignReceipt(receiptInput);
  assert(
    receipt.status ===
      'succeeded-awaiting-frame-finishing-and-human-review' &&
      receipt.counts?.plannedSlots === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      receipt.counts?.materializedSlots === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      receipt.counts?.remainingSlots === 0 &&
      receipt.failure === null &&
      receipt.effects?.candidateBundlesMaterialized ===
        TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      receipt.effects?.frameFinisherRequestsCreated ===
        TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      receipt.effects?.humanReviewsCreated === 0 &&
      receipt.effects?.candidateAdmissionsCreated === 0 &&
      receipt.effects?.providerCallsPerformed === 0,
    'TOP_HAT_POSE_BANK_FRAME_FINISHING_MATERIALIZATION_INCOMPLETE',
  );
  return receipt;
}

function validatePreflight(entry, preflight, workspaceRoot) {
  assert(
    isRecord(preflight) &&
      preflight.status === 'frame-finisher-preflight-ready' &&
      preflight.frameId === entry.slotId &&
      preflight.materializationSha256 === entry.materializationSha256 &&
      preflight.finisherRequestSha256 === entry.finisherRequestSha256 &&
      isRecord(preflight.sourceCandidate) &&
      digest(
        preflight.sourceCandidate.sha256,
        `${entry.slotId}.sourceCandidate.sha256`,
      ) &&
      isRecord(preflight.expectedFinishedFrame) &&
      digest(
        preflight.expectedFinishedFrame.sha256,
        `${entry.slotId}.expectedFinishedFrame.sha256`,
      ) &&
      digest(
        preflight.expectedFinishedFrame.visiblePixelSha256,
        `${entry.slotId}.expectedFinishedFrame.visiblePixelSha256`,
      ) &&
      digest(
        preflight.expectedFinishedFrame.alphaSha256,
        `${entry.slotId}.expectedFinishedFrame.alphaSha256`,
      ) &&
      digest(
        preflight.expectedFrameFinisherSha256,
        `${entry.slotId}.expectedFrameFinisherSha256`,
      ) &&
      digest(
        preflight.expectedReviewRequestSha256,
        `${entry.slotId}.expectedReviewRequestSha256`,
      ) &&
      isRecord(preflight.outputs?.absolute) &&
      Object.values(preflight.outputs.absolute).every(
        (value) =>
          typeof value === 'string' &&
          path.isAbsolute(value) &&
          inside(workspaceRoot, value),
      ),
    'TOP_HAT_POSE_BANK_FRAME_FINISHING_PREFLIGHT_INVALID',
  );
  const sourceAbsolute = path.resolve(
    workspaceRoot,
    ...preflight.sourceCandidate.path.split('/'),
  );
  assert(
    sourceAbsolute === entry.candidatePath,
    'TOP_HAT_POSE_BANK_FRAME_FINISHING_SOURCE_PATH_MISMATCH',
  );
}

function validateFinish(entry, preflight, result) {
  assert(
    isRecord(result) &&
      result.reused === false &&
      result.status === 'frame-finished-awaiting-human-review' &&
      result.report?.frameId === entry.slotId &&
      result.report?.source?.materializationSha256 ===
        entry.materializationSha256 &&
      result.report?.source?.finisherRequestSha256 ===
        entry.finisherRequestSha256 &&
      result.report?.output?.sha256 ===
        preflight.expectedFinishedFrame.sha256 &&
      result.report?.output?.visiblePixelSha256 ===
        preflight.expectedFinishedFrame.visiblePixelSha256 &&
      result.report?.output?.alphaSha256 ===
        preflight.expectedFinishedFrame.alphaSha256 &&
      result.report?.frameFinisherSha256 ===
        preflight.expectedFrameFinisherSha256 &&
      result.reviewRequest?.reviewRequestSha256 ===
        preflight.expectedReviewRequestSha256 &&
      result.report?.output?.approvalState === 'unapproved' &&
      result.report?.preservation?.visiblePixelsUnchanged === true &&
      result.report?.preservation?.alphaUnchanged === true &&
      result.report?.preservation?.canvasUnchanged === true &&
      result.report?.preservation?.visibleBoundsUnchanged === true &&
      result.reviewRequest?.sequenceReleaseAllowed === false &&
      result.reviewRequest?.runtimeActivationAllowed === false &&
      result.report?.authority?.creativeReview === false &&
      result.report?.authority?.candidateApproval === false &&
      result.report?.authority?.candidatePromotion === false &&
      result.report?.authority?.publication === false &&
      result.report?.authority?.runtimeActivation === false,
    'TOP_HAT_POSE_BANK_FRAME_FINISHING_RESULT_INVALID',
  );
}

async function prepareCampaign({
  materializationCampaignReceipt: receiptInput,
  workspaceRoot: workspaceRootInput,
  finishedAt: finishedAtInput,
  preflightFrame = preflightAvatarFinalPassProviderFrameFiles,
}) {
  assert(
    typeof preflightFrame === 'function',
    'TOP_HAT_POSE_BANK_FRAME_FINISHING_PREFLIGHT_EXECUTOR_INVALID',
  );
  const receipt = exactMaterializationSuccess(receiptInput);
  const workspaceRoot = realDirectory(workspaceRootInput, 'workspaceRoot');
  const finishedAt = timestamp(
    finishedAtInput ?? new Date().toISOString(),
    'finishedAt',
  );
  const prepared = [];

  for (let index = 0; index < receipt.slots.length; index += 1) {
    const entry = receipt.slots[index];
    assert(
      entry.slotId === TOP_HAT_RUNTIME_EXPECTED_SLOTS[index] &&
        typeof entry.candidatePath === 'string' &&
        path.isAbsolute(entry.candidatePath) &&
        inside(workspaceRoot, entry.candidatePath) &&
        typeof entry.materializationReceiptPath === 'string' &&
        path.isAbsolute(entry.materializationReceiptPath) &&
        inside(workspaceRoot, entry.materializationReceiptPath) &&
        typeof entry.finisherRequestPath === 'string' &&
        path.isAbsolute(entry.finisherRequestPath) &&
        inside(workspaceRoot, entry.finisherRequestPath),
      'TOP_HAT_POSE_BANK_FRAME_FINISHING_SLOT_INPUT_INVALID',
    );
    const preflight = await preflightFrame({
      workspaceRoot,
      materializationReceiptPath: entry.materializationReceiptPath,
      finisherRequestPath: entry.finisherRequestPath,
      finishedAt,
    });
    validatePreflight(entry, preflight, workspaceRoot);
    prepared.push(Object.freeze({ entry, preflight }));
  }

  const slots = prepared.map(({ entry, preflight }) =>
    Object.freeze({
      slotId: entry.slotId,
      materializationId: entry.materializationId,
      materializationSha256: entry.materializationSha256,
      finisherRequestSha256: entry.finisherRequestSha256,
      sourceCandidatePath: entry.candidatePath,
      sourceCandidateSha256: preflight.sourceCandidate.sha256,
      expectedFinishedFrame: preflight.expectedFinishedFrame,
      expectedFrameFinisherSha256: preflight.expectedFrameFinisherSha256,
      expectedReviewRequestSha256: preflight.expectedReviewRequestSha256,
      outputs: preflight.outputs.absolute,
    }),
  );
  const body = {
    schema: TOP_HAT_POSE_BANK_FRAME_FINISHING_CAMPAIGN_PLAN_SCHEMA,
    protocolVersion: TOP_HAT_POSE_BANK_FRAME_FINISHING_CAMPAIGN_PROTOCOL_VERSION,
    status: 'ready-for-six-slot-deterministic-frame-finishing',
    finishedAt,
    sourceMaterializationCampaignSha256: receipt.campaignExecutionSha256,
    sourceMaterializationPlanSha256: receipt.campaignPlanSha256,
    workspaceRoot,
    slots: Object.freeze(slots),
    policy: Object.freeze({
      slotOrder: TOP_HAT_RUNTIME_EXPECTED_SLOTS,
      shadowPreflightAllSlotsBeforeFirstWrite: true,
      exactPreflightHashReproductionRequired: true,
      sequential: true,
      stopOnFirstFailure: true,
      createOnlyFinishedBundles: true,
      namedHumanReviewRequiredAfterFinishing: true,
      automaticReviewAllowed: false,
      automaticAdmissionAllowed: false,
      automaticPromotionAllowed: false,
      sequenceReleaseAllowed: false,
      runtimeActivationAllowed: false,
    }),
    effects: Object.freeze({
      framesFinished: 0,
      finisherReportsCreated: 0,
      reviewRequestsCreated: 0,
      humanReviewsCreated: 0,
      candidateAdmissionsCreated: 0,
      poseSlotsFilled: 0,
      releasesCreated: 0,
      providerCallsPerformed: 0,
    }),
    authority: authority(),
  };
  const plan = deepFreeze({
    ...body,
    campaignPlanSha256: sha256Document(body),
  });
  return Object.freeze({ receipt, workspaceRoot, finishedAt, prepared, plan });
}

export async function compileTopHatPoseBankFrameFinishingCampaignPlan(input) {
  return (await prepareCampaign(input)).plan;
}

export function parseTopHatPoseBankFrameFinishingCampaignPlan(input) {
  const plan = verifySelfHash(
    input,
    'campaignPlanSha256',
    'Top Hat frame-finishing campaign plan',
  );
  assert(
    plan.schema === TOP_HAT_POSE_BANK_FRAME_FINISHING_CAMPAIGN_PLAN_SCHEMA &&
      plan.protocolVersion ===
        TOP_HAT_POSE_BANK_FRAME_FINISHING_CAMPAIGN_PROTOCOL_VERSION &&
      plan.status === 'ready-for-six-slot-deterministic-frame-finishing' &&
      Array.isArray(plan.slots) &&
      plan.slots.length === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      plan.slots.every(
        (entry, index) =>
          isRecord(entry) &&
          entry.slotId === TOP_HAT_RUNTIME_EXPECTED_SLOTS[index] &&
          digest(entry.materializationSha256, `${entry.slotId}.materializationSha256`) &&
          digest(entry.finisherRequestSha256, `${entry.slotId}.finisherRequestSha256`) &&
          digest(entry.sourceCandidateSha256, `${entry.slotId}.sourceCandidateSha256`) &&
          digest(
            entry.expectedFinishedFrame?.sha256,
            `${entry.slotId}.expectedFinishedFrame.sha256`,
          ) &&
          digest(
            entry.expectedFrameFinisherSha256,
            `${entry.slotId}.expectedFrameFinisherSha256`,
          ) &&
          digest(
            entry.expectedReviewRequestSha256,
            `${entry.slotId}.expectedReviewRequestSha256`,
          ),
      ) &&
      plan.policy?.shadowPreflightAllSlotsBeforeFirstWrite === true &&
      plan.policy?.exactPreflightHashReproductionRequired === true &&
      plan.policy?.sequential === true &&
      plan.policy?.stopOnFirstFailure === true &&
      plan.policy?.createOnlyFinishedBundles === true &&
      plan.policy?.namedHumanReviewRequiredAfterFinishing === true &&
      plan.policy?.automaticReviewAllowed === false &&
      plan.policy?.automaticAdmissionAllowed === false &&
      plan.policy?.automaticPromotionAllowed === false &&
      plan.policy?.sequenceReleaseAllowed === false &&
      plan.policy?.runtimeActivationAllowed === false &&
      isRecord(plan.effects) &&
      Object.values(plan.effects).every((value) => value === 0) &&
      plan.authority?.sourceRead === true &&
      plan.authority?.deterministicPixelFinishing === true &&
      plan.authority?.finisherReportPersistence === true &&
      plan.authority?.reviewRequestPersistence === true &&
      AUTHORITY_KEYS.filter(
        (key) =>
          ![
            'sourceRead',
            'deterministicPixelFinishing',
            'finisherReportPersistence',
            'reviewRequestPersistence',
          ].includes(key),
      ).every((key) => plan.authority?.[key] === false),
    'TOP_HAT_POSE_BANK_FRAME_FINISHING_PLAN_INVALID',
  );
  return plan;
}

export async function runTopHatPoseBankFrameFinishingCampaign({
  finishFrame = finishAvatarFinalPassProviderFrameFiles,
  ...input
}) {
  assert(
    typeof finishFrame === 'function',
    'TOP_HAT_POSE_BANK_FRAME_FINISHING_EXECUTOR_INVALID',
  );
  const preparedCampaign = await prepareCampaign(input);
  const slots = [];
  let failure = null;

  for (const { entry, preflight } of preparedCampaign.prepared) {
    try {
      const result = await finishFrame({
        workspaceRoot: preparedCampaign.workspaceRoot,
        materializationReceiptPath: entry.materializationReceiptPath,
        finisherRequestPath: entry.finisherRequestPath,
        finishedAt: preparedCampaign.finishedAt,
      });
      validateFinish(entry, preflight, result);
      slots.push(
        Object.freeze({
          slotId: entry.slotId,
          status: 'finished-awaiting-named-human-review',
          materializationSha256: entry.materializationSha256,
          finisherRequestSha256: entry.finisherRequestSha256,
          finishedFrameSha256: result.report.output.sha256,
          frameFinisherSha256: result.report.frameFinisherSha256,
          reviewRequestSha256: result.reviewRequest.reviewRequestSha256,
          finishedFramePath: result.finishedFramePath,
          frameFinisherReportPath: result.reportPath,
          frameReviewRequestPath: result.reviewRequestPath,
        }),
      );
    } catch (error) {
      failure = Object.freeze({
        slotId: entry.slotId,
        code:
          typeof error?.code === 'string'
            ? error.code
            : 'TOP_HAT_POSE_BANK_FRAME_FINISHING_SLOT_FAILED',
        message: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }

  const body = {
    schema: TOP_HAT_POSE_BANK_FRAME_FINISHING_CAMPAIGN_RECEIPT_SCHEMA,
    protocolVersion: TOP_HAT_POSE_BANK_FRAME_FINISHING_CAMPAIGN_PROTOCOL_VERSION,
    status:
      failure === null && slots.length === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length
        ? 'succeeded-awaiting-named-human-review'
        : 'failed',
    finishedAt: preparedCampaign.finishedAt,
    campaignPlanSha256: preparedCampaign.plan.campaignPlanSha256,
    sourceMaterializationCampaignSha256:
      preparedCampaign.receipt.campaignExecutionSha256,
    slots: Object.freeze(slots),
    counts: Object.freeze({
      plannedSlots: TOP_HAT_RUNTIME_EXPECTED_SLOTS.length,
      attemptedSlots: slots.length + (failure === null ? 0 : 1),
      finishedSlots: slots.length,
      remainingSlots: TOP_HAT_RUNTIME_EXPECTED_SLOTS.length - slots.length,
      humanReviewsCreated: 0,
      candidateAdmissionsCreated: 0,
    }),
    failure,
    nextRequiredStage: 'independent-named-human-frame-review',
    effects: Object.freeze({
      framesFinished: slots.length,
      finisherReportsCreated: slots.length,
      reviewRequestsCreated: slots.length,
      humanReviewsCreated: 0,
      candidateAdmissionsCreated: 0,
      poseSlotsFilled: 0,
      releasesCreated: 0,
      providerCallsPerformed: 0,
    }),
    authority: authority(),
  };
  const receipt = deepFreeze({
    ...body,
    campaignExecutionSha256: sha256Document(body),
  });
  return deepFreeze({ plan: preparedCampaign.plan, receipt });
}

export function parseTopHatPoseBankFrameFinishingCampaignReceipt(input) {
  const receipt = verifySelfHash(
    input,
    'campaignExecutionSha256',
    'Top Hat frame-finishing campaign receipt',
  );
  const successful = receipt.status === 'succeeded-awaiting-named-human-review';
  const failed = receipt.status === 'failed';
  const slotCount = Array.isArray(receipt.slots) ? receipt.slots.length : -1;
  assert(
    receipt.schema === TOP_HAT_POSE_BANK_FRAME_FINISHING_CAMPAIGN_RECEIPT_SCHEMA &&
      receipt.protocolVersion ===
        TOP_HAT_POSE_BANK_FRAME_FINISHING_CAMPAIGN_PROTOCOL_VERSION &&
      (successful || failed) &&
      slotCount >= 0 &&
      slotCount <= TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      receipt.slots.every(
        (entry, index) =>
          isRecord(entry) &&
          entry.slotId === TOP_HAT_RUNTIME_EXPECTED_SLOTS[index] &&
          entry.status === 'finished-awaiting-named-human-review' &&
          digest(entry.materializationSha256, `${entry.slotId}.materializationSha256`) &&
          digest(entry.finisherRequestSha256, `${entry.slotId}.finisherRequestSha256`) &&
          digest(entry.finishedFrameSha256, `${entry.slotId}.finishedFrameSha256`) &&
          digest(entry.frameFinisherSha256, `${entry.slotId}.frameFinisherSha256`) &&
          digest(entry.reviewRequestSha256, `${entry.slotId}.reviewRequestSha256`) &&
          typeof entry.finishedFramePath === 'string' &&
          path.isAbsolute(entry.finishedFramePath) &&
          typeof entry.frameFinisherReportPath === 'string' &&
          path.isAbsolute(entry.frameFinisherReportPath) &&
          typeof entry.frameReviewRequestPath === 'string' &&
          path.isAbsolute(entry.frameReviewRequestPath),
      ) &&
      receipt.counts?.plannedSlots === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
      receipt.counts?.finishedSlots === slotCount &&
      receipt.counts?.remainingSlots ===
        TOP_HAT_RUNTIME_EXPECTED_SLOTS.length - slotCount &&
      receipt.counts?.humanReviewsCreated === 0 &&
      receipt.counts?.candidateAdmissionsCreated === 0 &&
      receipt.nextRequiredStage === 'independent-named-human-frame-review' &&
      receipt.effects?.framesFinished === slotCount &&
      receipt.effects?.finisherReportsCreated === slotCount &&
      receipt.effects?.reviewRequestsCreated === slotCount &&
      receipt.effects?.humanReviewsCreated === 0 &&
      receipt.effects?.candidateAdmissionsCreated === 0 &&
      receipt.effects?.poseSlotsFilled === 0 &&
      receipt.effects?.releasesCreated === 0 &&
      receipt.effects?.providerCallsPerformed === 0 &&
      receipt.authority?.sourceRead === true &&
      receipt.authority?.deterministicPixelFinishing === true &&
      receipt.authority?.finisherReportPersistence === true &&
      receipt.authority?.reviewRequestPersistence === true &&
      AUTHORITY_KEYS.filter(
        (key) =>
          ![
            'sourceRead',
            'deterministicPixelFinishing',
            'finisherReportPersistence',
            'reviewRequestPersistence',
          ].includes(key),
      ).every((key) => receipt.authority?.[key] === false),
    'TOP_HAT_POSE_BANK_FRAME_FINISHING_RECEIPT_INVALID',
  );
  if (successful) {
    assert(
      slotCount === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
        receipt.counts.attemptedSlots === TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
        receipt.counts.remainingSlots === 0 &&
        receipt.failure === null,
      'TOP_HAT_POSE_BANK_FRAME_FINISHING_RECEIPT_SUCCESS_INVALID',
    );
  } else {
    assert(
      slotCount < TOP_HAT_RUNTIME_EXPECTED_SLOTS.length &&
        receipt.counts.attemptedSlots === slotCount + 1 &&
        isRecord(receipt.failure) &&
        receipt.failure.slotId === TOP_HAT_RUNTIME_EXPECTED_SLOTS[slotCount] &&
        typeof receipt.failure.code === 'string' &&
        receipt.failure.code.length > 0 &&
        typeof receipt.failure.message === 'string' &&
        receipt.failure.message.length > 0,
      'TOP_HAT_POSE_BANK_FRAME_FINISHING_RECEIPT_FAILURE_INVALID',
    );
  }
  return receipt;
}
