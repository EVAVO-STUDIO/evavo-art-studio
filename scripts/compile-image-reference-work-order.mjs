#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [reviewPath, outputPath] = process.argv.slice(2);
if (!reviewPath || !outputPath) {
  throw new Error(
    'usage: compile-image-reference-work-order.mjs <review.json> <output.json>',
  );
}
const bytes = await readFile(path.resolve(reviewPath));
const review = JSON.parse(bytes.toString('utf8'));
if (review.schema !== 'evavo.image-reference-review.v1') {
  throw new Error('unexpected review schema');
}
const canonicalPath = (value, label) => {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\')) {
    throw new Error(`${label} must be a non-empty forward-slash relative path`);
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized !== value ||
    normalized === '.' ||
    normalized.startsWith('/') ||
    normalized === '..' ||
    normalized.startsWith('../')
  ) {
    throw new Error(`${label} is not canonical and repository relative`);
  }
  return value;
};
const sourcePath = canonicalPath(review.sourcePath, 'sourcePath');
if (!review.sourceSha256 || !/^[0-9a-f]{64}$/u.test(review.sourceSha256)) {
  throw new Error('exact source identity required');
}
if (
  review.sourceBytes !== undefined &&
  (!Number.isSafeInteger(review.sourceBytes) || review.sourceBytes < 1)
) {
  throw new Error('sourceBytes must be a positive safe integer');
}
const allowed = new Set([
  'keep',
  'edit',
  'recreate',
  'generate-variation',
  'reference-only',
  'reject',
]);
if (!allowed.has(review.decision)) throw new Error('unsupported decision');
const required = [
  'semanticRole',
  'targetCanvas',
  'alphaPolicy',
  'runtimeFormat',
  'approvedTraits',
  'defects',
  'negativeConstraints',
];
for (const key of required) {
  if (review[key] === undefined) throw new Error(`missing ${key}`);
}
if (
  !review.targetCanvas ||
  !Number.isSafeInteger(review.targetCanvas.width) ||
  !Number.isSafeInteger(review.targetCanvas.height) ||
  review.targetCanvas.width < 1 ||
  review.targetCanvas.height < 1
) {
  throw new Error('targetCanvas must contain positive integer width and height');
}
for (const key of ['approvedTraits', 'defects', 'negativeConstraints']) {
  if (!Array.isArray(review[key]) || review[key].some((value) => typeof value !== 'string')) {
    throw new Error(`${key} must be an array of strings`);
  }
}
const operations = Array.isArray(review.operations) ? review.operations : [];
if (operations.some((value) => typeof value !== 'string')) {
  throw new Error('operations must be an array of strings');
}
const workOrder = {
  schema: 'evavo.image-reference-work-order.v2',
  sourcePath,
  sourceSha256: review.sourceSha256,
  ...(review.sourceBytes === undefined ? {} : { sourceBytes: review.sourceBytes }),
  ...(review.targetPath === undefined
    ? {}
    : { targetPath: canonicalPath(review.targetPath, 'targetPath') }),
  decision: review.decision,
  semanticRole: review.semanticRole,
  targetCanvas: review.targetCanvas,
  alphaPolicy: review.alphaPolicy,
  runtimeFormat: review.runtimeFormat,
  preserve: review.approvedTraits,
  removeOrFix: review.defects,
  negativeConstraints: review.negativeConstraints,
  operations,
  ...(review.preferredProcessorId === undefined
    ? {}
    : { preferredProcessorId: review.preferredProcessorId }),
  processorOptions: review.processorOptions || {},
  exactCanvasRequired: review.exactCanvasRequired === true,
  ...(review.deliveryProfileId === undefined
    ? {}
    : { deliveryProfileId: review.deliveryProfileId }),
  ...(review.background === undefined ? {} : { background: review.background }),
  assignment: review.assignment || null,
  styleScope: review.styleScope || null,
  provenance: review.provenance || null,
  approvals: review.approvals || {
    creative: false,
    historical: false,
    provenance: false,
  },
  comparisonRequired: ['edit', 'recreate', 'generate-variation'].includes(
    review.decision,
  ),
  providerExecution: false,
  sourceOverwrite: false,
  sourceDeletion: false,
  publication: false,
  reviewSha256: createHash('sha256').update(bytes).digest('hex'),
};
const canonical = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
};
workOrder.workOrderSha256 = createHash('sha256').update(canonical(workOrder)).digest('hex');
await writeFile(
  path.resolve(outputPath),
  `${JSON.stringify(workOrder, null, 2)}\n`,
  { flag: 'wx' },
);
console.log(
  JSON.stringify({
    status: 'passed',
    decision: workOrder.decision,
    output: path.resolve(outputPath),
  }),
);
