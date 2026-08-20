#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAPABILITY = path.join(
  ROOT,
  'config/eva-dense-motion-source-materialization-capability-v1.json',
);
const IMPLEMENTATION = path.join(
  ROOT,
  'scripts/project-art/eva-dense-motion-source-materialization.mjs',
);
const CLI = path.join(
  ROOT,
  'scripts/run-project-art-eva-dense-motion-source-materialization.mjs',
);
const TEST = path.join(
  ROOT,
  'scripts/test-project-art-eva-dense-motion-source-materialization.mjs',
);
const WORKFLOW = path.join(
  ROOT,
  '.github/workflows/eva-dense-motion-source-materialization.yml',
);

const read = (file) => readFileSync(file, 'utf8');
const capability = JSON.parse(read(CAPABILITY));
const implementation = read(IMPLEMENTATION);
const cli = read(CLI);
const test = read(TEST);
const workflow = read(WORKFLOW);

assert.equal(
  capability.schema,
  'evavo.project-art-eva-dense-motion-source-materialization-capability.v1',
);
assert.equal(capability.protocolVersion, '1.0.0');
assert.deepEqual(capability.requiredOrdinals, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
assert.equal(capability.execution.exactTenSourceCampaign, true);
assert.equal(capability.execution.allTenSourcesPreflightBeforeFirstWrite, true);
assert.equal(capability.execution.exactRuntimeGitBlobSha1Required, true);
assert.equal(capability.execution.fullPngStructureAndCrcRequired, true);
assert.equal(capability.execution.exactSourceByteCopyOnly, true);
assert.equal(capability.execution.imageTransformationAllowed, false);
assert.equal(capability.execution.createOnly, true);
assert.equal(capability.execution.atomicCampaignPublication, true);
assert.equal(capability.execution.partialStateRejected, true);
assert.ok(
  Object.values(capability.downstreamAuthority).every((value) => value === false),
);

for (const marker of [
  'allTenSourcesPreflightBeforeFirstWrite: true',
  'exactRuntimeGitBlobSha1Verified: true',
  'fullPngChunkStructureVerified: true',
  'everyPngChunkCrcVerified: true',
  'exactSourceByteCopy: true',
  'imageTransformation: false',
  'candidateAssurance: false',
  'cloudinaryUpload: false',
  'runtimeActivation: false',
  'EVA_DENSE_SOURCE_PARTIAL_STATE_QUARANTINED',
  'EVA_DENSE_SOURCE_COMPLETED_CAMPAIGN_BYTES_INVALID',
]) {
  assert.match(implementation, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
}

for (const marker of [
  "const COMMANDS = new Set(['preflight', 'run'])",
  "'--program'",
  "'--runtime-root'",
  "'--workspace-root'",
  "'--materialized-at'",
]) {
  assert.ok(cli.includes(marker), marker);
}
assert.ok(!cli.includes('--approved'));
assert.ok(!cli.includes('--upload'));
assert.ok(!cli.includes('--activate'));

for (const marker of [
  'a bad tenth source prevents frame one from being materialized',
  'partial source-materialization output is quarantined before any new write',
  'rejects tampered replay',
  'candidateAssurancesCreated, 0',
  'cloudinaryUploadsPerformed, 0',
  'runtimeActivationsPerformed, 0',
]) {
  assert.ok(test.includes(marker), marker);
}

for (const marker of [
  'node --check scripts/project-art/eva-dense-motion-source-materialization.mjs',
  'node --test scripts/test-project-art-eva-dense-motion-source-materialization.mjs',
  'node --test scripts/test-project-art-eva-dense-motion-ten-master.mjs',
  'git diff --check',
  'git diff --exit-code',
]) {
  assert.ok(workflow.includes(marker), marker);
}

const result = {
  schema: 'evavo.project-art-eva-dense-motion-source-materialization-static-guard.v1',
  status: 'valid',
  frameCount: capability.requiredOrdinals.length,
  exactSourceByteCopy: capability.execution.exactSourceByteCopyOnly,
  downstreamAuthorityClosed: true,
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export default Object.freeze(result);
