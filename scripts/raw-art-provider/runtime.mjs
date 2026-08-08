import {
  PROVIDER_PROTOCOL_VERSION,
  ProviderError,
  compileProviderCandidateRuntimeContract,
} from '../../packages/providers/dist/index.js';

import {
  HEX40,
  HEX64,
  SCHEMAS,
  assertFalseAuthority,
  boundedText,
  hashObject,
  isObject,
  safeId,
  verifySelfHash,
} from './shared.mjs';

const REQUEST_BATCH_STATUSES = new Set(['ready', 'partially-ready', 'blocked']);
const OPERATIONS = new Set(['generate', 'edit', 'inpaint']);
const MAXIMUM_REQUESTS = 100;
const MAXIMUM_UPSTREAM_ITEMS = 10_000;

function array(value, label, maximum) {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new Error(`${label} must be an array with at most ${maximum} entries`);
  }
  return value;
}

function count(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function requestEntry(value, index) {
  if (!isObject(value)) throw new Error(`requests[${index}] must be an object`);
  const workOrderId = safeId(value.workOrderId, `requests[${index}].workOrderId`);
  const sourcePath = boundedText(value.sourcePath, `requests[${index}].sourcePath`, 1, 32_768);
  if (!HEX64.test(value.sourceSha256 ?? '')) {
    throw new Error(`requests[${index}].sourceSha256 is invalid`);
  }
  const semanticRole = safeId(value.semanticRole, `requests[${index}].semanticRole`);
  const targetPath = boundedText(value.targetPath, `requests[${index}].targetPath`, 1, 32_768);
  if (typeof value.operation !== 'string' || !OPERATIONS.has(value.operation)) {
    throw new Error(`requests[${index}].operation is invalid`);
  }
  if (!isObject(value.request)) {
    throw new Error(`requests[${index}].request must be an object`);
  }
  return Object.freeze({
    value,
    workOrderId,
    sourcePath,
    sourceSha256: value.sourceSha256,
    semanticRole,
    targetPath,
    operation: value.operation,
    request: value.request,
  });
}

export function validateRawArtProviderRequestBatch(record) {
  const batch = record.value;
  if (
    batch.schema !== SCHEMAS.requestBatch ||
    !REQUEST_BATCH_STATUSES.has(batch.status) ||
    !HEX40.test(batch.gameHead ?? '') ||
    !HEX64.test(batch.queueSha256 ?? '') ||
    !HEX64.test(batch.styleBankSha256 ?? '') ||
    !isObject(batch.counts)
  ) {
    throw new Error('unexpected RAW_ART provider request batch');
  }
  const batchSha256 = verifySelfHash(
    batch,
    'batchSha256',
    'RAW_ART provider request batch',
  );
  if (batch.runId !== batchSha256.slice(0, 20)) {
    throw new Error('RAW_ART provider request batch runId mismatch');
  }
  assertFalseAuthority(batch.authority, 'RAW_ART provider request batch');

  const requestValues = array(batch.requests, 'requests', MAXIMUM_REQUESTS);
  const upstreamBlocked = array(
    batch.blocked,
    'blocked',
    MAXIMUM_UPSTREAM_ITEMS,
  );
  const upstreamDeferred = array(
    batch.deferred,
    'deferred',
    MAXIMUM_UPSTREAM_ITEMS,
  );
  const requests = requestValues.map(requestEntry);
  const seenWorkOrders = new Set();
  const seenSources = new Set();
  const seenTargets = new Set();
  for (const entry of requests) {
    if (seenWorkOrders.has(entry.workOrderId)) {
      throw new Error(`duplicate RAW_ART provider work order ${entry.workOrderId}`);
    }
    if (seenSources.has(entry.sourceSha256)) {
      throw new Error(`duplicate RAW_ART provider source ${entry.sourceSha256}`);
    }
    const targetKey = entry.targetPath.toLowerCase();
    if (seenTargets.has(targetKey)) {
      throw new Error(`duplicate RAW_ART provider target ${entry.targetPath}`);
    }
    seenWorkOrders.add(entry.workOrderId);
    seenSources.add(entry.sourceSha256);
    seenTargets.add(targetKey);
  }

  const expected = {
    providerRequired:
      requests.length + upstreamBlocked.length + upstreamDeferred.length,
    ready: requests.length,
    blocked: upstreamBlocked.length,
    deferred: upstreamDeferred.length,
  };
  for (const [name, expectedValue] of Object.entries(expected)) {
    if (count(batch.counts[name], `counts.${name}`) !== expectedValue) {
      throw new Error(`RAW_ART provider request batch counts.${name} mismatch`);
    }
  }
  if (
    (batch.status === 'ready' && (upstreamBlocked.length || upstreamDeferred.length)) ||
    (batch.status === 'blocked' && requests.length > 0)
  ) {
    throw new Error('RAW_ART provider request batch status does not match its entries');
  }

  return Object.freeze({
    value: batch,
    batchSha256,
    requests,
    upstreamBlocked,
    upstreamDeferred,
  });
}

function metadataObject(value) {
  if (!isObject(value)) {
    throw new Error('normalized provider request metadata is missing');
  }
  return value;
}

function assertRequestBinding(entry, source, request) {
  if (request.operation !== entry.operation) {
    throw new Error('provider request operation does not match its RAW_ART work order');
  }
  const metadata = metadataObject(request.metadata);
  const expected = {
    schema: 'evavo.raw-art-provider-request-metadata.v1',
    gameHead: source.value.gameHead,
    queueSha256: source.value.queueSha256,
    styleBankSha256: source.value.styleBankSha256,
    sourcePath: entry.sourcePath,
    sourceSha256: entry.sourceSha256,
    targetPath: entry.targetPath,
    semanticRole: entry.semanticRole,
  };
  for (const [name, expectedValue] of Object.entries(expected)) {
    if (metadata[name] !== expectedValue) {
      throw new Error(`provider request metadata.${name} does not match its RAW_ART work order`);
    }
  }
  if (
    !isObject(metadata.approvals) ||
    Object.keys(metadata.approvals).length === 0 ||
    Object.values(metadata.approvals).some((value) => value !== false)
  ) {
    throw new Error('provider request approvals must remain entirely false');
  }
}

function blockedContract(entry, error) {
  return Object.freeze({
    workOrderId: entry.workOrderId,
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

  const hasBlocked =
    providerContractBlocked.length > 0 ||
    source.upstreamBlocked.length > 0 ||
    source.upstreamDeferred.length > 0;
  const batch = {
    schema: SCHEMAS.runtimeBatch,
    status:
      jobs.length === 0 ? 'blocked' : hasBlocked ? 'partially-ready' : 'ready',
    providerProtocolVersion: PROVIDER_PROTOCOL_VERSION,
    gameHead: source.value.gameHead,
    queueSha256: source.value.queueSha256,
    styleBankSha256: source.value.styleBankSha256,
    sourceRequestBatch: {
      path: record.path,
      fileSha256: record.fileSha256,
      documentSha256: source.batchSha256,
      runId: source.value.runId,
    },
    counts: {
      providerRequired: source.value.counts.providerRequired,
      requestInputs: source.requests.length,
      readyRuntimeJobs: jobs.length,
      providerContractBlocked: providerContractBlocked.length,
      upstreamBlocked: source.upstreamBlocked.length,
      upstreamDeferred: source.upstreamDeferred.length,
    },
    jobs,
    providerContractBlocked,
    upstreamBlocked: source.upstreamBlocked,
    upstreamDeferred: source.upstreamDeferred,
    nextActions: [
      'Submit only selected jobs[].contract.runtimeJob values through a separate explicit write-enabled runtime call.',
      'Inspect immutable provider evidence and candidate artifacts after worker execution.',
      'Evaluate, master and independently approve candidates before any game-repository publication.',
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
