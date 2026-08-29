import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';

import { LocalArtifactStore } from '../../packages/artifacts/dist/index.js';
import {
  LocalRuntimeRepository,
  RuntimeWorker,
} from '../../packages/runtime/dist/index.js';
import {
  COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY as WORKER_EXECUTION_CAPABILITY,
  createProviderHandlers,
  createProviderRegistryFromEnvironment,
  providerWorkerCapabilities,
  providerWorkerCapabilityProfiles,
  restrictProviderRegistry,
} from '../../apps/worker/dist/provider-handlers.js';
import {
  validateCouncilAvatarProviderExecutionAuthorization,
} from './council-avatar-provider-authorization.mjs';
import {
  COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
  compileCouncilAvatarProviderRuntimePackage,
} from './council-avatar-provider-runtime.mjs';
import { inspectCouncilAvatarProviderReadiness } from './council-avatar-provider-readiness.mjs';

export const COUNCIL_AVATAR_PROVIDER_EXECUTION_RESULT_SCHEMA =
  'evavo.project-art-council-avatar-provider-execution-result.v1';

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

function sha256(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

async function readJson(filePath, label) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(
      `${label} could not be read: ${error instanceof Error ? error.message : String(error)}`,
    );
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

function selectedJobs(runtimePackage, authorization, characterId) {
  const allowed = new Map(
    authorization.jobs.map((job) => [job.characterId, job]),
  );
  const jobs = runtimePackage.jobs.filter((job) => {
    if (!allowed.has(job.characterId)) return false;
    return characterId ? job.characterId === characterId : true;
  });
  if (!jobs.length) {
    throw new Error(
      characterId
        ? `character ${characterId} is not authorized`
        : 'authorization contains no executable Council jobs',
    );
  }
  return Object.freeze(jobs);
}

function createAuthorizer(authorization, runtimePackage, executableJobs) {
  const exactJobs = new Map(
    executableJobs.map((job) => [job.runtimeJob.idempotencyKey, job]),
  );
  const adapterId = authorization.adapter.id;
  return Object.freeze({
    authorizationSha256: authorization.authorizationSha256,
    allowedAdapterIds: Object.freeze([adapterId]),
    queues: Object.freeze(['provider']),
    requiredCapability: COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
    adapterAllowed: (candidateAdapterId) => candidateAdapterId === adapterId,
    assertJobAuthorized(job, request, now = new Date()) {
      validateCouncilAvatarProviderExecutionAuthorization(authorization, {
        now,
        runtimePackage,
      });
      const expected = exactJobs.get(job.spec.idempotencyKey);
      if (!expected) throw new Error('runtime job is not included in this execution invocation');
      if (
        job.spec.maximumAttempts !== 1 ||
        !job.spec.requiredCapabilities.includes(
          COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
        ) ||
        request.requestId !== expected.runtimeJob.payload.requestId ||
        request.selection.preferredAdapterId !== adapterId ||
        request.selection.preferredModel !== authorization.adapter.model ||
        request.selection.allowFallback !== false ||
        request.candidateCount !== expected.runtimeJob.payload.candidateCount
      ) {
        throw new Error('Council avatar runtime job authorization binding drift');
      }
      if (sha256(job.spec) !== expected.runtimeJobSha256) {
        throw new Error('Council avatar runtime job hash drift');
      }
      return authorization;
    },
  });
}

export async function executeAuthorizedCouncilAvatarProviderJobs({
  authorizationPath,
  runtimeRoot,
  artifactRoot,
  characterId,
  environment = process.env,
} = {}) {
  if (
    COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY !==
    WORKER_EXECUTION_CAPABILITY
  ) {
    throw new Error('COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY_DRIFT');
  }
  const authorizationRecord = await readJson(
    path.resolve(authorizationPath),
    'Council avatar provider authorization',
  );
  const runtimePackage = compileCouncilAvatarProviderRuntimePackage();
  const authorization = validateCouncilAvatarProviderExecutionAuthorization(
    authorizationRecord,
    { runtimePackage },
  );
  const readiness = await inspectCouncilAvatarProviderReadiness({ environment });
  if (!readiness.readiness.readyForBoundedExecutionAuthorization) {
    throw new Error(
      `COUNCIL_AVATAR_PROVIDER_NOT_READY:${readiness.blockers.join(',') || 'unknown'}`,
    );
  }
  if (
    readiness.runtimePackageSha256 !== runtimePackage.runtimePackageSha256 ||
    readiness.desired.adapterId !== authorization.adapter.id ||
    readiness.desired.model !== authorization.adapter.model
  ) {
    throw new Error('COUNCIL_AVATAR_PROVIDER_EXECUTION_READINESS_DRIFT');
  }

  const executableJobs = selectedJobs(
    runtimePackage,
    authorization,
    characterId?.trim() || null,
  );
  const resolvedRuntimeRoot = await freshDirectory(
    runtimeRoot,
    'runtimeRoot',
  );
  const resolvedArtifactRoot = await freshDirectory(
    artifactRoot,
    'artifactRoot',
  );
  if (resolvedRuntimeRoot === resolvedArtifactRoot) {
    throw new Error('runtimeRoot and artifactRoot must be separate');
  }

  const fullRegistry = createProviderRegistryFromEnvironment(environment);
  const registry = restrictProviderRegistry(fullRegistry, [authorization.adapter.id]);
  const authorizer = createAuthorizer(
    authorization,
    runtimePackage,
    executableJobs,
  );
  const runtime = new LocalRuntimeRepository({ root: resolvedRuntimeRoot });
  const artifacts = new LocalArtifactStore({ root: resolvedArtifactRoot });
  const records = [];
  for (const job of executableJobs) {
    const record = await runtime.submit(job.runtimeJob);
    if (
      record.spec.maximumAttempts !== 1 ||
      sha256(record.spec) !== job.runtimeJobSha256
    ) {
      throw new Error(`submitted runtime job drifted for ${job.characterId}`);
    }
    records.push(Object.freeze({ characterId: job.characterId, jobId: record.id }));
  }

  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: `council-avatar-provider:${authorization.authorizationSha256.slice(0, 16)}`,
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

  const run = await worker.runUntilIdle();
  const jobs = [];
  for (const record of records) {
    const completed = await runtime.get(record.jobId);
    jobs.push(
      Object.freeze({
        characterId: record.characterId,
        jobId: record.jobId,
        state: completed?.state ?? 'missing',
        attempts: completed?.attempts?.length ?? 0,
        outputArtifactIds: Object.freeze([...(completed?.outputArtifacts ?? [])]),
        failureCode: completed?.failure?.code ?? null,
      }),
    );
  }

  return Object.freeze({
    schema: COUNCIL_AVATAR_PROVIDER_EXECUTION_RESULT_SCHEMA,
    authorizationSha256: authorization.authorizationSha256,
    runtimePackageSha256: runtimePackage.runtimePackageSha256,
    adapter: authorization.adapter,
    isolatedWorkspace: true,
    runtimeRoot: resolvedRuntimeRoot,
    artifactRoot: resolvedArtifactRoot,
    selectedCharacterId: characterId?.trim() || null,
    submittedJobCount: records.length,
    maximumAttemptsPerJob: 1,
    fallbackAllowed: false,
    candidateApprovalEstablished: false,
    candidatePromotionEstablished: false,
    runtimeActivationAllowed: false,
    worker: Object.freeze({
      claimed: run.claimed,
      succeeded: run.succeeded,
      failed: run.failed,
    }),
    jobs: Object.freeze(jobs),
  });
}
