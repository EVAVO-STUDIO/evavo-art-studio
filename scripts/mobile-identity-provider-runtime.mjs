#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { lstat, mkdir } from 'node:fs/promises';

import { LocalArtifactStore } from '../packages/artifacts/dist/index.js';
import {
  compileProviderCandidateRuntimeContract,
  compileProviderExecutionRoutingPlan,
  providerRequestSha256,
  validateProviderCandidateRequest,
} from '../packages/providers/dist/index.js';
import {
  LocalRuntimeRepository,
  RUNTIME_PROTOCOL_VERSION,
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
  boundedText,
  canonical,
  fail,
  hashObject,
  isObject,
  safeId,
  sha256,
  verifySelfHash,
  readJsonRecord,
  writeCreateOnly,
} from './raw-art-provider/shared.mjs';

export const MOBILE_IDENTITY_RUNTIME_BATCH_SCHEMA = 'evavo.mobile-identity-provider-runtime-batch.v1';
export const MOBILE_IDENTITY_SELECTION_SCHEMA = 'evavo.mobile-identity-provider-runtime-selection.v1';
export const MOBILE_IDENTITY_ADMISSION_SCHEMA = 'evavo.mobile-identity-provider-runtime-admission.v1';
export const MOBILE_IDENTITY_AUTHORIZATION_SCHEMA = 'evavo.mobile-identity-provider-runtime-authorization.v1';
export const MOBILE_IDENTITY_EXECUTION_RECEIPT_SCHEMA = 'evavo.mobile-identity-provider-runtime-execution.v1';
export const MOBILE_IDENTITY_EXECUTION_CAPABILITY = 'mobile-identity.execution-authorized';

const PROVIDER_REQUEST_SCHEMA = 'evavo.mobile-identity-provider-request.v1';
const MAX_AUTH_MS = 24 * 60 * 60 * 1000;
const MAX_ADAPTERS = 16;

function array(value, label, maximum = 100) {
  if (!Array.isArray(value) || value.length > maximum) fail(`${label} must be an array with at most ${maximum} entries`);
  return value;
}
function timestamp(value, label) {
  const text = boundedText(value, label, 20, 40);
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== text) fail(`${label} must be a canonical UTC timestamp`);
  return text;
}
function sourceRecord(record, documentSha256, runId) {
  return Object.freeze({ path: record.path, fileSha256: record.fileSha256, documentSha256, runId });
}
function falseAuthority() {
  return Object.freeze({
    providerExecution: false,
    runtimeSubmission: false,
    workerClaim: false,
    candidateApproval: false,
    candidatePromotion: false,
    targetRepositoryMutation: false,
    publication: false,
    forcePush: false,
  });
}
function admissionAuthority() {
  return Object.freeze({
    durableRuntimeAdmission: true,
    runtimeSubmission: true,
    providerExecution: false,
    workerClaim: false,
    candidateApproval: false,
    candidatePromotion: false,
    targetRepositoryMutation: false,
    publication: false,
    forcePush: false,
  });
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
    candidateApproval: false,
    candidatePromotion: false,
    targetRepositoryMutation: false,
    publication: false,
    forcePush: false,
  });
}
function exactAuthority(value, expected, label) {
  if (!isObject(value) || canonical(value) !== canonical(expected)) fail(`${label} authority is invalid`);
}
function absolute(value, label) {
  const input = boundedText(value, label, 1, 32768);
  if (input.includes('\0')) fail(`${label} is invalid`);
  const resolved = path.resolve(input);
  if (resolved !== input) fail(`${label} must be absolute and normalized`);
  return resolved;
}
async function directory(value, label, create = false) {
  const root = absolute(value, label);
  if (create) await mkdir(root, { recursive: true, mode: 0o700 });
  const state = await lstat(root);
  if (!state.isDirectory() || state.isSymbolicLink()) fail(`${label} must be a real directory`);
  return root;
}
function exactAdapters(value) {
  const result = [];
  const seen = new Set();
  for (const [index, entry] of array(value, 'allowedAdapterIds', MAX_ADAPTERS).entries()) {
    const id = safeId(entry, `allowedAdapterIds[${index}]`);
    if (['gpt-image', 'openai-image', 'comfyui'].includes(id)) fail('generic provider aliases are forbidden');
    if (seen.has(id)) fail(`allowedAdapterIds duplicates ${id}`);
    seen.add(id);
    result.push(id);
  }
  if (!result.length) fail('at least one exact provider adapter must be authorized');
  return Object.freeze(result.sort());
}
function executionQueue(selectionRunId) { return `mobile-identity.provider.${selectionRunId}`; }

export function compileMobileIdentityProviderRuntimeBatch(providerRequestRecord, options) {
  const wrapper = providerRequestRecord?.value;
  if (!isObject(wrapper) || wrapper.schema !== PROVIDER_REQUEST_SCHEMA || wrapper.status !== 'provider-request-ready') fail('unexpected mobile identity provider request');
  if (!isObject(wrapper.providerRequest)) fail('mobile identity native provider request is missing');
  const request = validateProviderCandidateRequest(wrapper.providerRequest);
  if (request.assetKind !== 'ui' || request.continuityPhase !== 'identity-master' || request.operation !== 'generate') fail('provider request is not an identity-master generation request');
  const workOrderId = safeId(options?.workOrderId, 'workOrderId');
  const contract = compileProviderCandidateRuntimeContract(request);
  const batch = {
    schema: MOBILE_IDENTITY_RUNTIME_BATCH_SCHEMA,
    status: 'ready',
    providerProtocolVersion: request.schemaVersion,
    sourceProviderRequest: sourceRecord(providerRequestRecord, wrapper.providerRequestSha256, wrapper.providerRequestSha256.slice(0, 20)),
    sourceProductionSha256: wrapper.sourceProductionSha256,
    workOrderId,
    providerRequestId: request.requestId,
    providerRequestSha256: contract.requestSha256,
    contract,
    contractSha256: hashObject(contract),
    runtimeJobSha256: hashObject(contract.runtimeJob),
    candidateCount: request.candidateCount,
    nextActions: [
      'Select this exact mobile identity work order for durable runtime admission.',
      'Authorize provider execution separately with exact adapter IDs and an expiration time.',
      'Keep all generated candidates unapproved until independent raster approval.',
    ],
    authority: falseAuthority(),
  };
  const runtimeBatchSha256 = hashObject(batch);
  return Object.freeze({ ...batch, runtimeBatchSha256, runId: runtimeBatchSha256.slice(0, 20) });
}

export function validateMobileIdentityProviderRuntimeBatch(record) {
  if (!isObject(record) || !isObject(record.value)) fail('mobile identity runtime batch record is invalid');
  const batch = record.value;
  if (batch.schema !== MOBILE_IDENTITY_RUNTIME_BATCH_SCHEMA || batch.status !== 'ready') fail('unexpected mobile identity runtime batch');
  const runtimeBatchSha256 = verifySelfHash(batch, 'runtimeBatchSha256', 'mobile identity runtime batch');
  exactAuthority(batch.authority, falseAuthority(), 'mobile identity runtime batch');
  const workOrderId = safeId(batch.workOrderId, 'workOrderId');
  const providerRequestId = safeId(batch.providerRequestId, 'providerRequestId');
  if (!isObject(batch.contract) || !isObject(batch.contract.request) || !isObject(batch.contract.runtimeJob)) fail('mobile identity runtime contract is invalid');
  const canonicalContract = compileProviderCandidateRuntimeContract(batch.contract.request);
  if (canonical(batch.contract) !== canonical(canonicalContract)) fail('mobile identity runtime contract is not canonical');
  if (hashObject(batch.contract) !== batch.contractSha256 || hashObject(batch.contract.runtimeJob) !== batch.runtimeJobSha256) fail('mobile identity runtime contract hash mismatch');
  if (providerRequestSha256(batch.contract.request) !== batch.providerRequestSha256 || batch.contract.request.requestId !== providerRequestId) fail('mobile identity provider request identity mismatch');
  if (!isObject(batch.sourceProviderRequest)) fail('sourceProviderRequest binding is invalid');
  return Object.freeze({ value: batch, runtimeBatchSha256, runId: batch.runId, workOrderId, providerRequestId, contract: batch.contract });
}

export function compileMobileIdentityRuntimeSelection(batchRecord, options) {
  const batch = validateMobileIdentityProviderRuntimeBatch(batchRecord);
  const selectedAt = timestamp(options?.selectedAt, 'selectedAt');
  const selectedBy = boundedText(options?.selectedBy, 'selectedBy', 1, 256);
  const reason = boundedText(options?.reason, 'reason', 1, 4096);
  const workOrderId = safeId(options?.workOrderId, 'workOrderId');
  if (workOrderId !== batch.workOrderId) fail('selected mobile identity work order is not ready in the supplied batch');
  const selection = {
    schema: MOBILE_IDENTITY_SELECTION_SCHEMA,
    status: 'selected',
    selectedAt,
    selectedBy,
    reason,
    workOrderId,
    providerRequestId: batch.providerRequestId,
    contractSha256: batch.value.contractSha256,
    runtimeJobSha256: batch.value.runtimeJobSha256,
    sourceRuntimeBatch: sourceRecord(batchRecord, batch.runtimeBatchSha256, batch.runId),
    intent: { durableRuntimeAdmission: true },
    authority: falseAuthority(),
  };
  const selectionSha256 = hashObject(selection);
  return Object.freeze({ ...selection, selectionSha256, runId: selectionSha256.slice(0, 20) });
}

export function validateMobileIdentityRuntimeSelection(selectionRecord, batchRecord) {
  const batch = validateMobileIdentityProviderRuntimeBatch(batchRecord);
  const value = selectionRecord?.value;
  if (!isObject(value) || value.schema !== MOBILE_IDENTITY_SELECTION_SCHEMA || value.status !== 'selected') fail('unexpected mobile identity runtime selection');
  const selectionSha256 = verifySelfHash(value, 'selectionSha256', 'mobile identity runtime selection');
  exactAuthority(value.authority, falseAuthority(), 'mobile identity runtime selection');
  if (value.workOrderId !== batch.workOrderId || value.providerRequestId !== batch.providerRequestId || value.contractSha256 !== batch.value.contractSha256 || value.runtimeJobSha256 !== batch.value.runtimeJobSha256) fail('mobile identity selection does not bind the exact runtime batch job');
  const expectedSource = sourceRecord(batchRecord, batch.runtimeBatchSha256, batch.runId);
  if (canonical(value.sourceRuntimeBatch) !== canonical(expectedSource)) fail('mobile identity selection source binding mismatch');
  if (!isObject(value.intent) || value.intent.durableRuntimeAdmission !== true || Object.keys(value.intent).length !== 1) fail('mobile identity selection intent is invalid');
  return Object.freeze({ value, selectionSha256, runId: value.runId, selectedAt: timestamp(value.selectedAt, 'selectedAt'), batch });
}

export async function admitMobileIdentityRuntime(batchRecord, selectionRecord, options) {
  const selection = validateMobileIdentityRuntimeSelection(selectionRecord, batchRecord);
  const actor = boundedText(options?.actor, 'actor', 1, 256);
  const admittedAt = timestamp(options?.admittedAt, 'admittedAt');
  if (Date.parse(admittedAt) < Date.parse(selection.selectedAt)) fail('admittedAt may not precede selectedAt');
  const runtimeRoot = await directory(options?.runtimeRoot, 'runtimeRoot', true);
  const source = selection.batch.contract.runtimeJob;
  const runtimeJob = Object.freeze({
    ...source,
    queue: executionQueue(selection.runId),
    idempotencyKey: `mobile-identity:${selection.runId}:${selection.batch.providerRequestId}`,
    requiredCapabilities: Object.freeze([...new Set([...(source.requiredCapabilities ?? []), MOBILE_IDENTITY_EXECUTION_CAPABILITY])].sort()),
    maximumAttempts: 1,
    labels: Object.freeze({
      ...(source.labels ?? {}),
      mobileIdentityAdmissionMode: 'explicit-execution-authorization',
      mobileIdentitySelectionRunId: selection.runId,
      mobileIdentitySelectionSha256: selection.selectionSha256,
      mobileIdentityWorkOrderId: selection.batch.workOrderId,
      mobileIdentityCanonicalRuntimeJobSha256: selection.batch.value.runtimeJobSha256,
    }),
  });
  const normalized = normalizeRuntimeJobSubmission(runtimeJob);
  const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
  const records = await runtime.submitBatch([runtimeJob], actor, new Date(admittedAt));
  if (!Array.isArray(records) || records.length !== 1) fail('mobile identity runtime admission returned an unexpected job count');
  const record = records[0];
  if (record.id !== normalized.spec.id || record.specHash !== normalized.specHash || canonical(record.spec) !== canonical(normalized.spec)) fail('mobile identity admitted runtime job differs from its exact normalized job');
  const receipt = {
    schema: MOBILE_IDENTITY_ADMISSION_SCHEMA,
    status: 'admitted',
    runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
    admittedAt,
    actor,
    runtimeRoot,
    runtimeRootSha256: sha256(Buffer.from(runtimeRoot, 'utf8')),
    sourceRuntimeBatch: sourceRecord(batchRecord, selection.batch.runtimeBatchSha256, selection.batch.runId),
    sourceSelection: sourceRecord(selectionRecord, selection.selectionSha256, selection.runId),
    job: {
      workOrderId: selection.batch.workOrderId,
      providerRequestId: selection.batch.providerRequestId,
      requestSha256: selection.batch.value.providerRequestSha256,
      contractSha256: selection.batch.value.contractSha256,
      canonicalRuntimeJobSha256: selection.batch.value.runtimeJobSha256,
      admittedRuntimeJobSha256: hashObject(runtimeJob),
      jobId: record.id,
      specSha256: record.specHash,
      executionQueue: record.spec.queue,
      maximumAttempts: 1,
    },
    executionIsolation: {
      mode: 'explicit-authorization-required',
      queue: executionQueue(selection.runId),
      requiredCapability: MOBILE_IDENTITY_EXECUTION_CAPABILITY,
      maximumAttempts: 1,
      genericProviderWorkerMayClaim: false,
    },
    authority: admissionAuthority(),
  };
  const admissionSha256 = hashObject(receipt);
  return Object.freeze({ ...receipt, admissionSha256, runId: admissionSha256.slice(0, 20) });
}

export function validateMobileIdentityAdmission(receiptRecord, batchRecord, selectionRecord, expectedRuntimeRoot) {
  const selection = validateMobileIdentityRuntimeSelection(selectionRecord, batchRecord);
  const value = receiptRecord?.value;
  if (!isObject(value) || value.schema !== MOBILE_IDENTITY_ADMISSION_SCHEMA || value.status !== 'admitted') fail('unexpected mobile identity runtime admission receipt');
  const admissionSha256 = verifySelfHash(value, 'admissionSha256', 'mobile identity runtime admission receipt');
  exactAuthority(value.authority, admissionAuthority(), 'mobile identity runtime admission receipt');
  const runtimeRoot = absolute(value.runtimeRoot, 'runtimeRoot');
  if (expectedRuntimeRoot && runtimeRoot !== absolute(expectedRuntimeRoot, 'expectedRuntimeRoot')) fail('mobile identity admission is bound to another runtime root');
  if (value.runtimeRootSha256 !== sha256(Buffer.from(runtimeRoot, 'utf8'))) fail('mobile identity runtime root hash mismatch');
  if (canonical(value.sourceRuntimeBatch) !== canonical(sourceRecord(batchRecord, selection.batch.runtimeBatchSha256, selection.batch.runId)) || canonical(value.sourceSelection) !== canonical(sourceRecord(selectionRecord, selection.selectionSha256, selection.runId))) fail('mobile identity admission source binding mismatch');
  if (!isObject(value.job) || value.job.workOrderId !== selection.batch.workOrderId || value.job.providerRequestId !== selection.batch.providerRequestId || value.job.contractSha256 !== selection.batch.value.contractSha256) fail('mobile identity admission job binding mismatch');
  return Object.freeze({ value, admissionSha256, runId: value.runId, runtimeRoot, selection, job: value.job });
}

export async function compileMobileIdentityAuthorization(batchRecord, selectionRecord, admissionRecord, options) {
  const runtimeRoot = await directory(options?.runtimeRoot, 'runtimeRoot');
  const artifactRoot = await directory(options?.artifactRoot, 'artifactRoot', true);
  if (runtimeRoot === artifactRoot) fail('runtimeRoot and artifactRoot must be separate directories');
  const admission = validateMobileIdentityAdmission(admissionRecord, batchRecord, selectionRecord, runtimeRoot);
  const authorizedAt = timestamp(options?.authorizedAt, 'authorizedAt');
  const expiresAt = timestamp(options?.expiresAt, 'expiresAt');
  if (Date.parse(expiresAt) <= Date.parse(authorizedAt) || Date.parse(expiresAt) - Date.parse(authorizedAt) > MAX_AUTH_MS) fail('mobile identity provider authorization must expire within 24 hours');
  const authorizedBy = boundedText(options?.authorizedBy, 'authorizedBy', 1, 256);
  const reason = boundedText(options?.reason, 'reason', 1, 4096);
  const allowedAdapterIds = exactAdapters(options?.allowedAdapterIds);
  const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
  const record = await runtime.get(admission.job.jobId);
  if (!record || record.state !== 'queued' || record.specHash !== admission.job.specSha256 || record.attempts.length !== 0 || record.redriveCount !== 0 || record.spec.maximumAttempts !== 1 || !record.spec.requiredCapabilities.includes(MOBILE_IDENTITY_EXECUTION_CAPABILITY)) fail('mobile identity runtime job is not an exact unstarted isolated admission');
  const authorization = {
    schema: MOBILE_IDENTITY_AUTHORIZATION_SCHEMA,
    status: 'authorized',
    runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
    authorizedAt,
    expiresAt,
    authorizedBy,
    reason,
    allowedAdapterIds,
    runtimeRoot,
    artifactRoot,
    sourceRuntimeBatch: sourceRecord(batchRecord, admission.selection.batch.runtimeBatchSha256, admission.selection.batch.runId),
    sourceSelection: sourceRecord(selectionRecord, admission.selection.selectionSha256, admission.selection.runId),
    sourceAdmission: sourceRecord(admissionRecord, admission.admissionSha256, admission.runId),
    job: {
      ...admission.job,
      kind: record.spec.kind,
      queue: record.spec.queue,
      maximumAttempts: 1,
    },
    execution: {
      requiredCapability: MOBILE_IDENTITY_EXECUTION_CAPABILITY,
      queues: [record.spec.queue],
      maximumAttempts: 1,
      automaticRetry: false,
      genericProviderWorkerMayClaim: false,
    },
    authority: authorizationAuthority(),
  };
  const authorizationSha256 = hashObject(authorization);
  return Object.freeze({ ...authorization, authorizationSha256, runId: authorizationSha256.slice(0, 20) });
}

export function validateMobileIdentityAuthorization(record, batchRecord, selectionRecord, admissionRecord) {
  const admission = validateMobileIdentityAdmission(admissionRecord, batchRecord, selectionRecord);
  const value = record?.value;
  if (!isObject(value) || value.schema !== MOBILE_IDENTITY_AUTHORIZATION_SCHEMA || value.status !== 'authorized') fail('unexpected mobile identity provider authorization');
  const authorizationSha256 = verifySelfHash(value, 'authorizationSha256', 'mobile identity provider authorization');
  exactAuthority(value.authority, authorizationAuthority(), 'mobile identity provider authorization');
  const authorizedAt = timestamp(value.authorizedAt, 'authorizedAt');
  const expiresAt = timestamp(value.expiresAt, 'expiresAt');
  if (Date.parse(expiresAt) <= Date.parse(authorizedAt) || Date.parse(expiresAt) - Date.parse(authorizedAt) > MAX_AUTH_MS) fail('mobile identity provider authorization duration is invalid');
  const allowedAdapterIds = exactAdapters(value.allowedAdapterIds);
  const runtimeRoot = absolute(value.runtimeRoot, 'runtimeRoot');
  const artifactRoot = absolute(value.artifactRoot, 'artifactRoot');
  if (runtimeRoot !== admission.runtimeRoot || runtimeRoot === artifactRoot) fail('mobile identity authorization storage binding is invalid');
  if (canonical(value.sourceRuntimeBatch) !== canonical(sourceRecord(batchRecord, admission.selection.batch.runtimeBatchSha256, admission.selection.batch.runId)) || canonical(value.sourceSelection) !== canonical(sourceRecord(selectionRecord, admission.selection.selectionSha256, admission.selection.runId)) || canonical(value.sourceAdmission) !== canonical(sourceRecord(admissionRecord, admission.admissionSha256, admission.runId))) fail('mobile identity authorization source binding mismatch');
  if (!isObject(value.job) || value.job.jobId !== admission.job.jobId || value.job.specSha256 !== admission.job.specSha256 || value.job.requestSha256 !== admission.job.requestSha256) fail('mobile identity authorization job binding mismatch');
  return Object.freeze({ value, authorizationSha256, runId: value.runId, authorizedAt, expiresAt, allowedAdapterIds, runtimeRoot, artifactRoot, admission, job: value.job });
}

function active(authorization, now = new Date()) {
  const milliseconds = now.getTime();
  if (milliseconds < Date.parse(authorization.authorizedAt) || milliseconds >= Date.parse(authorization.expiresAt)) fail('mobile identity provider execution authorization is not active');
}

export async function executeMobileIdentityAuthorization(authRecord, batchRecord, selectionRecord, admissionRecord, options, environment = process.env) {
  const authorization = validateMobileIdentityAuthorization(authRecord, batchRecord, selectionRecord, admissionRecord);
  active(authorization);
  const runtimeRoot = await directory(authorization.runtimeRoot, 'runtimeRoot');
  const artifactRoot = await directory(authorization.artifactRoot, 'artifactRoot');
  const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
  const artifacts = new LocalArtifactStore({ root: artifactRoot });
  const before = await runtime.get(authorization.job.jobId);
  if (!before || before.state !== 'queued' || before.specHash !== authorization.job.specSha256) fail('authorized mobile identity runtime job is no longer an exact queued admission');

  const baseRegistry = createProviderRegistryFromEnvironment(environment);
  const providerRegistry = restrictProviderRegistry(baseRegistry, authorization.allowedAdapterIds);
  const request = validateProviderCandidateRequest(before.spec.payload);
  const routing = compileProviderExecutionRoutingPlan(request, providerRegistry.rank(request));
  if (!routing.eligibleAdapters.length) fail('authorized mobile identity job has no eligible allowed provider adapter');
  const expectedRequestSha = authorization.job.requestSha256;
  if (providerRequestSha256(request) !== expectedRequestSha) fail('authorized mobile identity provider request identity drifted');

  const rawHandlers = createProviderHandlers(providerRegistry);
  const handlers = Object.fromEntries(Object.entries(rawHandlers).map(([kind, handler]) => [kind, async (context) => {
    active(authorization);
    if (context.job.id !== authorization.job.jobId || context.job.specHash !== authorization.job.specSha256 || providerRequestSha256(validateProviderCandidateRequest(context.job.spec.payload)) !== expectedRequestSha || !context.job.spec.requiredCapabilities.includes(MOBILE_IDENTITY_EXECUTION_CAPABILITY)) fail('mobile identity worker attempted to claim a job outside its exact authorization');
    return handler(context);
  }]));
  const workerId = safeId(options?.workerId ?? `mobile-identity:${authorization.runId}`, 'workerId');
  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: workerId,
      capabilities: Object.freeze([...new Set([...providerWorkerCapabilities(providerRegistry), MOBILE_IDENTITY_EXECUTION_CAPABILITY])].sort()),
      capabilityProfiles: providerWorkerCapabilityProfiles(providerRegistry),
      queues: Object.freeze([authorization.job.queue]),
    },
    handlers,
    concurrency: 1,
  });
  const runResult = await worker.runUntilIdle();
  const completed = await runtime.get(authorization.job.jobId);
  if (!completed || completed.specHash !== authorization.job.specSha256 || !['succeeded', 'failed'].includes(completed.state)) fail('mobile identity runtime completion record is invalid');
  const outputArtifacts = [];
  for (const artifactId of completed.outputArtifacts) {
    const verification = await artifacts.verify(artifactId);
    if (!verification.descriptorValid || !verification.contentValid) fail(`mobile identity output artifact failed immutable verification: ${artifactId}`);
    const descriptor = await artifacts.get(artifactId);
    if (!descriptor) fail(`mobile identity output artifact is missing: ${artifactId}`);
    if (descriptor.labels.artifactRole === 'provider-candidate' && (descriptor.storageClass !== 'intermediate' || descriptor.labels.approvalState !== 'unapproved' || descriptor.metadata.finalDeliverable !== false)) fail(`mobile identity provider candidate crossed its unapproved boundary: ${artifactId}`);
    outputArtifacts.push({ artifactId, contentHash: descriptor.contentHash, mediaType: descriptor.mediaType, storageClass: descriptor.storageClass, artifactRole: descriptor.labels.artifactRole ?? null, approvalState: descriptor.labels.approvalState ?? null });
  }
  const receipt = {
    schema: MOBILE_IDENTITY_EXECUTION_RECEIPT_SCHEMA,
    status: completed.state,
    completedAt: new Date().toISOString(),
    workerId,
    sourceAuthorization: sourceRecord(authRecord, authorization.authorizationSha256, authorization.runId),
    providerAdapters: providerRegistry.list().map((entry) => ({ id: entry.id, version: entry.version, models: entry.models, capabilities: entry.capabilities })),
    runResult,
    job: {
      workOrderId: authorization.job.workOrderId,
      providerRequestId: authorization.job.providerRequestId,
      requestSha256: authorization.job.requestSha256,
      jobId: authorization.job.jobId,
      specSha256: authorization.job.specSha256,
      state: completed.state,
      attempts: completed.attempts.length,
      outputArtifacts,
      ...(completed.failure ? { failure: completed.failure } : {}),
    },
    authority: authorizationAuthority(),
    nextActions: [
      'Inspect immutable provider evidence and keep every raster candidate unapproved.',
      'Run mobile identity raster review/approval before any Vector Studio derivative work.',
      'Keep target-repository mutation and publication in their separate governed lanes.',
    ],
  };
  const executionSha256 = hashObject(receipt);
  return Object.freeze({ ...receipt, executionSha256, runId: executionSha256.slice(0, 20) });
}

function parse(argv) {
  const command = argv[0];
  if (!command) fail('command is required');
  const values = new Map();
  for (let index = 1; index < argv.length; index += 2) {
    const name = argv[index]; const value = argv[index + 1];
    if (!name?.startsWith('--') || !value || value.startsWith('--') || values.has(name)) fail('arguments must be unique --name value pairs');
    values.set(name, value);
  }
  return { command, values };
}
function required(values, name) { const value = values.get(name); if (!value) fail(`missing ${name}`); return value; }
function list(value) { return value.split(',').map((entry) => entry.trim()).filter(Boolean); }

export async function runMobileIdentityProviderRuntimeCli(argv = process.argv.slice(2), environment = process.env) {
  const { command, values } = parse(argv);
  if (command === 'prepare') {
    const providerRequest = await readJsonRecord(required(values, '--provider-request'), 'mobile identity provider request');
    const result = compileMobileIdentityProviderRuntimeBatch(providerRequest, { workOrderId: required(values, '--work-order') });
    await writeCreateOnly(required(values, '--output'), result);
    return { status: result.status, runId: result.runId, runtimeBatchSha256: result.runtimeBatchSha256 };
  }
  const batch = await readJsonRecord(required(values, '--runtime-batch'), 'mobile identity provider runtime batch');
  if (command === 'select') {
    const result = compileMobileIdentityRuntimeSelection(batch, { workOrderId: required(values, '--work-order'), selectedAt: required(values, '--selected-at'), selectedBy: required(values, '--selected-by'), reason: required(values, '--reason') });
    await writeCreateOnly(required(values, '--output'), result);
    return { status: result.status, runId: result.runId, selectionSha256: result.selectionSha256 };
  }
  const selection = await readJsonRecord(required(values, '--selection'), 'mobile identity provider runtime selection');
  if (command === 'admit') {
    const result = await admitMobileIdentityRuntime(batch, selection, { runtimeRoot: required(values, '--runtime-root'), actor: required(values, '--actor'), admittedAt: required(values, '--admitted-at') });
    await writeCreateOnly(required(values, '--receipt'), result);
    return { status: result.status, runId: result.runId, admissionSha256: result.admissionSha256 };
  }
  const admission = await readJsonRecord(required(values, '--admission'), 'mobile identity provider runtime admission');
  if (command === 'authorize') {
    const result = await compileMobileIdentityAuthorization(batch, selection, admission, { runtimeRoot: required(values, '--runtime-root'), artifactRoot: required(values, '--artifact-root'), authorizedAt: required(values, '--authorized-at'), expiresAt: required(values, '--expires-at'), authorizedBy: required(values, '--authorized-by'), reason: required(values, '--reason'), allowedAdapterIds: list(required(values, '--allowed-adapters')) });
    await writeCreateOnly(required(values, '--output'), result);
    return { status: result.status, runId: result.runId, authorizationSha256: result.authorizationSha256 };
  }
  if (command === 'execute') {
    const authorization = await readJsonRecord(required(values, '--authorization'), 'mobile identity provider runtime authorization');
    const result = await executeMobileIdentityAuthorization(authorization, batch, selection, admission, { workerId: values.get('--worker-id') ?? 'mobile-identity-worker' }, environment);
    await writeCreateOnly(required(values, '--receipt'), result);
    if (result.status !== 'succeeded') fail('mobile identity provider runtime job failed');
    return { status: result.status, runId: result.runId, executionSha256: result.executionSha256 };
  }
  fail('command must be prepare, select, admit, authorize or execute');
}

const directlyInvoked = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (directlyInvoked) {
  runMobileIdentityProviderRuntimeCli()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => { process.stderr.write(`${JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : String(error) })}\n`); process.exitCode = 2; });
}
