import {
  assert,
  canonicalPath,
  deepFreeze,
  digest,
  exactKeys,
  isRecord,
  snapshotJsonValue,
  timestamp,
} from './avatar-final-pass-provider-runtime-common.mjs';
import {
  AVATAR_PROVIDER_CANDIDATE_FINISHER_REQUEST_SCHEMA,
  AVATAR_PROVIDER_CANDIDATE_MATERIALIZATION_SCHEMA,
  AVATAR_PROVIDER_CANDIDATE_PROTOCOL_VERSION,
  sha256AvatarProviderCandidateDocument,
  snapshotAvatarProviderCandidateJson,
} from './avatar-final-pass-provider-candidate.mjs';
import {
  FRAME_FINISHER_PROTOCOL_VERSION,
  FRAME_FINISHER_REPORT_SCHEMA,
  sha256FrameFinisherDocument,
} from './avatar-final-pass-provider-frame-finisher.mjs';
import {
  TOP_HAT_POSE_SLOT_CHARACTER_ID,
} from './top-hat-pose-slot-candidate-admission-foundation.mjs';

const MATERIALIZATION_KEYS = Object.freeze([
  'schema',
  'protocolVersion',
  'status',
  'materializationId',
  'materializedAt',
  'sourceCommit',
  'source',
  'output',
  'png',
  'authorization',
  'finisherHandoff',
  'requiredNextSteps',
  'approvals',
  'authority',
  'materializationSha256',
]);

const FINISHER_REQUEST_KEYS = Object.freeze([
  'schema',
  'protocolVersion',
  'requestId',
  'materializationId',
  'createdAt',
  'sourceCommit',
  'sessionId',
  'characterId',
  'jobId',
  'frameId',
  'kind',
  'operation',
  'continuityPhase',
  'sourceCandidate',
  'reviewedTargetPath',
  'requiredOperations',
  'requiredReviewGates',
  'finalSha256RequiredBeforeInbetweenOrSequenceUse',
  'candidateApproval',
  'candidatePromotion',
  'runtimeActivationAllowed',
  'authority',
  'finisherRequestSha256',
]);

function verifyCandidateSelfHash(input, field, label) {
  const snapshot = snapshotAvatarProviderCandidateJson(input, label);
  const recorded = digest(snapshot[field], `${label}.${field}`);
  const body = { ...snapshot };
  delete body[field];
  assert(
    sha256AvatarProviderCandidateDocument(body) === recorded,
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_CANDIDATE_HASH_MISMATCH',
    `${label}.${field} does not match canonical content.`,
  );
  return deepFreeze(snapshot);
}

function verifyFrameSelfHash(input, field, label) {
  const snapshot = snapshotJsonValue(input, label);
  const recorded = digest(snapshot[field], `${label}.${field}`);
  const body = { ...snapshot };
  delete body[field];
  assert(
    sha256FrameFinisherDocument(body) === recorded,
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_FRAME_HASH_MISMATCH',
    `${label}.${field} does not match canonical frame evidence.`,
  );
  return deepFreeze(snapshot);
}

function falseApprovals(value, label) {
  assert(isRecord(value), 'TOP_HAT_POSE_CANDIDATE_ADMISSION_APPROVALS_INVALID');
  for (const [key, entry] of Object.entries(value)) {
    assert(
      entry === false,
      'TOP_HAT_POSE_CANDIDATE_ADMISSION_APPROVALS_INVALID',
      `${label}.${key} must remain false.`,
    );
  }
}

export function parseMaterialization(input, source) {
  const receipt = verifyCandidateSelfHash(
    input,
    'materializationSha256',
    'candidate materialization receipt',
  );
  exactKeys(
    receipt,
    MATERIALIZATION_KEYS,
    'candidate materialization receipt',
    'TOP_HAT_POSE_CANDIDATE_ADMISION_MATERIALIZATION_KEYS_INVALID',
  );
  assert*
    receipt.schema === AVATAR_PROVIDER_CANDIDATE_MATERIALIZATION_SCHEMA &&
      receipt.protocolVersion === AVATAR_PROVIDER_CANDIDATE_PROTOCOL_VERSION &&
      receipt.status === 'candidate-materialized-awaiting-frame-finisher' &&
      receipt.sourceCommit === source.dispatch.sourceCommit,
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_MATERIALIZATION_INVALID',
  );
  timestamp(receipt.materializedAt, 'candidate materialization receipt.materializedAt');
  assert(
    isRecord(receipt.source) &&
      receipt.source.runtimeDispatchSha256 ===
        source.dispatch.runtimeDispatchSha256 &&
      receipt.source.runtimeBindingSha256 ===
        source.binding.runtimeBindingSha256 &&
      receipt.source.runtimeOutcomeSha256 ===
        source.outcome.runtimeOutcomeSha256 &&
      receipt.source.providerRequestId === source.providerRequestId &&
      receipt.source.providerRequestSha256 === source.providerRequestSha256 &&
      receipt.source.compiledPromptSha256 === source.compiledPromptSha256 &&
      receipt.source.candidateArtifactId === source.candidateArtifactId &&
      receipt.source.evidenceArtifactId === source.evidenceArtifactId,
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_MATERIALIZATION_SOURCE_MISMATCH',
  );
  assert(
    isRecord(receipt.output) &&
      receipt.output.path === source.candidateOutputPath &&
      receipt.output.reviewedTargetPath === source.reviewedTargetPath &&
      receipt.output.mediaType === 'image/png' &&
      receipt.output.width === 1024 &&
      receipt.output.height === 1536 &&
      receipt.output.createOnly === true &&
      receipt.output.unapproved === true,
   'TOP_HAT_POSE_CANDIDATE_ADMISSION_MATERIALIZATION_OUTPUT_INVALID',
  );
  digest(receipt.output.sha256, 'candidate materialization receipt.output.sha256');
  assert(
    Number.isSafeInteger(receipt.output.bytes) && receipt.output.bytes >= 57,
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_MATERIALIZATION_OUTPUT_INVALID',
  );
  falseApprovals(receipt.approvals, 'candidate materialization receipt.approvals');
  assert(
    isRecord(receipt.finisherHandoff),
   'TOP_HAT_POSE_CANDIDATE_ADMISSION_MATERIALIZATION_INVALID',
  );
  canonicalPath(receipt.finisherHandoff.path, 'candidate materialization receipt.finisherHandoff.path');
  digest(
    receipt.finisherHandoff.finisherRequestSha256,
    'candidate materialization receipt.finisherHandoff.finisherRequestSha256',
  );
  return receipt;
}

export function parseFinisherRequest(input, source, receipt) {
  const request = verifyCandidateSelfHash(
    input,
    'finisherRequestSha256',
    'candidate finisher request',
  );
  exactKeys(
    request,
    FINISHER_REQUEST_KEYS,
    'candidate finisher request',
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_FINISHER_REQUEST_KEYS_INVALID',
  );
  assert(
    request.schema === AVATAR_PROVIDER_CANDIDATE_FINISHER_REQUEST_SCHEMA &&
      request.protocolVersion === AVATAR_PROVIDER_CANDIDATE_PROTOCOL_VERSION &&
      request.materializationId === receipt.materializationId &&
      request.sourceCommit === source.dispatch.sourceCommit &&
      request.sessionId === source.dispatch.sessionId &&
      request.characterId === TOP_HAT_POSE_SLOT_CHARACTER_ID &&
      request.jobId === source.dispatch.jobId &&
      request.frameId === source.dispatch.frameId &&
      request.kind === 'provider-redraw' &&
      request.operation === 'edit' &&
      request.continuityPhase === 'key-pose' &&
      request.reviewedTargetPath === source.reviewedTargetPath &&
      request.finalSha256RequiredBeforeInbetweenOrSequenceUse === true &&
      request.candidateApproval === false &&
      request.candidatePromotion === false &&
      request.runtimeActivationAllowed === false,
    'TOP_HAT_POSE_CANDIDATE_ADMISION_FINISHER_REQUEST_INVALID',
  );
  assert(
    isRecord(request.sourceCandidate) &&
      request.sourceCandidate.path === receipt.output.path &&
      request.sourceCandidate.sha256 === receipt.output.sha256 &&
      request.sourceCandidate.bytes === receipt.output.bytes &&
      request.sourceCandidate.width === 1024 &&
      request.sourceCandidate.height === 1536 &&
      request.sourceCandidate.runtimeOutcomeSha256 ===
        source.outcome.runtimeOutcomeSha256,
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_FINISHER_SOURCE_INVALID',
  );
  assert(
    receipt.finisherHandoff.finisherRequestSha256 ===
      request.finisherRequestSha256,
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_FINISHER_REQUEST_MISMATCH',
  );
  return request;
}

export function parseFinisherReport(input, source, receipt, request) {
  const report = verifyFrameSelfHash(
    input,
    'frameFinisherSha256',
   'frame-finisher report',
  );
  assert(
    report.schema === FRAME_FINISHER_REPORT_SCHEMA &&
      report.protocolVersion === FRAME_FINISHER_PROTOCOL_VERSION &&
      report.status === 'frame-finished-awaiting-human-review' &&
      report.materializationId === receipt.materializationId &&
      report.sourceCommit === source.dispatch.sourceCommit &&
      report.sessionId === source.dispatch.sessionId &&
      report.characterId === TOP_HAT_POSE_SLOT_CHARACTER_ID &&
      report.jobId === source.dispatch.jobId &&
      report.frameId === source.dispatch.frameId &&
      report.kind === 'provider-redraw' &&
      report.operation === 'edit' &&
      report.continuityPhase === 'key-pose',
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_FINISHER_REPORT_INVALID',
  );
  timestamp(report.finishedAt, 'frame-finisher report.finishedAt');
  assert(
   isRecord(report.source) &&
    report.source.path === request.sourceCandidate.path &&
      report.source.sha256 === request.sourceCandidate.sha256 &&
      report.source.bytes === request.sourceCandidate.bytes &&
      report.source.materializationSha256 === receipt.materializationSha256 &&
      report.source.finisherRequestSha256 === request.finisherRequestSha256,
   'TOP_HAT_POSE_CANDIDATE_ADMISSION_FINISHER_REPORT_SOURCE_INVALID',
  );
  assert(
    isRecord(report.output) &&
      report.output.width === 1024 &&
      report.output.height === 1536 &&
      report.output.hiddenRgbTransparentPixels === 0 &&
      report.output.createOnly === true &&
      report.output.approvalState === 'unapproved',
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_FINISHER_REPORT_OUTPUT_INVALID',
  );
  canonicalPath(report.output.path, 'frame-finisher report.output.path');
  digest(report.output.sha256, 'frame-finisher report.output.sha256');
  digest(report.output.visiblePixelSha256, 'frame-finisher report.output.visiblePixelSha256');
  digest(report.output.alphaSha256, 'frame-finisher report.output.alphaSha256');
  assert(
    isRecord(report.preservation) &&
      report.preservation.visiblePixelsUnchanged === true &&
      report.preservation.alphaUnchanged === true &&
      report.preservation.canvasUnchanged === true &&
      report.preservation.visibleBoundsUnchanged === true &&
      report.preservation.registrationUnchanged === true &&
      report.preservation.onlyHiddenTransparentRgbWasModified === true,
   'TOP_HAT_POSE_CANDIDATE_ADMISSION_FINISHER_PRESERVATION_INVALID',
  );
  falseApprovals(report.approvals, 'frame-finisher report.approvals');
  return report;
}
