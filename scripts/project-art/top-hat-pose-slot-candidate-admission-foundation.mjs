import {
  assert,
  createAuthority,
  deepFreeze,
  exactKeys,
} from './avatar-final-pass-provider-runtime-common.mjs';

export const TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-candidate-admission.v1';
export const TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_CAPABILITIES_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-candidate-admission-capabilities.v1';
export const TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_RECEIPT_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-candidate-admission-receipt.v1';

export const TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_PROTOCOL = '2026-08-17.1';
export const TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_STATUS =
  'top-hat-pose-candidate-admitted-for-release-review';
export const TOP_HAT_POSE_SLOT_CHARACTER_ID = 'top-hat-man';

export const TOP_HAT_POSE_SLOT_IDS = Object.freeze([
  'blink-closed',
  'listening-attentive',
  'thinking-reflective',
  'speech-neutral',
  'presentation-open',
  'presentation-emphasis',
]);

export const TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_AUTHORITY_KEYS =
  Object.freeze([
    'evidenceRead',
    'finalFrameByteRead',
    'technicalAdmission',
    'releaseReviewEligibility',
    'providerExecution',
    'runtimeEnqueue',
    'imageMutation',
    'creativeDecision',
    'candidateApproval',
    'candidatePromotion',
    'poseSlotFilling',
    'poseBankRelease',
    'sequenceRelease',
    'repositoryMutation',
    'gitCommit',
    'gitPush',
    'deployment',
    'publication',
    'runtimeActivation',
    'forcePush',
  ]);

const POSITIVE_ADMISSION_AUTHORITY = Object.freeze([
  'evidenceRead',
  'finalFrameByteRead',
  'technicalAdmission',
  'releaseReviewEligibility',
]);

export function topHatPoseSlotCandidateAdmissionAuthority() {
  return createAuthority(
    TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_AUTHORITY_KEYS,
    POSITIVE_ADMISSION_AUTHORITY,
  );
}

export function parseTopHatPoseSlotCandidateAdmissionAuthority(value) {
  exactKeys(
    value,
    TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_AUTHORITY_KEYS,
    'Top Hat pose-slot candidate admission authority',
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_AUTHORITY_INVALID',
  );
  const positive = new Set(POSITIVE_ADMISSION_AUTHORITY);
  for (const key of TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_AUTHORITY_KEYS) {
    assert(
      value[key] === positive.has(key),
      'TOP_HAT_POSE_CANDIDATE_ADMISSION_AUTHORITY_INVALID',
      `Top Hat candidate admission authority.${key} is invalid.`,
    );
  }
  return deepFreeze({ ...value });
}

export function assertTopHatPoseSlotId(value) {
  assert(
    typeof value === 'string' && TOP_HAT_POSE_SLOT_IDS.includes(value),
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_SLOT_UNKNOWN',
    `Unknown Top Hat pose slot: ${String(value)}.`,
  );
  return value;
}

export function topHatPoseSlotCandidateAdmissionCapabilities() {
  return Object.freeze({
    schema: TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_CAPABILITIES_SCHEMA,
    protocolVersion: TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_PROTOCOL,
    admissionSchema: TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_SCHEMA,
    receiptSchema: TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_RECEIPT_SCHEMA,
    characterId: TOP_HAT_POSE_SLOT_CHARACTER_ID,
    requiredPoseSlots: TOP_HAT_POSE_SLOT_IDS.length,
    oneCandidatePerAdmission: true,
    exactAdapterRecompilationRequired: true,
    exactDispatchRecompilationRequired: true,
    exactProviderSourceChainRequired: true,
    materializationReceiptRequired: true,
    frameFinisherEvidenceRequired: true,
    namedHumanReviewRequired: true,
    allReviewGatesRequired: true,
    finalPngBytesRequired: true,
    nativeStraightAlphaRequired: true,
    exactCanvasRequired: Object.freeze({ width: 1024, height: 1536 }),
    transparentAndVisiblePixelsRequired: true,
    hiddenTransparentRgbAllowed: false,
    visibleCanvasEdgeContactAllowed: false,
    releaseReviewEligibleOutput: true,
    providerExecution: false,
    runtimeEnqueue: false,
    imageMutation: false,
    creativeDecision: false,
    candidateApproval: false,
    candidatePromotion: false,
    poseSlotFilling: false,
    poseBankRelease: false,
    sequenceRelease: false,
    repositoryMutation: false,
    gitCommit: false,
    gitPush: false,
    deployment: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  });
}
