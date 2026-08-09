#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { LocalArtifactStore } from '../packages/artifacts/dist/index.js';
import {
  compileProviderExecutionRoutingPlan,
} from '../packages/providers/dist/index.js';
import {
  LocalRuntimeRepository,
  RuntimeWorker,
} from '../packages/runtime/dist/index.js';
import {
  RAW_ART_PROVIDER_EXECUTION_CAPABILITY,
  createProviderHandlers,
  createProviderRegistryFromEnvironment,
  providerWorkerCapabilities,
  providerWorkerCapabilityProfiles,
  restrictProviderRegistry,
} from '../apps/worker/dist/provider-handlers.js';

import {
  assertRawArtProviderExecutionAuthorizationActive,
  createRawArtProviderExecutionAuthorizer,
  validateRawArtProviderRuntimeExecutionAuthorization,
  verifyRawArtProviderExecutionRuntimeState,
} from './raw-art-provider/execution.mjs';
import {
  hashObject,
  readJsonRecord,
  writeCreateOnly,
} from './raw-art-provider/shared.mjs';

export const RAW_ART_PROVIDER_RUNTIME_EXECUTION_RECEIPT_SCHEMA =
  'evavo.raw-art-provider-runtime-execution-receipt.v1';

const SUPPORTED = new Set([
  '--authorization',
  '--worker-id',
  '--command',
  '--concurrency',
  '--receipt',
]);

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      !name?.startsWith('--') ||
      !value ||
      value.startsWith('--') ||
      values.has(name) ||
      !SUPPORTED.has(name)
    ) {
      throw new Error('arguments must be unique supported --name value pairs');
    }
    values.set(name, value);
  }
  return values;
}

function required(values, name) {
  const value = values.get(name);
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function integer(value, fallback, minimum, maximum, label) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function safeWorkerId(value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)) {
    throw new Error('--worker-id must contain 1 to 128 safe characters');
  }
  return value;
}

function executionAuthority() {
  return Object.freeze({
    providerExecution: true,
    workerClaim: true,
    candidateArtifactCreation: true,
    evidenceArtifactCreation: true,
    runtimeCompletion: true,
    runtimeSubmission: false,
    runtimeRedrive: false,
    deliveryPublication: false,
    sourceMutation: false,
    sourceDeletion: false,
    targetRepositoryMutation: false,
    candidateApproval: false,
    candidatePromotion: false,
    publication: false,
    forcePush: false,
  });
}

async function boundSourceRecord(binding, label) {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
    throw new Error(`${label} binding is invalid`);
  }
  return readJsonRecord(binding.path, label);
}

async function inspectCompletedJobs(authorization, runtime, artifacts) {
  const jobs = [];
  let succeeded = 0;
  let failed = 0;
  for (const expected of authorization.jobs) {
    const job = await runtime.get(expected.jobId);
    if (!job || job.specHash !== expected.specSha256) {
      throw new Error(`authorized runtime job disappeared or drifted: ${expected.jobId}`);
    }
    const artifactEvidence = [];
    for (const artifactId of job.outputArtifacts) {
      const verification = await artifacts.verify(artifactId);
      if (!verification.descriptorValid || !verification.contentValid) {
        throw new Error(`runtime output artifact failed immutable verification: ${artifactId}`);
      }
      const descriptor = await artifacts.get(artifactId);
      if (!descriptor) throw new Error(`runtime output artifact is missing: ${artifactId}`);
      if (
        descriptor.labels.artifactRole === 'provider-candidate' &&
        (descriptor.storageClass !== 'intermediate' ||
          descriptor.labels.approvalState !== 'unapproved' ||
          descriptor.metadata.finalDeliverable !== false)
      ) {
        throw new Error(`provider candidate crossed its unapproved artifact boundary: ${artifactId}`);
      }
      artifactEvidence.push({
        artifactId,
        contentHash: descriptor.contentHash,
        mediaType: descriptor.mediaType,
        storageClass: descriptor.storageClass,
        artifactRole: descriptor.labels.artifactRole ?? null,
        approvalState: descriptor.labels.approvalState ?? null,
      });
    }
    if (job.state === 'succeeded') succeeded += 1;
    else failed += 1;
    jobs.push({
      workOrderId: expected.workOrderId,
      campaignItemId: expected.campaignItemId,
      providerRequestId: expected.providerRequestId,
      requestSha256: expected.requestSha256,
      jobId: expected.jobId,
      specSha256: expected.specSha256,
      state: job.state,
      attempts: job.attempts.length,
      redriveCount: job.redriveCount,
      outputArtifacts: artifactEvidence,
      ...(job.failure
        ? {
            failure: {
              classification: job.failure.classification,
              code: job.failure.code,
              message: job.failure.message,
            },
          }
        : {}),
    });
  }
  return Object.freeze({
    jobs: Object.freeze(jobs),
    succeeded,
    failed,
  });
}

export async function runAuthorizedRawArtProviderWorkerCli(
  argv = process.argv.slice(2),
  environment = process.env,
) {
  const values = parseArguments(argv);
  const authorizationPath = required(values, '--authorization');
  const authorizationRecord = await readJsonRecord(
    authorizationPath,
    'RAW_ART provider runtime execution authorization',
  );
  const sourceRuntimeBatch = await boundSourceRecord(
    authorizationRecord.value.sourceRuntimeBatch,
    'RAW_ART provider runtime batch',
  );
  const sourceSelection = await boundSourceRecord(
    authorizationRecord.value.sourceSelection,
    'RAW_ART provider runtime admission selection',
  );
  const sourceAdmissionReceipt = await boundSourceRecord(
    authorizationRecord.value.sourceAdmissionReceipt,
    'RAW_ART provider runtime admission receipt',
  );
  const authorization =
    validateRawArtProviderRuntimeExecutionAuthorization(
      authorizationRecord,
      sourceRuntimeBatch,
      sourceSelection,
      sourceAdmissionReceipt,
    );
  assertRawArtProviderExecutionAuthorizationActive(authorization);
  await verifyRawArtProviderExecutionRuntimeState(authorization);

  const baseRegistry = createProviderRegistryFromEnvironment(environment);
  const providerRegistry = restrictProviderRegistry(
    baseRegistry,
    authorization.allowedAdapterIds,
  );
  for (const [index, job] of authorization.jobs.entries()) {
    const request = job.admissionJob.selectionJob.batchEntry.contract.request;
    const plan = compileProviderExecutionRoutingPlan(
      request,
      providerRegistry.rank(request),
    );
    if (!plan.eligibleAdapters.length) {
      throw new Error(
        `authorized job ${index} has no eligible allowed provider adapter`,
      );
    }
  }

  const command = values.get('--command') ?? 'until-idle';
  if (command !== 'once' && command !== 'until-idle') {
    throw new Error('--command must be once or until-idle');
  }
  const workerId = safeWorkerId(
    values.get('--worker-id') ?? `raw-art-authorized:${authorization.runId}`,
  );
  const concurrency = integer(
    values.get('--concurrency'),
    1,
    1,
    Math.min(16, authorization.jobs.length),
    '--concurrency',
  );
  const runtime = new LocalRuntimeRepository({ root: authorization.runtimeRoot });
  const artifacts = new LocalArtifactStore({ root: authorization.artifactRoot });
  const authorizer = createRawArtProviderExecutionAuthorizer(authorization);
  const capabilities = Object.freeze([
    ...new Set([
      ...providerWorkerCapabilities(providerRegistry),
      RAW_ART_PROVIDER_EXECUTION_CAPABILITY,
    ]),
  ].sort());
  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: workerId,
      capabilities,
      capabilityProfiles: providerWorkerCapabilityProfiles(providerRegistry),
      queues: authorization.queues,
    },
    handlers: createProviderHandlers(providerRegistry, authorizer),
    concurrency,
  });
  const runResult = command === 'once'
    ? await worker.runOnce()
    : await worker.runUntilIdle();
  const completedAt = new Date().toISOString();
  const completed = await inspectCompletedJobs(
    authorization,
    runtime,
    artifacts,
  );
  const receipt = {
    schema: RAW_ART_PROVIDER_RUNTIME_EXECUTION_RECEIPT_SCHEMA,
    status: completed.failed === 0 ? 'succeeded' : 'failed',
    completedAt,
    workerId,
    sourceAuthorization: {
      path: authorizationRecord.path,
      fileSha256: authorizationRecord.fileSha256,
      documentSha256: authorization.authorizationSha256,
      runId: authorization.runId,
    },
    runtime: {
      root: authorization.runtimeRoot,
      protocolVersion: authorization.value.runtimeProtocolVersion,
    },
    artifacts: {
      root: authorization.artifactRoot,
    },
    providerAdapters: providerRegistry.list().map((entry) => ({
      id: entry.id,
      version: entry.version,
      models: entry.models,
      capabilities: entry.capabilities,
    })),
    runResult,
    counts: {
      authorizedRuntimeJobs: authorization.jobs.length,
      succeededRuntimeJobs: completed.succeeded,
      failedRuntimeJobs: completed.failed,
    },
    jobs: completed.jobs,
    nextActions: [
      'Inspect immutable provider evidence and keep all candidate artifacts unapproved.',
      'Run mastering, blocking quality evaluation and independent approval before promotion.',
      'Keep target-repository mutation and publication disabled until their separate governed boundaries pass.',
    ],
    authority: executionAuthority(),
  };
  const executionSha256 = hashObject(receipt);
  const sealed = Object.freeze({
    ...receipt,
    executionSha256,
    runId: executionSha256.slice(0, 20),
  });
  const receiptPath = required(values, '--receipt');
  await writeCreateOnly(receiptPath, sealed);
  if (completed.failed !== 0) {
    const error = new Error('one or more authorized RAW_ART provider jobs failed');
    error.executionReceipt = path.resolve(receiptPath);
    throw error;
  }
  return {
    status: sealed.status,
    receipt: path.resolve(receiptPath),
    runId: sealed.runId,
    executionSha256: sealed.executionSha256,
    counts: sealed.counts,
  };
}

const directlyInvoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (directlyInvoked) {
  runAuthorizedRawArtProviderWorkerCli()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(
        `${JSON.stringify({
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          ...(error?.executionReceipt
            ? { executionReceipt: error.executionReceipt }
            : {}),
        })}\n`,
      );
      process.exitCode = 2;
    });
}
