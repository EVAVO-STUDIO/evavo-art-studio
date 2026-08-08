import path from 'node:path';
import { lstat, mkdir } from 'node:fs/promises';

import {
  LocalRuntimeRepository,
  RUNTIME_PROTOCOL_VERSION,
  normalizeRuntimeJobSubmission,
} from '../../packages/runtime/dist/index.js';
import { compileProviderCandidateRuntimeContract } from '../../packages/providers/dist/index.js';

import { RAW_ART_PROVIDER_RUNTIME_BATCH_SCHEMA } from './runtime.mjs';
import {
  HEX24,
  HEX40,
  HEX64,
  assertFalseAuthority,
  boundedText,
  canonical,
  canonicalRelative,
  fail,
  hashObject,
  isObject,
  safeId,
  sha256,
  sourceIdentity,
  verifySelfHash,
} from './shared.mjs';

export const RAW_ART_PROVIDER_RUNTIME_ADMISSION_SELECTION_SCHEMA =
  'evavo.raw-art-provider-runtime-admission-selection.v1';
export const RAW_ART_PROVIDER_RUNTIME_ADMISSION_RECEIPT_SCHEMA =
  'evavo.raw-art-provider-runtime-admission-receipt.v1';

const RUNTIME_BATCH_STATUSES = new Set([
  'ready',
  'partially-ready',
  'blocked',
  'idle',
]);
const MAXIMUM_RUNTIME_JOBS = 100;
const MAXIMUM_REPORTED_PROBLEMS = 10_000;

function requiredHex(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    fail(`${label} is invalid`);
  }
  return value;
}

function nonNegativeCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function boundedArray(value, label, maximum) {
  if (!Array.isArray(value) || value.length > maximum) {
    fail(`${label} must contain at most ${maximum} entries`);
  }
  return value;
}

function canonicalTimestamp(value, label) {
  const timestamp = boundedText(value, label, 20, 40);
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== timestamp) {
    fail(`${label} must be a canonical UTC timestamp`);
  }
  return timestamp;
}

function runtimeBatchCounts(batch, jobs, providerBlocked, upstreamBlocked, upstreamDeferred) {
  if (!isObject(batch.counts)) {
    fail('RAW_ART provider runtime batch counts must be an object');
  }
  const counts = Object.freeze({
    providerRequiredTotal: nonNegativeCount(
      batch.counts.providerRequiredTotal,
      'counts.providerRequiredTotal',
    ),
    campaignNextBatchEligible: nonNegativeCount(
      batch.counts.campaignNextBatchEligible,
      'counts.campaignNextBatchEligible',
    ),
    requestInputs: nonNegativeCount(
      batch.counts.requestInputs,
      'counts.requestInputs',
    ),
    readyRuntimeJobs: nonNegativeCount(
      batch.counts.readyRuntimeJobs,
      'counts.readyRuntimeJobs',
    ),
    providerContractBlocked: nonNegativeCount(
      batch.counts.providerContractBlocked,
      'counts.providerContractBlocked',
    ),
    upstreamBlocked: nonNegativeCount(
      batch.counts.upstreamBlocked,
      'counts.upstreamBlocked',
    ),
    upstreamDeferred: nonNegativeCount(
      batch.counts.upstreamDeferred,
      'counts.upstreamDeferred',
    ),
    outsideCampaignNextBatch: nonNegativeCount(
      batch.counts.outsideCampaignNextBatch,
      'counts.outsideCampaignNextBatch',
    ),
    campaignOrBatchDeferred: nonNegativeCount(
      batch.counts.campaignOrBatchDeferred,
      'counts.campaignOrBatchDeferred',
    ),
  });

  if (
    counts.readyRuntimeJobs !== jobs.length ||
    counts.providerContractBlocked !== providerBlocked.length ||
    counts.upstreamBlocked !== upstreamBlocked.length ||
    counts.upstreamDeferred !== upstreamDeferred.length ||
    counts.requestInputs !== jobs.length + providerBlocked.length ||
    counts.providerRequiredTotal !==
      counts.requestInputs + upstreamBlocked.length + upstreamDeferred.length ||
    counts.campaignNextBatchEligible < counts.requestInputs ||
    counts.campaignNextBatchEligible > counts.providerRequiredTotal ||
    counts.outsideCampaignNextBatch > counts.upstreamDeferred ||
    counts.campaignOrBatchDeferred !==
      counts.upstreamDeferred - counts.outsideCampaignNextBatch
  ) {
    fail('RAW_ART provider runtime batch count reconciliation failed');
  }

  const currentProblems =
    providerBlocked.length +
    upstreamBlocked.length +
    counts.campaignOrBatchDeferred;
  if (
    (batch.status === 'ready' &&
      (jobs.length === 0 || currentProblems !== 0)) ||
    (batch.status === 'partially-ready' &&
      (jobs.length === 0 || currentProblems === 0)) ||
    (batch.status === 'blocked' &&
      (jobs.length !== 0 || currentProblems === 0)) ||
    (batch.status === 'idle' &&
      (jobs.length !== 0 || currentProblems !== 0))
  ) {
    fail('RAW_ART provider runtime batch status reconciliation failed');
  }

  return counts;
}

function assertRuntimeJobMetadata(entry, batch, request) {
  if (!isObject(request.metadata)) {
    fail(`runtime job ${entry.workOrderId} lacks governed request metadata`);
  }
  const expected = {
    gameHead: batch.gameHead,
    queueSha256: batch.queueSha256,
    campaignSha256: batch.campaignSha256,
    campaignRunId: batch.campaignRunId,
    campaignItemId: entry.campaignItemId,
    technicalAdmissionSha256: batch.technicalAdmissionSha256,
    styleBankSha256: batch.styleBankSha256,
    bindingsSha256: batch.bindingsSha256,
    sourcePath: entry.sourcePath,
    sourceSha256: entry.sourceSha256,
    targetPath: entry.targetPath,
    semanticRole: entry.semanticRole,
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (request.metadata[key] !== expectedValue) {
      fail(
        `runtime job ${entry.workOrderId} metadata.${key} does not match its runtime batch binding`,
      );
    }
  }
}

function validateRuntimeBatchJob(value, index, batch, campaignItemIds) {
  if (!isObject(value)) {
    fail(`jobs[${index}] must be an object`);
  }
  const entry = Object.freeze({
    value,
    workOrderId: safeId(value.workOrderId, `jobs[${index}].workOrderId`),
    campaignItemId: requiredHex(
      value.campaignItemId,
      HEX24,
      `jobs[${index}].campaignItemId`,
    ),
    sourcePath: canonicalRelative(
      value.sourcePath,
      `jobs[${index}].sourcePath`,
    ),
    sourceSha256: requiredHex(
      value.sourceSha256,
      HEX64,
      `jobs[${index}].sourceSha256`,
    ),
    semanticRole: safeId(
      value.semanticRole,
      `jobs[${index}].semanticRole`,
    ),
    targetPath: canonicalRelative(
      value.targetPath,
      `jobs[${index}].targetPath`,
    ),
    operation: safeId(value.operation, `jobs[${index}].operation`),
    contractSha256: requiredHex(
      value.contractSha256,
      HEX64,
      `jobs[${index}].contractSha256`,
    ),
    runtimeJobSha256: requiredHex(
      value.runtimeJobSha256,
      HEX64,
      `jobs[${index}].runtimeJobSha256`,
    ),
  });
  if (!campaignItemIds.has(entry.campaignItemId)) {
    fail(`jobs[${index}] is outside campaignNextBatchItemIds`);
  }
  if (!isObject(value.contract) || !isObject(value.contract.request)) {
    fail(`jobs[${index}].contract is invalid`);
  }

  const canonicalContract = compileProviderCandidateRuntimeContract(
    value.contract.request,
  );
  if (canonical(value.contract) !== canonical(canonicalContract)) {
    fail(`jobs[${index}].contract is not the canonical provider runtime contract`);
  }
  if (hashObject(value.contract) !== entry.contractSha256) {
    fail(`jobs[${index}].contractSha256 mismatch`);
  }
  if (hashObject(value.contract.runtimeJob) !== entry.runtimeJobSha256) {
    fail(`jobs[${index}].runtimeJobSha256 mismatch`);
  }
  if (value.contract.request.operation !== entry.operation) {
    fail(`jobs[${index}] operation does not match its provider request`);
  }
  assertRuntimeJobMetadata(entry, batch, value.contract.request);

  return Object.freeze({
    ...entry,
    contract: value.contract,
    providerRequestId: safeId(
      value.contract.request.requestId,
      `jobs[${index}].contract.request.requestId`,
    ),
    runtimeJob: value.contract.runtimeJob,
  });
}

export function validateRawArtProviderRuntimeBatch(record) {
  if (!isObject(record) || !isObject(record.value)) {
    fail('RAW_ART provider runtime batch record is invalid');
  }
  const batch = record.value;
  if (
    batch.schema !== RAW_ART_PROVIDER_RUNTIME_BATCH_SCHEMA ||
    !RUNTIME_BATCH_STATUSES.has(batch.status)
  ) {
    fail('unexpected RAW_ART provider runtime batch v1');
  }

  const runtimeBatchSha256 = verifySelfHash(
    batch,
    'runtimeBatchSha256',
    'RAW_ART provider runtime batch',
  );
  assertFalseAuthority(batch.authority, 'RAW_ART provider runtime batch');

  const gameHead = requiredHex(batch.gameHead, HEX40, 'gameHead');
  const queueSha256 = requiredHex(batch.queueSha256, HEX64, 'queueSha256');
  const campaignSha256 = requiredHex(
    batch.campaignSha256,
    HEX64,
    'campaignSha256',
  );
  if (batch.campaignRunId !== campaignSha256.slice(0, 20)) {
    fail('campaignRunId does not match campaignSha256');
  }
  const technicalAdmissionSha256 = requiredHex(
    batch.technicalAdmissionSha256,
    HEX64,
    'technicalAdmissionSha256',
  );
  const styleBankSha256 = requiredHex(
    batch.styleBankSha256,
    HEX64,
    'styleBankSha256',
  );
  const bindingsSha256 = requiredHex(
    batch.bindingsSha256,
    HEX64,
    'bindingsSha256',
  );
  const providerProtocolVersion = boundedText(
    batch.providerProtocolVersion,
    'providerProtocolVersion',
    1,
    128,
  );

  if (!isObject(batch.sourceRequestBatch)) {
    fail('RAW_ART provider runtime batch sourceRequestBatch is invalid');
  }
  const sourceRequestBatch = Object.freeze({
    path: boundedText(
      batch.sourceRequestBatch.path,
      'sourceRequestBatch.path',
      1,
      32_768,
    ),
    fileSha256: requiredHex(
      batch.sourceRequestBatch.fileSha256,
      HEX64,
      'sourceRequestBatch.fileSha256',
    ),
    documentSha256: requiredHex(
      batch.sourceRequestBatch.documentSha256,
      HEX64,
      'sourceRequestBatch.documentSha256',
    ),
    runId: requiredHex(
      batch.sourceRequestBatch.runId,
      /^[0-9a-f]{20}$/u,
      'sourceRequestBatch.runId',
    ),
  });

  const campaignItemValues = boundedArray(
    batch.campaignNextBatchItemIds,
    'campaignNextBatchItemIds',
    500,
  );
  const campaignNextBatchItemIds = [];
  const campaignItemIds = new Set();
  for (const [index, value] of campaignItemValues.entries()) {
    const itemId = requiredHex(
      value,
      HEX24,
      `campaignNextBatchItemIds[${index}]`,
    );
    if (campaignItemIds.has(itemId)) {
      fail(`campaignNextBatchItemIds duplicates ${itemId}`);
    }
    campaignItemIds.add(itemId);
    campaignNextBatchItemIds.push(itemId);
  }

  const jobValues = boundedArray(batch.jobs, 'jobs', MAXIMUM_RUNTIME_JOBS);
  const jobs = jobValues.map((entry, index) =>
    validateRuntimeBatchJob(entry, index, batch, campaignItemIds),
  );
  const providerContractBlocked = boundedArray(
    batch.providerContractBlocked,
    'providerContractBlocked',
    MAXIMUM_REPORTED_PROBLEMS,
  );
  const upstreamBlocked = boundedArray(
    batch.upstreamBlocked,
    'upstreamBlocked',
    MAXIMUM_REPORTED_PROBLEMS,
  );
  const upstreamDeferred = boundedArray(
    batch.upstreamDeferred,
    'upstreamDeferred',
    MAXIMUM_REPORTED_PROBLEMS,
  );
  const counts = runtimeBatchCounts(
    batch,
    jobs,
    providerContractBlocked,
    upstreamBlocked,
    upstreamDeferred,
  );

  const byWorkOrderId = new Map();
  const seenCampaignItems = new Set();
  const seenSources = new Set();
  const seenTargets = new Set();
  const seenProviderRequests = new Set();
  const seenRuntimeIdempotency = new Set();
  for (const entry of jobs) {
    const sourceKey = sourceIdentity(entry.sourcePath, entry.sourceSha256);
    const targetKey = entry.targetPath.toLowerCase();
    const idempotencyKey = `${entry.runtimeJob.queue}\0${entry.runtimeJob.idempotencyKey}`;
    if (byWorkOrderId.has(entry.workOrderId)) {
      fail(`RAW_ART provider runtime batch duplicates ${entry.workOrderId}`);
    }
    if (seenCampaignItems.has(entry.campaignItemId)) {
      fail(`RAW_ART provider runtime batch duplicates campaign item ${entry.campaignItemId}`);
    }
    if (seenSources.has(sourceKey)) {
      fail(`RAW_ART provider runtime batch duplicates source ${entry.sourcePath}`);
    }
    if (seenTargets.has(targetKey)) {
      fail(`RAW_ART provider runtime batch duplicates target ${entry.targetPath}`);
    }
    if (seenProviderRequests.has(entry.providerRequestId)) {
      fail(`RAW_ART provider runtime batch duplicates provider request ${entry.providerRequestId}`);
    }
    if (seenRuntimeIdempotency.has(idempotencyKey)) {
      fail(
        `RAW_ART provider runtime batch duplicates runtime idempotency ${entry.runtimeJob.idempotencyKey}`,
      );
    }
    byWorkOrderId.set(entry.workOrderId, entry);
    seenCampaignItems.add(entry.campaignItemId);
    seenSources.add(sourceKey);
    seenTargets.add(targetKey);
    seenProviderRequests.add(entry.providerRequestId);
    seenRuntimeIdempotency.add(idempotencyKey);
  }

  return Object.freeze({
    value: batch,
    runtimeBatchSha256,
    runId: batch.runId,
    status: batch.status,
    providerProtocolVersion,
    gameHead,
    queueSha256,
    campaignSha256,
    campaignRunId: batch.campaignRunId,
    technicalAdmissionSha256,
    styleBankSha256,
    bindingsSha256,
    sourceRequestBatch,
    campaignNextBatchItemIds: Object.freeze(campaignNextBatchItemIds),
    counts,
    jobs: Object.freeze(jobs),
    byWorkOrderId,
    providerContractBlocked,
    upstreamBlocked,
    upstreamDeferred,
  });
}

function selectionAuthority() {
  return Object.freeze({
    runtimeSubmission: false,
    providerExecution: false,
    workerClaim: false,
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

function receiptAuthority() {
  return Object.freeze({
    durableRuntimeAdmission: true,
    runtimeSubmission: true,
    providerExecution: false,
    workerClaim: false,
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

function snapshotSelectionInput(options) {
  if (!isObject(options)) fail('runtime admission selection options are invalid');
  const selectedAt = canonicalTimestamp(options.selectedAt, 'selectedAt');
  const selectedBy = boundedText(options.selectedBy, 'selectedBy', 1, 256);
  const reason = boundedText(options.reason, 'reason', 1, 4_096);
  const requestedIds = boundedArray(
    options.workOrderIds,
    'workOrderIds',
    MAXIMUM_RUNTIME_JOBS,
  );
  if (requestedIds.length === 0) {
    fail('workOrderIds must select at least one ready runtime job');
  }
  const workOrderIds = [];
  const seen = new Set();
  for (const [index, value] of requestedIds.entries()) {
    const workOrderId = safeId(value, `workOrderIds[${index}]`);
    if (seen.has(workOrderId)) {
      fail(`workOrderIds duplicates ${workOrderId}`);
    }
    seen.add(workOrderId);
    workOrderIds.push(workOrderId);
  }
  return Object.freeze({
    selectedAt,
    selectedBy,
    reason,
    workOrderIds: Object.freeze(workOrderIds),
  });
}

export function compileRawArtProviderRuntimeAdmissionSelection(
  runtimeBatchRecord,
  options,
) {
  const batch = validateRawArtProviderRuntimeBatch(runtimeBatchRecord);
  const input = snapshotSelectionInput(options);
  const jobs = input.workOrderIds.map((workOrderId) => {
    const entry = batch.byWorkOrderId.get(workOrderId);
    if (!entry) {
      fail(`selected RAW_ART provider runtime work order is not ready: ${workOrderId}`);
    }
    return Object.freeze({
      workOrderId: entry.workOrderId,
      campaignItemId: entry.campaignItemId,
      providerRequestId: entry.providerRequestId,
      contractSha256: entry.contractSha256,
      runtimeJobSha256: entry.runtimeJobSha256,
    });
  });

  const selection = {
    schema: RAW_ART_PROVIDER_RUNTIME_ADMISSION_SELECTION_SCHEMA,
    status: 'selected',
    runtimeBatchSha256: batch.runtimeBatchSha256,
    runtimeBatchRunId: batch.runId,
    sourceRuntimeBatch: {
      path: runtimeBatchRecord.path,
      fileSha256: runtimeBatchRecord.fileSha256,
      documentSha256: batch.runtimeBatchSha256,
      runId: batch.runId,
    },
    selectedAt: input.selectedAt,
    selectedBy: input.selectedBy,
    reason: input.reason,
    counts: {
      selectedRuntimeJobs: jobs.length,
    },
    jobs,
    nextActions: [
      'Admit this exact selection through the explicit write-enabled RAW_ART runtime admission command.',
      'Start a compatible Art Studio worker separately only when provider execution is deliberately authorised.',
      'Review immutable provider evidence and unapproved candidates before any promotion or publication.',
    ],
    intent: {
      durableRuntimeAdmission: true,
    },
    authority: selectionAuthority(),
  };
  const selectionSha256 = hashObject(selection);
  return Object.freeze({
    ...selection,
    selectionSha256,
    runId: selectionSha256.slice(0, 20),
  });
}

export function validateRawArtProviderRuntimeAdmissionSelection(
  selectionRecord,
  runtimeBatchRecord,
) {
  const batch = validateRawArtProviderRuntimeBatch(runtimeBatchRecord);
  if (!isObject(selectionRecord) || !isObject(selectionRecord.value)) {
    fail('RAW_ART provider runtime admission selection record is invalid');
  }
  const selection = selectionRecord.value;
  if (
    selection.schema !== RAW_ART_PROVIDER_RUNTIME_ADMISSION_SELECTION_SCHEMA ||
    selection.status !== 'selected'
  ) {
    fail('unexpected RAW_ART provider runtime admission selection v1');
  }
  const selectionSha256 = verifySelfHash(
    selection,
    'selectionSha256',
    'RAW_ART provider runtime admission selection',
  );
  assertFalseAuthority(
    selection.authority,
    'RAW_ART provider runtime admission selection',
  );
  if (
    !isObject(selection.intent) ||
    Object.keys(selection.intent).length !== 1 ||
    selection.intent.durableRuntimeAdmission !== true
  ) {
    fail('runtime admission selection intent is invalid');
  }
  if (
    selection.runtimeBatchSha256 !== batch.runtimeBatchSha256 ||
    selection.runtimeBatchRunId !== batch.runId
  ) {
    fail('runtime admission selection is stale for the supplied runtime batch');
  }
  if (!isObject(selection.sourceRuntimeBatch)) {
    fail('runtime admission selection sourceRuntimeBatch is invalid');
  }
  const expectedSource = {
    path: runtimeBatchRecord.path,
    fileSha256: runtimeBatchRecord.fileSha256,
    documentSha256: batch.runtimeBatchSha256,
    runId: batch.runId,
  };
  if (canonical(selection.sourceRuntimeBatch) !== canonical(expectedSource)) {
    fail('runtime admission selection does not bind the exact runtime batch file');
  }

  const selectedAt = canonicalTimestamp(selection.selectedAt, 'selectedAt');
  const selectedBy = boundedText(selection.selectedBy, 'selectedBy', 1, 256);
  const reason = boundedText(selection.reason, 'reason', 1, 4_096);
  if (
    !isObject(selection.counts) ||
    !Number.isSafeInteger(selection.counts.selectedRuntimeJobs) ||
    selection.counts.selectedRuntimeJobs < 1 ||
    selection.counts.selectedRuntimeJobs > MAXIMUM_RUNTIME_JOBS
  ) {
    fail('runtime admission selection counts are invalid');
  }
  const jobValues = boundedArray(
    selection.jobs,
    'selection.jobs',
    MAXIMUM_RUNTIME_JOBS,
  );
  if (
    jobValues.length === 0 ||
    selection.counts.selectedRuntimeJobs !== jobValues.length
  ) {
    fail('runtime admission selection job count reconciliation failed');
  }

  const jobs = [];
  const seen = new Set();
  for (const [index, value] of jobValues.entries()) {
    if (!isObject(value)) fail(`selection.jobs[${index}] must be an object`);
    const workOrderId = safeId(
      value.workOrderId,
      `selection.jobs[${index}].workOrderId`,
    );
    if (seen.has(workOrderId)) {
      fail(`runtime admission selection duplicates ${workOrderId}`);
    }
    const entry = batch.byWorkOrderId.get(workOrderId);
    if (!entry) {
      fail(`selected runtime job is not ready in the supplied batch: ${workOrderId}`);
    }
    const expected = {
      workOrderId: entry.workOrderId,
      campaignItemId: entry.campaignItemId,
      providerRequestId: entry.providerRequestId,
      contractSha256: entry.contractSha256,
      runtimeJobSha256: entry.runtimeJobSha256,
    };
    if (canonical(value) !== canonical(expected)) {
      fail(`selection.jobs[${index}] does not bind the exact runtime job`);
    }
    seen.add(workOrderId);
    jobs.push(Object.freeze({ ...expected, batchEntry: entry }));
  }

  return Object.freeze({
    value: selection,
    selectionSha256,
    runId: selection.runId,
    selectedAt,
    selectedBy,
    reason,
    batch,
    jobs: Object.freeze(jobs),
  });
}

async function prepareRuntimeRoot(value) {
  const rootInput = boundedText(value, 'runtimeRoot', 1, 32_768);
  if (rootInput.includes('\0')) fail('runtimeRoot is invalid');
  const root = path.resolve(rootInput);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const state = await lstat(root);
  if (!state.isDirectory() || state.isSymbolicLink()) {
    fail('runtimeRoot must be a real directory, not a symbolic link');
  }
  return root;
}

function runtimeActor(value) {
  return boundedText(value, 'actor', 1, 256);
}

function verifyAdmissionRecords(records, expected) {
  if (!Array.isArray(records) || records.length !== expected.length) {
    fail('durable runtime admission returned an unexpected job count');
  }
  return records.map((record, index) => {
    const target = expected[index];
    if (
      !isObject(record) ||
      record.protocolVersion !== RUNTIME_PROTOCOL_VERSION ||
      record.id !== target.normalized.spec.id ||
      record.specHash !== target.normalized.specHash ||
      canonical(record.spec) !== canonical(target.normalized.spec)
    ) {
      fail(`durable runtime admission record ${index} does not match its exact job`);
    }
    const createdAt = canonicalTimestamp(
      record.createdAt,
      `runtime admission record ${index}.createdAt`,
    );
    return Object.freeze({
      workOrderId: target.selectionJob.workOrderId,
      campaignItemId: target.selectionJob.campaignItemId,
      providerRequestId: target.selectionJob.providerRequestId,
      contractSha256: target.selectionJob.contractSha256,
      runtimeJobSha256: target.selectionJob.runtimeJobSha256,
      jobId: record.id,
      specSha256: record.specHash,
      createdAt,
    });
  });
}

export async function admitRawArtProviderRuntimeSelection(
  runtimeBatchRecord,
  selectionRecord,
  options,
) {
  const selection = validateRawArtProviderRuntimeAdmissionSelection(
    selectionRecord,
    runtimeBatchRecord,
  );
  if (!isObject(options)) fail('runtime admission options are invalid');
  const actor = runtimeActor(options.actor);
  const admittedAt = canonicalTimestamp(options.admittedAt, 'admittedAt');
  if (Date.parse(admittedAt) < Date.parse(selection.selectedAt)) {
    fail('admittedAt may not precede selectedAt');
  }

  const expected = selection.jobs.map((selectionJob) => {
    const normalized = normalizeRuntimeJobSubmission(
      selectionJob.batchEntry.runtimeJob,
    );
    return Object.freeze({ selectionJob, normalized });
  });
  const runtimeRoot = await prepareRuntimeRoot(options.runtimeRoot);
  const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
  const records = await runtime.submitBatch(
    expected.map((entry) => entry.selectionJob.batchEntry.runtimeJob),
    actor,
    new Date(admittedAt),
  );
  const jobs = verifyAdmissionRecords(records, expected);

  const receipt = {
    schema: RAW_ART_PROVIDER_RUNTIME_ADMISSION_RECEIPT_SCHEMA,
    status: 'admitted',
    runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
    providerProtocolVersion: selection.batch.providerProtocolVersion,
    admittedAt,
    actor,
    runtimeRoot,
    runtimeRootSha256: sha256(Buffer.from(runtimeRoot, 'utf8')),
    sourceRuntimeBatch: {
      path: runtimeBatchRecord.path,
      fileSha256: runtimeBatchRecord.fileSha256,
      documentSha256: selection.batch.runtimeBatchSha256,
      runId: selection.batch.runId,
    },
    selection: {
      path: selectionRecord.path,
      fileSha256: selectionRecord.fileSha256,
      documentSha256: selection.selectionSha256,
      runId: selection.runId,
      selectedAt: selection.selectedAt,
      selectedBy: selection.selectedBy,
      reason: selection.reason,
    },
    campaign: {
      gameHead: selection.batch.gameHead,
      queueSha256: selection.batch.queueSha256,
      campaignSha256: selection.batch.campaignSha256,
      campaignRunId: selection.batch.campaignRunId,
      technicalAdmissionSha256:
        selection.batch.technicalAdmissionSha256,
      styleBankSha256: selection.batch.styleBankSha256,
      bindingsSha256: selection.batch.bindingsSha256,
    },
    counts: {
      selectedRuntimeJobs: selection.jobs.length,
      admittedRuntimeJobs: jobs.length,
    },
    jobs,
    nextActions: [
      'Keep the durable runtime repository stopped until provider execution is deliberately authorised.',
      'Start a compatible Art Studio worker separately and inspect immutable provider evidence plus unapproved candidate artifacts.',
      'Master, evaluate and independently approve candidates before any target-repository mutation, promotion or publication.',
    ],
    authority: receiptAuthority(),
  };
  const admissionSha256 = hashObject(receipt);
  return Object.freeze({
    ...receipt,
    admissionSha256,
    runId: admissionSha256.slice(0, 20),
  });
}
