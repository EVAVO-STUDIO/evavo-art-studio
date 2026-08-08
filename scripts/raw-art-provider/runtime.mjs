import {
  PROVIDER_PROTOCOL_VERSION,
  ProviderError,
  compileProviderCandidateRuntimeContract,
} from '../../packages/providers/dist/index.js';

import {
  HEX24,
  HEX40,
  HEX64,
  SCHEMAS,
  assertFalseAuthority,
  boundedText,
  canonicalRelative,
  hashObject,
  isObject,
  safeId,
  sourceIdentity,
  verifySelfHash,
} from './shared.mjs';

export const RAW_ART_PROVIDER_RUNTIME_BATCH_SCHEMA =
  'evavo.raw-art-provider-runtime-batch.v1';

const REQUEST_BATCH_STATUSES = new Set([
  'ready',
  'partially-ready',
  'blocked',
  'idle',
]);
const OPERATIONS = new Set(['generate', 'edit', 'inpaint']);
const MAXIMUM_REQUESTS = 100;
const MAXIMUM_UPSTREAM_ITEMS = 10_000;
const MAXIMUM_CAMPAIGN_BATCH_ITEMS = 500;

function boundedArray(value, label, maximum) {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new Error(`${label} must contain at most ${maximum} entries`);
  }
  return value;
}

function nonNegativeCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function requiredHex(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function falseApprovalRecord(value) {
  return (
    isObject(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every((entry) => entry === false)
  );
}

function campaignBatchIds(value) {
  const values = boundedArray(
    value,
    'campaignNextBatchItemIds',
    MAXIMUM_CAMPAIGN_BATCH_ITEMS,
  );
  const seen = new Set();
  const result = [];
  for (const [index, itemId] of values.entries()) {
    requiredHex(itemId, HEX24, `campaignNextBatchItemIds[${index}]`);
    if (seen.has(itemId)) {
      throw new Error(`campaignNextBatchItemIds duplicates ${itemId}`);
    }
    seen.add(itemId);
    result.push(itemId);
  }
  return Object.freeze(result);
}

function requestEntry(value, index, campaignItemIds) {
  if (!isObject(value)) throw new Error(`requests[${index}] must be an object`);
  const workOrderId = safeId(value.workOrderId, `requests[${index}].workOrderId`);
  const campaignItemId = requiredHex(
    value.campaignItemId,
    HEX24,
    `requests[${index}].campaignItemId`,
  );
  if (!campaignItemIds.has(campaignItemId)) {
    throw new Error(
      `requests[${index}].campaignItemId is outside campaignNextBatchItemIds`,
    );
  }
  const sourcePath = canonicalRelative(
    value.sourcePath,
    `requests[${index}].sourcePath`,
  );
  const sourceSha256 = requiredHex(
    value.sourceSha256,
    HEX64,
    `requests[${index}].sourceSha256`,
  );
  const semanticRole = safeId(
    value.semanticRole,
    `requests[${index}].semanticRole`,
  );
  const targetPath = canonicalRelative(
    value.targetPath,
    `requests[${index}].targetPath`,
  );
  if (typeof value.operation !== 'string' || !OPERATIONS.has(value.operation)) {
    throw new Error(`requests[${index}].operation is invalid`);
  }
  if (!isObject(value.request)) {
    throw new Error(`requests[${index}].request must be an object`);
  }
  return Object.freeze({
    value,
    workOrderId,
    campaignItemId,
    sourcePath,
    sourceSha256,
    semanticRole,
    targetPath,
    operation: value.operation,
    request: value.request,
  });
}

function deferredReason(entry) {
  return isObject(entry) && typeof entry.reason === 'string'
    ? entry.reason
    : null;
}

function validateBatchCounts(batch, requests, upstreamBlocked, upstreamDeferred) {
  if (!isObject(batch.counts)) {
    throw new Error('RAW_ART provider request batch counts must be an object');
  }
  const counts = {
    providerRequiredTotal: nonNegativeCount(
      batch.counts.providerRequiredTotal,
      'counts.providerRequiredTotal',
    ),
    campaignNextBatchEligible: nonNegativeCount(
      batch.counts.campaignNextBatchEligible,
      'counts.campaignNextBatchEligible',
    ),
    ready: nonNegativeCount(batch.counts.ready, 'counts.ready'),
    blocked: nonNegativeCount(batch.counts.blocked, 'counts.blocked'),
    deferred: nonNegativeCount(batch.counts.deferred, 'counts.deferred'),
    outsideCampaignNextBatch: nonNegativeCount(
      batch.counts.outsideCampaignNextBatch,
      'counts.outsideCampaignNextBatch',
    ),
    campaignOrBatchDeferred: nonNegativeCount(
      batch.counts.campaignOrBatchDeferred,
      'counts.campaignOrBatchDeferred',
    ),
  };
  const outside = upstreamDeferred.filter(
    (entry) => deferredReason(entry) === 'outside-campaign-next-batch',
  ).length;
  if (
    counts.ready !== requests.length ||
    counts.blocked !== upstreamBlocked.length ||
    counts.deferred !== upstreamDeferred.length ||
    counts.outsideCampaignNextBatch !== outside ||
    counts.campaignOrBatchDeferred !== upstreamDeferred.length - outside ||
    counts.providerRequiredTotal !==
      requests.length + upstreamBlocked.length + upstreamDeferred.length ||
    counts.campaignNextBatchEligible < requests.length ||
    counts.campaignNextBatchEligible > counts.providerRequiredTotal
  ) {
    throw new Error('RAW_ART provider request batch count reconciliation failed');
  }

  const currentProblems =
    counts.blocked + counts.campaignOrBatchDeferred;
  if (
    (batch.status === 'ready' &&
      (counts.ready === 0 || currentProblems !== 0)) ||
    (batch.status === 'partially-ready' &&
      (counts.ready === 0 || currentProblems === 0)) ||
    (batch.status === 'blocked' &&
      (counts.ready !== 0 || counts.blocked === 0)) ||
    (batch.status === 'idle' &&
      (counts.ready !== 0 || counts.blocked !== 0))
  ) {
    throw new Error('RAW_ART provider request batch status reconciliation failed');
  }
  return Object.freeze(counts);
}

export function validateRawArtProviderRequestBatch(record) {
  const batch = record.value;
  if (
    batch.schema !== SCHEMAS.requestBatch ||
    !REQUEST_BATCH_STATUSES.has(batch.status)
  ) {
    throw new Error('unexpected RAW_ART provider request batch v2');
  }
  const gameHead = requiredHex(batch.gameHead, HEX40, 'gameHead');
  const queueSha256 = requiredHex(
    batch.queueSha256,
    HEX64,
    'queueSha256',
  );
  const campaignSha256 = requiredHex(
    batch.campaignSha256,
    HEX64,
    'campaignSha256',
  );
  if (batch.campaignRunId !== campaignSha256.slice(0, 20)) {
    throw new Error('campaignRunId does not match campaignSha256');
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
  const batchSha256 = verifySelfHash(
    batch,
    'batchSha256',
    'RAW_ART provider request batch',
  );
  assertFalseAuthority(batch.authority, 'RAW_ART provider request batch');

  const campaignNextBatchItemIds = campaignBatchIds(
    batch.campaignNextBatchItemIds,
  );
  const campaignItemIds = new Set(campaignNextBatchItemIds);
  const requestValues = boundedArray(
    batch.requests,
    'requests',
    MAXIMUM_REQUESTS,
  );
  const upstreamBlocked = boundedArray(
    batch.blocked,
    'blocked',
    MAXIMUM_UPSTREAM_ITEMS,
  );
  const upstreamDeferred = boundedArray(
    batch.deferred,
    'deferred',
    MAXIMUM_UPSTREAM_ITEMS,
  );
  const requests = requestValues.map((entry, index) =>
    requestEntry(entry, index, campaignItemIds),
  );

  const seenWorkOrders = new Set();
  const seenCampaignItems = new Set();
  const seenSources = new Set();
  const seenTargets = new Set();
  for (const entry of requests) {
    const sourceKey = sourceIdentity(entry.sourcePath, entry.sourceSha256);
    const targetKey = entry.targetPath.toLowerCase();
    if (seenWorkOrders.has(entry.workOrderId)) {
      throw new Error(`duplicate RAW_ART provider work order ${entry.workOrderId}`);
    }
    if (seenCampaignItems.has(entry.campaignItemId)) {
      throw new Error(`duplicate RAW_ART campaign item ${entry.campaignItemId}`);
    }
    if (seenSources.has(sourceKey)) {
      throw new Error(`duplicate RAW_ART provider source ${entry.sourcePath}`);
    }
    if (seenTargets.has(targetKey)) {
      throw new Error(`duplicate RAW_ART provider target ${entry.targetPath}`);
    }
    seenWorkOrders.add(entry.workOrderId);
    seenCampaignItems.add(entry.campaignItemId);
    seenSources.add(sourceKey);
    seenTargets.add(targetKey);
  }
  const counts = validateBatchCounts(
    batch,
    requests,
    upstreamBlocked,
    upstreamDeferred,
  );

  return Object.freeze({
    value: batch,
    batchSha256,
    gameHead,
    queueSha256,
    campaignSha256,
    campaignRunId: batch.campaignRunId,
    technicalAdmissionSha256,
    styleBankSha256,
    bindingsSha256,
    campaignNextBatchItemIds,
    requests,
    upstreamBlocked,
    upstreamDeferred,
    counts,
  });
}

function metadataObject(value) {
  if (!isObject(value)) {
    throw new Error('normalized provider request metadata is missing');
  }
  return value;
}

function assertPositiveDimensions(value) {
  return (
    isObject(value) &&
    Number.isSafeInteger(value.width) &&
    value.width > 0 &&
    Number.isSafeInteger(value.height) &&
    value.height > 0
  );
}

function assertRequestBinding(entry, source, request) {
  if (request.operation !== entry.operation) {
    throw new Error('provider request operation does not match its RAW_ART work order');
  }
  if (request.sourceCanvas !== undefined) {
    throw new Error('provider request must retain adapter-derived source canvas policy');
  }
  const metadata = metadataObject(request.metadata);
  const expected = {
    schema: SCHEMAS.requestMetadata,
    gameHead: source.gameHead,
    queueSha256: source.queueSha256,
    campaignSha256: source.campaignSha256,
    campaignRunId: source.campaignRunId,
    campaignItemId: entry.campaignItemId,
    technicalAdmissionSha256: source.technicalAdmissionSha256,
    styleBankSha256: source.styleBankSha256,
    bindingsSha256: source.bindingsSha256,
    sourcePath: entry.sourcePath,
    sourceSha256: entry.sourceSha256,
    targetPath: entry.targetPath,
    semanticRole: entry.semanticRole,
    providerCanvasPolicy: 'adapter-derived-from-target',
    masteringRequired: true,
  };
  for (const [name, expectedValue] of Object.entries(expected)) {
    if (metadata[name] !== expectedValue) {
      throw new Error(
        `provider request metadata.${name} does not match its RAW_ART work order`,
      );
    }
  }
  for (const name of [
    'artDirectionFileSha256',
    'bridgeFileSha256',
    'providerMapFileSha256',
  ]) {
    requiredHex(metadata[name], HEX64, `provider request metadata.${name}`);
  }
  if (!assertPositiveDimensions(metadata.sourceDimensions)) {
    throw new Error('provider request metadata.sourceDimensions is invalid');
  }
  if (!falseApprovalRecord(metadata.approvals)) {
    throw new Error('provider request approvals must remain entirely false');
  }
}

function blockedContract(entry, error) {
  return Object.freeze({
    workOrderId: entry.workOrderId,
    campaignItemId: entry.campaignItemId,
    sourcePath: entry.sourcePath,
    sourceSha256: entry.sourceSha256,
    semanticRole: entry.semanticRole,
    targetPath: entry.targetPath,
    operation: entry.operation,
    stage: 'canonical-provider-contract',
    error: Object.freeze({
      code:
        error instanceof ProviderError
          ? error.code
          : 'RAW_ART_PROVIDER_CONTRACT_INVALID',
      classification:
        error instanceof ProviderError ? error.classification : 'permanent',
      message:
        (error instanceof Error ? error.message : String(error)).slice(0, 4_096),
    }),
  });
}

export function compileRawArtProviderRuntimeBatch(record) {
  const source = validateRawArtProviderRequestBatch(record);
  const jobs = [];
  const providerContractBlocked = [];

  for (const entry of source.requests) {
    try {
      const contract = compileProviderCandidateRuntimeContract(entry.request);
      assertRequestBinding(entry, source, contract.request);
      jobs.push(
        Object.freeze({
          workOrderId: entry.workOrderId,
          campaignItemId: entry.campaignItemId,
          sourcePath: entry.sourcePath,
          sourceSha256: entry.sourceSha256,
          semanticRole: entry.semanticRole,
          targetPath: entry.targetPath,
          operation: entry.operation,
          contract,
          contractSha256: hashObject(contract),
          runtimeJobSha256: hashObject(contract.runtimeJob),
        }),
      );
    } catch (error) {
      providerContractBlocked.push(blockedContract(entry, error));
    }
  }

  const currentProblems =
    providerContractBlocked.length +
    source.counts.blocked +
    source.counts.campaignOrBatchDeferred;
  const status =
    jobs.length === 0
      ? currentProblems > 0
        ? 'blocked'
        : 'idle'
      : currentProblems > 0
        ? 'partially-ready'
        : 'ready';
  const batch = {
    schema: RAW_ART_PROVIDER_RUNTIME_BATCH_SCHEMA,
    status,
    providerProtocolVersion: PROVIDER_PROTOCOL_VERSION,
    gameHead: source.gameHead,
    queueSha256: source.queueSha256,
    campaignSha256: source.campaignSha256,
    campaignRunId: source.campaignRunId,
    technicalAdmissionSha256: source.technicalAdmissionSha256,
    styleBankSha256: source.styleBankSha256,
    bindingsSha256: source.bindingsSha256,
    campaignNextBatchItemIds: source.campaignNextBatchItemIds,
    sourceRequestBatch: {
      path: record.path,
      fileSha256: record.fileSha256,
      documentSha256: source.batchSha256,
      runId: source.value.runId,
    },
    counts: {
      providerRequiredTotal: source.counts.providerRequiredTotal,
      campaignNextBatchEligible: source.counts.campaignNextBatchEligible,
      requestInputs: source.requests.length,
      readyRuntimeJobs: jobs.length,
      providerContractBlocked: providerContractBlocked.length,
      upstreamBlocked: source.counts.blocked,
      upstreamDeferred: source.counts.deferred,
      outsideCampaignNextBatch: source.counts.outsideCampaignNextBatch,
      campaignOrBatchDeferred: source.counts.campaignOrBatchDeferred,
    },
    jobs,
    providerContractBlocked,
    upstreamBlocked: source.upstreamBlocked,
    upstreamDeferred: source.upstreamDeferred,
    nextActions: [
      'Submit only deliberately selected jobs[].contract.runtimeJob values through a separate explicit write-enabled runtime call.',
      'Run the Art Studio worker separately and inspect immutable provider evidence and unapproved candidate artifacts.',
      'Master, evaluate and independently approve candidates before any Development Studio publication.',
    ],
    authority: {
      providerExecution: false,
      runtimeSubmission: false,
      sourceMutation: false,
      sourceDeletion: false,
      targetRepositoryMutation: false,
      candidateSelection: false,
      candidatePromotion: false,
      creativeApproval: false,
      historicalApproval: false,
      provenanceApproval: false,
      runtimeApproval: false,
      publication: false,
      forcePush: false,
    },
  };
  const runtimeBatchSha256 = hashObject(batch);
  return Object.freeze({
    ...batch,
    runtimeBatchSha256,
    runId: runtimeBatchSha256.slice(0, 20),
  });
}
