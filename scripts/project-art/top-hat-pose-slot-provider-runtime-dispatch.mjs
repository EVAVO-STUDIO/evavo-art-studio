import {
  AVATAR_FINAL_PASS_PROVIDER_BATCH_SCHEMA,
  PROVIDER_BATCH_AUTHORITY_KEYS,
} from './avatar-final-pass-provider-runtime-constants.mjs';
import {
  createAuthority,
  deepFreeze,
  identifier,
  sha256Document,
  timestamp,
  assert,
} from './avatar-final-pass-provider-runtime-common.mjs';
import {
  parseAvatarFinalPassProviderBatch,
} from './avatar-final-pass-provider-runtime-batch.mjs';
import {
  compileAvatarFinalPassProviderRuntimeDispatch,
} from './avatar-final-pass-provider-runtime-dispatch.mjs';
import {
  compileProjectArtTopHatPoseSlotProviderPackage,
} from './top-hat-pose-slot-provider-package.mjs';
import {
  GENERIC_PLAN_SCHEMA,
  TOP_HAT_RUNTIME_CHARACTER_ID,
  TOP_HAT_RUNTIME_EXPECTED_SLOTS,
  TOP_HAT_RUNTIME_SESSION_ID,
  assertTopHatRuntimeAuthorizationActive,
} from './top-hat-pose-slot-provider-runtime-foundation.mjs';
import {
  assertReadyTopHatRuntimeSourcePackage,
  mappedTopHatRuntimeGenericJob,
} from './top-hat-pose-slot-provider-runtime-job.mjs';

function oneJobGenericBatch(sourcePackage, sourceJob, compiledAt) {
  const job = mappedTopHatRuntimeGenericJob(
    sourcePackage,
    sourceJob,
  );
  const body = {
    schema: AVATAR_FINAL_PASS_PROVIDER_BATCH_SCHEMA,
    requestId:
      `top-hat-runtime:${sourcePackage.packageSha256.slice(0, 40)}:${sourceJob.slotId}`,
    compiledAt,
    plan: Object.freeze({
      schema: GENERIC_PLAN_SCHEMA,
      planSha256: sourcePackage.productionPlanSha256,
      sourceCommit: sourcePackage.artStudio.commit,
      sessionId: TOP_HAT_RUNTIME_SESSION_ID,
      characterId: TOP_HAT_RUNTIME_CHARACTER_ID,
      canvas: Object.freeze({ width: 1024, height: 1536 }),
    }),
    requestSha256: sourcePackage.requestSha256,
    requestCanonicalSha256: sourcePackage.requestSha256,
    jobs: Object.freeze([job]),
    readySubmissions: Object.freeze([
      Object.freeze({
        jobId: job.jobId,
        candidateOutputPath: job.candidateOutputPath,
        providerRequestSha256: job.providerRequestSha256,
        providerRequestInput: job.providerRequestInput,
      }),
    ]),
    counts: Object.freeze({
      requested: 1,
      ready: 1,
      blocked: 0,
      redraws: 1,
      inbetweens: 0,
    }),
    candidateCountPerJob: 1,
    explicitProviderSubmissionRequired: true,
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    productionReady: false,
    runtimeActivationAllowed: false,
    authority: createAuthority(PROVIDER_BATCH_AUTHORITY_KEYS),
  };
  const batch = deepFreeze({
    ...body,
    batchSha256: sha256Document(body),
  });
  parseAvatarFinalPassProviderBatch(batch);
  return batch;
}

export function compileTopHatPoseSlotProviderRuntimeDispatch({
  parsedAdapter,
  slotId,
  compiledAt = new Date().toISOString(),
}) {
  const selectedSlotId = identifier(slotId, 'slotId');
  assert(
    TOP_HAT_RUNTIME_EXPECTED_SLOTS.includes(selectedSlotId),
    'TOP_HAT_PROVIDER_RUNTIME_SLOT_UNKNOWN',
  );
  timestamp(compiledAt, 'compiledAt');
  const sourcePackage =
    compileProjectArtTopHatPoseSlotProviderPackage(
      parsedAdapter.sourceRequest,
    );
  assertReadyTopHatRuntimeSourcePackage(sourcePackage);
  assert(
    sourcePackage.packageSha256 ===
      parsedAdapter.sourceProviderPackageSha256 &&
      sourcePackage.requestSha256 ===
        parsedAdapter.sourceProviderRequestSha256,
    'TOP_HAT_PROVIDER_RUNTIME_SOURCE_PACKAGE_MISMATCH',
  );
  const sourceJob = sourcePackage.jobs.find(
    (job) => job.slotId === selectedSlotId,
  );
  assert(
    sourceJob,
    'TOP_HAT_PROVIDER_RUNTIME_SLOT_UNKNOWN',
  );
  assertTopHatRuntimeAuthorizationActive(
    sourceJob.authorization,
    compiledAt,
    selectedSlotId,
  );
  const batch = oneJobGenericBatch(
    sourcePackage,
    sourceJob,
    compiledAt,
  );
  const dispatch =
    compileAvatarFinalPassProviderRuntimeDispatch({
      batch,
      jobId: `redraw:${selectedSlotId}`,
      compiledAt,
    });
  const metadata =
    dispatch.providerCompiler.input.metadata.topHatPoseSlot;
  assert(
    metadata.guardedDispatchRequired === true &&
      metadata.slotId === selectedSlotId &&
      metadata.providerPackageSha256 ===
        parsedAdapter.sourceProviderPackageSha256 &&
      metadata.authorization.expiresAt ===
        sourceJob.authorization.expiresAt &&
      metadata.authorization.maximumProviderCalls === 1,
    'TOP_HAT_PROVIDER_RUNTIME_DISPATCH_METADATA_INVALID',
  );
  return dispatch;
}
