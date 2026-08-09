import path from 'node:path';
import { lstat } from 'node:fs/promises';

import {
  LocalRuntimeRepository,
  RUNTIME_PROTOCOL_VERSION,
} from '../../packages/runtime/dist/index.js';
import {
  providerRequestSha256,
} from '../../packages/providers/dist/index.js';

import {
  RAW_ART_PROVIDER_EXECUTION_CAPABILITY,
  validateRawArtProviderRuntimeAdmissionReceipt,
} from './admission.mjs';
import {
  boundedText,
  canonical,
  fail,
  hashObject,
  isObject,
  safeId,
  sha256,
  verifySelfHash,
} from './shared.mjs';

export const RAW_ART_PROVIDER_RUNTIME_EXECUTION_AUTHORIZATION_SCHEMA =
  'evavo.raw-art-provider-runtime-execution-authorization.v1';
export const RAW_ART_PROVIDER_REQUEST_METADATA_SCHEMA =
  'evavo.raw-art-provider-request-metadata.v2';

const MAXIMUM_RUNTIME_JOBS = 100;
const MAXIMUM_ADAPTERS = 16;
const MAXIMUM_AUTHORIZATION_DURATION_MS = 24 * 60 * 60 * 1000;
const JOB_EXECUTION_STATES = new Set(['queued']);

function boundedArray(value, label, maximum) {
  if (!Array.isArray(value) || value.length > maximum) {
    fail(`${label} must contain at most ${maximum} entries`);
  }
  return value;
}

function canonicalTimestamp(value, label) {
  const timestamp = boundedText(value, label, 20, 40);
  const milliseconds = Date.parse(timestamp);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== timestamp
  ) {
    fail(`${label} must be a canonical UTC timestamp`);
  }
  return timestamp;
}

function authorizationAuthority() {
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

function assertAuthorizationAuthority(value) {
  const expected = authorizationAuthority();
  if (!isObject(value) || canonical(value) !== canonical(expected)) {
    fail('RAW_ART provider execution authorization authority is invalid');
  }
}

function adapterIds(value) {
  const entries = boundedArray(value, 'allowedAdapterIds', MAXIMUM_ADAPTERS);
  if (entries.length === 0) {
    fail('allowedAdapterIds must authorize at least one exact adapter');
  }
  const seen = new Set();
  const result = [];
  for (const [index, entry] of entries.entries()) {
    const adapterId = safeId(entry, `allowedAdapterIds[${index}]`);
    if (seen.has(adapterId)) {
      fail(`allowedAdapterIds duplicates ${adapterId}`);
    }
    seen.add(adapterId);
    result.push(adapterId);
  }
  return Object.freeze(result.sort());
}

function absolutePath(value, label) {
  const input = boundedText(value, label, 1, 32_768);
  if (input.includes('\0')) fail(`${label} is invalid`);
  const resolved = path.resolve(input);
  if (resolved !== input) fail(`${label} must be absolute and normalized`);
  return resolved;
}

async function existingDirectory(value, label) {
  const resolved = absolutePath(value, label);
  const state = await lstat(resolved);
  if (!state.isDirectory() || state.isSymbolicLink()) {
    fail(`${label} must be a real directory, not a symbolic link`);
  }
  return resolved;
}

function sourceRecord(record, documentSha256, runId) {
  return Object.freeze({
    path: record.path,
    fileSha256: record.fileSha256,
    documentSha256,
    runId,
  });
}

function snapshotAuthorizationOptions(options) {
  if (!isObject(options)) fail('provider execution authorization options are invalid');
  const authorizedAt = canonicalTimestamp(options.authorizedAt, 'authorizedAt');
  const expiresAt = canonicalTimestamp(options.expiresAt, 'expiresAt');
  const authorizedMilliseconds = Date.parse(authorizedAt);
  const expiresMilliseconds = Date.parse(expiresAt);
  if (
    expiresMilliseconds <= authorizedMilliseconds ||
    expiresMilliseconds - authorizedMilliseconds >
      MAXIMUM_AUTHORIZATION_DURATION_MS
  ) {
    fail('provider execution authorization must expire within 24 hours after it begins');
  }
  const authorizedBy = boundedText(
    options.authorizedBy,
    'authorizedBy',
    1,
    256,
  );
  const reason = boundedText(options.reason, 'reason', 1, 4_096);
  const allowedAdapterIds = adapterIds(options.allowedAdapterIds);
  const runtimeRoot = absolutePath(options.runtimeRoot, 'runtimeRoot');
  const artifactRoot = absolutePath(options.artifactRoot, 'artifactRoot');
  if (runtimeRoot === artifactRoot) {
    fail('runtimeRoot and artifactRoot must be separate directories');
  }
  return Object.freeze({
    authorizedAt,
    expiresAt,
    authorizedBy,
    reason,
    allowedAdapterIds,
    runtimeRoot,
    artifactRoot,
  });
}

async function exactRuntimeRecords(admission, runtimeRoot) {
  const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
  const jobs = [];
  for (const [index, expected] of admission.jobs.entries()) {
    const record = await runtime.get(expected.jobId);
    if (
      !record ||
      !JOB_EXECUTION_STATES.has(record.state) ||
      record.specHash !== expected.specSha256 ||
      canonical(record.spec) !== canonical(expected.normalized.spec) ||
      record.attempts.length !== 0 ||
      record.redriveCount !== 0 ||
      record.spec.maximumAttempts !== 1 ||
      !record.spec.requiredCapabilities.includes(
        RAW_ART_PROVIDER_EXECUTION_CAPABILITY,
      )
    ) {
      fail(`runtime authorization job ${index} is not an exact unstarted isolated admission`);
    }
    jobs.push(record);
  }
  return Object.freeze(jobs);
}

export async function compileRawArtProviderRuntimeExecutionAuthorization(
  runtimeBatchRecord,
  selectionRecord,
  admissionReceiptRecord,
  options,
) {
  const input = snapshotAuthorizationOptions(options);
  const admission = validateRawArtProviderRuntimeAdmissionReceipt(
    admissionReceiptRecord,
    runtimeBatchRecord,
    selectionRecord,
    input.runtimeRoot,
  );
  const runtimeRoot = await existingDirectory(input.runtimeRoot, 'runtimeRoot');
  const runtimeRecords = await exactRuntimeRecords(admission, runtimeRoot);
  const queueValues = [...new Set(admission.jobs.map((entry) => entry.executionQueue))];
  if (queueValues.length !== 1) {
    fail('RAW_ART provider admission must use exactly one isolated execution queue');
  }
  const queues = Object.freeze(queueValues);

  const jobs = admission.jobs.map((entry, index) => {
    const request = entry.selectionJob.batchEntry.contract.request;
    const requestHash = entry.selectionJob.batchEntry.contract.requestSha256;
    if (providerRequestSha256(request) !== requestHash) {
      fail(`runtime authorization job ${index} provider request identity drifted`);
    }
    return Object.freeze({
      workOrderId: entry.workOrderId,
      campaignItemId: entry.campaignItemId,
      providerRequestId: entry.providerRequestId,
      requestSha256: requestHash,
      contractSha256: entry.contractSha256,
      canonicalRuntimeJobSha256: entry.runtimeJobSha256,
      admittedRuntimeJobSha256: entry.admittedRuntimeJobSha256,
      jobId: entry.jobId,
      specSha256: entry.specSha256,
      queue: entry.executionQueue,
      kind: runtimeRecords[index].spec.kind,
      maximumAttempts: 1,
    });
  });

  const authorization = {
    schema: RAW_ART_PROVIDER_RUNTIME_EXECUTION_AUTHORIZATION_SCHEMA,
    status: 'authorized',
    runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
    providerProtocolVersion: admission.selection.batch.providerProtocolVersion,
    authorizedAt: input.authorizedAt,
    expiresAt: input.expiresAt,
    authorizedBy: input.authorizedBy,
    reason: input.reason,
    allowedAdapterIds: input.allowedAdapterIds,
    runtime: {
      root: runtimeRoot,
      rootSha256: sha256(Buffer.from(runtimeRoot, 'utf8')),
    },
    artifacts: {
      root: input.artifactRoot,
      rootSha256: sha256(Buffer.from(input.artifactRoot, 'utf8')),
    },
    sourceRuntimeBatch: sourceRecord(
      runtimeBatchRecord,
      admission.selection.batch.runtimeBatchSha256,
      admission.selection.batch.runId,
    ),
    sourceSelection: sourceRecord(
      selectionRecord,
      admission.selection.selectionSha256,
      admission.selection.runId,
    ),
    sourceAdmissionReceipt: sourceRecord(
      admissionReceiptRecord,
      admission.admissionSha256,
      admission.runId,
    ),
    campaign: {
      gameHead: admission.selection.batch.gameHead,
      queueSha256: admission.selection.batch.queueSha256,
      campaignSha256: admission.selection.batch.campaignSha256,
      campaignRunId: admission.selection.batch.campaignRunId,
      technicalAdmissionSha256:
        admission.selection.batch.technicalAdmissionSha256,
      styleBankSha256: admission.selection.batch.styleBankSha256,
      bindingsSha256: admission.selection.batch.bindingsSha256,
    },
    execution: {
      requiredCapability: RAW_ART_PROVIDER_EXECUTION_CAPABILITY,
      queues,
      maximumAttempts: 1,
      automaticRetry: false,
      genericProviderWorkerMayClaim: false,
    },
    counts: {
      authorizedRuntimeJobs: jobs.length,
      allowedAdapters: input.allowedAdapterIds.length,
      isolatedQueues: queues.length,
    },
    jobs,
    nextActions: [
      'Run only the dedicated RAW_ART provider execution command with this exact authorization document.',
      'Inspect immutable provider evidence and unapproved candidate artifacts after runtime completion.',
      'Master, evaluate and independently approve candidates before any promotion, target-repository mutation or publication.',
    ],
    authority: authorizationAuthority(),
  };
  const authorizationSha256 = hashObject(authorization);
  return Object.freeze({
    ...authorization,
    authorizationSha256,
    runId: authorizationSha256.slice(0, 20),
  });
}

function exactSource(value, record, documentSha256, runId, label) {
  const expected = sourceRecord(record, documentSha256, runId);
  if (!isObject(value) || canonical(value) !== canonical(expected)) {
    fail(`${label} does not bind the exact source file`);
  }
}

export function validateRawArtProviderRuntimeExecutionAuthorization(
  authorizationRecord,
  runtimeBatchRecord,
  selectionRecord,
  admissionReceiptRecord,
) {
  const admission = validateRawArtProviderRuntimeAdmissionReceipt(
    admissionReceiptRecord,
    runtimeBatchRecord,
    selectionRecord,
  );
  if (!isObject(authorizationRecord) || !isObject(authorizationRecord.value)) {
    fail('RAW_ART provider runtime execution authorization record is invalid');
  }
  const value = authorizationRecord.value;
  if (
    value.schema !== RAW_ART_PROVIDER_RUNTIME_EXECUTION_AUTHORIZATION_SCHEMA ||
    value.status !== 'authorized'
  ) {
    fail('unexpected RAW_ART provider runtime execution authorization v1');
  }
  const authorizationSha256 = verifySelfHash(
    value,
    'authorizationSha256',
    'RAW_ART provider runtime execution authorization',
  );
  assertAuthorizationAuthority(value.authority);
  if (
    value.runtimeProtocolVersion !== RUNTIME_PROTOCOL_VERSION ||
    value.providerProtocolVersion !== admission.selection.batch.providerProtocolVersion
  ) {
    fail('provider execution authorization protocol binding is invalid');
  }
  const authorizedAt = canonicalTimestamp(value.authorizedAt, 'authorizedAt');
  const expiresAt = canonicalTimestamp(value.expiresAt, 'expiresAt');
  if (
    Date.parse(expiresAt) <= Date.parse(authorizedAt) ||
    Date.parse(expiresAt) - Date.parse(authorizedAt) >
      MAXIMUM_AUTHORIZATION_DURATION_MS
  ) {
    fail('provider execution authorization duration is invalid');
  }
  const authorizedBy = boundedText(value.authorizedBy, 'authorizedBy', 1, 256);
  const reason = boundedText(value.reason, 'reason', 1, 4_096);
  const allowedAdapterIds = adapterIds(value.allowedAdapterIds);

  if (!isObject(value.runtime) || !isObject(value.artifacts)) {
    fail('provider execution authorization storage binding is invalid');
  }
  const runtimeRoot = absolutePath(value.runtime.root, 'runtime.root');
  const artifactRoot = absolutePath(value.artifacts.root, 'artifacts.root');
  if (runtimeRoot === artifactRoot) {
    fail('runtime and artifact roots must remain separate');
  }
  if (
    value.runtime.rootSha256 !== sha256(Buffer.from(runtimeRoot, 'utf8')) ||
    value.artifacts.rootSha256 !== sha256(Buffer.from(artifactRoot, 'utf8'))
  ) {
    fail('provider execution authorization storage hash mismatch');
  }
  if (runtimeRoot !== admission.runtimeRoot) {
    fail('provider execution authorization is bound to another runtime root');
  }

  exactSource(
    value.sourceRuntimeBatch,
    runtimeBatchRecord,
    admission.selection.batch.runtimeBatchSha256,
    admission.selection.batch.runId,
    'sourceRuntimeBatch',
  );
  exactSource(
    value.sourceSelection,
    selectionRecord,
    admission.selection.selectionSha256,
    admission.selection.runId,
    'sourceSelection',
  );
  exactSource(
    value.sourceAdmissionReceipt,
    admissionReceiptRecord,
    admission.admissionSha256,
    admission.runId,
    'sourceAdmissionReceipt',
  );

  const expectedCampaign = {
    gameHead: admission.selection.batch.gameHead,
    queueSha256: admission.selection.batch.queueSha256,
    campaignSha256: admission.selection.batch.campaignSha256,
    campaignRunId: admission.selection.batch.campaignRunId,
    technicalAdmissionSha256:
      admission.selection.batch.technicalAdmissionSha256,
    styleBankSha256: admission.selection.batch.styleBankSha256,
    bindingsSha256: admission.selection.batch.bindingsSha256,
  };
  if (!isObject(value.campaign) || canonical(value.campaign) !== canonical(expectedCampaign)) {
    fail('provider execution authorization campaign binding is invalid');
  }

  const queues = Object.freeze([
    ...new Set(admission.jobs.map((entry) => entry.executionQueue)),
  ]);
  const expectedExecution = {
    requiredCapability: RAW_ART_PROVIDER_EXECUTION_CAPABILITY,
    queues,
    maximumAttempts: 1,
    automaticRetry: false,
    genericProviderWorkerMayClaim: false,
  };
  if (!isObject(value.execution) || canonical(value.execution) !== canonical(expectedExecution)) {
    fail('provider execution authorization isolation contract is invalid');
  }
  if (
    !isObject(value.counts) ||
    value.counts.authorizedRuntimeJobs !== admission.jobs.length ||
    value.counts.allowedAdapters !== allowedAdapterIds.length ||
    value.counts.isolatedQueues !== queues.length
  ) {
    fail('provider execution authorization count reconciliation failed');
  }

  const jobValues = boundedArray(value.jobs, 'authorization.jobs', MAXIMUM_RUNTIME_JOBS);
  if (jobValues.length !== admission.jobs.length) {
    fail('provider execution authorization job count mismatch');
  }
  const byJobId = new Map();
  const jobs = admission.jobs.map((entry, index) => {
    const request = entry.selectionJob.batchEntry.contract.request;
    const expected = {
      workOrderId: entry.workOrderId,
      campaignItemId: entry.campaignItemId,
      providerRequestId: entry.providerRequestId,
      requestSha256: entry.selectionJob.batchEntry.contract.requestSha256,
      contractSha256: entry.contractSha256,
      canonicalRuntimeJobSha256: entry.runtimeJobSha256,
      admittedRuntimeJobSha256: entry.admittedRuntimeJobSha256,
      jobId: entry.jobId,
      specSha256: entry.specSha256,
      queue: entry.executionQueue,
      kind: entry.normalized.spec.kind,
      maximumAttempts: 1,
    };
    if (
      providerRequestSha256(request) !== expected.requestSha256 ||
      !isObject(jobValues[index]) ||
      canonical(jobValues[index]) !== canonical(expected)
    ) {
      fail(`authorization.jobs[${index}] does not bind the exact admitted job`);
    }
    if (byJobId.has(expected.jobId)) {
      fail(`provider execution authorization duplicates runtime job ${expected.jobId}`);
    }
    const job = Object.freeze({ ...expected, admissionJob: entry });
    byJobId.set(expected.jobId, job);
    return job;
  });

  return Object.freeze({
    value,
    authorizationSha256,
    runId: value.runId,
    authorizedAt,
    expiresAt,
    authorizedBy,
    reason,
    allowedAdapterIds,
    runtimeRoot,
    artifactRoot,
    queues,
    jobs: Object.freeze(jobs),
    byJobId,
    admission,
  });
}

export async function verifyRawArtProviderExecutionRuntimeState(
  authorization,
) {
  const runtimeRoot = await existingDirectory(
    authorization.runtimeRoot,
    'runtimeRoot',
  );
  const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
  const records = [];
  for (const [index, entry] of authorization.jobs.entries()) {
    const record = await runtime.get(entry.jobId);
    if (
      !record ||
      record.state !== 'queued' ||
      record.specHash !== entry.specSha256 ||
      canonical(record.spec) !== canonical(entry.admissionJob.normalized.spec) ||
      record.attempts.length !== 0 ||
      record.redriveCount !== 0
    ) {
      fail(`authorized runtime job ${index} is no longer an exact unstarted admission`);
    }
    records.push(record);
  }
  return Object.freeze(records);
}

function authorizationNow(value) {
  let milliseconds = Number.NaN;
  try {
    milliseconds = Date.prototype.getTime.call(value);
  } catch {
    fail('provider execution authorization clock is invalid');
  }
  if (!Number.isFinite(milliseconds)) {
    fail('provider execution authorization clock is invalid');
  }
  return milliseconds;
}

export function assertRawArtProviderExecutionAuthorizationActive(
  authorization,
  now = new Date(),
) {
  const milliseconds = authorizationNow(now);
  if (
    milliseconds < Date.parse(authorization.authorizedAt) ||
    milliseconds >= Date.parse(authorization.expiresAt)
  ) {
    fail('RAW_ART provider execution authorization is not currently active');
  }
  return milliseconds;
}

export function createRawArtProviderExecutionAuthorizer(authorization) {
  const allowedAdapterIds = new Set(authorization.allowedAdapterIds);
  return Object.freeze({
    authorizationSha256: authorization.authorizationSha256,
    allowedAdapterIds: authorization.allowedAdapterIds,
    queues: authorization.queues,
    requiredCapability: RAW_ART_PROVIDER_EXECUTION_CAPABILITY,
    adapterAllowed(adapterId) {
      return allowedAdapterIds.has(adapterId);
    },
    assertJobAuthorized(job, request, now = new Date()) {
      assertRawArtProviderExecutionAuthorizationActive(authorization, now);
      const expected = authorization.byJobId.get(job.id);
      if (!expected) {
        fail(`RAW_ART provider execution job is not authorized: ${job.id}`);
      }
      if (
        job.specHash !== expected.specSha256 ||
        job.spec.queue !== expected.queue ||
        job.spec.kind !== expected.kind ||
        job.spec.maximumAttempts !== 1 ||
        job.redriveCount !== 0 ||
        job.attempts.length !== 1 ||
        !job.spec.requiredCapabilities.includes(
          RAW_ART_PROVIDER_EXECUTION_CAPABILITY,
        )
      ) {
        fail(`RAW_ART provider execution job identity drifted: ${job.id}`);
      }
      if (
        providerRequestSha256(request) !== expected.requestSha256 ||
        request.requestId !== expected.providerRequestId ||
        !isObject(request.metadata) ||
        request.metadata.schema !== RAW_ART_PROVIDER_REQUEST_METADATA_SCHEMA ||
        request.metadata.campaignItemId !== expected.campaignItemId ||
        request.metadata.campaignSha256 !==
          authorization.admission.selection.batch.campaignSha256
      ) {
        fail(`RAW_ART provider execution request drifted: ${job.id}`);
      }
      return expected;
    },
  });
}
