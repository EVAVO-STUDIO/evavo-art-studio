#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const jobSource = await readFile(
  new URL('./build-governed-workspace-job.mjs', import.meta.url),
  'utf8',
);
const webSource = await readFile(
  new URL('./compile-project-local-web-asset-delivery.mjs', import.meta.url),
  'utf8',
);
const errors = [];
for (const token of [
  'evavo.art-studio.delivery.v2',
  'evavo.governed-workspace-job.v1',
  "type: 'copy'",
  "type: 'move'",
  "type: 'delete-file'",
  'expectedOutputs',
  'executableCandidates',
  'sourceSha256',
  'expectedSha256',
  'sourceDeliverySha256',
  "flag: 'wx'",
  'must name a declared file output',
]) {
  if (!jobSource.includes(token)) errors.push(`workspace job missing contract token: ${token}`);
}
for (const token of [
  'evavo.project-local-web-asset-handoff.v1',
  'evavo.art-studio.delivery.v2',
  "publicRoot || 'public/media'",
  "asset.reviewStatus !== 'approved'",
  "asset.variant !== 'web'",
  'cloudinaryRequired: false',
  'sourceMastersPublished: false',
  "flag: 'wx'",
]) {
  if (!webSource.includes(token)) errors.push(`project-local web handoff missing contract token: ${token}`);
}
for (const [label, source] of [['workspace job', jobSource], ['project-local web handoff', webSource]]) {
  for (const forbidden of [
    'exec(',
    'shell:',
    'git push',
    '--force',
    'unlink(',
  ]) {
    if (source.includes(forbidden)) errors.push(`${label} contains forbidden execution token: ${forbidden}`);
  }
}

if (errors.length === 0) {
  const test = spawnSync(process.execPath, ['scripts/test-project-local-web-asset-handoff.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20000,
  });
  if (test.status !== 0) errors.push(`project-local web handoff execution test failed: ${(test.stderr || test.stdout).trim()}`);
}

console.log('EVAVO Art Studio governed workspace handoff');
for (const error of errors) console.log(`  - ${error}`);
if (errors.length) process.exit(1);
console.log('  contract passed');
