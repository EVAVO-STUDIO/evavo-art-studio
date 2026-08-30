import { lstat, mkdir, realpath, readFile } from 'node:fs/promises';
import path from 'node:path';

import { LocalArtifactStore } from '../../packages/artifacts/dist/index.js';
import { LocalRuntimeRepository, RuntimeWorker } from '../../packages/runtime/dist/index.js';
import {
  candidateMasteringWorkerCapabilities,
  createCandidateMasteringHandlers,
} from '../../apps/worker/dist/mastering-handlers.js';
import {
  COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY as WORKER_EXECUTION_CAPABILITY,
  createProviderHandlers,
  createProviderRegistryFromEnvironment,
  providerWorkerCapabilities,
  providerWorkerCapabilityProfiles,
  restrictProviderRegistry,
} from '../../apps/worker/dist/provider-handlers.js';
import {
  validateCouncilAvatarDirectionMasterExecutionAuthorization,
} from './council-avatar-direction-master-authorization.mjs';
import {
  compileCouncilAvatarDirectionMasterRuntimePackage,
} from './council-avatar-direction-master-runtime.mjs';
import {
  inspectCouncilAvatarDirectionMasterReadiness,
} from './council-avatar-direction-master-readiness.mjs';
import {
  COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
} from './council-avatar-provider-runtime.mjs';

export const COUNCIL_AVATAR_DIRECTION_MASTER_EXECUTION_RESULT_SCHEMA =
  'evavo.project-art-council-avatar-direction-master-execution-result.v1';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function exactJson(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

async function readJson(filePath, label) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path.resolve(filePath), 'utf8'));
  } catch (error) {
    throw new Error(`${label} could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed;
}

async function freshDirectory(value, label) {
  const target = path.resolve(value);
  try {
    await lstat(target);
    throw new Error(`${label} must not already exist`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await mkdir(target, { recursive: true, mode: 0o700 });
  const resolved = await realpath(target);
  if (resolved !== target) throw new Error(`${label} must resolve exactly`);
  return resolved;
}

async function existingDirectory(value, label) {
  const target = path.resolve(value);
  const stat = await lstat(target);
  if (!stat.isDirectory()) throw new Error(`${label} must be an existing directory`);
  const resolved = await realpath(target);
  if (resolved !== target) throw new Error(`${label} must resolve exactly`);
  return resolved;
}

function runtimeOptionsFromAuthorization(authorization) {
  const counts = new Set((authorization.jobs ?? []).map((job) => job.candidateCount));
  if (
    counts.size !== 1 ||
    !authorization.adapter?.id ||
    !authorization.adapter?.model
  ) {
    throw new Error('Council direction-master authorization provider settings are incomplete or inconsistent');
  }
  return Object.freeze({
    candidateCount: [...counts][0],
    preferredAdapterId: authorization.adapter.id,
    preferredModel: authorization.adapter.model,
  });
}

function selectedJobs(runtimePackage, authorization, { characterId, viewId } = {}) {
  const allowed = new Map(
    authorization.jobs.map((job) => [`${job.characterId}:${job.viewId}`, job]),
  );
  const jobs = runtimePackage.jobs.filter((job) => {
    if (!allowed.has(`${job.characterId}:${job.viewId}`)) return false;
    if (characterId && job.characterId !== characterId) return false;
    if (viewId && job.viewId !== viewId) return false;
    return true;
  });
  if (!jobs.length) throw new Error('authorization contains no matching executable direction-master jobs');
  return Object.freeze(jobs);
}

function createAuthorizer(authorization, runtimePackage, executableJobs) {
  const exactJobs = new Map(
    executableJobs.map((job) => [job.normalizedRuntimeSpec.idempotencyKey, job]),
  );
  const adapterId = authorization.adapter.id;
  return Object.freeze({
    authorizationSha256: authorization.authorizationSha256,
    allowedAdapterIds: Object.freeze([adapterId]),
    queues: Object.freeze(['provider']),
    requiredCapability: COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
    adapterAllowed: (candidateAdapterId) => candidateAdapterId === adapterId,
    assertJobAuthorized(job, request, now = new Date()) {
      validateCouncilAvatarDirectionMasterExecutionAuthorization(authorization, {
        now,
        runtimePackage,
      });
      const expected = exactJobs.get(job.spec.idempotencyKey);
      if (!expected) throw new Error('runtime job is not included in this direction execution invocation');
      const reference = request.references?.[0];
      if (
        job.specHash !== expected.runtimeSpecSha256 ||
        !exactJson(job.spec, expected.normalizedRuntimeSpec) ||
        job.spec.maximumAttempts !== 1 ||
        !job.spec.requiredCapabilities.includes(COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY) ||
        request.continuityPhase !== 'direction-master' ||
        request.requestId !== expected.normalizedRuntimeSpec.payload.requestId ||
        request.selection.preferredAdapterId !== adapterId ||
        request.selection.preferredModel !== authorization.adapter.model ||
        request.selection.allowFallback !== false ||
        request.candidateCount !== expected.normalizedRuntimeSpec.payload.candidateCount ||
        reference?.role !== 'canonical-identity' ||
        reference?.artifactId !== expected.identityMasteredArtifactId ||
        reference?.required !== true ||
        reference?.strength !== 1 ||
        !job.spec.inputArtifacts.includes(expected.identityMasteredArtifactId)
      ) {
        throw new Error('Council direction-master runtime job authorization binding drift');
      }
      return authorization;
    },
  });
}

async function providerCandidateIds(runtime, artifacts, records) {
  const ids = [];
  for (const record of records) {
    const completed = await runtime.get(record.jobId);
    for (const artifactId of completed?.outputArtifacts ?? []) {
      const descriptor = await artifacts.get(artifactId);
      if (
        descriptor?.storageClass === 'intermediate' &&
        descriptor.labels.artifactRole === 'provider-candidate' &&
        descriptor.labels.approvalState === 'unapproved'
      ) {
        ids.push(Object.freeze({
          characterId: record.characterId,
          viewId: record.viewId,
          artifactId,
        }));
      }
    }
  }
  return Object.freeze(ids);
}

async function runTechnicalAssurance(runtime, artifacts, candidates, authorizationSha256) {
  if (!candidates.length) {
    return Object.freeze({ submitted: 0, claimed: 0, succeeded: 0, failed: 0, jobs: Object.freeze([]) });
  }
  const records = [];
  for (const candidate of candidates) {
    const job = await runtime.submit({
      queue: 'media',
      kind: 'art.candidate.master-alpha',
      idempotencyKey: `council-avatar:direction-assurance:${candidate.artifactId}`,
      payload: {
        candidateArtifactId: candidate.artifactId,
        backgroundMode: 'native-alpha',
        targetWidth: 1024,
        targetHeight: 1536,
        resampling: 'lanczos3',
        deliveryProfileId: 'godot-sprite-lossless',
        requireFakeTransparencyRejection: true,
        requireMeaningfulAlpha: true,
        proofBackgrounds: ['#000000', '#ffffff', '#808080', '#00ff00', '#ff00ff'],
        frameId: `${candidate.characterId}:direction-master:${candidate.viewId}`,
      },
      inputArtifacts: [candidate.artifactId],
      requiredCapabilities: [
        'media.background-recovery',
        'media.raster',
        'quality.sprite-frame',
        'evidence.bundle',
      ],
      maximumAttempts: 1,
      labels: {
        councilCharacterId: candidate.characterId,
        councilDirectionViewId: candidate.viewId,
        assuranceStage: 'direction-master-technical',
        authorizationSha256,
      },
    });
    records.push(Object.freeze({ ...candidate, jobId: job.id }));
  }

  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: `council-direction-assurance:${authorizationSha256.slice(0, 16)}`,
      capabilities: candidateMasteringWorkerCapabilities(),
      queues: Object.freeze(['media']),
    },
    handlers: createCandidateMasteringHandlers(),
    concurrency: 1,
  });
  const run = await worker.runUntilIdle();
  const jobs = [];
  for (const record of records) {
    const completed = await runtime.get(record.jobId);
    const outputs = [];
    for (const artifactId of completed?.outputArtifacts ?? []) {
      const descriptor = await artifacts.get(artifactId);
      if (!descriptor) continue;
      outputs.push(Object.freeze({
        artifactId,
        artifactRole: descriptor.labels.artifactRole ?? null,
        approvalState: descriptor.labels.approvalState ?? null,
        qualityState: descriptor.labels.qualityState ?? null,
      }));
    }
    jobs.push(Object.freeze({
      characterId: record.characterId,
      viewId: record.viewId,
      sourceCandidateArtifactId: record.artifactId,
      jobId: record.jobId,
      state: completed?.state ?? 'missing',
      attempts: completed?.attempts?.length ?? 0,
      failureCode: completed?.failure?.code ?? null,
      outputs: Object.freeze(outputs),
    }));
  }
  return Object.freeze({
    submitted: records.length,
    claimed: run.claimed,
    succeeded: run.succeeded,
    failed: run.failed,
    jobs: Object.freeze(jobs),
  });
}

export async function executeAuthorizedCouncilAvatarDirectionMasterJobs({
  authorizationPath,
  identityApprovalPath,
  runtimeRoot,
  artifactRoot,
  characterId,
  viewId,
  environment = process.env,
} = {}) {
  if (COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY !== WORKER_EXECUTION_CAPABILITY) {
    throw new Error('COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY_DRIFT');
  }
  const [authorizationRecord, identityLockApproval] = await Promise.all([
    readJson(authorizationPath, 'Council direction-master authorization'),
    readJson(identityApprovalPath, 'Council identity-lock approval'),
  ]);
  const runtimeOptions = runtimeOptionsFromAuthorization(authorizationRecord);
  const runtimePackage = compileCouncilAvatarDirectionMasterRuntimePackage({
    identityLockApproval,
    ...runtimeOptions,
  });
  const authorization = validateCouncilAvatarDirectionMasterExecutionAuthorization(
    authorizationRecord,
    { runtimePackage },
  );
  const resolvedArtifactRoot = await existingDirectory(artifactRoot, 'artifactRoot');
  const readiness = await inspectCouncilAvatarDirectionMasterReadiness({
    identityLockApproval,
    artifactRoot: resolvedArtifactRoot,
    environment,
    ...runtimeOptions,
  });
  if (!readiness.readiness.readyForBoundedExecutionAuthorization) {
    throw new Error(`COUNCIL_DIRECTION_PROVIDER_NOT_READY:${readiness.blockers.join(',') || 'unknown'}`);
  }
  if (
    readiness.runtimePackageSha256 !== runtimePackage.runtimePackageSha256 ||
    readiness.desired.adapterId !== authorization.adapter.id ||
    readiness.desired.model !== authorization.adapter.model ||
    readiness.readiness.identityReferenceReady !== true ||
    readiness.readiness.identityArtifactsReady !== true
  ) {
    throw new Error('COUNCIL_DIRECTION_EXECUTION_READINESS_DRIFT');
  }

  const executableJobs = selectedJobs(runtimePackage, authorization, {
    characterId: characterId?.trim() || null,
    viewId: viewId?.trim() || null,
  });
  const resolvedRuntimeRoot = await freshDirectory(runtimeRoot, 'runtimeRoot');
  if (resolvedRuntimeRoot === resolvedArtifactRoot) {
    throw new Error('runtimeRoot and artifactRoot must be separate');
  }

  const fullRegistry = createProviderRegistryFromEnvironment(environment);
  const registry = restrictProviderRegistry(fullRegistry, [authorization.adapter.id]);
  const authorizer = createAuthorizer(authorization, runtimePackage, executableJobs);
  const runtime = new LocalRuntimeRepository({ root: resolvedRuntimeRoot });
  const artifacts = new LocalArtifactStore({ root: resolvedArtifactRoot });
  const records = [];
  for (const job of executableJobs) {
    const record = await runtime.submit(job.runtimeJob);
    if (
      record.specHash !== job.runtimeSpecSha256 ||
      !exactJson(record.spec, job.normalizedRuntimeSpec) ||
      record.spec.maximumAttempts !== 1 ||
      !record.spec.inputArtifacts.includes(job.identityMasteredArtifactId)
    ) {
      throw new Error(`submitted direction runtime job drifted for ${job.characterId}:${job.viewId}`);
    }
    records.push(Object.freeze({
      characterId: job.characterId,
      viewId: job.viewId,
      jobId: record.id,
    }));
  }

  const providerWorker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: `council-direction-provider:${authorization.authorizationSha256.slice(0, 16)}`,
      capabilities: Object.freeze([
        ...providerWorkerCapabilities(registry),
        COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
      ]),
      capabilityProfiles: providerWorkerCapabilityProfiles(registry),
      queues: Object.freeze(['provider']),
    },
    handlers: createProviderHandlers(registry, authorizer),
    concurrency: 1,
  });

  const providerRun = await providerWorker.runUntilIdle();
  const candidates = await providerCandidateIds(runtime, artifacts, records);
  const assurance = await runTechnicalAssurance(
    runtime,
    artifacts,
    candidates,
    authorization.authorizationSha256,
  );

  const jobs = [];
  for (const record of records) {
    const completed = await runtime.get(record.jobId);
    jobs.push(Object.freeze({
      characterId: record.characterId,
      viewId: record.viewId,
      jobId: record.jobId,
      state: completed?.state ?? 'missing',
      attempts: completed?.attempts?.length ?? 0,
      outputArtifactIds: Object.freeze([...(completed?.outputArtifacts ?? [])]),
      failureCode: completed?.failure?.code ?? null,
    }));
  }

  return Object.freeze({
    schema: COUNCIL_AVATAR_DIRECTION_MASTER_EXECUTION_RESULT_SCHEMA,
    authorizationSha256: authorization.authorizationSha256,
    identityApprovalSha256: runtimePackage.identityApprovalSha256,
    directionMasterPlanSha256: runtimePackage.directionMasterPlanSha256,
    runtimePackageSha256: runtimePackage.runtimePackageSha256,
    adapter: authorization.adapter,
    existingCanonicalIdentityArtifactStore: true,
    runtimeRoot: resolvedRuntimeRoot,
    artifactRoot: resolvedArtifactRoot,
    selectedCharacterId: characterId?.trim() || null,
    selectedViewId: viewId?.trim() || null,
    submittedJobCount: records.length,
    maximumAttemptsPerJob: 1,
    fallbackAllowed: false,
    directionMasterApprovalEstablished: false,
    candidatePromotionEstablished: false,
    runtimeActivationAllowed: false,
    websiteActivationAllowed: false,
    provider: Object.freeze({
      claimed: providerRun.claimed,
      succeeded: providerRun.succeeded,
      failed: providerRun.failed,
      candidateArtifactsFound: candidates.length,
    }),
    technicalAssurance: assurance,
    independentVisualReviewRequired: true,
    jobs: Object.freeze(jobs),
  });
}
