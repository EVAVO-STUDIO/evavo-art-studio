import {
  assert,
  createAuthority,
  deepFreeze,
  exactKeys,
} from './avatar-final-pass-provider-runtime-common.mjs';

export const TOP_HAT_POSE_BANK_RELEASE_PLAN_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-release-plan.v1';
export const TOP_HAT_POSE_BANK_RELEASE_PLAN_CAPABILITIES_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-release-plan-capabilities.v1';
export const TOP_HAT_POSE_BANK_RELEASE_PLAN_RECEIPT_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-release-plan-receipt.v1';

export const TOP_HAT_POSE_BANK_RELEASE_PLAN_PROTOCOL = '2026-08-17.2';
export const TOP_HAT_POSE_BANK_RELEASE_PLAN_STATUS =
  'top-hat-pose-bank-release-plan-ready-for-human-approval';

export const TOP_HAT_POSE_BANK_RELEASE_PLAN_REQUIRED_NEXT_STEPS =
  Object.freeze([
    'obtain-separate-named-human-pose-bank-release-approval',
    'publish-a-new-avatar-runtime-pose-bank-release',
    'perform-separate-website-installation-and-activation-review',
  ]);

export const TOP_HAT_POSE_BANK_RELEASE_PLAN_AUTHORITY_KEYS =
  Object.freeze([
    'evidenceRead',
    'technicalPlanCompilation',
    'releaseApprovalEligibility',
    'providerExecution',
    'runtimeEnqueue',
    'imageMutation',
    'creativeDecision',
    'candidateApproval',
    'candidatePromotion',
    'poseSlotFilling',
    'poseBankReleaseApproval',
    'poseBankRelease',
    'sequenceRelease',
    'repositoryMutation',
    'gitCommit',
    'gitPush',
    'deployment',
    'publication',
    'runtimeActivation',
    'websiteInstallation',
    'forcePush',
  ]);

const POSITIVE_PLAN_AUTHORITY = Object.freeze([
  'evidenceRead',
  'technicalPlanCompilation',
  'releaseApprovalEligibility',
]);

export function topHatPoseBankReleasePlanAuthority() {
  return createAuthority(
    TOP_HAT_POSE_BANK_RELEASE_PLAN_AUTHORITY_KEYS,
    POSITIVE_PLAN_AUTHORITY,
  );
}

export function parseTopHatPoseBankReleasePlanAuthority(value) {
  exactKeys(
    value,
    TOP_HAT_POSE_BANK_RELEASE_PLAN_AUTHORITY_KEYS,
    'Top Hat pose-bank release-plan authority',
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_AUTHORITY_INVALID',
  );
  const positive = new Set(POSITIVE_PLAN_AUTHORITY);
  for (const key of TOP_HAT_POSE_BANK_RELEASE_PLAN_AUTHORITY_KEYS) {
    assert(
      value[key] === positive.has(key),
      'TOP_HAT_POSE_BANK_RELEASE_PLAN_AUTHORITY_INVALID',
      `Top Hat pose-bank release-plan authority.${key} is invalid.`,
    );
  }
  return deepFreeze({ ...value });
}

export function topHatPoseBankReleasePlanCapabilities() {
  return Object.freeze({
    schema: TOP_HAT_POSE_BANK_RELEASE_PLAN_CAPABILITIES_SCHEMA,
    protocolVersion: TOP_HAT_POSE_BANK_RELEASE_PLAN_PROTOCOL,
    planSchema: TOP_HAT_POSE_BANK_RELEASE_PLAN_SCHEMA,
    receiptSchema: TOP_HAT_POSE_BANK_RELEASE_PLAN_RECEIPT_SCHEMA,
    characterId: 'top-hat-man',
    requiredPoseSlots: 6,
    exactSlotSetRequired: true,
    oneAdmissionPerSlotRequired: true,
    candidateAdmissionSelfHashRequired: true,
    commonSourceIdentityRequired: true,
    exactReviewedTargetPathsRequired: true,
    exactFinishedScratchPathsRequired: true,
    canonicalSlotOrderRequired: true,
    deterministicForFixedTimestamp: true,
    separateNamedHumanReleaseApprovalRequired: true,
    releaseReviewEligibleOutput: true,
    providerExecution: false,
    runtimeEnqueue: false,
    imageMutation: false,
    creativeDecision: false,
    candidateApproval: false,
    candidatePromotion: false,
    poseSlotFilling: false,
    poseBankReleaseApproval: false,
    poseBankRelease: false,
    sequenceRelease: false,
    repositoryMutation: false,
    gitCommit: false,
    gitPush: false,
    deployment: false,
    publication: false,
    runtimeActivation: false,
    websiteInstallation: false,
    forcePush: false,
  });
}
