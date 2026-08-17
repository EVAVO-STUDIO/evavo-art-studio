import {
  GENERIC_PROVIDER_METADATA_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_METADATA_SCHEMA,
  TOP_HAT_RUNTIME_CHARACTER_ID,
  TOP_HAT_RUNTIME_SESSION_ID,
  topHatRuntimeFalseApprovals,
} from './top-hat-pose-slot-provider-runtime-foundation.mjs';
import {
  topHatRuntimeContinuityEvidence,
  topHatRuntimeProviderImageReferences,
} from './top-hat-pose-slot-provider-runtime-references.mjs';

export function createTopHatRuntimeProviderRequest({
  sourcePackage,
  sourceJob,
  genericJobId,
  candidateOutputPath,
  admittedReferences,
}) {
  const source = sourceJob.providerRequestInput;
  const selection = sourceJob.selection;
  return Object.freeze({
    schemaVersion: '1.0',
    operation: 'edit',
    assetKind: 'sprite-frame',
    continuityPhase: 'key-pose',
    assetId: `${TOP_HAT_RUNTIME_CHARACTER_ID}:${sourceJob.slotId}`,
    candidateFamilyId:
      `top-hat-pose-runtime:${sourcePackage.productionPlanSha256}:${sourceJob.slotId}`,
    creativeIntent: sourceJob.composedPrompt,
    negativeIntent: source.negativeIntent,
    style: source.style,
    shot: source.shot,
    target: Object.freeze({
      width: 1024,
      height: 1536,
      transparency: 'required',
      outputFormat: 'png',
    }),
    sourceCanvas: Object.freeze({ width: 1024, height: 1536 }),
    background: Object.freeze({ strategy: 'native-alpha' }),
    quality: 'high',
    candidateCount: 1,
    ...(selection.seed === null ? {} : { seed: selection.seed }),
    references: topHatRuntimeProviderImageReferences(
      admittedReferences,
    ),
    selection: Object.freeze({
      ...(selection.preferredAdapterId === null
        ? {}
        : { preferredAdapterId: selection.preferredAdapterId }),
      ...(selection.preferredModel === null
        ? {}
        : { preferredModel: selection.preferredModel }),
      allowedAdapterIds: selection.allowedAdapterIds,
      allowFallback: false,
      requireSeed: selection.requireSeed,
    }),
    metadata: Object.freeze({
      schema: GENERIC_PROVIDER_METADATA_SCHEMA,
      planSha256: sourcePackage.productionPlanSha256,
      sourceCommit: sourcePackage.artStudio.commit,
      sessionId: TOP_HAT_RUNTIME_SESSION_ID,
      characterId: TOP_HAT_RUNTIME_CHARACTER_ID,
      jobId: genericJobId,
      frameId: sourceJob.slotId,
      upstreamJobSha256: sourceJob.jobEnvelopeSha256,
      targetPath: sourceJob.candidateOutputPath,
      candidateOutputPath,
      identityFrameId: 'neutral',
      authorizationEvidenceSha256:
        sourceJob.authorization.evidenceSha256,
      approvals: topHatRuntimeFalseApprovals(),
      topHatPoseSlot: Object.freeze({
        schema:
          TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_METADATA_SCHEMA,
        guardedDispatchRequired: true,
        providerPackageSchema: sourcePackage.schema,
        providerPackageSha256: sourcePackage.packageSha256,
        providerRequestSchema: sourcePackage.requestSchema,
        providerRequestSha256: sourcePackage.requestSha256,
        providerJobSchema: sourceJob.schema,
        providerJobEnvelopeSha256: sourceJob.jobEnvelopeSha256,
        productionPlanSchema: sourcePackage.productionPlanSchema,
        productionPlanSha256: sourcePackage.productionPlanSha256,
        identityReferenceSetSha256:
          sourcePackage.identityReferenceSetSha256,
        runtime: sourcePackage.runtime,
        artStudio: sourcePackage.artStudio,
        slotId: sourceJob.slotId,
        purpose: sourceJob.purpose,
        requiredFor: sourceJob.requiredFor,
        sourceMapping: sourceJob.sourceMapping,
        reviewedTargetPath: sourceJob.candidateOutputPath,
        candidateEvidencePath: sourceJob.candidateEvidencePath,
        candidateManifestPath: sourceJob.candidateManifestPath,
        reviewContactSheetPath: sourceJob.reviewContactSheetPath,
        authorization: Object.freeze({
          action: sourceJob.authorization.action,
          actorClass: 'human',
          actorId: sourceJob.authorization.actorId,
          occurredAt: sourceJob.authorization.occurredAt,
          expiresAt: sourceJob.authorization.expiresAt,
          evidenceSha256: sourceJob.authorization.evidenceSha256,
          maximumProviderCalls:
            sourceJob.authorization.maximumProviderCalls,
        }),
        alphaEncoding: source.metadata.alphaEncoding,
        bodyCadenceIndependentOfVisemes: true,
        registeredMouthLayerOwnsVisemes: true,
        syntheticBodyInbetweeningAllowed: false,
        continuityEvidence: topHatRuntimeContinuityEvidence(
          sourceJob,
          admittedReferences,
        ),
      }),
    }),
  });
}
