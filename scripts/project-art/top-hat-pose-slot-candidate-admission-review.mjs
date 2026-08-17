import {
  assert,
  deepFreeze,
  digest,
  exactKeys,
  isRecord,
  sameCanonical,
  snapshotJsonValue,
  timestamp,
} from './avatar-final-pass-provider-runtime-common.mjs';
import {
  FRAME_FINISHER_PROTOCOL_VERSION,
  FRAME_REVIEW_DECISION_SCHEMA,
  FRAME_REVIEW_OUTCOME_SCHEMA,
  FRAME_REVIEW_REQUEST_SCHEMA,
  sha256FrameFinisherDocument,
} from './avatar-final-pass-provider-frame-finisher.mjs';
import {
  TOP_HAT_POSE_SLOT_CHARACTER_ID,
} from './top-hat-pose-slot-candidate-admission-foundation.mjs';

const REVIEW_GATES = Object.freeze([
  'technical',
  'handsAndAnatomy',
  'faceIdentity',
  'silhouetteRegistration',
  'adjacentFrameContinuity',
  'loopClosure',
]);

const REVIEW_DECISION_AUTHORITY_KEYS = Object.freeze([
  'sourceMutation',
  'sourceDeletion',
  'candidatePromotion',
  'dependentInbetweenGeneration',
  'sequenceRelease',
  'repositoryMutation',
  'gitMutation',
  'deployment',
  'publication',
  'runtimeActivation',
  'forcePush',
]);

const REVIEW_OUTCOME_AUTHORITY_KEYS = Object.freeze([
  'namedHumanReviewEvidence',
  'finalFrameHashAdmission',
  'candidatePromotion',
  'dependentInbetweenGeneration',
  'sequenceRelease',
  'repositoryMutation',
  'gitMutation',
  'deployment',
  'publication',
  'runtimeActivation',
  'forcePush',
]);

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

export function parseReviewRequest(input, source, report) {
  const request = verifyFrameSelfHash(
    input,
    'reviewRequestSha256',
    'frame-review request',
  );
  assert(
    request.schema === FRAME_REVIEW_REQUEST_SCHEMA &&
      request.protocolVersion === FRAME_FINISHER_PROTOCOL_VERSION &&
      request.frameFinisherSha256 === report.frameFinisherSha256 &&
      request.materializationSha256 === report.source.materializationSha256 &&
      request.frameId === source.dispatch.frameId &&
      request.characterId === TOP_HAT_POSE_SLOT_CHARACTER_ID &&
      request.reviewedTargetPath === source.reviewedTargetPath &&
      request.finalSha256RequiredBeforeInbetweenOrSequenceUse === true &&
      request.sequenceReleaseAllowed === false &&
      request.runtimeActivationAllowed === false,
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_REVIEW_REQUEST_INVALID',
  );
  assert(
    isRecord(request.finishedFrame) &&
      request.finishedFrame.path === report.output.path &&
      request.finishedFrame.sha256 === report.output.sha256 &&
      request.finishedFrame.bytes === report.output.bytes &&
      request.finishedFrame.width === 1024 &&
      request.finishedFrame.height === 1536 &&
      request.finishedFrame.visiblePixelSha256 ===
        report.output.visiblePixelSha256 &&
      request.finishedFrame.alphaSha256 === report.output.alphaSha256,
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_REVIEW_REQUEST_FRAME_INVALID',
  );
  assert(
    Array.isArray(request.requiredGates) &&
      request.requiredGates.join('\0') === REVIEW_GATES.join('\0'),
    'TOP_HAT_POSE_CANDIDATE_ADMISION_REVIEW_GATES_INVALID',
  );
  return request;
}

export function parseReviewDecision(input, report, request) {
  const decision = verifyFrameSelfHash(
    input,
    'decisionSha256',
    'frame-review decision',
  );
  assert(
    decision.schema === FRAME_REVIEW_DECISION_SCHEMA &&
      decision.protocolVersion === FRAME_FINISHER_PROTOCOL_VERSION &&
      decision.frameFinisherSha256 === report.frameFinisherSha256 &&
      decision.reviewRequestSha256 === request.reviewRequestSha256 &&
      decision.frameId === report.frameId &&
      decision.decision === 'approve-final-frame',
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_REVIEW_DECISION_INVALID',
  );
  assert(
    isRecord(decision.reviewer) &&
      decision.reviewer.actorClass === 'human' &&
      typeof decision.reviewer.actorId === 'string' &&
      decision.reviewer.actorId.length >= 1,
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_HUMAN_REVIEW_REQUIRED',
  );
  timestamp(decision.reviewer.occurredAt, 'frame-review decision.reviewer.occurredAt');
  digest(decision.reviewer.evidenceSha256, 'frame-review decision.reviewer.evidenceSha256');
  assert(isRecord(decision.gates), 'TOP_HAT_POSE_CANDIDATE_ADMISSION_REVIEW_GATES_INVALID');
  for (const gate of REVIEW_GATES.filter((entry) => entry !== 'loopClosure')) {
    assert(
      decision.gates[gate] === 'pass',
      'TOP_HAT_POSE_CANDIDATE_ADMISSION_REVIEW_GATES_INVALID',
      `${gate} must pass before Top Hat candidate admission.`,
    );
  }
  assert(
    decision.gates.loopClosure === 'pass' ||
      decision.gates.loopClosure === 'not-applicable',
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_REVIEW_GATES_INVALID',
  );
  assert(isRecord(decision.evidence), 'TOP_HAT_POSE_CANDIDATE_ADMISSION_REVIEW_EVIDENCE_INVALID');
  for (const key of [
    'nativeScaleSha256',
    'contactSheetSha256',
    'identityReferenceSha256',
   'adjacentFramesSha256',
  ]) {
    digest(decision.evidence[key], `frame-review decision.evidence.${key}`);
  }
  if (decision.gates.loopClosure === 'not-applicable') {
    assert(
      decision.evidence.loopClosureSha256 === null,
      'TOP_HAT_POSE_CANDIDATE_ADMISSION_REVIEW_EVIDENCE_INVALID',
    );
  } else {
    digest(
      decision.evidence.loopClosureSha256,
      'frame-review decision.evidence.loopClosureSha256',
    );
  }
  exactKeys(
    decision.authority,
    REVIEW_DECISION_AUTHORITY_KEYS,
    'frame-review decision.authority',
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_REVIEW_AUTHORITY_INVALID',
  );
  assert(
    Object.values(decision.authority).every((value) => value === false),
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_REVIEW_AUTHORITY_INVALID',
  );
  return decision;
}

export function parseReviewOutcome(input, source, report, request, decision) {
  const outcome = verifyFrameSelfHash(
    input,
   'reviewOutcomeSha256',
    'frame-review outcome',
  );
  assert(
    outcome.schema === FRAME_REVIEW_OUTCOME_SCHEMA &&
      outcome.protocolVersion === FRAME_FINISHER_PROTOCOL_VERSION &&
      outcome.status === 'final-frame-admitted' &&
      outcome.frameId === source.dispatch.frameId &&
      outcome.characterId === TOP_HAT_POSE_SLOT_CHARACTER_ID &&
      outcome.frameFinisherSha256 === report.frameFinisherSha256 &&
      outcome.reviewRequestSha256 === request.reviewRequestSha256 &&
      outcome.reviewDecisionSha256 === decision.decisionSha256 &&
      outcome.finalFrameSha256 === report.output.sha256 &&
      outcome.dependentInbetweenEndpointAllowed === true &&
      outcome.sequenceDraftUseAllowed === true &&
      outcome.sequenceReleaseAllowed === false &&
      outcome.runtimeActivationAllowed === false,
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_REVIEW_OUTCOME_INVALID',
  );
  timestamp(outcome.reviewedAt, 'frame-review outcome.reviewedAt');
  assert(
    isRecord(outcome.finishedFrame) &&
      outcome.finishedFrame.path === report.output.path &&
      outcome.finishedFrame.sha256 === report.output.sha256 &&
      outcome.finishedFrame.bytes === report.output.bytes &&
      outcome.finishedFrame.width === 1024 &&
      outcome.finishedFrame.height === 1536 &&
      sameCanonical(outcome.reviewer, decision.reviewer) &&
      sameCanonical(outcome.gates, decision.gates) &&
      sameCanonical(outcome.evidence, decision.evidence),
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_REVIEW_OUTCOME_BINDING_INVALID',
  );
  exactKeys(
    outcome.authority,
    REVIEW_OUTCOME_AUTHORITY_KEYS,
    'frame-review outcome.authority',
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_REVIEW_AUTHORITY_INVALID',
  );
  for (const key of REVIEW_OUTCOME_AUTHORITY_KEYS) {
    const expected =
      key === 'namedHumanReviewEvidence' || key === 'finalFrameHashAdmission';
    assert(
      outcome.authority[key] === expected,
      'TOP_HAT_POSE_CANDIDATE_ADMISSION_REVIEW_AUTHORITY_INVALID',
      `frame-review outcome.authority.${key} is invalid.`,
    );
  }
  return outcome;
}
