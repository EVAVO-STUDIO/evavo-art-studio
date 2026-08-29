#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LocalArtifactStore } from '../packages/artifacts/dist/index.js';
import { validateProviderCandidateRequest } from '../packages/providers/dist/index.js';
import {
  LocalRuntimeRepository,
  RuntimeWorker,
  RUNTIME_PROTOCOL_VERSION,
  PermanentRuntimeError,
} from '../packages/runtime/dist/index.js';
import {
  createProviderHandlers,
  createProviderRegistryFromEnvironment,
  providerWorkerCapabilities,
  providerWorkerCapabilityProfiles,
  restrictProviderRegistry,
} from '../apps/worker/dist/provider-handlers.js';
import {
  TILE_MAP_PROVIDER_AUTHORIZATION_SCHEMA,
  TILE_MAP_PROVIDER_EXECUTION_CAPABILITY,
} from './authorize-tile-map-provider-runtime.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
};
const hashObject = (value) => sha256(Buffer.from(canonical(value), 'utf8'));
const parseArgs = (argv) => {
  const supported = new Set(['--authorization', '--worker-id', '--command', '--concurrency', '--receipt']);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || !value || value.startsWith('--') || values.has(name) || !supported.has(name)) {
      throw new Error('arguments must be unique supported --name value pairs');
    }
    values.set(name, value);
  }
  return values;
};
const required = (values, name) => {
  const value = values.get(name);
  if (!value) throw new Error(`missing ${name}`);
  return value;
};
const safeWorkerId = (value) => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)) throw new Error('--worker-id must contain 1 to 128 safe characters');
  return value;
};
const integer = (value, fallback, minimum, maximum, label) => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${label} must be integer ${minimum}-${maximum}`);
  return parsed;
};
const readJson = async (file, label) => {
  const resolved = path.resolve(file);
  const bytes = await readFile(resolved);
  const value = JSON.parse(bytes.toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a JSON object`);
  return { path: resolved, bytes, value };
};
const safeHash = (value, label) => {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) throw new Error(`${label} must be SHA-256`);
  return value;
};
const authorityBody = (authorization) => {
  const { authorizationSha256: _hash, runId: _runId, ...body } = authorization;
  return body;
};

function validateAuthorization(record) {
  const authorization = record.value;
  if (authorization.schema !== TILE_MAP_PROVIDER_AUTHORIZATION_SCHEMA || authorization.status !== 'authorized') {
    throw new Error('unexpected Tile Map provider authorization schema/status');
  }
  if (authorization.runtimeProtocolVersion !== RUNTIME_PROTOCOL_VERSION) {
    throw new Error('Tile Map provider authorization runtime protocol drifted');
  }
  const expectedHash = hashObject(authorityBody(authorization));
  if (authorization.authorizationSha256 !== expectedHash || authorization.runId !== expectedHash.slice(0, 20)) {
    throw new Error('Tile Map provider authorization self hash is invalid');
  }
  const now = Date.now();
  if (now < Date.parse(authorization.authorizedAt) || now >= Date.parse(authorization.expiresAt)) {
    throw new Error('Tile Map provider authorization is not currently active');
  }
  if (!Array.isArray(authorization.allowedAdapterIds) || authorization.allowedAdapterIds.length === 0) {
    throw new Error('Tile Map provider authorization has no allowed adapters');
  }
  if (authorization.execution?.requiredCapability !== TILE_MAP_PROVIDER_EXECUTION_CAPABILITY) {
    throw new Error('Tile Map provider authorization execution capability is invalid');
  }
  if (!Array.isArray(authorization.execution.queues) || authorization.execution.queues.length !== 1) {
    throw new Error('Tile Map provider authorization must isolate exactly one queue');
  }
  if (!Array.isArray(authorization.jobs) || authorization.jobs.length === 0) {
    throw new Error('Tile Map provider authorization contains no jobs');
  }
  return authorization;
}

async function verifySourceBatch(authorization) {
  const source = authorization.sourceProviderBatch;
  const record = await readJson(source.path, 'Tile Map provider runtime batch');
  if (sha256(record.bytes) !== source.fileSha256) throw new Error('Tile Map provider runtime batch bytes drifted');
  if (record.value.provider_batch_fingerprint !== source.documentSha256) throw new Error('Tile Map provider runtime batch fingerprint drifted');
  if (record.value.source_map_fingerprint !== authorization.sourceMapFingerprint) throw new Error('Tile Map provider source map fingerprint drifted');
  return record;
}

async function verifyRuntimeState(authorization, runtime) {
  const expected = new Map();
  for (const item of authorization.jobs) {
    if (expected.has(item.jobId)) throw new Error(`duplicate authorized runtime job ${item.jobId}`);
    const record = await runtime.get(item.jobId);
    if (!record || record.state !== 'queued' || record.specHash !== item.specSha256 || record.attempts.length !== 0 || record.redriveCount !== 0) {
      throw new Error(`authorized Tile Map runtime job is not exact unstarted queued state: ${item.jobId}`);
    }
    if (record.spec.maximumAttempts !== 1 || !record.spec.requiredCapabilities.includes(TILE_MAP_PROVIDER_EXECUTION_CAPABILITY)) {
      throw new Error(`authorized Tile Map runtime job lost isolated execution policy: ${item.jobId}`);
    }
    if (!authorization.execution.queues.includes(record.spec.queue)) throw new Error(`authorized Tile Map runtime job queue drifted: ${item.jobId}`);
    expected.set(item.jobId, item);
  }
  return expected;
}

function guardedHandlers(baseHandlers, authorization, expectedJobs) {
  const result = {};
  for (const [kind, base] of Object.entries(baseHandlers)) {
    result[kind] = async (context) => {
      const expected = expectedJobs.get(context.job.id);
      if (!expected || context.job.specHash !== expected.specSha256) {
        throw new PermanentRuntimeError(
          'TILE_MAP_PROVIDER_EXECUTION_UNAUTHORIZED',
          `runtime job ${context.job.id} is not in the active Tile Map authorization`,
        );
      }
      if (!context.job.spec.requiredCapabilities.includes(TILE_MAP_PROVIDER_EXECUTION_CAPABILITY)) {
        throw new PermanentRuntimeError(
          'TILE_MAP_PROVIDER_EXECUTION_CONTRACT_MISMATCH',
          'Tile Map provider job is missing its execution authorization capability',
        );
      }
      const request = validateProviderCandidateRequest(context.job.spec.payload);
      const metadata = request.metadata;
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || metadata.schema !== 'evavo.tile-map-provider-metadata.v1') {
        throw new PermanentRuntimeError(
          'TILE_MAP_PROVIDER_EXECUTION_CONTRACT_MISMATCH',
          'Tile Map provider request metadata schema is missing',
        );
      }
      if (
        metadata.candidateId !== expected.candidateId ||
        metadata.sourceMapFingerprint !== authorization.sourceMapFingerprint ||
        metadata.providerAuthority !== 'candidate-generation-only' ||
        metadata.approvalAuthority !== false ||
        metadata.reviewRequired !== true
      ) {
        throw new PermanentRuntimeError(
          'TILE_MAP_PROVIDER_EXECUTION_CONTRACT_MISMATCH',
          'Tile Map provider request metadata drifted from authorization',
        );
      }
      if (Date.now() >= Date.parse(authorization.expiresAt)) {
        throw new PermanentRuntimeError(
          'TILE_MAP_PROVIDER_EXECUTION_UNAUTHORIZED',
          'Tile Map provider authorization expired before execution',
        );
      }
      return base(context);
    };
  }
  return Object.freeze(result);
}

async function inspectCompleted(authorization, runtime, artifacts) {
  const jobs = [];
  let succeeded = 0;
  let failed = 0;
  for (const expected of authorization.jobs) {
    const job = await runtime.get(expected.jobId);
    if (!job || job.specHash !== expected.specSha256) throw new Error(`authorized job drifted after execution: ${expected.jobId}`);
    const outputArtifacts = [];
    for (const artifactId of job.outputArtifacts) {
      const verification = await artifacts.verify(artifactId);
      if (!verification.descriptorValid || !verification.contentValid) throw new Error(`provider artifact failed immutable verification: ${artifactId}`);
      const descriptor = await artifacts.get(artifactId);
      if (!descriptor) throw new Error(`provider artifact missing: ${artifactId}`);
      if (
        descriptor.labels.artifactRole === 'provider-candidate' &&
        (descriptor.storageClass !== 'intermediate' ||
          descriptor.labels.approvalState !== 'unapproved' ||
          descriptor.metadata.finalDeliverable !== false)
      ) {
        throw new Error(`Tile Map provider candidate crossed unapproved boundary: ${artifactId}`);
      }
      outputArtifacts.push({
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
      candidateId: expected.candidateId,
      taskId: expected.taskId,
      visualFamily: expected.visualFamily,
      providerRequestSha256: expected.providerRequestSha256,
      jobId: expected.jobId,
      specSha256: expected.specSha256,
      state: job.state,
      attempts: job.attempts.length,
      outputArtifacts,
      ...(job.failure ? { failure: job.failure } : {}),
    });
  }
  return { jobs, succeeded, failed };
}

export async function runAuthorizedTileMapProviderWorker(argv = process.argv.slice(2), environment = process.env) {
  const values = parseArgs(argv);
  const authorizationRecord = await readJson(required(values, '--authorization'), 'Tile Map provider authorization');
  const authorization = validateAuthorization(authorizationRecord);
  await verifySourceBatch(authorization);
  const runtime = new LocalRuntimeRepository({ root: authorization.runtime.root });
  const artifacts = new LocalArtifactStore({ root: authorization.artifacts.root });
  const expectedJobs = await verifyRuntimeState(authorization, runtime);
  const baseRegistry = createProviderRegistryFromEnvironment(environment);
  const providerRegistry = restrictProviderRegistry(baseRegistry, authorization.allowedAdapterIds);
  const baseHandlers = createProviderHandlers(providerRegistry);
  const handlers = guardedHandlers(baseHandlers, authorization, expectedJobs);
  const command = values.get('--command') ?? 'until-idle';
  if (!['once', 'until-idle'].includes(command)) throw new Error('--command must be once or until-idle');
  const workerId = safeWorkerId(values.get('--worker-id') ?? `tile-map-authorized:${authorization.runId}`);
  const concurrency = integer(values.get('--concurrency'), 1, 1, Math.min(16, authorization.jobs.length), '--concurrency');
  const capabilities = [...new Set([
    ...providerWorkerCapabilities(providerRegistry),
    TILE_MAP_PROVIDER_EXECUTION_CAPABILITY,
  ])].sort();
  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: workerId,
      capabilities,
      capabilityProfiles: providerWorkerCapabilityProfiles(providerRegistry),
      queues: authorization.execution.queues,
    },
    handlers,
    concurrency,
  });
  const runResult = command === 'once' ? await worker.runOnce() : await worker.runUntilIdle();
  const completed = await inspectCompleted(authorization, runtime, artifacts);
  const receiptBase = {
    schema: 'evavo.tile-map-provider-execution-receipt.v1',
    status: completed.failed === 0 ? 'succeeded' : 'failed',
    completedAt: new Date().toISOString(),
    workerId,
    sourceAuthorization: {
      path: authorizationRecord.path,
      fileSha256: sha256(authorizationRecord.bytes),
      documentSha256: authorization.authorizationSha256,
      runId: authorization.runId,
    },
    sourceMapFingerprint: authorization.sourceMapFingerprint,
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
    authority: {
      providerExecution: true,
      candidateArtifactCreation: true,
      evidenceArtifactCreation: true,
      candidateApproval: false,
      candidatePromotion: false,
      repositoryMutation: false,
      publication: false,
    },
  };
  const executionSha256 = hashObject(receiptBase);
  const receipt = { ...receiptBase, executionSha256, runId: executionSha256.slice(0, 20) };
  const receiptPath = path.resolve(required(values, '--receipt'));
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  if (completed.failed !== 0) {
    const error = new Error('one or more authorized Tile Map provider jobs failed');
    error.executionReceipt = receiptPath;
    throw error;
  }
  return { status: receipt.status, receipt: receiptPath, runId: receipt.runId, executionSha256, counts: receipt.counts };
}

const directlyInvoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (directlyInvoked) {
  runAuthorizedTileMapProviderWorker()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${JSON.stringify({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        ...(error?.executionReceipt ? { executionReceipt: error.executionReceipt } : {}),
      })}\n`);
      process.exitCode = 2;
    });
}
