import { TOP_HAT_POSE_SLOT_PRODUCTION_PLAN_SCHEMA } from './top-hat-pose-slot-production.mjs';
import {
  CHARACTER_ID,
  TOP_HAT_POSE_SLOT_PROVIDER_CAPABILITIES_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_JOB_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_METADATA_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_REQUEST_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_SCHEMA,
  createProjectArtTopHatPoseSlotProviderAuthority,
  freezeClone,
  isRecord,
  sha256Document,
} from './top-hat-pose-slot-provider-foundation.mjs';
import { currentPlan, parseRequest } from './top-hat-pose-slot-provider-validation.mjs';
import { compileJob } from './top-hat-pose-slot-provider-job.mjs';

export {
  TOP_HAT_POSE_SLOT_PROVIDER_CAPABILITIES_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_JOB_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_METADATA_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_REQUEST_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_SCHEMA,
  ProjectArtTopHatPoseSlotProviderPackageError,
  canonicalTopHatPoseSlotProviderPackageJson,
  createProjectArtTopHatPoseSlotProviderAuthority,
} from './top-hat-pose-slot-provider-foundation.mjs';

export function createProjectArtTopHatPoseSlotProviderPackageRequest(
  options = {},
) {
  const plan = options.plan ?? currentPlan();
  const selectionBySlot = isRecord(options.selectionBySlot)
    ? options.selectionBySlot
    : {};
  const authorizationBySlot = isRecord(options.authorizationBySlot)
    ? options.authorizationBySlot
    : {};
  const artifactBindingsBySlot = isRecord(options.artifactBindingsBySlot)
    ? options.artifactBindingsBySlot
    : {};
  const notesBySlot = isRecord(options.notesBySlot) ? options.notesBySlot : {};
  return freezeClone({
    schema: TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_REQUEST_SCHEMA,
    requestId:
      options.requestId ?? 'top-hat-pose-slot-provider-package-v1',
    plan,
    jobs: plan.productionSlots.map((slot) => ({
      slotId: slot.slotId,
      candidateOutputPath: slot.candidateOutputs.rgbaMasterPath,
      selection:
        selectionBySlot[slot.slotId] ??
        {
          preferredAdapterId: null,
          preferredModel: null,
          allowedAdapterIds: [],
          allowFallback: false,
          requireSeed: true,
          seed: null,
        },
      authorization: authorizationBySlot[slot.slotId] ?? null,
      artifactBindings: artifactBindingsBySlot[slot.slotId] ?? [],
      notes: notesBySlot[slot.slotId] ?? '',
    })),
    authority: createProjectArtTopHatPoseSlotProviderAuthority(),
  });
}

export function compileProjectArtTopHatPoseSlotProviderPackage(value) {
  const request = parseRequest(value);
  const requestSha256 = sha256Document(request);
  const jobs = Object.freeze(
    request.jobs.map((entry) => compileJob(entry, request.plan)),
  );
  const readyJobs = jobs.filter(
    (job) => job.status === 'ready-for-explicit-provider-submission',
  );
  const blockedJobs = jobs.filter((job) => job.status === 'blocked');
  const body = Object.freeze({
    schema: TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_SCHEMA,
    requestSchema: TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_REQUEST_SCHEMA,
    requestId: request.requestId,
    requestSha256,
    productionPlanSchema: request.plan.schema,
    productionPlanSha256: request.plan.planSha256,
    characterId: CHARACTER_ID,
    runtime: request.plan.runtime,
    artStudio: request.plan.artStudio,
    identityReferenceSetSha256: request.plan.identityReferenceSetSha256,
    status:
      blockedJobs.length === 0
        ? 'ready-for-explicit-provider-submission'
        : 'blocked',
    jobs,
    counts: Object.freeze({
      jobs: jobs.length,
      readyJobs: readyJobs.length,
      blockedJobs: blockedJobs.length,
      maximumProviderCalls: jobs.length,
      candidatesPerJob: 1,
      maximumCandidates: jobs.length,
      requiredPoseSlots: request.plan.counts.requiredPoseSlots,
      activationEligiblePoseSlots:
        request.plan.counts.activationEligiblePoseSlots,
    }),
    currentRuntimeSafe: request.plan.currentRuntimeSafe,
    expandedPerformanceReady: false,
    artGenerationRequired: true,
    explicitHumanAuthorizationRequired: true,
    explicitProviderSubmissionRequired: true,
    providerExecutionPerformed: false,
    candidateBytesMaterialized: false,
    candidateApprovalPerformed: false,
    poseSlotsFilled: false,
    runtimeActivationPerformed: false,
    publicationPerformed: false,
    authority: request.authority,
  });
  return Object.freeze({
    ...body,
    packageSha256: sha256Document(body),
  });
}

export function projectArtTopHatPoseSlotProviderPackageCapabilities() {
  return Object.freeze({
    schema: TOP_HAT_POSE_SLOT_PROVIDER_CAPABILITIES_SCHEMA,
    requestSchema: TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_REQUEST_SCHEMA,
    packageSchema: TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_SCHEMA,
    jobSchema: TOP_HAT_POSE_SLOT_PROVIDER_JOB_SCHEMA,
    providerMetadataSchema: TOP_HAT_POSE_SLOT_PROVIDER_METADATA_SCHEMA,
    productionPlanSchema: TOP_HAT_POSE_SLOT_PRODUCTION_PLAN_SCHEMA,
    characterId: CHARACTER_ID,
    requiredPoseSlots: 6,
    maximumProviderCalls: 6,
    candidatesPerJob: 1,
    explicitHumanAuthorizationRequired: true,
    authorizationWindowHoursMaximum: 24,
    exactReferenceAdmissionRequired: true,
    deterministicSeedSupported: true,
    providerFallbackAllowed: false,
    nativeStraightAlphaRequired: true,
    alphaAssociationDeclared: true,
    fakeTransparencyGridAllowed: false,
    opaqueMatteAllowed: false,
    chromaSpillAllowed: false,
    registeredMouthLayerOwnsVisemes: true,
    bodyCadenceIndependentOfVisemes: true,
    syntheticBodyInbetweeningAllowed: false,
    createOnlyCandidatePaths: true,
    providerExecution: false,
    imageMutation: false,
    candidateApproval: false,
    candidatePromotion: false,
    poseSlotFilling: false,
    sequenceRelease: false,
    repositoryMutation: false,
    gitCommit: false,
    gitPush: false,
    deployment: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  });
}
