import {
  assert,
  sha256Document,
} from './avatar-final-pass-provider-runtime-common.mjs';
import {
  TOP_HAT_POSE_SLOT_PROVIDER_JOB_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_REQUEST_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_SCHEMA,
} from './top-hat-pose-slot-provider-package.mjs';
import {
  TOP_HAT_RUNTIME_CHARACTER_ID,
  TOP_HAT_RUNTIME_EXPECTED_SLOTS,
  topHatRuntimeCandidateOutputPath,
} from './top-hat-pose-slot-provider-runtime-foundation.mjs';
import {
  mapTopHatRuntimeReferences,
} from './top-hat-pose-slot-provider-runtime-references.mjs';
import {
  createTopHatRuntimeProviderRequest,
} from './top-hat-pose-slot-provider-runtime-request.mjs';

export function mappedTopHatRuntimeGenericJob(sourcePackage, sourceJob) {
  assert(
    sourceJob.schema === TOP_HAT_POSE_SLOT_PROVIDER_JOB_SCHEMA &&
      sourceJob.status ===
        'ready-for-explicit-provider-submission' &&
      sourceJob.blockers.length === 0 &&
      sourceJob.providerRequestInput !== null &&
      sourceJob.providerExecution === false &&
      sourceJob.imageMutation === false &&
      sourceJob.candidateApproval === false &&
      sourceJob.candidatePromotion === false &&
      sourceJob.poseSlotFilling === false &&
      sourceJob.runtimeActivation === false &&
      sourceJob.publication === false,
    'TOP_HAT_PROVIDER_RUNTIME_SOURCE_JOB_INVALID',
    `${sourceJob.slotId} is not a sealed submit-ready Top Hat provider job.`,
  );
  const { admittedReferences, requiredReferences } =
    mapTopHatRuntimeReferences(sourceJob);
  const jobId = `redraw:${sourceJob.slotId}`;
  const candidateOutputPath =
    topHatRuntimeCandidateOutputPath(sourceJob.slotId);
  const request = createTopHatRuntimeProviderRequest({
    sourcePackage,
    sourceJob,
    genericJobId: jobId,
    candidateOutputPath,
    admittedReferences,
  });
  const body = {
    jobId,
    frameId: sourceJob.slotId,
    kind: 'provider-redraw',
    operation: 'edit',
    continuityPhase: 'key-pose',
    status: 'ready-for-explicit-provider-submission',
    blockers: Object.freeze([]),
    identityFrameId: 'neutral',
    targetPath: sourceJob.candidateOutputPath,
    candidateOutputPath,
    upstreamJobSha256: sourceJob.jobEnvelopeSha256,
    requiredReferences,
    admittedReferences,
    authorization: Object.freeze({
      action: 'run-provider-once',
      actorClass: 'human',
      actorId: sourceJob.authorization.actorId,
      occurredAt: sourceJob.authorization.occurredAt,
      evidenceSha256: sourceJob.authorization.evidenceSha256,
    }),
    composedPrompt: sourceJob.composedPrompt,
    promptSha256: sourceJob.promptSha256,
    providerRequestInput: request,
    providerRequestSha256: sha256Document(request),
    candidateCount: 1,
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    targetPublication: false,
  };
  return Object.freeze({
    ...body,
    jobEnvelopeSha256: sha256Document(body),
  });
}

export function assertReadyTopHatRuntimeSourcePackage(sourcePackage) {
  assert(
    sourcePackage.schema ===
      TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_SCHEMA &&
      sourcePackage.requestSchema ===
        TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_REQUEST_SCHEMA &&
      sourcePackage.characterId === TOP_HAT_RUNTIME_CHARACTER_ID &&
      sourcePackage.status ===
        'ready-for-explicit-provider-submission' &&
      sourcePackage.counts.jobs === 6 &&
      sourcePackage.counts.readyJobs === 6 &&
      sourcePackage.counts.blockedJobs === 0 &&
      sourcePackage.counts.maximumProviderCalls === 6 &&
      sourcePackage.counts.candidatesPerJob === 1 &&
      sourcePackage.counts.maximumCandidates === 6 &&
      sourcePackage.currentRuntimeSafe === true &&
      sourcePackage.expandedPerformanceReady === false &&
      sourcePackage.providerExecutionPerformed === false &&
      sourcePackage.candidateBytesMaterialized === false &&
      sourcePackage.candidateApprovalPerformed === false &&
      sourcePackage.poseSlotsFilled === false &&
      sourcePackage.runtimeActivationPerformed === false &&
      sourcePackage.publicationPerformed === false,
    'TOP_HAT_PROVIDER_RUNTIME_PACKAGE_NOT_READY',
    'All six Top Hat pose jobs must be exactly admitted before runtime adaptation.',
  );
  assert(
    sourcePackage.jobs.map((job) => job.slotId).join('\0') ===
      TOP_HAT_RUNTIME_EXPECTED_SLOTS.join('\0'),
    'TOP_HAT_PROVIDER_RUNTIME_SLOT_SET_INVALID',
  );
  assert(
    Object.values(sourcePackage.authority).every(
      (value) => value === false,
    ),
    'TOP_HAT_PROVIDER_RUNTIME_SOURCE_AUTHORITY_INVALID',
  );
}

export function topHatRuntimeSlotSummary(sourceJob) {
  return Object.freeze({
    slotId: sourceJob.slotId,
    genericJobId: `redraw:${sourceJob.slotId}`,
    sourceJobEnvelopeSha256: sourceJob.jobEnvelopeSha256,
    reviewedTargetPath: sourceJob.candidateOutputPath,
    scratchCandidateOutputPath:
      topHatRuntimeCandidateOutputPath(sourceJob.slotId),
    sourceProviderRequestSha256: sourceJob.providerRequestSha256,
    authorization: Object.freeze({
      actorClass: 'human',
      actorId: sourceJob.authorization.actorId,
      occurredAt: sourceJob.authorization.occurredAt,
      expiresAt: sourceJob.authorization.expiresAt,
      evidenceSha256: sourceJob.authorization.evidenceSha256,
      maximumProviderCalls: 1,
    }),
    providerExecution: false,
    candidateMaterialization: false,
    candidateApproval: false,
    poseSlotFilling: false,
    runtimeActivation: false,
  });
}
