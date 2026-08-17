import {
  createAuthority,
  assert,
} from './avatar-final-pass-provider-runtime-common.mjs';

export const TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-provider-runtime-adapter.v1';
export const TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_CAPABILITIES_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-provider-runtime-adapter-capabilities.v1';
export const TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_METADATA_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-provider-runtime-adapter-metadata.v1';
export const TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_RECEIPT_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-provider-runtime-adapter-receipt.v1';
export const TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_DISPATCH_RECEIPT_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-provider-runtime-dispatch-receipt.v1';

export const GENERIC_PROVIDER_METADATA_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-metadata.v1';
export const GENERIC_PLAN_SCHEMA =
  'evavo.project-art-avatar-final-pass-plan.v1';
export const TOP_HAT_RUNTIME_SESSION_ID = 'top-hat-pose-slots-v1';
export const TOP_HAT_RUNTIME_CHARACTER_ID = 'top-hat-man';
export const TOP_HAT_RUNTIME_EXPECTED_SLOTS = Object.freeze([
  'blink-closed',
  'listening-attentive',
  'thinking-reflective',
  'speech-neutral',
  'presentation-open',
  'presentation-emphasis',
]);

const ADAPTER_AUTHORITY_KEYS = Object.freeze([
  'runtimeContractCompilation',
  'runtimeEnqueue',
  'providerExecution',
  'candidateMaterialization',
  'receiptPersistence',
  'deterministicQa',
  'creativeReview',
  'candidateApproval',
  'candidatePromotion',
  'poseSlotFilling',
  'sequenceRelease',
  'targetRepositoryMutation',
  'gitMutation',
  'deployment',
  'publication',
  'runtimeActivation',
  'forcePush',
]);

export function topHatRuntimeAdapterAuthority() {
  return createAuthority(ADAPTER_AUTHORITY_KEYS);
}

export function topHatRuntimeCandidateOutputPath(slotId) {
  return `scratch/avatar-final-pass/${TOP_HAT_RUNTIME_SESSION_ID}/${slotId}/candidate-01.png`;
}

export function topHatRuntimeFalseApprovals() {
  return Object.freeze({
    creative: false,
    anatomy: false,
    identity: false,
    continuity: false,
    loop: false,
    runtime: false,
    publication: false,
  });
}

export function assertTopHatRuntimeAuthorizationActive(
  authorization,
  compiledAt,
  slotId,
) {
  const compiled = Date.parse(compiledAt);
  const occurred = Date.parse(authorization.occurredAt);
  const expires = Date.parse(authorization.expiresAt);
  assert(
    compiled >= occurred,
    'TOP_HAT_PROVIDER_RUNTIME_AUTHORIZATION_NOT_YET_ACTIVE',
    `${slotId} provider authorization is not active at dispatch compilation.`,
  );
  assert(
    compiled <= expires,
    'TOP_HAT_PROVIDER_RUNTIME_AUTHORIZATION_EXPIRED',
    `${slotId} provider authorization expired before dispatch compilation.`,
  );
  assert(
    authorization.maximumProviderCalls === 1,
    'TOP_HAT_PROVIDER_RUNTIME_AUTHORIZATION_SCOPE_INVALID',
  );
}
