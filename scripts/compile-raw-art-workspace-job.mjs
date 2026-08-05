#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const queuePath = option('--queue');
const workspaceRoot = option('--workspace-root');
const evidenceRoot = option('--evidence-root');
const outputPath = option('--output');
const artStudioRepo = option('--art-studio-repo', 'evavo-art-studio');
const sourceRootOption = option('--source-root');
const stagingRoot = option('--staging-root', '.evavo-art-staging');
if (!queuePath || !workspaceRoot || !evidenceRoot || !outputPath) {
  throw new Error(
    'usage: compile-raw-art-workspace-job.mjs --queue <queue.json> --workspace-root <path> --evidence-root <path> --output <job.json> [--art-studio-repo <relative>] [--source-root <relative>] [--staging-root <relative>]',
  );
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
const safeRelative = (value, label) => {
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
const joinRelative = (...parts) =>
  safeRelative(path.posix.join(...parts), 'generated relative path');
const queueBytes = await readFile(path.resolve(queuePath));
const queue = JSON.parse(queueBytes.toString('utf8'));
if (queue.schema !== 'evavo.raw-art-production-queue.v2') {
  throw new Error('unexpected RAW_ART queue schema');
}
const unhashedQueue = { ...queue };
delete unhashedQueue.queueSha256;
if (queue.queueSha256 !== sha256(canonical(unhashedQueue))) {
  throw new Error('RAW_ART queue self hash mismatch');
}
const registryBytes = await readFile(
  new URL('../config/image-processing-recipes.v1.json', import.meta.url),
);
const registry = JSON.parse(registryBytes.toString('utf8'));
if (registry.schema !== 'evavo.image-processing-recipes.v2') {
  throw new Error('unexpected processor registry schema');
}
const workspace = path.resolve(workspaceRoot);
const evidence = path.resolve(evidenceRoot);
if (workspace === evidence || evidence.startsWith(`${workspace}${path.sep}`)) {
  throw new Error('evidence-root must remain outside workspace-root');
}
const artRepo = safeRelative(artStudioRepo, 'art-studio-repo');
const sourceRoot = safeRelative(
  sourceRootOption || queue.sourceRoot,
  'source-root',
);
const staging = safeRelative(stagingRoot, 'staging-root');
const ready = queue.entries.filter((entry) => entry.state === 'ready-deterministic');
if (ready.length === 0) {
  throw new Error('queue contains no ready-deterministic entries');
}
const processors = [...registry.processors].sort(
  (left, right) =>
    left.fallbackRank - right.fallbackRank || left.id.localeCompare(right.id),
);
const supports = (processor, entry) =>
  entry.operations.every((operation) => processor.capabilities.includes(operation)) &&
  (processor.id !== 'sharp-delivery-optimizer' ||
    (entry.deliveryProfileId && entry.background));
const selected = ready.map((entry) => {
  const candidates = processors.filter((candidate) => supports(candidate, entry));
  const processor = entry.preferredProcessorId
    ? candidates.find((candidate) => candidate.id === entry.preferredProcessorId)
    : candidates[0];
  if (!processor) {
    throw new Error(
      `no single processor supports ${entry.sourcePath}: ${entry.operations.join(', ')}`,
    );
  }
  if (!entry.targetPath) throw new Error(`ready entry lost targetPath: ${entry.sourcePath}`);
  if (!Number.isSafeInteger(entry.sourceBytes) || entry.sourceBytes < 1) {
    throw new Error(`ready entry lost sourceBytes: ${entry.sourcePath}`);
  }
  return { entry, processor };
});
const operations = [];
const jobRoot = joinRelative(staging, 'jobs', queue.queueSha256.slice(0, 16));
const sharpGroups = new Map();
for (const item of selected) {
  if (item.processor.id !== 'sharp-delivery-optimizer') continue;
  const key = item.entry.semanticRole;
  const group = sharpGroups.get(key) || [];
  group.push(item.entry);
  sharpGroups.set(key, group);
}
let sharpBatchIndex = 0;
for (const [semanticRole, entries] of [...sharpGroups.entries()].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  for (let offset = 0; offset < entries.length; offset += 500) {
    sharpBatchIndex += 1;
    const items = entries.slice(offset, offset + 500);
    const batchId = `raw-${semanticRole.replace(/[^a-z0-9]+/giu, '-').replace(/^-|-$/gu, '') || 'art'}-${String(sharpBatchIndex).padStart(4, '0')}-${queue.queueSha256.slice(0, 8)}`;
    const manifest = {
      schema: 'evavo.art-delivery-optimization.v1',
      batchId,
      project: {
        id: 'Brass_Brine',
        title: 'Brass & Brine',
        engine: 'godot',
        engineVersion: '4.6.2',
        viewport: { width: 1280, height: 720 },
        rendering: 'monochrome-engraving-with-restrained-red-accent',
      },
      items: items.map((entry) => ({
        id: entry.sourceSha256.slice(0, 24),
        sourcePath: safeRelative(entry.sourcePath, 'sourcePath'),
        targetPath: safeRelative(entry.targetPath, 'targetPath'),
        sourceSha256: entry.sourceSha256,
        sourceBytes: entry.sourceBytes,
        profileId: entry.deliveryProfileId,
        background: entry.background,
      })),
    };
    const manifestPath = joinRelative(jobRoot, 'sharp', `${batchId}.manifest.json`);
    const outputRoot = joinRelative(staging, 'outputs', 'sharp', batchId);
    const wrapperReceipt = joinRelative(
      staging,
      'receipts',
      'sharp',
      `${batchId}.wrapper.json`,
    );
    operations.push({
      type: 'write-text',
      path: manifestPath,
      content: `${JSON.stringify(manifest, null, 2)}\n`,
    });
    operations.push({
      type: 'run-python',
      executableCandidates: ['py', 'python', 'python3'],
      script: joinRelative(artRepo, 'tools', 'run_art_delivery_optimizer.py'),
      cwd: artRepo,
      args: [
        '--workspace-root',
        workspace,
        '--repo',
        artRepo,
        '--manifest',
        manifestPath,
        '--source-root',
        sourceRoot,
        '--output-root',
        outputRoot,
        '--wrapper-receipt',
        wrapperReceipt,
        '--apply',
      ],
      expectedOutputs: [
        {
          path: outputRoot,
          kind: 'directory',
          minimumFiles: items.length + 1,
          maximumFiles: items.length + 1,
        },
        { path: wrapperReceipt, kind: 'file', minimumBytes: 64 },
      ],
      timeoutMs: 14_400_000,
    });
  }
}
for (const { entry, processor } of selected) {
  if (processor.id !== 'sharp-exact-canvas-runtime') continue;
  const itemId = entry.sourceSha256.slice(0, 24);
  const planPath = joinRelative(jobRoot, 'sharp-exact', `${itemId}.plan.json`);
  const outputFile = joinRelative(
    staging,
    'outputs',
    'sharp-exact',
    itemId,
    safeRelative(entry.targetPath, 'targetPath'),
  );
  const receiptFile = joinRelative(
    staging,
    'receipts',
    'sharp-exact',
    `${itemId}.receipt.json`,
  );
  const plan = {
    schema: 'evavo.image-processing-plan.v2',
    sourcePath: entry.sourcePath,
    sourceSha256: entry.sourceSha256,
    sourceBytes: entry.sourceBytes,
    targetPath: entry.targetPath,
    decision: entry.decision,
    productionDecision: 'deterministic-processing',
    semanticRole: entry.semanticRole,
    targetCanvas: entry.targetCanvas,
    alphaPolicy: entry.alphaPolicy,
    runtimeFormat: entry.runtimeFormat,
    exactCanvasRequired: entry.exactCanvasRequired === true,
    deliveryProfileId: entry.deliveryProfileId,
    background: entry.background,
    operations: entry.operations,
    deterministicOperations: entry.operations,
    providerOperations: [],
    routes: [
      {
        processorId: processor.id,
        kind: processor.kind,
        entrypoint: processor.entrypoint,
        capabilities: entry.operations,
        receiptSchema: processor.receiptSchema,
      },
    ],
    selectedRoute: {
      processorId: processor.id,
      kind: processor.kind,
      entrypoint: processor.entrypoint,
      capabilities: entry.operations,
      receiptSchema: processor.receiptSchema,
    },
    processorOptions: entry.processorOptions || {},
    sourceOverwrite: false,
    sourceDeletion: false,
    createOnlyOutput: true,
    lossyIntermediateAllowed: false,
    providerExecution: false,
    publication: false,
  };
  plan.planSha256 = sha256(canonical(plan));
  operations.push({
    type: 'write-text',
    path: planPath,
    content: `${JSON.stringify(plan, null, 2)}\n`,
  });
  operations.push({
    type: 'run-node',
    executableCandidates: ['node'],
    script: joinRelative(artRepo, 'tools', 'process_image_with_sharp.mjs'),
    cwd: artRepo,
    args: [
      '--workspace-root',
      workspace,
      '--plan',
      planPath,
      '--input',
      joinRelative(sourceRoot, entry.sourcePath),
      '--output',
      outputFile,
      '--receipt',
      receiptFile,
    ],
    expectedOutputs: [
      { path: outputFile, kind: 'file', minimumBytes: 1 },
      { path: receiptFile, kind: 'file', minimumBytes: 64 },
    ],
    timeoutMs: 3_600_000,
  });
}
for (const { entry, processor } of selected) {
  if (processor.id !== 'python-pillow-fallback') continue;
  const itemId = entry.sourceSha256.slice(0, 24);
  const planPath = joinRelative(jobRoot, 'pillow', `${itemId}.plan.json`);
  const outputFile = joinRelative(
    staging,
    'outputs',
    'pillow',
    itemId,
    safeRelative(entry.targetPath, 'targetPath'),
  );
  const receiptFile = joinRelative(
    staging,
    'receipts',
    'pillow',
    `${itemId}.receipt.json`,
  );
  const plan = {
    schema: 'evavo.image-processing-plan.v2',
    sourcePath: entry.sourcePath,
    sourceSha256: entry.sourceSha256,
    sourceBytes: entry.sourceBytes,
    targetPath: entry.targetPath,
    decision: entry.decision,
    productionDecision: 'deterministic-processing',
    semanticRole: entry.semanticRole,
    targetCanvas: entry.targetCanvas,
    alphaPolicy: entry.alphaPolicy,
    runtimeFormat: entry.runtimeFormat,
    exactCanvasRequired: entry.exactCanvasRequired === true,
    deliveryProfileId: entry.deliveryProfileId,
    background: entry.background,
    operations: entry.operations,
    deterministicOperations: entry.operations,
    providerOperations: [],
    routes: [
      {
        processorId: processor.id,
        kind: processor.kind,
        entrypoint: processor.entrypoint,
        capabilities: entry.operations,
        receiptSchema: processor.receiptSchema,
      },
    ],
    selectedRoute: {
      processorId: processor.id,
      kind: processor.kind,
      entrypoint: processor.entrypoint,
      capabilities: entry.operations,
      receiptSchema: processor.receiptSchema,
    },
    processorOptions: entry.processorOptions || {},
    sourceOverwrite: false,
    sourceDeletion: false,
    createOnlyOutput: true,
    lossyIntermediateAllowed: false,
    providerExecution: false,
    publication: false,
  };
  plan.planSha256 = sha256(canonical(plan));
  operations.push({
    type: 'write-text',
    path: planPath,
    content: `${JSON.stringify(plan, null, 2)}\n`,
  });
  operations.push({
    type: 'run-python',
    executableCandidates: ['py', 'python', 'python3'],
    script: joinRelative(artRepo, 'tools', 'process_image_with_pillow.py'),
    cwd: artRepo,
    args: [
      '--workspace-root',
      workspace,
      '--plan',
      planPath,
      '--input',
      joinRelative(sourceRoot, entry.sourcePath),
      '--output',
      outputFile,
      '--receipt',
      receiptFile,
    ],
    expectedOutputs: [
      { path: outputFile, kind: 'file', minimumBytes: 1 },
      { path: receiptFile, kind: 'file', minimumBytes: 64 },
    ],
    timeoutMs: 3_600_000,
  });
}
const job = {
  schema: 'evavo.governed-workspace-job.v1',
  runId: `raw-art-${queue.queueSha256.slice(0, 24)}`,
  root: workspace,
  evidenceRoot: evidence,
  sourceQueueSha256: queue.queueSha256,
  sourceQueueBytesSha256: sha256(queueBytes),
  processorRegistrySha256: sha256(registryBytes),
  stagingOnly: true,
  operations,
};
job.jobSha256 = sha256(canonical(job));
await writeFile(path.resolve(outputPath), `${JSON.stringify(job, null, 2)}\n`, {
  flag: 'wx',
});
console.log(
  JSON.stringify({
    status: 'passed',
    readyEntries: ready.length,
    sharpEntries: selected.filter((item) => item.processor.id === 'sharp-delivery-optimizer').length,
    sharpExactEntries: selected.filter((item) => item.processor.id === 'sharp-exact-canvas-runtime').length,
    pillowEntries: selected.filter((item) => item.processor.id === 'python-pillow-fallback').length,
    operations: operations.length,
    jobSha256: job.jobSha256,
    output: path.resolve(outputPath),
  }),
);
