export const AVATAR_FINAL_PASS_PROVIDER_BATCH_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-batch.v1';
export const AVATAR_FINAL_PASS_PROVIDER_RUNTIME_DISPATCH_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-runtime-dispatch.v1';
export const AVATAR_FINAL_PASS_PROVIDER_RUNTIME_BINDING_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-runtime-binding.v1';
export const AVATAR_FINAL_PASS_PROVIDER_RUNTIME_OUTCOME_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-runtime-outcome.v1';
export const AVATAR_FINAL_PASS_PROVIDER_RUNTIME_CAPABILITIES_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-runtime-capabilities.v1';
export const AVATAR_FINAL_PASS_PROVIDER_RUNTIME_PROTOCOL_VERSION =
  '2026-08-13.1';
export const GENERIC_PROVIDER_PROTOCOL_VERSION = '2026-08-07.3';

export const SHA1_PATTERN = /^[a-f0-9]{40}$/u;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
export const ARTIFACT_ID_PATTERN = /^artifact_[a-f0-9]{64}$/u;
export const PROVIDER_REQUEST_ID_PATTERN = /^provider_[a-f0-9]{40}$/u;
export const SUBMISSION_IDEMPOTENCY_KEY_PATTERN =
  /^avatar-provider-submit:[a-f0-9]{40}$/u;
export const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,191}$/u;

export const MAXIMUM_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const MAXIMUM_TEXT_BYTES = 256 * 1024;
export const MAXIMUM_DEPTH = 64;
export const MAXIMUM_NODES = 200_000;

export const PROVIDER_OPERATIONS = Object.freeze(['generate', 'edit']);
export const PROVIDER_JOB_KINDS = Object.freeze([
  'provider-redraw',
  'provider-generated-inbetween',
]);
export const FAILURE_CLASSIFICATIONS = Object.freeze([
  'transient',
  'permanent',
  'incompatible',
  'cancelled',
]);

export const PROVIDER_BATCH_AUTHORITY_KEYS = Object.freeze([
  'sourceMutation',
  'automaticGenerationAuthorization',
  'providerExecution',
  'candidateApproval',
  'candidatePromotion',
  'repositoryMutation',
  'gitCommit',
  'gitPush',
  'deployment',
  'publication',
  'runtimeActivation',
  'forcePush',
]);

export const RUNTIME_DISPATCH_AUTHORITY_KEYS = Object.freeze([
  'runtimeContractCompilation',
  'runtimeEnqueue',
  'providerExecution',
  'candidateMaterialization',
  'receiptPersistence',
  'deterministicQa',
  'creativeReview',
  'candidateApproval',
  'candidatePromotion',
  'targetRepositoryMutation',
  'gitMutation',
  'deployment',
  'publication',
  'runtimeActivation',
  'explicitWriteEnabledRuntimeRequired',
]);

export const RUNTIME_BINDING_AUTHORITY_KEYS = Object.freeze([
  'runtimeEnqueue',
  'providerExecution',
  'candidateMaterialization',
  'receiptPersistence',
  'candidateApproval',
  'candidatePromotion',
  'targetRepositoryMutation',
  'gitMutation',
  'deployment',
  'publication',
  'runtimeActivation',
]);

export const RUNTIME_OUTCOME_AUTHORITY_KEYS = Object.freeze([
  'candidateMaterialization',
  'receiptPersistence',
  'deterministicQa',
  'creativeReview',
  'candidateApproval',
  'candidatePromotion',
  'targetRepositoryMutation',
  'gitMutation',
  'deployment',
  'publication',
  'runtimeActivation',
]);

export const REFERENCE_CAPABILITY_BY_ROLE = Object.freeze({
  'canonical-identity': 'identity-reference',
  'previous-key-pose': 'temporal-reference',
  'next-key-pose': 'temporal-reference',
  'base-image': null,
  'edit-mask': 'defect-mask',
});
