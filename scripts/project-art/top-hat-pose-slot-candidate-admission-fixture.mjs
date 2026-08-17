import { createHash } from 'node:crypto';

import {
  AVATAR_PROVIDER_CANDIDATE_FINISHER_REQUEST_SCHEMA,
  AVATAR_PROVIDER_CANDIDATE_MATERIALIZATION_SCHEMA,
  AVATAR_PROVIDER_CANDIDATE_PROTOCOL_VERSION,
  inspectAvatarProviderCandidatePng,
  sha256AvatarProviderCandidateDocument,
} from './avatar-final-pass-provider-candidate.mjs';
import {
  FRAME_FINISHER_PROTOCOL_VERSION,
  FRAME_FINISHER_REPORT_SCHEMA,
  FRAME_REVIEW_DECISION_SCHEMA,
  FRAME_REVIEW_OUTCOME_SCHEMA,
  FRAME_REVIEW_REQUEST_SCHEMA,
  sha256FrameFinisherDocument,
} from './avatar-final-pass-provider-frame-finisher.mjs';
import {
  compileAvatarFinalPassProviderRuntimeOutcome,
  validateAvatarFinalPassCompiledProviderRuntimeContract,
} from './avatar-final-pass-provider-runtime.mjs';
import {
  candidateRunOutcome,
  compiledRuntimeContract,
} from './avatar-final-pass-provider-runtime-fixture.mjs';
import {
  createRgbaPng,
} from './avatar-final-pass-provider-candidate-fixture.mjs';
import {
  compileProjectArtTopHatPoseSlotProviderRuntimeAdapter,
  compileProjectArtTopHatPoseSlotProviderRuntimeDispatch,
} from './top-hat-pose-slot-provider-runtime-adapter.mjs';
import {
  createReadyTopHatPoseSlotProviderRuntimeRequest,
  topHatPoseRuntimeFixtureCompiledAt,
} from './top-hat-pose-slot-provider-runtime-fixture.mjs';
import {
  parseAvatarProviderCandidateSourceChain,
} from './avatar-final-pass-provider-candidate-source.mjs';

const sha = (value) =>
  createHash('sha256').update(String(value), 'utf8').digest('hex');

const providerStartedAt = '2026-08-16T12:31:00.000Z';
const providerCompletedAt = '2026-08-16T12:32:00.000Z';
const materializedAt = '2026-08-16T12:33:00.000Z';
const finishedAt = '2026-08-16T12:34:00.000Z';
const reviewedAt = '2026-08-16T12:36:00.000Z';
export const topHatPoseCandidateFixtureAdmittedAt =
  '2026-08-16T12:37:00.000Z';

function candidateSelfHash(body, field) {
  return Object.freeze({
    ...body,
    [field]: sha256AvatarProviderCandidateDocument(body),
  });
}

function frameSelfHash(body, field) {
  return Object.freeze({
    ...body,
    [field]: sha256FrameFinisherDocument(body),
  });
}

function allFalse(keys) {
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, false])));
}

function outputPaths(candidatePath) {
  const stem = candidatePath.slice(0, -4);
  return Object.freeze({
    finisherRequest: `${stem}.finisher-request.json`,
    finished: `${stem}.finished.png`,
    report: `${stem}.frame-finisher.json`,
    reviewRequest: `${stem}.frame-review-request.json`,
    reviewOutcome: `${stem}.frame-review-outcome.json`,
  });
}

export function createTopHatPoseSlotCandidateAdmissionFixture(
  slotId = 'blink-closed',
) {
  const adapter =
    compileProjectArtTopHatPoseSlotProviderRuntimeAdapter({
      request: createReadyTopHatPoseSlotProviderRuntimeRequest(),
      compiledAt: topHatPoseRuntimeFixtureCompiledAt,
    });
  const dispatch =
    compileProjectArtTopHatPoseSlotProviderRuntimeDispatch({
      adapter,
      slotId,
      compiledAt: topHatPoseRuntimeFixtureCompiledAt,
    });
  const compiled = compiledRuntimeContract(dispatch);
  const binding =
    validateAvatarFinalPassCompiledProviderRuntimeContract(
      dispatch,
      compiled,
    );
  const rawOutcome = structuredClone(
    candidateRunOutcome(dispatch, binding),
  );
  rawOutcome.completedAt = providerCompletedAt;
  rawOutcome.result.attempts[0].startedAt = providerStartedAt;
  rawOutcome.result.attempts[0].completedAt = providerCompletedAt;
  const outcome = compileAvatarFinalPassProviderRuntimeOutcome(
    dispatch,
    binding,
    rawOutcome,
  );
  const source = parseAvatarProviderCandidateSourceChain({
    dispatch,
    binding,
    outcome,
  });

  const finishedFrameBytes = createRgbaPng({
    width: 1024,
    height: 1536,
  });
  const png = inspectAvatarProviderCandidatePng(
    finishedFrameBytes,
    1024,
    1536,
    { requireTransparentPixels: true },
  );
  const paths = outputPaths(source.candidateOutputPath);
  const materializationId =
    `top-hat-materialization:${sha(`${slotId}:${outcome.runtimeOutcomeSha256}`).slice(0, 40)}`;

  const materializationBody = {
    schema: AVATAR_PROVIDER_CANDIDATE_MATERIALIZATION_SCHEMA,
    protocolVersion: AVATAR_PROVIDER_CANDIDATE_PROTOCOL_VERSION,
    status: 'candidate-materialized-awaiting-frame-finisher',
    materializationId,
    materializedAt,
    sourceCommit: dispatch.sourceCommit,
    source: Object.freeze({
      runtimeDispatchSha256: dispatch.runtimeDispatchSha256,
      runtimeBindingSha256: binding.runtimeBindingSha256,
      runtimeOutcomeSha256: outcome.runtimeOutcomeSha256,
      providerRequestId: source.providerRequestId,
      providerRequestSha256: source.providerRequestSha256,
      compiledPromptSha256: source.compiledPromptSha256,
      candidateArtifactId: source.candidateArtifactId,
      candidateArtifactDescriptorSha256: sha(`${slotId}:candidate-descriptor`),
      evidenceArtifactId: source.evidenceArtifactId,
      evidenceArtifactDescriptorSha256: sha(`${slotId}:evidence-descriptor`),
      providerEvidenceContentSha256: sha(`${slotId}:provider-evidence`),
    }),
    output: Object.freeze({
      path: source.candidateOutputPath,
      reviewedTargetPath: source.reviewedTargetPath,
      sha256: png.sha256,
      bytes: png.byteLength,
      mediaType: 'image/png',
      width: 1024,
      height: 1536,
      createOnly: true,
      unapproved: true,
    }),
    png,
    authorization: Object.freeze({
      action: 'materialize-unapproved-provider-candidate',
      actorClass: 'agent',
      actorId: 'fixture-agent',
      occurredAt: providerCompletedAt,
      evidenceSha256: sha(`${slotId}:materialization-authorization`),
    }),
    finisherHandoff: Object.freeze({
      path: paths.finisherRequest,
      finisherRequestSha256: '',
    }),
    requiredNextSteps: Object.freeze([
      'rerun-avatar-frame-finisher',
      'review-hands-anatomy-face-identity-and-continuity',
      'record-final-reviewed-frame-sha256',
    ]),
    approvals: Object.freeze({
      technical: false,
      creative: false,
      anatomy: false,
      identity: false,
      continuity: false,
      loop: false,
      runtime: false,
      publication: false,
    }),
    authority: Object.freeze({
      artifactRead: true,
      evidenceRead: true,
      candidateMaterialization: true,
      receiptPersistence: true,
      finisherRequestPersistence: true,
      alphaExtraction: false,
      deterministicQa: false,
      creativeReview: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      runtimeActivation: false,
      forcePush: false,
    }),
  };

  const finisherRequestBody = {
    schema: AVATAR_PROVIDER_CANDIDATE_FINISHER_REQUEST_SCHEMA,
    protocolVersion: AVATAR_PROVIDER_CANDIDATE_PROTOCOL_VERSION,
    requestId: `top-hat-finisher:${sha(`${slotId}:${png.sha256}`).slice(0, 40)}`,
    materializationId,
    createdAt: materializedAt,
    sourceCommit: dispatch.sourceCommit,
    sessionId: dispatch.sessionId,
    characterId: dispatch.characterId,
    jobId: dispatch.jobId,
    frameId: dispatch.frameId,
    kind: dispatch.kind,
    operation: dispatch.operation,
    continuityPhase: dispatch.continuityPhase,
    sourceCandidate: Object.freeze({
      path: source.candidateOutputPath,
      sha256: png.sha256,
      bytes: png.byteLength,
      mediaType: 'image/png',
      width: 1024,
      height: 1536,
      visiblePixels: png.visiblePixels,
      transparentPixels: png.transparentPixels,
      partialAlphaPixels: png.partialAlphaPixels,
      hiddenRgbTransparentPixels: png.hiddenRgbTransparentPixels,
      edgeVisiblePixels: png.edgeVisiblePixels,
      visibleBounds: png.visibleBounds,
      artifactId: source.candidateArtifactId,
      artifactDescriptorSha256: materializationBody.source.candidateArtifactDescriptorSha256,
      evidenceArtifactId: source.evidenceArtifactId,
      evidenceDescriptorSha256: materializationBody.source.evidenceArtifactDescriptorSha256,
      runtimeOutcomeSha256: outcome.runtimeOutcomeSha256,
    }),
    reviewedTargetPath: source.reviewedTargetPath,
    requiredOperations: Object.freeze([
      'clear-hidden-rgb-under-fully-transparent-pixels',
      'preserve-canonical-canvas-and-registration',
      'run-avatar-frame-finisher',
    ]),
    requiredReviewGates: Object.freeze([
      'technical',
      'hands-and-anatomy',
      'face-identity',
      'silhouette-and-registration',
      'adjacent-frame-continuity',
      'final-to-first-loop-closure-when-applicable',
    ]),
    finalSha256RequiredBeforeInbetweenOrSequenceUse: true,
    candidateApproval: false,
    candidatePromotion: false,
    runtimeActivationAllowed: false,
    authority: Object.freeze({
      sourceMutation: false,
      sourceDeletion: false,
      deterministicQa: false,
      creativeReview: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      runtimeActivation: false,
      forcePush: false,
    }),
  };
  const finisherRequest = candidateSelfHash(
    finisherRequestBody,
    'finisherRequestSha256',
  );
  materializationBody.finisherHandoff = Object.freeze({
    path: paths.finisherRequest,
    finisherRequestSha256: finisherRequest.finisherRequestSha256,
  });
  const materializationReceipt = candidateSelfHash(
    materializationBody,
    'materializationSha256',
  );

  const frameFinisherBody = {
    schema: FRAME_FINISHER_REPORT_SCHEMA,
    protocolVersion: FRAME_FINISHER_PROTOCOL_VERSION,
    status: 'frame-finished-awaiting-human-review',
    finishId: `top-hat-frame-finish:${sha(`${slotId}:${png.sha256}`).slice(0, 40)}`,
    finishedAt,
    materializationId,
    sourceCommit: dispatch.sourceCommit,
    sessionId: dispatch.sessionId,
    characterId: dispatch.characterId,
    jobId: dispatch.jobId,
    frameId: dispatch.frameId,
    kind: dispatch.kind,
    operation: dispatch.operation,
    continuityPhase: dispatch.continuityPhase,
    source: Object.freeze({
      path: source.candidateOutputPath,
      sha256: png.sha256,
      bytes: png.byteLength,
      width: 1024,
      height: 1536,
      hiddenRgbTransparentPixels: png.hiddenRgbTransparentPixels,
      visibleBounds: png.visibleBounds,
      visiblePixelSha256: png.visiblePixelSha256,
      alphaSha256: png.alphaSha256,
      materializationSha256: materializationReceipt.materializationSha256,
      finisherRequestSha256: finisherRequest.finisherRequestSha256,
    }),
    output: Object.freeze({
      path: paths.finished,
      sha256: png.sha256,
      bytes: png.byteLength,
      width: 1024,
      height: 1536,
      hiddenRgbTransparentPixels: 0,
      hiddenRgbPixelsCleared: 0,
      visibleBounds: png.visibleBounds,
      visiblePixelSha256: png.visiblePixelSha256,
      alphaSha256: png.alphaSha256,
      createOnly: true,
      approvalState: 'unapproved',
    }),
    preservation: Object.freeze({
      visiblePixelsUnchanged: true,
      alphaUnchanged: true,
      canvasUnchanged: true,
      visibleBoundsUnchanged: true,
      registrationUnchanged: true,
      onlyHiddenTransparentRgbWasModified: true,
    }),
    requiredNextSteps: Object.freeze([
      'inspect-finished-frame-at-native-scale',
      'inspect-finished-frame-in-contact-sheet',
      'record-named-human-frame-review-decision',
    ]),
    approvals: Object.freeze({
      technical: false,
      creative: false,
      anatomy: false,
      identity: false,
      continuity: false,
      loop: false,
      runtime: false,
      publication: false,
    }),
    authority: Object.freeze({
      sourceRead: true,
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
      sequenceAdmission: false,
      sequenceRelease: false,
      repositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      runtimeActivation: false,
      forcePush: false,
    }),
  };
  const frameFinisherReport = frameSelfHash(
    frameFinisherBody,
    'frameFinisherSha256',
  );

  const reviewRequestBody = {
    schema: FRAME_REVIEW_REQUEST_SCHEMA,
    protocolVersion: FRAME_FINISHER_PROTOCOL_VERSION,
    reviewRequestId: `top-hat-frame-review:${sha(`${slotId}:${frameFinisherReport.frameFinisherSha256}`).slice(0, 40)}`,
    createdAt: finishedAt,
    frameFinisherSha256: frameFinisherReport.frameFinisherSha256,
    materializationSha256: materializationReceipt.materializationSha256,
    finisherRequestSha256: finisherRequest.finisherRequestSha256,
    frameId: slotId,
    characterId: dispatch.characterId,
    finishedFrame: Object.freeze({
      path: paths.finished,
      sha256: png.sha256,
      bytes: png.byteLength,
      width: 1024,
      height: 1536,
      visibleBounds: png.visibleBounds,
      visiblePixelSha256: png.visiblePixelSha256,
      alphaSha256: png.alphaSha256,
    }),
    reviewedTargetPath: source.reviewedTargetPath,
    requiredGates: Object.freeze([
      'technical',
      'handsAndAnatomy',
      'faceIdentity',
      'silhouetteRegistration',
      'adjacentFrameContinuity',
      'loopClosure',
    ]),
    requiredEvidence: Object.freeze([
      'native-scale-inspection',
      'contact-sheet-inspection',
      'canonical-identity-comparison',
      'adjacent-frame-continuity-comparison',
      'final-to-first-loop-closure-when-applicable',
    ]),
    finalSha256RequiredBeforeInbetweenOrSequenceUse: true,
    sequenceReleaseAllowed: false,
    runtimeActivationAllowed: false,
    authority: Object.freeze({
      namedHumanReviewEvidence: true,
      finalFrameHashAdmission: false,
      candidatePromotion: false,
      dependentInbetweenGeneration: false,
      sequenceRelease: false,
      repositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      runtimeActivation: false,
      forcePush: false,
    }),
  };
  const frameReviewRequest = frameSelfHash(
    reviewRequestBody,
    'reviewRequestSha256',
  );

  const gates = Object.freeze({
    technical: 'pass',
    handsAndAnatomy: 'pass',
    faceIdentity: 'pass',
    silhouetteRegistration: 'pass',
    adjacentFrameContinuity: 'pass',
    loopClosure: 'not-applicable',
  });
  const evidence = Object.freeze({
    nativeScaleSha256: sha(`${slotId}:native-scale`),
    contactSheetSha256: sha(`${slotId}:contact-sheet`),
    identityReferenceSha256: sha(`${slotId}:identity-reference`),
    adjacentFramesSha256: sha(`${slotId}:adjacent-frames`),
    loopClosureSha256: null,
  });
  const reviewer = Object.freeze({
    actorClass: 'human',
    actorId: 'fixture-reviewer',
    occurredAt: '2026-08-16T12:35:00.000Z',
    evidenceSha256: sha(`${slotId}:reviewer-evidence`),
  });
  const reviewDecisionBody = {
    schema: FRAME_REVIEW_DECISION_SCHEMA,
    protocolVersion: FRAME_FINISHER_PROTOCOL_VERSION,
    reviewId: `top-hat-review:${slotId}`,
    frameFinisherSha256: frameFinisherReport.frameFinisherSha256,
    reviewRequestSha256: frameReviewRequest.reviewRequestSha256,
    frameId: slotId,
    decision: 'approve-final-frame',
    reviewer,
    gates,
    evidence,
    notes: 'Fixture-only named-human approval evidence.',
    authority: allFalse([
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
    ]),
  };
  const frameReviewDecision = frameSelfHash(
    reviewDecisionBody,
    'decisionSha256',
  );

  const reviewOutcomeBody = {
    schema: FRAME_REVIEW_OUTCOME_SCHEMA,
    protocolVersion: FRAME_FINISHER_PROTOCOL_VERSION,
    status: 'final-frame-admitted',
    reviewedAt,
    reviewId: frameReviewDecision.reviewId,
    frameId: slotId,
    characterId: dispatch.characterId,
    frameFinisherSha256: frameFinisherReport.frameFinisherSha256,
    reviewRequestSha256: frameReviewRequest.reviewRequestSha256,
    reviewDecisionSha256: frameReviewDecision.decisionSha256,
    finishedFrame: Object.freeze({
      path: paths.finished,
      sha256: png.sha256,
      bytes: png.byteLength,
      width: 1024,
      height: 1536,
    }),
    finalFrameSha256: png.sha256,
    dependentInbetweenEndpointAllowed: true,
    sequenceDraftUseAllowed: true,
    sequenceReleaseAllowed: false,
    runtimeActivationAllowed: false,
    reviewer,
    gates,
    evidence,
    notes: frameReviewDecision.notes,
    requiredNextSteps: Object.freeze([
      'bind-final-frame-sha-to-dependent-inbetween-or-sequence-draft',
      'obtain-separate-sequence-release-approval',
    ]),
    authority: Object.freeze({
      namedHumanReviewEvidence: true,
      finalFrameHashAdmission: true,
      candidatePromotion: false,
      dependentInbetweenGeneration: false,
      sequenceRelease: false,
      repositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      runtimeActivation: false,
      forcePush: false,
    }),
  };
  const frameReviewOutcome = frameSelfHash(
    reviewOutcomeBody,
    'reviewOutcomeSha256',
  );

  return Object.freeze({
    adapter,
    slotId,
    dispatch,
    binding,
    outcome,
    materializationReceipt,
    finisherRequest,
    frameFinisherReport,
    frameReviewRequest,
    frameReviewDecision,
    frameReviewOutcome,
    finishedFrameBytes,
    admittedAt: topHatPoseCandidateFixtureAdmittedAt,
  });
}
