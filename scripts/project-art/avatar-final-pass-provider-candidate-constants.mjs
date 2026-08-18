export const AVATAR_PROVIDER_CANDIDATE_PROTOCOL_VERSION = '2026-08-13.2';

export const AVATAR_PROVIDER_CANDIDATE_CAPABILITIES_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-candidate-capabilities.v1';
export const AVATAR_PROVIDER_CANDIDATE_MATERIALIZATION_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-candidate-materialization.v1';
export const AVATAR_PROVIDER_CANDIDATE_FINISHER_REQUEST_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-candidate-finisher-request.v1';

export const AVATAR_PROVIDER_RUNTIME_DISPATCH_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-runtime-dispatch.v1';
export const AVATAR_PROVIDER_RUNTIME_BINDING_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-runtime-binding.v1';
export const AVATAR_PROVIDER_RUNTIME_OUTCOME_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-runtime-outcome.v1';
export const AVATAR_PROVIDER_RUNTIME_PROTOCOL_VERSION = '2026-08-13.1';
export const GENERIC_PROVIDER_PROTOCOL_VERSION = '2026-08-15.1';
export const AVATAR_FINAL_PASS_PROVIDER_METADATA_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-metadata.v1';

export const SHA1_PATTERN = /^[a-f0-9]{40}$/u;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
export const ARTIFACT_ID_PATTERN = /^artifact_[a-f0-9]{64}$/u;
export const PROVIDER_REQUEST_ID_PATTERN = /^provider_[a-f0-9]{40}$/u;
export const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,191}$/u;

export const MAXIMUM_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const MAXIMUM_CANDIDATE_BYTES = 64 * 1024 * 1024;
export const MAXIMUM_DECODED_BYTES = 256 * 1024 * 1024;
export const MAXIMUM_CANVAS_EDGE = 8192;
export const MAXIMUM_DEPTH = 64;
export const MAXIMUM_NODES = 200_000;

export const CANDIDATE_MATERIALIZATION_AUTHORITY_KEYS = Object.freeze([
  'artifactRead',
  'evidenceRead',
  'candidateMaterialization',
  'receiptPersistence',
  'finisherRequestPersistence',
  'alphaExtraction',
  'deterministicQa',
  'creativeReview',
  'candidateApproval',
  'candidatePromotion',
  'targetRepositoryMutation',
  'gitMutation',
  'deployment',
  'publication',
  'runtimeActivation',
  'forcePush',
]);

export const FINISHER_REQUEST_AUTHORITY_KEYS = Object.freeze([
  'sourceMutation',
  'sourceDeletion',
  'deterministicQa',
  'creativeReview',
  'candidateApproval',
  'candidatePromotion',
  'targetRepositoryMutation',
  'gitMutation',
  'deployment',
  'publication',
  'runtimeActivation',
  'forcePush',
]);

export const AUTHORIZATION_ACTION =
  'materialize-unapproved-provider-candidate';
