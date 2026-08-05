#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [reviewPath, outputPath] = process.argv.slice(2);
if (!reviewPath || !outputPath) throw new Error('usage: compile-image-reference-work-order.mjs <review.json> <output.json>');
const bytes = await readFile(path.resolve(reviewPath));
const review = JSON.parse(bytes.toString('utf8'));
if (review.schema !== 'evavo.image-reference-review.v1') throw new Error('unexpected review schema');
if (!review.sourcePath || !review.sourceSha256 || !/^[0-9a-f]{64}$/.test(review.sourceSha256)) throw new Error('exact source identity required');
const allowed = new Set(['keep','edit','recreate','generate-variation','reference-only','reject']);
if (!allowed.has(review.decision)) throw new Error('unsupported decision');
const required = ['semanticRole','targetCanvas','alphaPolicy','runtimeFormat','approvedTraits','defects','negativeConstraints'];
for (const key of required) if (review[key] === undefined) throw new Error(`missing ${key}`);
const workOrder = {
  schema: 'evavo.image-reference-work-order.v1',
  sourcePath: review.sourcePath,
  sourceSha256: review.sourceSha256,
  decision: review.decision,
  semanticRole: review.semanticRole,
  targetCanvas: review.targetCanvas,
  alphaPolicy: review.alphaPolicy,
  runtimeFormat: review.runtimeFormat,
  preserve: review.approvedTraits,
  removeOrFix: review.defects,
  negativeConstraints: review.negativeConstraints,
  operations: review.operations || [],
  comparisonRequired: ['edit','recreate','generate-variation'].includes(review.decision),
  providerExecution: false,
  sourceOverwrite: false,
  sourceDeletion: false,
  publication: false,
  reviewSha256: createHash('sha256').update(bytes).digest('hex')
};
await writeFile(path.resolve(outputPath), `${JSON.stringify(workOrder, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({status:'passed', decision:workOrder.decision, output:path.resolve(outputPath)}));
