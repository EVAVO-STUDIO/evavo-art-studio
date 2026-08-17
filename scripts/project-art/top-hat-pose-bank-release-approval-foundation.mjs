import {
  assert,
  createAuthority,
  deepFreeze,
  exactKeys,
} from './avatar-final-pass-provider-runtime-common.mjs';

export const TOP_HAT_POSE_BANK_RELEASE_APPROVAL_DECISION_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-release-approval-decision.v1';
export const TOP_HAT_POSE_BANK_RELEASE_APPROVAL_ADMISSION_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-release-approval-admission.v1';
export const TOP_HAT_POSE_BANK_RELEASE_APPROVAL_CAPABILITIES_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-release-approval-capabilities.v1';
export const TOP_HAT_POSE_BANK_RELEASE_APPROVAL_RECEIPT_SCHEMA =
  'evavo.project-art-top-hat-pose-bank-release-approval-receipt.v1';

export const TOP_HAT_POSE_BANK_RELEASE_APPROVAL_PROTOCOL = '2026-08-17.3';
export const TOP_HAT_POSE_BANK_RELEASE_APPROVAL_STATUS =
  'top-hat-pose-bank-release-approval-admitted-for-runtime-publication';

export const TOP_HAT_POSE_BANK_RELEASE_APPROVAL_REQUIRED_NEXT_STEPS =
  Object.freeze([
    'publish-a-new-avatar-runtime-pose-bank-release',
    'perform-separate-website-installation-and-activation-review',
  ]);

export const TOP_HAT_POSE_BANK_RELEASE_APPROVAL_AUTHORITY_KEYS =
  Object.freeze([
    'evidenceRead',
    'namedHumanReleaseApprovalAdmission',
    'runtimePublicationEligibility',
    'providerExecution',
    'runtimeEnqueue',
    'imageMutation',
    'creativeDecision',
    'candidateApproval',
    'candidatePromotion',
    'poseSlotFilling',
    'poseBankReleaseApproval',
    'poseBankRelease',
    'runtimePublication',
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

const POSITIVE_APPROVAL_ADMISSION_AUTHORITY = Object.freeze([
  'evidenceRead',
  'namedHumanReleaseApprovalAdmission',
  'runtimePublicationEligibility',
]);

export function topHatPoseBankReleaseApprovalAuthority() {
  return createAuthority(
    TOP_HAT_POSE_BANK_RELEASE_APPROVAL_AUTHORITY_KEYS,
    POSITIVE_APPROVAL_ADMISSION_AUTHORITY,
  );
}

export function parseTopHatPoseBankReleaseApprovalAuthority(value) {
  exactKeys(
    value,
    TOP_HAT_POSE_BANK_RELEASE_APPROVAL_AUTHORITY_KEYS,
    'Top Hat pose-bank release-approval authority',
    'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_AUTHORITY_INVALID',
  );
  const positive = new Set(POSITIVE_APPROVAL_ADMISSION_AUTHORITY);
  for (const key of TOP_HAT_POSE_BANK_RELEASE_APPROVAL_AUTHORITY_KEYS) {
    assert(
      value[key] === positive.has(key),
      'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_AUTHORITY_INVALID',
      `Top Hat pose-bank release-approval authority.${key} is invalid.`,
    );
  }
  return deepFreeze({ ...value });
}

export function topHatPoseBankReleaseApprovalCapabilities() {
  return Object.freeze({
    schema: TOP_HAT_POSE_BANK_RELEASE_APPROVAL_CAPABILITIES_SCHEMA,
    protocolVersion: TOP_HAT_POSE_BANK_RELEASE_APPROVAL_PROTOCOL,
    decisionSchema: TOP_HAT_POSE_BANK_RELEASE_APPROVAL_DECISION_SCHEMA,
    admissionSchema: TOP_HAT_POSE_BANK_RELEASE_APPROVAL_ADMISSION_SCHEMA,
    receiptSchema: TOP_HAT_POSE_BANK_RELEASE_APPROVAL_RECEIPT_SCHEMA,
    characterId: 'top-hat-man',
    requiredPoseSlots: 6,
    exactReleasePlanSelfHashRequired: true,
    exactDecisionSelfHashRequired: true,
    exactSixSlotIdentityBindingRequired: true,
    separateNamedHumanDecisionRequired: true,
    approvalDecisionMustFollowPlan: true,
    admissionMustFollowDecision: true,
    runtimePublicationEligibleOutput: true,
    runtimePublicationTransactionStillRequired: true,
    websiteInstallationReviewStillRequired: true,
    providerExecution: false,
    runtimeEnqueue: false,
    imageMutation: false,
    creativeDecision: false,
    candidateApproval: false,
    candidatePromotion: false,
    poseSlotFilling: false,
    poseBankReleaseApproval: false,
    poseBankRelease: false,
    runtimePublication: false,
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
