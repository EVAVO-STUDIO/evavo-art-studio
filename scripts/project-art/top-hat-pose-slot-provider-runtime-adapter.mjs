import {
  canonicalJson,
  deepFreeze,
  exactKeys,
  sha256Document,
  snapshotJsonValue,
  timestamp,
  verifySelfHash,
  assert,
} from './avatar-final-pass-provider-runtime-common.mjs';
import {
  TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_REQUEST_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_SCHEMA,
  compileProjectArtTopHatPoseSlotProviderPackage,
} from './top-hat-pose-slot-provider-package.mjs';
import {
  TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_CAPABILITIES_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_SCHEMA,
  TOP_HAT_RUNTIME_CHARACTER_ID,
  TOP_HAT_RUNTIME_SESSION_ID,
  topHatRuntimeAdapterAuthority,
} from './top-hat-pose-slot-provider-runtime-foundation.mjs';
import {
  assertReadyTopHatRuntimeSourcePackage,
  topHatRuntimeSlotSummary,
} from './top-hat-pose-slot-provider-runtime-job.mjs';
import {
  compileTopHatPoseSlotProviderRuntimeDispatch,
} from './top-hat-pose-slot-provider-runtime-dispatch.mjs';

export {
  TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_CAPABILITIES_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_METADATA_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_RECEIPT_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_DISPATCH_RECEIPT_SCHEMA,
} from './top-hat-pose-slot-provider-runtime-foundation.mjs';

export function compileProjectArtTopHatPoseSlotProviderRuntimeAdapter({
  request,
  compiledAt = new Date().toISOString(),
}) {
  timestamp(compiledAt, 'compiledAt');
  const sourceRequest = deepFreeze(
    snapshotJsonValue(request, 'Top Hat provider request'),
  );
  const sourcePackage =
    compileProjectArtTopHatPoseSlotProviderPackage(sourceRequest);
  assertReadyTopHatRuntimeSourcePackage(sourcePackage);
  const body = {
    schema: TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_SCHEMA,
    compiledAt,
    sourceRequest,
    sourceRequestSchema: sourceRequest.schema,
    sourceProviderRequestSha256: sourcePackage.requestSha256,
    sourceProviderPackageSchema: sourcePackage.schema,
    sourceProviderPackageSha256: sourcePackage.packageSha256,
    productionPlanSchema: sourcePackage.productionPlanSchema,
    productionPlanSha256: sourcePackage.productionPlanSha256,
    characterId: TOP_HAT_RUNTIME_CHARACTER_ID,
    runtime: sourcePackage.runtime,
    artStudio: sourcePackage.artStudio,
    slots: Object.freeze(
      sourcePackage.jobs.map(topHatRuntimeSlotSummary),
    ),
    counts: Object.freeze({
      slots: 6,
      readySlots: 6,
      maximumProviderCalls: 6,
      candidatesPerSlot: 1,
    }),
    authority: topHatRuntimeAdapterAuthority(),
  };
  return deepFreeze({
    ...body,
    adapterSha256: sha256Document(body),
  });
}

export function parseProjectArtTopHatPoseSlotProviderRuntimeAdapter(
  input,
) {
  const snapshot = snapshotJsonValue(
    input,
    'Top Hat provider runtime adapter',
  );
  exactKeys(
    snapshot,
    [
      'schema',
      'compiledAt',
      'sourceRequest',
      'sourceRequestSchema',
      'sourceProviderRequestSha256',
      'sourceProviderPackageSchema',
      'sourceProviderPackageSha256',
      'productionPlanSchema',
      'productionPlanSha256',
      'characterId',
      'runtime',
      'artStudio',
      'slots',
      'counts',
      'authority',
      'adapterSha256',
    ],
    'Top Hat provider runtime adapter',
    'TOP_HAT_PROVIDER_RUNTIME_ADAPTER_KEYS_INVALID',
  );
  const verified = verifySelfHash(
    snapshot,
    'adapterSha256',
    'Top Hat provider runtime adapter',
  );
  assert(
    verified.schema ===
      TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_SCHEMA,
    'TOP_HAT_PROVIDER_RUNTIME_ADAPTER_SCHEMA_INVALID',
  );
  const expected =
    compileProjectArtTopHatPoseSlotProviderRuntimeAdapter({
      request: verified.sourceRequest,
      compiledAt: verified.compiledAt,
    });
  assert(
    canonicalJson(expected) === canonicalJson(verified),
    'TOP_HAT_PROVIDER_RUNTIME_ADAPTER_MISMATCH',
  );
  return verified;
}

export function compileProjectArtTopHatPoseSlotProviderRuntimeDispatch({
  adapter,
  slotId,
  compiledAt = new Date().toISOString(),
}) {
  return compileTopHatPoseSlotProviderRuntimeDispatch({
    parsedAdapter:
      parseProjectArtTopHatPoseSlotProviderRuntimeAdapter(adapter),
    slotId,
    compiledAt,
  });
}

export function projectArtTopHatPoseSlotProviderRuntimeAdapterCapabilities() {
  return Object.freeze({
    schema:
      TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_CAPABILITIES_SCHEMA,
    sourcePackageSchema:
      TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_SCHEMA,
    sourceRequestSchema:
      TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_REQUEST_SCHEMA,
    adapterSchema:
      TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_SCHEMA,
    outputDispatchSchema:
      'evavo.project-art-avatar-final-pass-provider-runtime-dispatch.v1',
    characterId: TOP_HAT_RUNTIME_CHARACTER_ID,
    sessionId: TOP_HAT_RUNTIME_SESSION_ID,
    requiredPoseSlots: 6,
    oneCandidatePerSlot: true,
    sourceAuthorizationWindowPreserved: true,
    sourceAuthorizationMaximumProviderCallsPreserved: true,
    guardedDispatchCompilerRequired: true,
    genericBatchPersisted: false,
    neutralAnchorRole: 'base-image',
    inhaleExhaleAnchorRole: 'canonical-identity',
    continuityEvidenceRetainedInMetadata: true,
    continuityEvidenceSubmittedAsUnverifiedImageReference: false,
    nativeStraightAlphaRequired: true,
    reviewedTargetPathsPreserved: true,
    scratchCandidatePathsCreateOnly: true,
    genericRuntimeDispatchCompatible: true,
    genericCandidateMaterializerCompatible: true,
    providerExecution: false,
    runtimeContractCompilation: false,
    runtimeEnqueue: false,
    candidateMaterialization: false,
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
