#!/usr/bin/env node

import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import path from 'node:path';

import { LocalArtifactStore } from '../packages/artifacts/dist/index.js';
import {
  compileProviderCandidateRuntimeContract,
  compileProviderExecutionRoutingPlan,
  providerRequestSha256,
  validateProviderCandidateRequest,
} from '../packages/providers/dist/index.js';
import {
  LocalRuntimeRepository,
  RuntimeWorker,
  normalizeRuntimeJobSubmission,
} from '../packages/runtime/dist/index.js';
import {
  createProviderHandlers,
  createProviderRegistryFromEnvironment,
  providerWorkerCapabilities,
  providerWorkerCapabilityProfiles,
  restrictProviderRegistry,
} from '../apps/worker/dist/provider-handlers.js';

import {
  inspectTopHatV3ProviderDispatch,
} from './project-art/top-hat-v3-provider-dispatch.mjs';
import {
  inspectTopHatV3ProviderAuthorization,
} from './project-art/top-hat-v3-provider-authorization.mjs';

export const TOP_HAT_V3_PROVIDER_EXECUTION_RECEIPT_SCHEMA =
  'evavo.project-art-top-hat-v3-provider-execution-receipt.v1';
export const TOP_HAT_V3_PROVIDER_EXECUTION_CAPABILITY =
  'top-hat-v3.execution-authorized';

function fail(code, detail = code) {
  const error = new Error(`${code}:${detail}`);
  error.code = code;
  throw error;
}

function parseArgs(argv) {
  const supported = new Set([
    '--dispatch',
    '--authorization',
    '--runtime-root',
    '--artifact-root',
    '--receipt',
    '--worker-id',
  ]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!supported.has(flag) || !value || values.has(flag)) {
      fail('TOP_HAT_V3_EXEC_ARGUMENT_INVALID', String(flag));
    }
    values.set(flag, value);
  }
  return values;
}

function required(values, flag) {
  const value = values.get(flag);
  if (!value) fail('TOP_HAT_V3_EXEC_ARGUMENT_REQUIRED', flag);
  return value;
}

async function jsonFile(value, label) {
  const resolved = path.resolve(value);
  const state = await lstat(resolved);
  if (!state.isFile() || state.isSymbolicLink()) {
    fail('TOP_HAT_V3_EXEC_FILE_INVALID', label);
  }
  return {
    path: resolved,
    value: JSON.parse(await readFile(resolved, 'utf8')),
  };
}

async function realDirectory(value, label) {
  const resolved = path.resolve(value);
  await mkdir(resolved, { recursive: true, mode: 0o700 });
  const state = await lstat(resolved);
  if (!state.isDirectory() || state.isSymbolicLink()) {
    fail('TOP_HAT_V3_EXEC_DIRECTORY_INVALID', label);
  }
  return resolved;
}

async function createOnlyJson(value, document) {
  const resolved = path.resolve(value);
  await mkdir(path.dirname(resolved), { recursive: true, mode: 0o700 });
  await writeFile(resolved, `${JSON.stringify(document, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  return resolved;
}

function workerId(value, dispatchSha256) {
  const text = value ?? `top-hat-v3:${dispatchSha256.slice(0, 20)}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(text)) {
    fail('TOP_HAT_V3_EXEC_WORKER_ID_INVALID');
  }
  return text;
}

async function preflightReferences(artifacts, request, adapter) {
  const rows = [];
  let aggregateBytes = 0;
  for (const reference of request.references) {
    const descriptor = await artifacts.get(reference.artifactId);
    if (!descriptor) {
      if (reference.required) {
        fail('TOP_HAT_V3_EXEC_REFERENCE_MISSING', reference.artifactId);
      }
      continue;
    }
    const verified = await artifacts.verify(reference.artifactId);
    if (!verified.descriptorValid || !verified.contentValid) {
      fail('TOP_HAT_V3_EXEC_REFERENCE_INVALID', reference.artifactId);
    }
    if (!descriptor.mediaType.startsWith('image/')) {
      fail('TOP_HAT_V3_EXEC_REFERENCE_NOT_IMAGE', reference.artifactId);
    }
    if (
      descriptor.sizeBytes > 32 * 1024 * 1024 ||
      descriptor.sizeBytes > adapter.maximumSourceBytes
    ) {
      fail('TOP_HAT_V3_EXEC_REFERENCE_TOO_LARGE', reference.artifactId);
    }
    aggregateBytes += descriptor.sizeBytes;
    if (aggregateBytes > 128 * 1024 * 1024) {
      fail('TOP_HAT_V3_EXEC_REFERENCES_TOO_LARGE');
    }
    rows.push({
      artifactId: reference.artifactId,
      role: reference.role,
      contentHash: descriptor.contentHash,
      mediaType: descriptor.mediaType,
      sizeBytes: descriptor.sizeBytes,
    });
  }
  return Object.freeze(rows);
}

function isolatedRuntimeJob(compiled, dispatch, sourceJob) {
  const queue = `top-hat-v3.provider.${dispatch.dispatchSha256.slice(0, 20)}`;
  const source = compiled.runtimeJob;
  return Object.freeze({
    ...source,
    queue,
    idempotencyKey: `top-hat-v3:${dispatch.dispatchSha256}:${sourceJob.jobId}`,
    maximumAttempts: 1,
    requiredCapabilities: Object.freeze(
      [...new Set([
        ...source.requiredCapabilities,
        TOP_HAT_V3_PROVIDER_EXECUTION_CAPABILITY,
      ])].sort(),
    ),
    labels: Object.freeze({
      ...source.labels,
      topHatV3: 'provider-dispatch-v1',
      topHatV3DispatchSha256: dispatch.dispatchSha256,
      topHatV3JobId: sourceJob.jobId,
      topHatV3RequestSha256: sourceJob.requestSha256,
    }),
  });
}

async function inspectCompleted(runtime, artifacts, compiledJobs) {
  const jobs = [];
  let succeeded = 0;
  let failed = 0;
  for (const entry of compiledJobs) {
    const runtimeJob = await runtime.get(entry.runtimeJobId);
    if (!runtimeJob || runtimeJob.specHash !== entry.specHash) {
      fail('TOP_HAT_V3_EXEC_RUNTIME_JOB_DRIFT', entry.sourceJob.jobId);
    }
    const outputs = [];
    for (const id of runtimeJob.outputArtifacts) {
      const verified = await artifacts.verify(id);
      const descriptor = await artifacts.get(id);
      if (!verified.descriptorValid || !verified.contentValid || !descriptor) {
        fail('TOP_HAT_V3_EXEC_OUTPUT_INVALID', id);
      }
      if (
        descriptor.labels.artifactRole === 'provider-candidate' &&
        (descriptor.storageClass !== 'intermediate' ||
          descriptor.labels.approvalState !== 'unapproved' ||
          descriptor.metadata?.finalDeliverable !== false)
      ) {
        fail('TOP_HAT_V3_EXEC_CANDIDATE_ESCALATED', id);
      }
      outputs.push({
        artifactId: id,
        contentHash: descriptor.contentHash,
        mediaType: descriptor.mediaType,
        storageClass: descriptor.storageClass,
        artifactRole: descriptor.labels.artifactRole ?? null,
        approvalState: descriptor.labels.approvalState ?? null,
      });
    }
    if (runtimeJob.state === 'succeeded') succeeded += 1;
    else failed += 1;
    jobs.push({
      jobId: entry.sourceJob.jobId,
      requestSha256: entry.sourceJob.requestSha256,
      runtimeJobId: entry.runtimeJobId,
      specHash: entry.specHash,
      state: runtimeJob.state,
      attempts: runtimeJob.attempts.length,
      outputs,
      ...(runtimeJob.failure
        ? {
            failure: {
              classification: runtimeJob.failure.classification,
              code: runtimeJob.failure.code,
              message: runtimeJob.failure.message,
            },
          }
        : {}),
    });
  }
  return Object.freeze({ jobs: Object.freeze(jobs), succeeded, failed });
}

export async function runTopHatV3ProviderDispatch(
  argv = process.argv.slice(2),
  environment = process.env,
) {
  const values = parseArgs(argv);
  const dispatchRecord = await jsonFile(required(values, '--dispatch'), 'dispatch');
  const authorizationRecord = await jsonFile(
    required(values, '--authorization'),
    'authorization',
  );
  const dispatchReadiness = inspectTopHatV3ProviderDispatch(dispatchRecord.value);
  const authorizationReadiness = inspectTopHatV3ProviderAuthorization(
    authorizationRecord.value,
    { usedProviderCalls: dispatchRecord.value.budget.usedProviderCallsBeforeDispatch },
  );
  if (!authorizationReadiness.active) {
    fail('TOP_HAT_V3_EXEC_AUTHORIZATION_INACTIVE');
  }
  if (
    dispatchRecord.value.authorizationSha256 !== authorizationReadiness.authorizationSha256 ||
    dispatchRecord.value.generationPlanSha256 !== authorizationReadiness.generationPlanSha256
  ) {
    fail('TOP_HAT_V3_EXEC_AUTHORIZATION_BINDING_MISMATCH');
  }
  if (dispatchReadiness.jobCount < 1) {
    fail('TOP_HAT_V3_EXEC_EMPTY_DISPATCH');
  }

  const runtimeRoot = await realDirectory(required(values, '--runtime-root'), 'runtimeRoot');
  const artifactRoot = await realDirectory(required(values, '--artifact-root'), 'artifactRoot');
  if (runtimeRoot === artifactRoot) {
    fail('TOP_HAT_V3_EXEC_ROOT_COLLISION');
  }

  const baseRegistry = createProviderRegistryFromEnvironment(environment);
  const registry = restrictProviderRegistry(
    baseRegistry,
    authorizationReadiness.allowedAdapterIds,
  );
  const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
  const artifacts = new LocalArtifactStore({ root: artifactRoot });
  const compiledJobs = [];

  for (const sourceJob of dispatchRecord.value.jobs) {
    const request = validateProviderCandidateRequest(sourceJob.request);
    if (providerRequestSha256(request) !== sourceJob.requestSha256) {
      fail('TOP_HAT_V3_EXEC_REQUEST_HASH_MISMATCH', sourceJob.jobId);
    }
    const routing = compileProviderExecutionRoutingPlan(
      request,
      registry.rank(request),
    );
    if (!routing.eligibleAdapters.length || routing.inspection.fallbackAllowed !== false) {
      fail('TOP_HAT_V3_EXEC_NO_ELIGIBLE_ADAPTER', sourceJob.jobId);
    }
    await preflightReferences(
      artifacts,
      request,
      routing.eligibleAdapters[0].adapter.descriptor,
    );
    const compiled = compileProviderCandidateRuntimeContract(request);
    const isolated = isolatedRuntimeJob(compiled, dispatchRecord.value, sourceJob);
    const normalized = normalizeRuntimeJobSubmission(isolated);
    const existing = await runtime.get(normalized.spec.id);
    if (existing !== null) {
      fail('TOP_HAT_V3_EXEC_JOB_ALREADY_EXISTS', sourceJob.jobId);
    }
    compiledJobs.push({
      sourceJob,
      runtimeJob: isolated,
      runtimeJobId: normalized.spec.id,
      specHash: normalized.specHash,
    });
  }

  const submitted = await runtime.submitBatch(
    compiledJobs.map((entry) => entry.runtimeJob),
    `top-hat-v3:${authorizationReadiness.actorId}`,
    new Date(),
  );
  if (submitted.length !== compiledJobs.length) {
    fail('TOP_HAT_V3_EXEC_SUBMISSION_COUNT_MISMATCH');
  }

  const queue = `top-hat-v3.provider.${dispatchRecord.value.dispatchSha256.slice(0, 20)}`;
  const capabilities = Object.freeze(
    [...new Set([
      ...providerWorkerCapabilities(registry),
      TOP_HAT_V3_PROVIDER_EXECUTION_CAPABILITY,
    ])].sort(),
  );
  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: workerId(values.get('--worker-id'), dispatchRecord.value.dispatchSha256),
      capabilities,
      capabilityProfiles: providerWorkerCapabilityProfiles(registry),
      queues: [queue],
    },
    handlers: createProviderHandlers(registry),
    concurrency: Math.min(
      dispatchRecord.value.jobs.length,
      authorizationReadiness.maximumConcurrentCalls,
    ),
  });
  const runResult = await worker.runUntilIdle();
  const completed = await inspectCompleted(runtime, artifacts, compiledJobs);
  const receipt = Object.freeze({
    schema: TOP_HAT_V3_PROVIDER_EXECUTION_RECEIPT_SCHEMA,
    characterId: 'top-hat-man',
    status: completed.failed === 0 ? 'succeeded' : 'failed',
    completedAt: new Date().toISOString(),
    dispatchSha256: dispatchRecord.value.dispatchSha256,
    authorizationSha256: authorizationReadiness.authorizationSha256,
    generationPlanSha256: dispatchRecord.value.generationPlanSha256,
    providerPlanSha256: dispatchRecord.value.providerPlanSha256,
    scheduleSha256: dispatchRecord.value.scheduleSha256,
    phase: dispatchRecord.value.phase,
    clipId: dispatchRecord.value.clipId,
    waveIndex: dispatchRecord.value.waveIndex,
    runtimeRoot,
    artifactRoot,
    queue,
    providerAdapters: Object.freeze(
      registry.list().map((entry) => ({
        id: entry.id,
        version: entry.version,
        models: entry.models,
        capabilities: entry.capabilities,
      })),
    ),
    runResult,
    counts: Object.freeze({
      dispatched: compiledJobs.length,
      succeeded: completed.succeeded,
      failed: completed.failed,
      providerCallsReserved: dispatchRecord.value.budget.callsReservedByThisDispatch,
    }),
    jobs: completed.jobs,
    authority: Object.freeze({
      providerExecution: true,
      candidateArtifactCreation: true,
      evidenceArtifactCreation: true,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      publication: false,
      deployment: false,
      runtimeActivation: false,
    }),
  });
  const receiptPath = await createOnlyJson(required(values, '--receipt'), receipt);
  if (completed.failed > 0) {
    const error = new Error('TOP_HAT_V3_EXEC_PROVIDER_JOB_FAILED');
    error.receiptPath = receiptPath;
    throw error;
  }
  return Object.freeze({
    ok: true,
    receiptPath,
    dispatched: compiledJobs.length,
    succeeded: completed.succeeded,
    failed: completed.failed,
    approvalPerformed: false,
    runtimeActivationPerformed: false,
  });
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/gu, '/')}`) {
  runTopHatV3ProviderDispatch()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(
        `${JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          code: error?.code ?? null,
          receiptPath: error?.receiptPath ?? null,
        })}\n`,
      );
      process.exitCode = 2;
    });
}
