#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'scripts/local-generation-batch-v2.mjs',
  'scripts/run-local-generation-batch.mjs',
  'scripts/run-local-art-batch-managed.mjs',
  'scripts/run-local-art-batch-entry.mjs',
  'scripts/local-generation-batch-v2.test.mjs',
  'scripts/local-generation-batch-audit-v2.mjs',
  'scripts/local-generation-batch-audit-v2.test.mjs',
  'scripts/compile-comfyui-quality-profile-draft.mjs',
  'scripts/compile-comfyui-quality-profile-draft.test.mjs',
  'scripts/decompile-comfyui-workflow-catalog.mjs',
  'scripts/compile-comfyui-quality-catalog.mjs',
  'scripts/local-generation-reference-graph-v2.mjs',
  'scripts/local-generation-reference-graph-v2.test.mjs',
  'scripts/local-generation-model-plan-v2.mjs',
  'scripts/local-generation-model-plan-v2.test.mjs',
  'schemas/local-generation-batch.v2.schema.json',
  'config/local-generation-quality-profiles.v2.json',
  'examples/local-generation-batch.template.json',
  'examples/local-generation-batch.sprite-family.json',
  'RUN-LOCAL-ART-BATCH.cmd',
  'docs/LOCAL_GENERATION_BATCH_V2.md',
  'docs/LOCAL_GENERATION_QUALITY_AND_CONTINUITY.md',
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

for (const relative of [
  'scripts/local-generation-batch-v2.mjs',
  'scripts/run-local-generation-batch.mjs',
  'scripts/run-local-art-batch-managed.mjs',
  'scripts/run-local-art-batch-entry.mjs',
  'scripts/local-generation-batch-audit-v2.mjs',
  'scripts/compile-comfyui-quality-profile-draft.mjs',
  'scripts/decompile-comfyui-workflow-catalog.mjs',
  'scripts/compile-comfyui-quality-catalog.mjs',
  'scripts/local-generation-reference-graph-v2.mjs',
  'scripts/local-generation-model-plan-v2.mjs',
]) {
  const check = spawnSync(process.execPath, ['--check', path.join(root, relative)], { cwd: root, encoding: 'utf8', shell: false, windowsHide: true });
  assert.equal(check.status, 0, check.stderr || check.stdout || `${relative} syntax check failed`);
}

const compiler = fs.readFileSync(path.join(root, 'scripts/local-generation-batch-v2.mjs'), 'utf8');
const runner = fs.readFileSync(path.join(root, 'scripts/run-local-generation-batch.mjs'), 'utf8');
const managed = fs.readFileSync(path.join(root, 'scripts/run-local-art-batch-managed.mjs'), 'utf8');
const entry = fs.readFileSync(path.join(root, 'scripts/run-local-art-batch-entry.mjs'), 'utf8');
const audit = fs.readFileSync(path.join(root, 'scripts/local-generation-batch-audit-v2.mjs'), 'utf8');
const cmd = fs.readFileSync(path.join(root, 'RUN-LOCAL-ART-BATCH.cmd'), 'utf8');
const mcp = fs.readFileSync(path.join(root, 'apps/mcp/src/local-generation-batch-tools.ts'), 'utf8');
const docs = fs.readFileSync(path.join(root, 'docs/LOCAL_GENERATION_BATCH_V2.md'), 'utf8');
const continuityDocs = fs.readFileSync(path.join(root, 'docs/LOCAL_GENERATION_QUALITY_AND_CONTINUITY.md'), 'utf8');
const referenceGraph = fs.readFileSync(path.join(root, 'scripts/local-generation-reference-graph-v2.mjs'), 'utf8');
const modelPlan = fs.readFileSync(path.join(root, 'scripts/local-generation-model-plan-v2.mjs'), 'utf8');
const qualityCompiler = fs.readFileSync(path.join(root, 'scripts/compile-comfyui-quality-profile-draft.mjs'), 'utf8');
const qualityCatalogCompiler = fs.readFileSync(path.join(root, 'scripts/compile-comfyui-quality-catalog.mjs'), 'utf8');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/local-generation-batch.v2.schema.json'), 'utf8'));
const qualityProfiles = JSON.parse(fs.readFileSync(path.join(root, 'config/local-generation-quality-profiles.v2.json'), 'utf8'));

for (const token of [
  'evavo.local-generation-batch.v2', 'MAX_BATCH_SIZE = 2000', 'LEGACY_CHUNK_SIZE = 100',
  'portrait_high_quality', 'sprite_sheet_clean', 'concept_art_painterly', 'comic_inked', 'cinematic_stills', 'product_mockups',
  'sequential-anchor', 'paired', 'repair', 'variation', 'sprite', 'promptSha256', 'negativePromptSha256',
]) assert.equal(compiler.includes(token), true, `compiler lost ${token}`);

for (const token of ['framesNeedingRetry', 'duplicate-hash', 'dimension-mismatch', 'qaCandidate', 'materializeAccepted', 'evavo.local-generation-batch-receipt.v2', 'metadata', 'webpDimensions']) {
  assert.equal(runner.includes(token), true, `runner lost ${token}`);
}
for (const token of ['sqlite:///:memory:', '--disable-all-custom-nodes', '--disable-api-nodes', 'CheckpointLoaderSimple', 'KSampler', 'portFree', 'stopProcess']) {
  assert.equal(managed.includes(token), true, `managed launcher lost ${token}`);
}
for (const token of ['manifest.source.json', 'manifest.execution.json', 'prompt-plan-audit.json', 'provider-selection.json', 'qualityAdapter', 'catalogPath', 'adapterId', 'run-local-art-batch-managed.mjs']) {
  assert.equal(entry.includes(token), true, `managed entry lost ${token}`);
}
for (const token of ['generic-ai-filler', 'low-shot-specificity', 'duplicate-shot-prompt', 'identity-layer-drift', 'campaign-prompt-collapse']) {
  assert.equal(audit.includes(token), true, `prompt audit lost ${token}`);
}
assert.equal(cmd.includes('run-local-art-batch-entry.mjs'), true, 'CMD launcher no longer uses managed entrypoint');

for (const token of ['local_generation_batch_capabilities', 'run_local_generation_batch', 'managedComfyUiLifecycle', 'run-local-art-batch-entry.mjs']) {
  assert.equal(mcp.includes(token), true, `MCP lost ${token}`);
}
for (const token of ['Do not claim that a profile value affected provider pixels', 'Reference and anchor evidence', '2,000 shots']) {
  assert.equal(docs.includes(token), true, `docs lost ${token}`);
}
for (const token of ['canonical-identity', 'previous-key-pose', 'pose-control']) {
  assert.equal(referenceGraph.includes(token), true, `reference graph lost ${token}`);
}
for (const token of ['loras', "createHash('sha256')", 'reviewed provider profile']) {
  assert.equal(modelPlan.toLowerCase().includes(token.toLowerCase()), true, `model plan lost ${token}`);
}
for (const token of ['KSampler', 'sampler_name', 'scheduler', 'denoise', 'safeVersion']) {
  assert.equal(qualityCompiler.includes(token), true, `quality compiler lost ${token}`);
}
for (const token of ['decompile-comfyui-workflow-catalog.mjs', 'compile-comfyui-workflow-catalog.mjs', 'qualityProfiles']) {
  assert.equal(qualityCatalogCompiler.includes(token), true, `quality catalog compiler lost ${token}`);
}
assert.equal(schema.$id?.includes('local-generation-batch.v2'), true, 'JSON schema lost v2 identity');
assert.equal(qualityProfiles.schema, 'evavo.local-generation-quality-profiles.v2', 'quality profile document schema drifted');
for (const name of ['portrait_high_quality', 'sprite_sheet_clean', 'concept_art_painterly', 'comic_inked', 'cinematic_stills', 'product_mockups']) {
  assert.ok(qualityProfiles.profiles?.[name], `quality profile missing ${name}`);
}
for (const token of ['workflow-baked', 'artifact-conditioned', 'prompt-only', 'LoRA']) {
  assert.equal(continuityDocs.includes(token), true, `quality/continuity docs lost ${token}`);
}
console.log('Local generation batch v2 source contract passed.');
