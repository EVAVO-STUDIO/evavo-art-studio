export const AVATAR_FINAL_PASS_PROVIDER_REQUEST_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-request.v1';
export const AVATAR_FINAL_PASS_PROVIDER_BATCH_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-batch.v1';
export const AVATAR_FINAL_PASS_PROVIDER_METADATA_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-metadata.v1';

export const FINAL_PASS_PLAN_SCHEMA =
  'evavo.project-art-avatar-final-pass-plan.v1';
export const SHA1_PATTERN = /^[a-f0-9]{40}$/u;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
export const ARTIFACT_ID_PATTERN = /^artifact_[a-f0-9]{64}$/u;
export const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,191}$/u;
export const ADAPTER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,95}$/u;
export const MAXIMUM_DOCUMENT_BYTES = 4 * 1024 * 1024;
export const MAXIMUM_JOBS = 512;
export const MAXIMUM_BINDINGS_PER_JOB = 8;
export const MAXIMUM_TEXT = 8_192;

export const AVATAR_FINAL_PASS_PROVIDER_AUTHORITY_KEYS = Object.freeze([
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
