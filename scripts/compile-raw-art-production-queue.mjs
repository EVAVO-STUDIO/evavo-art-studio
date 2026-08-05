#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const inventoryPath = option('--inventory');
const decisionsPath = option('--decisions');
const bridgePath = option('--bridge');
const outputPath = option('--output');
const receiptsPath = option('--receipts');
const sourceRoot = option('--source-root', '.');
const batchSize = Number(option('--batch-size', '100'));
if (!inventoryPath || !decisionsPath || !bridgePath || !outputPath) {
  throw new Error(
    'usage: compile-raw-art-production-queue.mjs --inventory <json|jsonl> --decisions <json|jsonl> --bridge <json> --output <json> [--receipts <json|jsonl>] [--source-root <path>] [--batch-size <n>]',
  );
}
if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 500) {
  throw new Error('batch-size must be an integer between 1 and 500');
}
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`;
};
const canonicalRelative = (value, label) => {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('\\') ||
    path.posix.isAbsolute(value)
  ) {
    throw new Error(`${label} must be a forward-slash relative path`);
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized !== value ||
    value === '.' ||
    value === '..' ||
    value.startsWith('../')
  ) {
    throw new Error(`${label} is not canonical`);
  }
  return value;
};
const readRecords = async (requested) => {
  if (!requested) return { bytes: Buffer.alloc(0), records: [] };
  const bytes = await readFile(path.resolve(requested));
  const text = bytes.toString('utf8').replace(/^\uFEFF/u, '').trim();
  if (!text) return { bytes, records: [] };
  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      const value = JSON.parse(text);
      if (Array.isArray(value)) return { bytes, records: value };
      for (const key of ['items', 'records', 'entries', 'results', 'decisions']) {
        if (Array.isArray(value[key])) return { bytes, records: value[key] };
      }
      return { bytes, records: [value] };
    } catch {
      // Fall through to JSONL so a first-line object remains supported.
    }
  }
  return {
    bytes,
    records: text
      .split(/\r?\n/u)
      .filter((line) => line.trim())
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          throw new Error(`invalid JSONL record ${index + 1}: ${error.message}`);
        }
      }),
  };
};
const text = (value) =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const sourcePathOf = (record) =>
  text(record.sourcePath) ||
  text(record.path) ||
  text(record.relativePath) ||
  text(record.file) ||
  text(record.source?.path);
const sourceShaOf = (record) =>
  text(record.sourceSha256) ||
  text(record.sha256) ||
  text(record.hash) ||
  text(record.source?.sha256);
const outputShaOf = (record) =>
  text(record.outputSha256) ||
  text(record.output?.sha256) ||
  text(record.prepared?.sha256);
const targetPathOf = (record) =>
  text(record.targetPath) ||
  text(record.output?.targetPath) ||
  text(record.target?.path);
const sourceBytesOf = (record) =>
  Number.isSafeInteger(record.sourceBytes)
    ? record.sourceBytes
    : Number.isSafeInteger(record.bytes)
      ? record.bytes
      : Number.isSafeInteger(record.byteLength)
        ? record.byteLength
        : Number.isSafeInteger(record.sizeBytes)
          ? record.sizeBytes
          : Number.isSafeInteger(record.source?.bytes)
            ? record.source.bytes
            : null;
const dimensionsOf = (record) => {
  const image = record.image || record.decoded || record.source?.dimensions || {};
  const width = Number.isSafeInteger(record.width) ? record.width : image.width;
  const height = Number.isSafeInteger(record.height) ? record.height : image.height;
  return Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0
    ? { width, height }
    : null;
};
const identityKey = (record) => {
  const digest = sourceShaOf(record);
  if (digest && /^[0-9a-f]{64}$/u.test(digest)) return `sha:${digest}`;
  const sourcePath = sourcePathOf(record);
  if (sourcePath) {
    return `path:${sourcePath.normalize('NFC').toLocaleLowerCase('en-US')}`;
  }
  return null;
};
const indexUnique = (records, label) => {
  const result = new Map();
  for (const record of records) {
    const key = identityKey(record);
    if (!key) continue;
    const previous = result.get(key);
    if (previous && canonical(previous) !== canonical(record)) {
      throw new Error(`duplicate conflicting ${label} identity: ${key}`);
    }
    result.set(key, record);
  }
  return result;
};
const flattenReceipts = (value) => {
  if (Array.isArray(value)) return value.flatMap(flattenReceipts);
  if (!value || typeof value !== 'object') return [];
  if (
    value.schema === 'evavo.art-delivery-optimization-receipt.v1' &&
    Array.isArray(value.items)
  ) {
    return value.items;
  }
  if (value.schema === 'evavo.image-processing-receipt.v1') {
    return [
      {
        schema: value.schema,
        sourceSha256: value.source?.sha256,
        sourcePath: value.source?.path,
        outputSha256: value.output?.sha256,
        targetPath: value.targetPath,
        outputBytes: value.output?.bytes,
      },
    ];
  }
  for (const key of ['receipts', 'records', 'results']) {
    if (Array.isArray(value[key])) return value[key].flatMap(flattenReceipts);
  }
  return [value];
};
const safeId = (value) =>
  String(value || '')
    .trim()
    .toLocaleLowerCase('en-US')
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '');
const resolveTargetPath = (sourcePath, decision, mapping) => {
  if (decision?.targetPath) {
    return canonicalRelative(decision.targetPath, 'decision.targetPath');
  }
  const template = text(mapping?.targetPathTemplate);
  if (!template) return null;
  const assignment = decision?.assignment || {};
  const sourceStem = safeId(path.posix.basename(sourcePath, path.posix.extname(sourcePath)));
  const values = {
    source_stem: sourceStem,
    port_id: safeId(assignment.portId || decision?.portId),
    identity_id: safeId(
      assignment.identityId ||
        assignment.characterId ||
        assignment.shipId ||
        assignment.effectId ||
        assignment.iconId ||
        assignment.documentId ||
        decision?.identityId,
    ),
    view_id: safeId(assignment.viewId || decision?.viewId || 'default'),
    scene_id: safeId(assignment.sceneId || decision?.sceneId || 'default'),
  };
  let unresolved = false;
  const resolved = template.replace(/\{([a-z0-9_]+)\}/giu, (_, key) => {
    const value = values[key];
    if (!value) unresolved = true;
    return value || `__missing_${key}__`;
  });
  return unresolved ? null : canonicalRelative(resolved, 'resolved target path');
};

const [inventoryInput, decisionInput, receiptInput] = await Promise.all([
  readRecords(inventoryPath),
  readRecords(decisionsPath),
  readRecords(receiptsPath),
]);
const bridgeBytes = await readFile(path.resolve(bridgePath));
const bridge = JSON.parse(bridgeBytes.toString('utf8'));
if (bridge.schema !== 'evavo.brass-brine.art-studio-bridge.v1') {
  throw new Error('unexpected Art Studio bridge schema');
}
const roleMappings = bridge.roles || {};
const inventory = indexUnique(inventoryInput.records, 'inventory');
const decisions = indexUnique(decisionInput.records, 'decision');
const receipts = indexUnique(
  flattenReceipts(receiptInput.records),
  'receipt',
);
const providerOperations = new Set([
  'reviewed-mask-to-alpha',
  'retouch',
  'inpaint',
  'outpaint',
  'linework-strengthen',
]);
const allowedDecisions = new Set([
  'keep',
  'edit',
  'recreate',
  'generate-variation',
  'reference-only',
  'reject',
]);
const entries = [];
for (const inventoryRecord of [...inventory.values()]) {
  const sourcePath = canonicalRelative(
    sourcePathOf(inventoryRecord),
    'inventory sourcePath',
  );
  const sourceSha256 = sourceShaOf(inventoryRecord);
  if (!sourceSha256 || !/^[0-9a-f]{64}$/u.test(sourceSha256)) {
    throw new Error('every inventory item requires lowercase source SHA-256');
  }
  const key = `sha:${sourceSha256}`;
  const decision =
    decisions.get(key) ||
    decisions.get(
      `path:${sourcePath.normalize('NFC').toLocaleLowerCase('en-US')}`,
    ) ||
    null;
  const semanticRole =
    text(decision?.semanticRole) ||
    text(inventoryRecord.role) ||
    text(inventoryRecord.suggestedRole) ||
    'reference-unknown';
  const mapping = roleMappings[semanticRole] || null;
  const dimensions = dimensionsOf(inventoryRecord);
  const sourceBytes = sourceBytesOf(inventoryRecord);
  const decisionName = text(decision?.decision);
  if (decisionName && !allowedDecisions.has(decisionName)) {
    throw new Error(`unsupported review decision: ${decisionName}`);
  }
  const operations = mapping
    ? [
        ...new Set([
          ...(mapping.defaultOperations || []),
          ...(decision?.operations || []),
        ]),
      ]
    : [...new Set(decision?.operations || [])];
  const exactCanvas =
    Boolean(dimensions && mapping) &&
    dimensions.width === mapping.targetCanvas.width &&
    dimensions.height === mapping.targetCanvas.height;
  if (
    mapping?.exactCanvasRequired === true &&
    !exactCanvas &&
    !operations.includes('canvas-normalize')
  ) {
    operations.push('canvas-normalize');
  }
  const targetPath = mapping
    ? resolveTargetPath(sourcePath, decision, mapping)
    : null;
  if (targetPath && mapping?.runtimeFormat) {
    const expected = `.${String(mapping.runtimeFormat).toLowerCase().replace(/^\./u, '')}`;
    if (path.posix.extname(targetPath).toLowerCase() !== expected) {
      throw new Error(`target path extension does not match ${mapping.runtimeFormat}: ${targetPath}`);
    }
  }
  const receipt = receipts.get(key) || null;
  const receiptTarget = receipt ? targetPathOf(receipt) : null;
  const receiptOutputSha256 = receipt ? outputShaOf(receipt) : null;
  let state;
  let reason;
  if (!decisionName) {
    state = 'blocked-missing-decision';
    reason = 'exact-source-has-no-review-decision';
  } else if (decisionName === 'reference-only') {
    state = 'reference-only';
    reason = 'retained-as-reference-not-runtime-art';
  } else if (decisionName === 'reject') {
    state = 'held-rejected';
    reason = 'rejection-does-not-authorize-source-deletion';
  } else if (!mapping) {
    state = 'blocked-role-unmapped';
    reason = `semantic-role-is-not-mapped:${semanticRole}`;
  } else if (!targetPath) {
    state = 'blocked-target-unresolved';
    reason = 'target-path-requires-explicit-assignment';
  } else if (!dimensions || !Number.isSafeInteger(sourceBytes) || sourceBytes < 1) {
    state = 'blocked-source-evidence';
    reason = 'decoded-dimensions-and-source-byte-length-are-required';
  } else if (receipt) {
    if (
      !receiptOutputSha256 ||
      !/^[0-9a-f]{64}$/u.test(receiptOutputSha256) ||
      !receiptTarget ||
      canonicalRelative(receiptTarget, 'receipt targetPath') !== targetPath
    ) {
      state = 'blocked-receipt-mismatch';
      reason = 'receipt-does-not-bind-the-exact-target-and-output';
    } else {
      state = 'completed';
      reason = 'exact-source-target-and-output-receipt-present';
    }
  } else {
    const requiresProvider =
      ['recreate', 'generate-variation'].includes(decisionName) ||
      operations.some((operation) => providerOperations.has(operation));
    state = requiresProvider ? 'provider-required' : 'ready-deterministic';
    reason = requiresProvider
      ? 'creative-generation-or-semantic-edit-required'
      : exactCanvas
        ? 'reviewed-source-can-enter-deterministic-production'
        : 'reviewed-source-requires-deterministic-canvas-normalization';
  }
  entries.push({
    sourcePath,
    sourceSha256,
    sourceBytes,
    dimensions,
    semanticRole,
    decision: decisionName,
    state,
    reason,
    targetPath,
    operations,
    ...(mapping
      ? {
          targetCanvas: mapping.targetCanvas,
          alphaPolicy: mapping.alphaPolicy,
          runtimeFormat: mapping.runtimeFormat,
          deliveryProfileId: mapping.deliveryProfileId,
          background: mapping.background,
          exactCanvasRequired: mapping.exactCanvasRequired === true,
          preferredProcessorId:
            text(decision?.preferredProcessorId) ||
            text(mapping.preferredProcessorId) ||
            null,
          processorOptions: {
            ...(mapping.processorOptions || {}),
            ...(decision?.processorOptions || {}),
          },
        }
      : {}),
    assignment: decision?.assignment || null,
    approvals: decision?.approvals || null,
    styleScope: decision?.styleScope || null,
    approvedTraits: decision?.preserve || decision?.approvedTraits || [],
    defects: decision?.removeOrFix || decision?.defects || [],
    negativeConstraints: decision?.negativeConstraints || [],
    styleReferenceEligible: ['keep', 'reference-only'].includes(decisionName),
    receipt: receipt
      ? {
          schema: receipt.schema || null,
          outputSha256: receiptOutputSha256,
          targetPath: receiptTarget,
        }
      : null,
  });
}
entries.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
const targetOwners = new Map();
for (const entry of entries.filter((candidate) => candidate.targetPath)) {
  const key = entry.targetPath.normalize('NFC').toLocaleLowerCase('en-US');
  const prior = targetOwners.get(key);
  if (prior && prior !== entry.sourceSha256) {
    throw new Error(`target path collision: ${entry.targetPath}`);
  }
  targetOwners.set(key, entry.sourceSha256);
}
const grouped = new Map();
for (const entry of entries.filter(
  (candidate) => candidate.state === 'ready-deterministic',
)) {
  const group = grouped.get(entry.semanticRole) || [];
  group.push(entry);
  grouped.set(entry.semanticRole, group);
}
const batches = [];
for (const [semanticRole, items] of [...grouped.entries()].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  for (let offset = 0; offset < items.length; offset += batchSize) {
    const selected = items.slice(offset, offset + batchSize);
    batches.push({
      batchId: `${semanticRole
        .replace(/[^a-z0-9]+/giu, '-')
        .replace(/^-|-$/gu, '') || 'unknown'}-${String(offset / batchSize + 1).padStart(4, '0')}`,
      semanticRole,
      sourceSha256s: selected.map((item) => item.sourceSha256),
      targetPaths: selected.map((item) => item.targetPath),
      count: selected.length,
    });
  }
}
const configuredStates = [
  'blocked-missing-decision',
  'blocked-role-unmapped',
  'blocked-target-unresolved',
  'blocked-source-evidence',
  'blocked-receipt-mismatch',
  'ready-deterministic',
  'provider-required',
  'reference-only',
  'held-rejected',
  'completed',
];
const counts = Object.fromEntries(
  configuredStates.map((state) => [
    state,
    entries.filter((entry) => entry.state === state).length,
  ]),
);
const queue = {
  schema: 'evavo.raw-art-production-queue.v2',
  sourceRoot,
  inputs: {
    inventorySha256: sha256(inventoryInput.bytes),
    decisionsSha256: sha256(decisionInput.bytes),
    bridgeSha256: sha256(bridgeBytes),
    receiptsSha256: receiptsPath ? sha256(receiptInput.bytes) : null,
  },
  entries,
  batches,
  counts,
  resumableBySourceSha256AndTargetPath: true,
  receiptCannotBypassReviewDecision: true,
  sourceMutation: false,
  sourceDeletion: false,
  providerExecution: false,
  targetRepositoryMutation: false,
  publication: false,
};
queue.queueSha256 = sha256(canonical(queue));
await writeFile(path.resolve(outputPath), `${JSON.stringify(queue, null, 2)}\n`, {
  flag: 'wx',
});
console.log(
  JSON.stringify({
    status: 'passed',
    entries: entries.length,
    batches: batches.length,
    counts,
    queueSha256: queue.queueSha256,
    output: path.resolve(outputPath),
  }),
);
