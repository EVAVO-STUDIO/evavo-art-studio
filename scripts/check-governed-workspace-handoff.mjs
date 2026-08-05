#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import process from 'node:process';

const source = await readFile(
  new URL('./build-governed-workspace-job.mjs', import.meta.url),
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
  if (!source.includes(token)) errors.push(`missing contract token: ${token}`);
}
for (const forbidden of [
  'exec(',
  'spawn(',
  'shell:',
  'git push',
  '--force',
  'unlink(',
]) {
  if (source.includes(forbidden)) {
    errors.push(`forbidden execution token: ${forbidden}`);
  }
}
console.log('EVAVO Art Studio governed workspace handoff');
for (const error of errors) console.log(`  - ${error}`);
if (errors.length) process.exit(1);
console.log('  contract passed');
