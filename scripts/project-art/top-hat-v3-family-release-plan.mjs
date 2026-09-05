import { createHash } from 'node:crypto';

import {
  inspectTopHatV3ApprovedFrameLedger,
} from './top-hat-v3-approved-frame-ledger.mjs';
import {
  assertTopHatV3GenerationPlanContract,
} from './top-hat-v3-suite-contract.mjs';

export const TOP_HAT_V3_FAMILY_RELEASE_PLAN_SCHEMA =
  'evavo.project-art-top-hat-v3-family-release-plan.v1';
export const TOP_HAT_V3_CLOUDINARY_UPLOAD_PLAN_SCHEMA =
  'evavo.project-art-top-hat-v3-cloudinary-upload-plan.v1';

const freeze = Object.freeze;
const SHA256 = /^[a-f0-9]{64}$/u;
const CLOUD_NAME = 'dntogqtey';
const CLOUDINARY_ROOT = 'evavo/avatar-runtime/top-hat-man/production-v3';

function fail(code, detail = code) {
  const error = new Error(`${code}:${detail}`);
  error.code = code;
  throw error;
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('TOP_HAT_V3_RELEASE_RECORD_INVALID', label);
  }
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function sha256Document(value) {
  return createHash('sha256')
    .update(`${JSON.stringify(canonical(value))}\n`, 'utf8')
    .digest('hex');
}

function timestamp(value, label) {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    fail('TOP_HAT_V3_RELEASE_TIMESTAMP_INVALID', label);
  }
  return value;
}

function expectedJobs(plan) {
  const phases = Array.isArray(plan.phases) ? plan.phases : [];
  const foundation = phases.find((phase) => phase.id === 'foundation')?.jobs ?? [];
  const layers = phases.find((phase) => phase.id === 'registered-layers')?.jobs ?? [];
  const clips = phases.find((phase) => phase.id === 'body-clips')?.clips ?? [];
  const body = clips.flatMap((clip) =>
    clip.waves.flatMap((wave) =>
      wave.jobs.map((job) => ({
        ...job,
        kind: 'body-frame',
        clipId: clip.clipId,
        loopMode: clip.loopMode,
        fps: clip.fps,
      })),
    ),
  );
  return { foundation, layers, body, all: [...foundation, ...layers, ...body] };
}

function publicIdFor(job) {
  if (job.kind === 'foundation-pose') {
    return `${CLOUDINARY_ROOT}/foundation/${job.poseSlotId ?? job.jobId}`;
  }
  if (job.kind === 'registered-layer') {
    const suffix = [job.layer, job.pose, job.energy].filter(Boolean).join('-');
    return `${CLOUDINARY_ROOT}/layers/${suffix || job.jobId}`;
  }
  return `${CLOUDINARY_ROOT}/body/${job.clipId}/${String((job.ordinal ?? 0) + 1).padStart(3, '0')}`;
}

export function compileTopHatV3FamilyReleasePlan(input = {}) {
  const generationPlan = record(input.generationPlan, 'generationPlan');
  const suiteContract = assertTopHatV3GenerationPlanContract(generationPlan);
  const ledger = record(input.approvedLedger, 'approvedLedger');
  const ledgerReadiness = inspectTopHatV3ApprovedFrameLedger(ledger);
  const preparedAt = timestamp(
    input.preparedAt ?? new Date().toISOString(),
    'preparedAt',
  );
  if (!SHA256.test(generationPlan.planSha256 ?? '')) {
    fail('TOP_HAT_V3_RELEASE_GENERATION_PLAN_INVALID');
  }
  if (ledgerReadiness.generationPlanSha256 !== generationPlan.planSha256) {
    fail('TOP_HAT_V3_RELEASE_LEDGER_PLAN_MISMATCH');
  }
  const jobs = expectedJobs(generationPlan);
  if (
    jobs.foundation.length !== suiteContract.foundationPoseCount ||
    jobs.layers.length !== suiteContract.registeredLayerCount ||
    jobs.body.length !== suiteContract.bodyFrameCount ||
    jobs.all.length !== suiteContract.totalArtworkCount
  ) {
    fail('TOP_HAT_V3_RELEASE_JOB_COUNT_INVALID');
  }
  const expectedIds = new Set(jobs.all.map((job) => job.jobId));
  const approvedIds = new Set(ledger.approvedJobIds);
  if (
    approvedIds.size !== suiteContract.totalArtworkCount ||
    expectedIds.size !== suiteContract.totalArtworkCount ||
    [...expectedIds].some((jobId) => !approvedIds.has(jobId))
  ) {
    fail('TOP_HAT_V3_RELEASE_FAMILY_INCOMPLETE');
  }
  const entryByJob = new Map(ledger.entries.map((entry) => [entry.jobId, entry]));
  const candidateHashes = new Set();
  const assets = freeze(
    jobs.all.map((job) => {
      const approval = entryByJob.get(job.jobId);
      if (!approval) fail('TOP_HAT_V3_RELEASE_APPROVAL_MISSING', job.jobId);
      if (candidateHashes.has(approval.candidateSha256)) {
        fail('TOP_HAT_V3_RELEASE_DUPLICATE_CANDIDATE_BYTES', approval.candidateSha256);
      }
      candidateHashes.add(approval.candidateSha256);
      return freeze({
        jobId: job.jobId,
        kind: approval.kind,
        clipId: approval.clipId,
        frameOrdinal: approval.frameOrdinal,
        role: approval.role,
        targetPath: approval.targetPath,
        localSha256: approval.candidateSha256,
        approvalEvidenceSha256: approval.evidenceSha256,
        reviewer: approval.reviewer,
        reviewedAt: approval.reviewedAt,
        cloudinary: freeze({
          cloudName: CLOUD_NAME,
          publicId: publicIdFor({ ...job, kind: approval.kind }),
          resourceType: 'image',
          format: 'png',
          type: 'upload',
          overwrite: false,
          uniqueFilename: false,
          backup: true,
          phash: true,
        }),
      });
    }),
  );
  if (
    new Set(assets.map((asset) => asset.cloudinary.publicId)).size !==
    suiteContract.totalArtworkCount
  ) {
    fail('TOP_HAT_V3_RELEASE_CLOUDINARY_PUBLIC_ID_COLLISION');
  }

  const body = freeze({
    schema: TOP_HAT_V3_FAMILY_RELEASE_PLAN_SCHEMA,
    characterId: 'top-hat-man',
    preparedAt,
    generationPlanSha256: generationPlan.planSha256,
    approvedFrameLedgerSha256: ledgerReadiness.ledgerSha256,
    signatureClip: freeze({
      id: suiteContract.signatureClipId,
      frames: suiteContract.signatureClipFrames,
      fps: suiteContract.signatureClipFps,
    }),
    counts: freeze({
      foundationPoses: suiteContract.foundationPoseCount,
      bodyFrames: suiteContract.bodyFrameCount,
      registeredLayers: suiteContract.registeredLayerCount,
      clips: suiteContract.clipCount,
      totalAssets: suiteContract.totalArtworkCount,
      uniqueCandidateHashes: candidateHashes.size,
      uniqueCloudinaryPublicIds: suiteContract.totalArtworkCount,
    }),
    assets,
    policy: freeze({
      completeFamilyRequired: true,
      signatureHatTipRequired: true,
      duplicateCandidateBytesForbidden: true,
      allAssetsHumanApproved: true,
      createOnlyCloudinaryUpload: true,
      cloudinaryOverwrite: false,
      partialFamilyPublicationAllowed: false,
      partialRuntimeActivationAllowed: false,
      runtimeActivationAllowed: false,
      repositoryMutationAllowed: false,
      automaticPublication: false,
    }),
  });
  return freeze({ ...body, releasePlanSha256: sha256Document(body) });
}

export function compileTopHatV3CloudinaryUploadPlan(input = {}) {
  const release = compileTopHatV3FamilyReleasePlan(input);
  const body = freeze({
    schema: TOP_HAT_V3_CLOUDINARY_UPLOAD_PLAN_SCHEMA,
    characterId: 'top-hat-man',
    preparedAt: release.preparedAt,
    sourceReleasePlanSha256: release.releasePlanSha256,
    cloudName: CLOUD_NAME,
    namespace: CLOUDINARY_ROOT,
    assetCount: release.assets.length,
    uploads: freeze(
      release.assets.map((asset) =>
        freeze({
          jobId: asset.jobId,
          localPath: asset.targetPath,
          localSha256: asset.localSha256,
          approvalEvidenceSha256: asset.approvalEvidenceSha256,
          request: asset.cloudinary,
        }),
      ),
    ),
    policy: freeze({
      networkExecutionPerformed: false,
      separateNetworkAuthorityRequired: true,
      createOnly: true,
      overwrite: false,
      partialFamilyActivationAllowed: false,
      runtimeActivationAllowed: false,
    }),
  });
  return freeze({ ...body, uploadPlanSha256: sha256Document(body) });
}

export function inspectTopHatV3FamilyReleasePlan(value) {
  const plan = record(value, 'release-plan');
  const { releasePlanSha256, ...body } = plan;
  if (
    plan.schema !== TOP_HAT_V3_FAMILY_RELEASE_PLAN_SCHEMA ||
    plan.characterId !== 'top-hat-man' ||
    plan.signatureClip?.id !== 'hat-tip' ||
    plan.signatureClip?.frames !== 28 ||
    plan.signatureClip?.fps !== 30 ||
    plan.counts?.totalAssets !== 755 ||
    plan.counts?.uniqueCandidateHashes !== 755 ||
    plan.counts?.uniqueCloudinaryPublicIds !== 755 ||
    plan.policy?.completeFamilyRequired !== true ||
    plan.policy?.signatureHatTipRequired !== true ||
    plan.policy?.runtimeActivationAllowed !== false ||
    !SHA256.test(releasePlanSha256 ?? '') ||
    sha256Document(body) !== releasePlanSha256
  ) {
    fail('TOP_HAT_V3_RELEASE_PLAN_INVALID');
  }
  return freeze({
    schema: 'evavo.project-art-top-hat-v3-family-release-plan-readiness.v1',
    characterId: 'top-hat-man',
    releasePlanSha256,
    assetCount: plan.counts.totalAssets,
    completeFamily: true,
    signatureHatTipPresent: true,
    cloudinaryUploadPlanningReady: true,
    networkExecutionPerformed: false,
    runtimeActivationAllowed: false,
  });
}
