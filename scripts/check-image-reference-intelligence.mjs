#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const policy = JSON.parse(
  await readFile(
    new URL('../config/image-reference-intelligence.v1.json', import.meta.url),
    'utf8',
  ),
);
const source = await readFile(
  new URL('./compile-image-reference-work-order.mjs', import.meta.url),
  'utf8',
);
const errors = [];
if (policy.schema !== 'evavo.image-reference-intelligence.v1') {
  errors.push('wrong policy identity');
}
for (const decision of [
  'keep',
  'edit',
  'recreate',
  'generate-variation',
  'reference-only',
  'reject',
]) {
  if (!policy.decisions.includes(decision)) errors.push(`missing ${decision}`);
}
for (const token of [
  'evavo.image-reference-work-order.v2',
  'sourceSha256',
  'sourceBytes',
  'targetPath',
  'approvedTraits',
  'defects',
  'negativeConstraints',
  'exactCanvasRequired',
  'deliveryProfileId',
  'background',
  'assignment',
  'approvals',
  'workOrderSha256',
  'comparisonRequired',
  'providerExecution: false',
  'sourceOverwrite: false',
  'sourceDeletion: false',
  'publication: false',
]) {
  if (!source.includes(token)) errors.push(`missing ${token}`);
}
for (const forbidden of [
  'child_process',
  'spawn(',
  'exec(',
  'git push',
  'rm(',
]) {
  if (source.includes(forbidden)) errors.push(`forbidden ${forbidden}`);
}
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}
console.log('image reference intelligence contract passed');
