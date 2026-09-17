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
const PNG_STRUCTURE = path.join(
  ROOT,
  'scripts/project-art/png-structure-v1.mjs',
);
const SOURCE_PREFLIGHT = path.join(
  ROOT,
  'scripts/project-art/eva-dense-motion-source-preflight.mjs',
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
const PNG_TEST = path.join(
  ROOT,
  'scripts/test-project-art-png-structure-v1.mjs',
);
const WORKFLOW = path.join(
  ROOT,
  '.github/workflows/eva-dense-motion-source-materialization.yml',
);

const read = (file) => readFileSync(file, 'utf8');
const capability = JSON.parse(read(CAPABILITY));
const pngStructure = read(PNG_STRUCTURE);
const sourcePreflight = read(SOURCE_PREFLIGHT);
const implementation = read(IMPLEMENTATION);
const cli = read(CLI);
const test = read(TEST);
const pngTest = read(PNG_TEST);
const workflow = read(WORKFLOW);

assert.equal(
  capability.schema,
  'evavo.project-art-eva-dense-motion-source-materialization-capability.v1',
);
assert.equal(capability.protocolVersion, '1.0.0');
assert.deepEqual(capability.requiredOrdinals, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
assert.equal(
  capability.pngStructureValidator,
  'scripts/project-art/png-structure-v1.mjs',
);
assert.equal(
  capability.pngStructureTest,
  'scripts/test-project-art-png-structure-v1.mjs',
);
assert.equal(capability.execution.exactTenSourceCampaign, true);
assert.equal(capability.execution.allTenSourcesPreflightBeforeFirstWrite, true);
assert.equal(capability.execution.exactRuntimeGitBlobSha1Required, true);
assert.equal(capability.execution.fullPngStructureAndCrcRequired, true);
assert.equal(capability.execution.idatInflateRequired, true);
assert.equal(capability.execution.scanlineReconstructionRequired, true);
assert.equal(capability.execution.decodedPixelStatisticsRequired, true);
assert.equal(capability.execution.nonInterlacedRequired, true);
assert.equal(capability.execution.noTrailingBytesRequired, true);
assert.equal(capability.execution.exactSourceByteCopyOnly, true);
assert.equal(capability.execution.imageTransformationAllowed, false);
assert.equal(capability.execution.createOnly, true);
assert.equal(capability.execution.atomicCampaignPublication, true);
assert.equal(capability.execution.partialStateRejected, true);
assert.ok(
  Object.values(capability.downstreamAuthority).every((value) => value === false),
);

for (const marker of [
  "import { inflateSync } from 'node:zlib'",
  'export function pngCrc32',
  'fullPngChunkStructureVerified: true',
  'everyPngChunkCrcVerified: true',
  'idatDecodeVerified: true',
  'scanlineFiltersVerified: true',
  'pixelReconstructionVerified: true',
  'noTrailingBytesVerified: true',
  "'CHUNK_CRC_INVALID'",
  "'IDAT_DECODE_INVALID'",
  "'SCANLINE_FILTER_INVALID'",
  "'INTERLACE_UNSUPPORTED'",
  "'TRAILING_BYTES'",
]) {
  assert.ok(pngStructure.includes(marker), marker);
}

for (const marker of [
  "import { inspectPngStructure } from './png-structure-v1.mjs'",
  "errorPrefix: 'EVA_DENSE_SOURCE_PNG'",
  'fullPngStructureAndCrcVerified: true',
  'idatDecodeVerified: true',
  'scanlineReconstructionVerified: true',
  'decodedPixelStatisticsRecorded: true',
  'nonInterlacedVerified: true',
  'noTrailingBytesVerified: true',
  'everyPngChunkCrcVerification: true',
  'pixelReconstructionVerification: true',
]) {
  assert.ok(sourcePreflight.includes(marker), marker);
}

for (const marker of [
  'allTenSourcesPreflightBeforeFirstWrite: true',
  'exactGitBlobIdentityRequired: true',
  'byteForByteWorkspaceCopy: true',
  'candidateCreation: false',
  'cloudinaryUpload: false',
  'runtimeActivation: false',
  'EVA_DENSE_SOURCE_MATERIALIZATION_PARTIAL_FRAME_QUARANTINED',
  'EVA_DENSE_SOURCE_MATERIALIZATION_COMPLETED_SOURCE_INVALID',
]) {
  assert.ok(implementation.includes(marker), marker);
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
  'fully decoded source frame bundle',
  'fullPngChunkStructureVerified',
  'everyPngChunkCrcVerified',
  'structurally invalid PNG bytes',
  'candidateCreationAllowed, false',
  'capabilities.cloudinaryUpload, false',
  'capabilities.runtimeActivation, false',
]) {
  assert.ok(test.includes(marker), marker);
}

for (const marker of [
  'fully parses, CRC-checks, inflates and reconstructs all five scanline filters',
  'rejects a corrupted chunk CRC',
  'rejects trailing bytes after IEND',
  'rejects an invalid scanline filter',
  'rejects interlaced sources',
  'rejects non-contiguous IDAT chunks',
]) {
  assert.ok(pngTest.includes(marker), marker);
}

for (const marker of [
  'node --check scripts/project-art/png-structure-v1.mjs',
  'node --check scripts/project-art/eva-dense-motion-source-materialization.mjs',
  'node --test scripts/test-project-art-png-structure-v1.mjs',
  'node --test scripts/test-project-art-eva-dense-motion-ten-master.mjs',
  'git diff --check',
  'git diff --exit-code',
]) {
  assert.ok(workflow.includes(marker), marker);
}

const result = {
  schema: 'evavo.project-art-eva-dense-motion-source-materialization-static-guard.v2',
  status: 'valid',
  frameCount: capability.requiredOrdinals.length,
  pngValidation: Object.freeze({
    chunkStructure: true,
    chunkCrc: true,
    idatInflate: true,
    scanlineReconstruction: true,
    decodedPixelStatistics: true,
    nonInterlaced: true,
    noTrailingBytes: true,
  }),
  exactSourceByteCopy: capability.execution.exactSourceByteCopyOnly,
  downstreamAuthorityClosed: true,
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export default Object.freeze(result);
