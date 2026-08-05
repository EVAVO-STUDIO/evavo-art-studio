#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import process from 'node:process';

const policy = JSON.parse(
  await readFile(
    new URL('../config/raw-art-production-orchestrator.v1.json', import.meta.url),
    'utf8',
  ),
);
const queue = await readFile(
  new URL('./compile-raw-art-production-queue.mjs', import.meta.url),
  'utf8',
);
const workspace = await readFile(
  new URL('./compile-raw-art-workspace-job.mjs', import.meta.url),
  'utf8',
);
const style = await readFile(
  new URL('./build-approved-style-profile.mjs', import.meta.url),
  'utf8',
);
const errors = [];
if (policy.schema !== 'evavo.raw-art-production-orchestrator.v2') {
  errors.push('orchestrator identity changed');
}
for (const state of [
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
]) {
  if (!policy.states.includes(state) || !queue.includes(`'${state}'`)) {
    errors.push(`missing queue state ${state}`);
  }
}
for (const token of [
  'evavo.raw-art-production-queue.v2',
  'receiptCannotBypassReviewDecision',
  'target path collision',
  'decoded-dimensions-and-source-byte-length-are-required',
  'exact-source-target-and-output-receipt-present',
  'resumableBySourceSha256AndTargetPath',
  'queueSha256',
]) {
  if (!queue.includes(token)) errors.push(`queue compiler lost ${token}`);
}
for (const token of [
  'evavo.governed-workspace-job.v1',
  'sharp-delivery-optimizer',
  'sharp-exact-canvas-runtime',
  'python-pillow-fallback',
  'run_art_delivery_optimizer.py',
  'process_image_with_sharp.mjs',
  'process_image_with_pillow.py',
  "type: 'run-node'",
  'executableCandidates',
  "kind: 'directory'",
  'minimumFiles',
  'sourceQueueSha256',
  'stagingOnly: true',
]) {
  if (!workspace.includes(token)) errors.push(`workspace compiler lost ${token}`);
}
for (const token of [
  'evavo.approved-style-reference-profile.v2',
  'duplicate style exemplar SHA-256',
  'approvedTraits',
  'knownDefectsToAvoid',
  'negativeConstraints',
  'approvalEvidence',
  'metadataReferenceOnly: true',
  'modelTrainingPerformed: false',
  'profileSha256',
]) {
  if (!style.includes(token)) errors.push(`style compiler lost ${token}`);
}
for (const source of [queue, workspace, style]) {
  for (const forbidden of [
    'child_process',
    'spawn(',
    'exec(',
    'git push',
    'sourceDeletion: true',
    'providerExecution: true',
    'publication: true',
  ]) {
    if (source.includes(forbidden)) errors.push(`orchestrator contains forbidden ${forbidden}`);
  }
}
if (
  policy.execution.sourceMutation !== false ||
  policy.execution.sourceDeletion !== false ||
  policy.execution.targetRepositoryMutation !== false ||
  policy.execution.providerExecution !== false ||
  policy.execution.publication !== false ||
  policy.execution.receiptCannotBypassReviewDecision !== true ||
  policy.execution.stagingOnly !== true
) {
  errors.push('orchestrator authority boundary changed');
}
if (
  policy.styleLearning.metadataOnly !== true ||
  policy.styleLearning.modelTrainingClaimed !== false ||
  policy.styleLearning.duplicateExemplarsRejected !== true
) {
  errors.push('style-learning truth boundary changed');
}
console.log('EVAVO RAW_ART production orchestrator');
for (const error of errors) console.log(`  - ${error}`);
if (errors.length) process.exit(1);
console.log('  contract passed');
