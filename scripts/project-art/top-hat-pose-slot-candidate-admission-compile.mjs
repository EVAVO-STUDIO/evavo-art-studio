import {
  assert,
  canonicalJson,
  deepFreeze,
  isRecord,
  sha256Document,
  timestamp,
} from './avatar-final-pass-provider-runtime-common.mjs';
import {
  inspectAvatarProviderCandidatePng,
} from './avatar-final-pass-provider-candidate.mjs';
import {
  parseAvatarFinalPassProviderRuntimeDispatch,
} from './avatar-final-pass-provider-runtime-dispatch-core.mjs';
import {
  parseAvatarFinalPassProviderRuntimeBinding,
} from './avatar-final-pass-provider-runtime-binding.mjs';
import {
  parseAvatarProviderCandidateSourceChain,
} from './avatar-final-pass-provider-candidate-source.mjs';
import {
  compileProjectArtTopHatPoseSlotProviderRuntimeDispatch,
  parseProjectArtTopHatPoseSlotProviderRuntimeAdapter,
} from './top-hat-pose-slot-provider-runtime-adapter.mjs';
import {
  parseFinisherReport,
  parseFinisherRequest,
  parseMaterialization,
} from './top-hat-pose-slot-candidate-admission-materialization.mjs';
import {
  parseReviewDecision,
  parseReviewOutcome,
  parseReviewRequest,
} from './top-hat-pose-slot-candidate-admission-review.mjs';
import {
  TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_PROTOCOL,
  TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_SCHEMA,
  TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_STATUS,
  TOP_HAT_POSE_SLOT_CHARACTER_ID,
  assertTopHatPoseSlotId,
  topHatPoseSlotCandidateAdmissionAuthority,
} from './top-hat-pose-slot-candidate-admission-foundation.mjs';

function exactFinishedFramePath(candidateOutputPath) {
  assert(
    candidateOutputPath.endsWith('.png'),
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_PATH_INVALID',
  );
  return `${candidateOutputPath.slice(0, -4)}.finished.png`;
}

export function admitProjectArtTopHatPoseSlotCandidate({
  adapter: adapterInput,
  slotId: slotInput,
  dispatch: dispatchInput,
  binding: bindingInput,
  outcome: outcomeInput,
  materializationReceipt: materializationInput,
  finisherRequest: finisherRequestInput,
  frameFinisherReport: frameReportInput,
  frameReviewRequest: reviewRequestInput,
  frameReviewDecision: reviewDecisionInput,
  frameReviewOutcome: reviewOutcomeInput,
  finishedFrameBytes,
  admittedAt = new Date().toISOString(),
}) {
  const slotId = assertTopHatPoseSlotId(slotInput);
  timestamp(admittedAt, 'admittedAt');
  const adapter = parseProjectArtTopHatPoseSlotProviderRuntimeAdapter(adapterInput);
  const slot = adapter.slots.find((entry) => entry.slotId === slotId);
  assert(slot, 'TOP_HAT_POSE_CANDIDATE_ADMISSION_SLOT_UNKNOWN');

  const dispatch = parseAvatarFinalPassProviderRuntimeDispatch(dispatchInput);
  const expectedDispatch =
    compileProjectArtTopHatPoseSlotProviderRuntimeDispatch({
      adapter,
      slotId,
      compiledAt: dispatch.compiledAt,
    });
  assert(
    canonicalJson(dispatch) === canonicalJson(expectedDispatch),
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_DISPATCH_MISMATCH',
  );
  assert(
    dispatch.characterId === TOP_HAT_POSE_SLOT_CHARACTER_ID &&
      dispatch.frameId === slotId &&
      dispatch.jobId === `redraw:${slotId}` &&
      dispatch.sessionId === 'top-hat-pose-slots-v1' &&
      dispatch.kind === 'provider-redraw' &&
      dispatch.operation === 'edit' &&
      dispatch.continuityPhase === 'key-pose' &&
      dispatch.candidateAdmission.candidateOutputPath ===
        slot.scratchCandidateOutputPath &&
      dispatch.candidateAdmission.reviewedTargetPath ===
        slot.reviewedTargetPath &&
      dispatch.candidateAdmission.expectedWidth === 1024 &&
      dispatch.candidateAdmission.expectedHeight === 1536,
    'TOP_HAT_POSE_CANDIDATE_ADMISION_DISPATCH_SCOPE_INVALID',
  );
  const topHatMetadata =
    dispatch.providerCompiler.input.metadata.topHatPoseSlot;
  assert(
    isRecord(topHatMetadata) &&
      topHatMetadata.guardedDispatchRequired === true &&
      topHatMetadata.slotId === slotId &&
      topHatMetadata.providerPackageSha256 ===
        adapter.sourceProviderPackageSha256 &&
      topHatMetadata.providerRequestSha256 ===
        adapter.sourceProviderRequestSha256 &&
      topHatMetadata.productionPlanSha256 ===
        adapter.productionPlanSha256 &&
      topHatMetadata.reviewedTargetPath === slot.reviewedTargetPath &&
      topHatMetadata.bodyCadenceIndependentOfVisemes === true &&
      topHatMetadata.registeredMouthLayerOwnsVisemes === true &&
      topHatMetadata.syntheticBodyInbetweeningAllowed === false,
   'TOP_HAT_POSE_CANDIDATE_ADMISSION_METADATA_INVALID',
  );

  const binding = parseAvatarFinalPassProviderRuntimeBinding(
    bindingInput,
    dispatch,
  );
  const source = parseAvatarProviderCandidateSourceChain({
    dispatch,
    binding,
    outcome: outcomeInput,
  });
  const outcome = source.outcome;
  const materialization = parseMaterialization(materializationInput, source);
  const finisherRequest = parseFinisherRequest(
    finisherRequestInput,
    source,
    materialization,
  );
  const frameReport = parseFinisherReport(
    frameReportInput,
    source,
    materialization,
    finisherRequest,
  );
  const reviewRequest = parseReviewRequest(
    reviewRequestInput,
    source,
    frameReport,
  );
  const reviewDecision = parseReviewDecision(
    reviewDecisionInput,
    frameReport,
    reviewRequest,
  );
  const reviewOutcome = parseReviewOutcome(
    reviewOutcomeInput,
    source,
    frameReport,
    reviewRequest,
    reviewDecision,
  );

  assert(
    Date.parse(admittedAt) >= Date.parse(reviewOutcome.reviewedAt),
   'TOP_HAT_POSE_CANDIDATE_ADMISSION_TIME_INVALID',
  );
  assert(
    frameReport.output.path === exactFinishedFramePath(source.candidateOutputPath),
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_FINISHED_PATH_INVALID',
  );

  const bytes = Buffer.from(finishedFrameBytes);
  const png = inspectAvatarProviderCandidatePng(bytes, 1024, 1536, {
    requireTransparentPixels: true,
  });
  assert(
    png.sha256 === frameReport.output.sha256 &&
      png.sha256 === reviewOutcome.finalFrameSha256 &&
      png.byteLength === frameReport.output.bytes &&
      png.visiblePixels > 0 &&
      png.transparentPixels > 0 &&
      png.hiddenRgbTransparentPixels === 0 &&
      png.edgeVisiblePixels === 0 &&
      png.visiblePixelSha256 === frameReport.output.visiblePixelSha256 &&
      png.alphaSha256 === frameReport.output.alphaSha256,
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_FINAL_PNG_INVALID',
  );

  const body = {
    schema: TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_SCHEMA,
    protocolVersion: TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_PROTOCOL,
    status: TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_STATUS,
    admittedAt,
    characterId: TOP_HAT_POSE_SLOT_CHARACTER_ID,
    slotId,
    adapterSha256: adapter.adapterSha256,
    sourceProviderPackageSha256: adapter.sourceProviderPackageSha256,
    sourceProviderRequestSha256: adapter.sourceProviderRequestSha256,
    productionPlanSha256: adapter.productionPlanSha256,
    runtime: adapter.runtime,
    artStudio: adapter.artStudio,
    sourceChain: Object.freeze({
      runtimeDispatchSha256: dispatch.runtimeDispatchSha256,
      runtimeBindingSha256: binding.runtimeBindingSha256,
      runtimeOutcomeSha256: outcome.runtimeOutcomeSha256,
      materializationSha256: materialization.materializationSha256,
      finisherRequestSha256: finisherRequest.finisherRequestSha256,
      frameFinisherSha256: frameReport.frameFinisherSha256,
      reviewRequestSha256: reviewRequest.reviewRequestSha256,
      reviewDecisionSha256: reviewDecision.decisionSha256,
      reviewOutcomeSha256: reviewOutcome.reviewOutcomeSha256,
      candidateArtifactId: source.candidateArtifactId,
      evidenceArtifactId: source.evidenceArtifactId,
      providerRequestId: source.providerRequestId,
      providerRequestSha256: source.providerRequestSha256,
      compiledPromptSha256: source.compiledPromptSha256,
    }),
    finalFrame: Object.freeze({
      path: frameReport.output.path,
      reviewedTargetPath: source.reviewedTargetPath,
      sha256: png.sha256,
      bytes: png.byteLength,
      width: png.width,
      height: png.height,
      visiblePixels: png.visiblePixels,
      transparentPixels: png.transparentPixels,
      partialAlphaPixels: png.partialAlphaPixels,
      hiddenRgbTransparentPixels: png.hiddenRgbTransparentPixels,
      edgeVisiblePixels: png.edgeVisiblePixels,
      visibleBounds: png.visibleBounds,
      visiblePixelSha256: png.visiblePixelSha256,
      alphaSha256: png.alphaSha256,
      alphaAssociation: 'straight',
      pixelFormat: 'rgba8-straight',
      colourSpace: 'srgb',
    }),
    review: Object.freeze({
      reviewId: reviewDecision.reviewId,
      reviewer: reviewDecision.reviewer,
      gates: reviewDecision.gates,
      evidence: reviewDecision.evidence,
      notes: reviewDecision.notes,
    }),
    releaseReview: Object.freeze({
      eligible: true,
      candidateApprovalInherited: false,
      poseSlotFilled: false,
      poseBankReleased: false,
      runtimeActivationAllowed: false,
      websiteInstallationAllowed: false,
      requiredNextSteps: Object.freeze([
        'collect-six-exact-slot-admissions',
        'compile-hash-bound-top-hat-pose-bank-release-plan',
        'obtain-separate-named-human-pose-bank-release-approval',
        'publish-a-new-avatar-runtime-pose-bank-release',
        'perform-separate-website-installation-and-activation-review',
      ]),
    }),
    authority: topHatPoseSlotCandidateAdmissionAuthority(),
  };
  return deepFreeze({
    ...body,
    candidateAdmissionSha256: sha256Document(body),
  });
}

