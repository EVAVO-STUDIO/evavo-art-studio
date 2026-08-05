#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [workOrderPath, outputPath] = process.argv.slice(2);
if (!workOrderPath || !outputPath) {
  throw new Error(
    'usage: compile-image-processing-plan.mjs <work-order.json> <output.json>',
  );
}
const workBytes = await readFile(path.resolve(workOrderPath));
const work = JSON.parse(workBytes.toString('utf8'));
const registryBytes = await readFile(
  new URL('../config/image-processing-recipes.v1.json', import.meta.url),
);
const registry = JSON.parse(registryBytes.toString('utf8'));
if (
  work.schema !== 'evavo.image-reference-work-order.v2' &&
  work.schema !== 'evavo.image-reference-work-order.v1'
) {
  throw new Error('unexpected work order schema');
}
if (registry.schema !== 'evavo.image-processing-recipes.v2') {
  throw new Error('unexpected image processing registry schema');
}
if (!/^[0-9a-f]{64}$/u.test(work.sourceSha256 || '')) {
  throw new Error('exact source hash required');
}
if (
  work.sourceBytes !== undefined &&
  (!Number.isSafeInteger(work.sourceBytes) || work.sourceBytes < 1)
) {
  throw new Error('sourceBytes must be a positive safe integer');
}
if (!Array.isArray(work.operations) || work.operations.some((value) => typeof value !== 'string')) {
  throw new Error('operations must be an array of strings');
}
if (
  !work.targetCanvas ||
  !Number.isSafeInteger(work.targetCanvas.width) ||
  !Number.isSafeInteger(work.targetCanvas.height) ||
  work.targetCanvas.width < 1 ||
  work.targetCanvas.height < 1
) {
  throw new Error('targetCanvas must contain positive integer width and height');
}
const canonical = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`;
};
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const operations = [...new Set(work.operations)];
const nonDeterministic = new Set(registry.nonDeterministicOperations || []);
const providerOperations = operations.filter((operation) =>
  nonDeterministic.has(operation),
);
const deterministicOperations = operations.filter(
  (operation) => !nonDeterministic.has(operation),
);
const productionDecision = ['recreate', 'generate-variation'].includes(work.decision)
  ? 'provider-required'
  : providerOperations.length > 0
    ? 'provider-assisted-edit-required'
    : ['reference-only', 'reject'].includes(work.decision)
      ? 'no-production'
      : 'deterministic-processing';
const processors = [...registry.processors].sort(
  (left, right) =>
    left.fallbackRank - right.fallbackRank || left.id.localeCompare(right.id),
);
const supportsAll = (processor) =>
  deterministicOperations.every((operation) =>
    processor.capabilities.includes(operation),
  );
const routeIsUsable = (processor) => {
  if (!supportsAll(processor)) return false;
  if (
    ['sharp-delivery-optimizer', 'sharp-exact-canvas-runtime'].includes(processor.id) &&
    (!work.deliveryProfileId || !work.background)
  ) {
    return false;
  }
  return true;
};
const preferredProcessorId = typeof work.preferredProcessorId === 'string'
  ? work.preferredProcessorId
  : null;
const usableProcessors = processors.filter(routeIsUsable);
if (preferredProcessorId && !usableProcessors.some((processor) => processor.id === preferredProcessorId)) {
  throw new Error(`preferred processor cannot satisfy the complete operation set: ${preferredProcessorId}`);
}
const orderedProcessors = preferredProcessorId
  ? [
      usableProcessors.find((processor) => processor.id === preferredProcessorId),
      ...usableProcessors.filter((processor) => processor.id !== preferredProcessorId),
    ]
  : usableProcessors;
const routes = orderedProcessors.map((processor) => ({
  processorId: processor.id,
  kind: processor.kind,
  entrypoint: processor.entrypoint,
  capabilities: deterministicOperations,
  receiptSchema: processor.receiptSchema,
  ...(processor.platforms ? { platforms: processor.platforms } : {}),
}));
if (productionDecision === 'deterministic-processing' && routes.length === 0) {
  throw new Error(
    `no single deterministic processor supports the complete operation set: ${deterministicOperations.join(', ')}`,
  );
}
const plan = {
  schema: 'evavo.image-processing-plan.v2',
  sourcePath: work.sourcePath,
  sourceSha256: work.sourceSha256,
  ...(work.sourceBytes === undefined ? {} : { sourceBytes: work.sourceBytes }),
  ...(work.targetPath === undefined ? {} : { targetPath: work.targetPath }),
  decision: work.decision,
  productionDecision,
  semanticRole: work.semanticRole,
  targetCanvas: work.targetCanvas,
  alphaPolicy: work.alphaPolicy,
  runtimeFormat: work.runtimeFormat,
  exactCanvasRequired: work.exactCanvasRequired === true,
  ...(work.deliveryProfileId === undefined
    ? {}
    : { deliveryProfileId: work.deliveryProfileId }),
  ...(work.background === undefined ? {} : { background: work.background }),
  operations,
  deterministicOperations,
  providerOperations,
  routes,
  selectedRoute: routes[0] || null,
  ...(preferredProcessorId ? { preferredProcessorId } : {}),
  processorOptions: work.processorOptions || {},
  requiredEvidence: [
    'decoded-dimensions',
    'alpha-usage',
    'before-sha256',
    'after-sha256',
    'output-byte-length',
    'processor-identity',
    'operation-list',
    'create-only-output',
  ],
  sourceOverwrite: false,
  sourceDeletion: false,
  createOnlyOutput: true,
  lossyIntermediateAllowed: false,
  providerExecution: false,
  publication: false,
  workOrderSha256: sha256(workBytes),
  registrySha256: sha256(registryBytes),
};
plan.planSha256 = sha256(canonical(plan));
await writeFile(
  path.resolve(outputPath),
  `${JSON.stringify(plan, null, 2)}\n`,
  { flag: 'wx' },
);
console.log(
  JSON.stringify({
    status: 'passed',
    productionDecision,
    routes: routes.length,
    selectedProcessor: plan.selectedRoute?.processorId ?? null,
    planSha256: plan.planSha256,
    output: path.resolve(outputPath),
  }),
);
