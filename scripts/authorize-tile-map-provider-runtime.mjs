#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  LocalRuntimeRepository,
  RUNTIME_PROTOCOL_VERSION,
} from '../packages/runtime/dist/index.js';

export const TILE_MAP_PROVIDER_EXECUTION_CAPABILITY =
  'tile-map.execution-authorized';
export const TILE_MAP_PROVIDER_AUTHORIZATION_SCHEMA =
  'evavo.tile-map-provider-execution-authorization.v1';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
};
const hashObject = (value) => sha256(Buffer.from(canonical(value), 'utf8'));
const safeId = (value, label) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)) {
    throw new Error(`${label} must use 1 to 128 safe id characters`);
  }
  return value;
};
const absolute = (value, label) => {
  if (typeof value !== 'string' || !value) throw new Error(`${label} is required`);
  const resolved = path.resolve(value);
  if (resolved !== value) throw new Error(`${label} must be absolute and normalized`);
  return resolved;
};
const timestamp = (value, label) => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(Date.parse(value)).toISOString() !== value) {
    throw new Error(`${label} must be a canonical UTC timestamp`);
  }
  return value;
};
const optionMap = (argv) => {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || !value || value.startsWith('--') || values.has(name)) {
      throw new Error('arguments must be unique --name value pairs');
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
const splitAdapters = (value) => {
  const items = [...new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean).map((entry) => safeId(entry, 'allowed adapter id')))];
  if (!items.length || items.length > 16) throw new Error('--allowed-adapters must contain 1 to 16 comma-separated adapter ids');
  return items.sort();
};
const jsonObject = async (file, label) => {
  const bytes = await readFile(file);
  const value = JSON.parse(bytes.toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a JSON object`);
  return { path: path.resolve(file), bytes, value };
};

export async function authorizeTileMapProviderRuntime(argv = process.argv.slice(2)) {
  const values = optionMap(argv);
  const providerBatchFile = absolute(required(values, '--provider-batch'), '--provider-batch');
  const runtimeRoot = absolute(required(values, '--runtime-root'), '--runtime-root');
  const artifactRoot = absolute(required(values, '--artifact-root'), '--artifact-root');
  const output = absolute(required(values, '--output'), '--output');
  const allowedAdapterIds = splitAdapters(required(values, '--allowed-adapters'));
  const authorizedBy = required(values, '--authorized-by').trim();
  const reason = required(values, '--reason').trim();
  const authorizedAt = timestamp(required(values, '--authorized-at'), '--authorized-at');
  const expiresAt = timestamp(required(values, '--expires-at'), '--expires-at');
  const duration = Date.parse(expiresAt) - Date.parse(authorizedAt);
  if (duration <= 0 || duration > 24 * 60 * 60 * 1000) {
    throw new Error('authorization must expire within 24 hours after authorized-at');
  }
  if (!authorizedBy || authorizedBy.length > 256 || !reason || reason.length > 4096) {
    throw new Error('authorized-by/reason are invalid');
  }
  if (runtimeRoot === artifactRoot) throw new Error('runtime-root and artifact-root must be separate');
  await mkdir(runtimeRoot, { recursive: true });
  await mkdir(artifactRoot, { recursive: true });
  for (const [candidate, label] of [[runtimeRoot, 'runtime-root'], [artifactRoot, 'artifact-root']]) {
    const state = await lstat(candidate);
    if (!state.isDirectory() || state.isSymbolicLink()) throw new Error(`${label} must be a real non-symbolic directory`);
  }
  const batchRecord = await jsonObject(providerBatchFile, 'Tile Map provider runtime batch');
  const batch = batchRecord.value;
  if (batch.schema_version !== 1 || batch.status !== 'ready-for-provider-runtime') {
    throw new Error('provider batch must be schema v1 and ready-for-provider-runtime');
  }
  const providerBatchFingerprint = safeHash(batch.provider_batch_fingerprint, 'provider_batch_fingerprint');
  const sourceMapFingerprint = safeHash(batch.source_map_fingerprint, 'source_map_fingerprint');
  if (!Array.isArray(batch.jobs) || !batch.jobs.length || batch.jobs.length > 100) {
    throw new Error('provider batch jobs must contain 1 to 100 jobs');
  }
  const queue = `tile-map-provider-${providerBatchFingerprint.slice(0, 20)}`;
  const submissions = batch.jobs.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`jobs[${index}] must be object`);
    const candidateId = safeId(entry.candidate_id, `jobs[${index}].candidate_id`);
    const runtimeJob = entry.runtime_job;
    if (!runtimeJob || typeof runtimeJob !== 'object' || Array.isArray(runtimeJob)) throw new Error(`jobs[${index}].runtime_job must be object`);
    if (runtimeJob.queue !== 'provider' || typeof runtimeJob.kind !== 'string' || !runtimeJob.kind.startsWith('art.candidate.')) {
      throw new Error(`jobs[${index}] runtime job is not a provider candidate`);
    }
    if (!Array.isArray(runtimeJob.requiredCapabilities) || !runtimeJob.requiredCapabilities.length) {
      throw new Error(`jobs[${index}] runtime job requiredCapabilities missing`);
    }
    return {
      queue,
      kind: runtimeJob.kind,
      idempotencyKey: `tile-map-authorized:${candidateId}:${providerBatchFingerprint.slice(0, 16)}`,
      payload: runtimeJob.payload,
      requiredCapabilities: [...new Set([...runtimeJob.requiredCapabilities, TILE_MAP_PROVIDER_EXECUTION_CAPABILITY])].sort(),
      ...(Array.isArray(runtimeJob.requiredCapabilityProfile)
        ? { requiredCapabilityProfile: [...runtimeJob.requiredCapabilityProfile] }
        : {}),
      maximumAttempts: 1,
      leaseDurationMs: runtimeJob.leaseDurationMs,
      timeoutMs: runtimeJob.timeoutMs,
      labels: {
        ...(runtimeJob.labels ?? {}),
        governanceDomain: 'tile-map',
        candidateId,
        providerBatchFingerprint,
        sourceMapFingerprint,
      },
    };
  });
  const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
  const records = await runtime.submitBatch(submissions, `tile-map-authorize:${authorizedBy}`, new Date(authorizedAt));
  const jobs = records.map((record, index) => ({
    candidateId: batch.jobs[index].candidate_id,
    taskId: batch.jobs[index].task_id,
    visualFamily: batch.jobs[index].visual_family,
    providerRequestSha256: batch.jobs[index].request_sha256,
    canonicalRuntimeJobSha256: batch.jobs[index].runtime_job_sha256,
    jobId: record.id,
    specSha256: record.specHash,
    queue: record.spec.queue,
    kind: record.spec.kind,
    maximumAttempts: record.spec.maximumAttempts,
  }));
  if (jobs.some((job) => job.maximumAttempts !== 1)) throw new Error('authorized Tile Map jobs must use maximumAttempts=1');
  const base = {
    schema: TILE_MAP_PROVIDER_AUTHORIZATION_SCHEMA,
    status: 'authorized',
    runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
    authorizedAt,
    expiresAt,
    authorizedBy,
    reason,
    allowedAdapterIds,
    sourceProviderBatch: {
      path: batchRecord.path,
      fileSha256: sha256(batchRecord.bytes),
      documentSha256: providerBatchFingerprint,
    },
    sourceMapFingerprint,
    runtime: { root: runtimeRoot, rootSha256: sha256(Buffer.from(runtimeRoot, 'utf8')) },
    artifacts: { root: artifactRoot, rootSha256: sha256(Buffer.from(artifactRoot, 'utf8')) },
    execution: {
      requiredCapability: TILE_MAP_PROVIDER_EXECUTION_CAPABILITY,
      queues: [queue],
      maximumAttempts: 1,
      automaticRetry: false,
      genericProviderWorkerMayClaim: false,
    },
    jobs,
    authority: {
      providerExecution: true,
      candidateArtifactCreation: true,
      evidenceArtifactCreation: true,
      runtimeCompletion: true,
      candidateApproval: false,
      candidatePromotion: false,
      sourceMutation: false,
      repositoryMutation: false,
      publication: false,
    },
  };
  const authorizationSha256 = hashObject(base);
  const authorization = { ...base, authorizationSha256, runId: authorizationSha256.slice(0, 20) };
  await writeFile(output, `${JSON.stringify(authorization, null, 2)}\n`, { flag: 'wx' });
  return { status: 'authorized', output, runId: authorization.runId, authorizationSha256, jobs: jobs.length, queue };
}

function safeHash(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) throw new Error(`${label} must be SHA-256`);
  return value;
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}`) {
  authorizeTileMapProviderRuntime()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : String(error) })}\n`);
      process.exitCode = 2;
    });
}
