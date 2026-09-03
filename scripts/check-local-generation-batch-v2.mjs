#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'scripts/local-generation-batch-v2.mjs',
  'scripts/run-local-generation-batch.mjs',
  'scripts/local-generation-batch-v2.test.mjs',
  'examples/local-generation-batch.template.json',
  'RUN-LOCAL-ART-BATCH.cmd',
  'docs/LOCAL_GENERATION_BATCH_V2.md',
  'apps/mcp/src/local-generation-batch-tools.ts',
];
for (const relative of required) {
  const file = path.join(root, relative);
  assert.equal(fs.existsSync(file), true, `missing ${relative}`);
  const state = fs.lstatSync(file);
  assert.equal(state.isFile(), true, `${relative} must be a file`);
  assert.equal(state.isSymbolicLink(), false, `${relative} must not be a symlink`);
  assert.ok(state.size > 0, `${relative} must not be empty`);
}
const compiler = fs.readFileSync(path.join(root, 'scripts/local-generation-batch-v2.mjs'), 'utf8');
const runner = fs.readFileSync(path.join(root, 'scripts/run-local-generation-batch.mjs'), 'utf8');
const mcp = fs.readFileSync(path.join(root, 'apps/mcp/src/local-generation-batch-tools.ts'), 'utf8');
const docs = fs.readFileSync(path.join(root, 'docs/LOCAL_GENERATION_BATCH_V2.md'), 'utf8');
for (const token of [
  'evavo.local-generation-batch.v2',
  'MAX_BATCH_SIZE = 2000',
  'LEGACY_CHUNK_SIZE = 100',
  'portrait_high_quality',
  'sprite_sheet_clean',
  'concept_art_painterly',
  'comic_inked',
  'cinematic_stills',
  'product_mockups',
  'sequential-anchor',
  'paired',
  'repair',
  'variation',
  'sprite',
  'promptSha256',
  'negativePromptSha256',
]) assert.equal(compiler.includes(token), true, `compiler lost ${token}`);
for (const token of [
  'framesNeedingRetry',
  'duplicate-hash',
  'dimension-mismatch',
  'qaCandidate',
  'materializeAccepted',
  'evavo.local-generation-batch-receipt.v2',
  'metadata',
]) assert.equal(runner.includes(token), true, `runner lost ${token}`);
for (const token of ['local_generation_batch_capabilities', 'run_local_generation_batch']) assert.equal(mcp.includes(token), true, `MCP lost ${token}`);
for (const token of ['Do not claim that a profile value affected provider pixels', 'Reference and anchor evidence', '2,000 shots']) assert.equal(docs.includes(token), true, `docs lost ${token}`);
console.log('Local generation batch v2 source contract passed.');
