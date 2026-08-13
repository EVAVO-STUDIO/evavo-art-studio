#!/usr/bin/env node
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'scripts/project-art/avatar-final-pass-provider-frame-finisher.mjs',
  'scripts/avatar-final-pass-provider-frame-finisher-cli.mjs',
  'tools/project_art_avatar_final_pass_provider_frame_finisher_mcp.mjs',
  'scripts/test-project-art-avatar-final-pass-provider-frame-finisher.mjs',
  'scripts/test-project-art-avatar-final-pass-provider-frame-finisher-mcp.mjs',
  'docs/PROJECT_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER.md',
];
const content = new Map();
for (const relative of files) {
  const absolute = path.join(root, relative);
  const metadata = lstatSync(absolute);
  assert.equal(metadata.isFile(), true, `${relative} must be a file`);
  assert.equal(metadata.isSymbolicLink(), false, `${relative} must not be symbolic`);
  assert.equal(metadata.nlink, 1, `${relative} must be single-link`);
  assert.ok(metadata.size > 0 && metadata.size < 8_000_000, `${relative} has invalid size`);
  const source = readFileSync(absolute, 'utf8');
  assert.equal(source.startsWith('\uFEFF'), false, `${relative} has a BOM`);
  assert.equal(source.includes('\r'), false, `${relative} must use LF line endings`);
  assert.equal(source.endsWith('\n'), true, `${relative} needs a final newline`);
  content.set(relative, source);
}

const core = content.get('scripts/project-art/avatar-final-pass-provider-frame-finisher.mjs');
for (const token of [
  '2026-08-13.3',
  'frame-finished-awaiting-human-review',
  'final-frame-admitted',
  'frame-repair-required',
  'frame-rejected',
  'hiddenRgbTransparentPixels',
  'visiblePixelSha256',
  'alphaSha256',
  'approve-final-frame',
  'actorClass === \'human\'',
  'dependentInbetweenEndpointAllowed',
  'sequenceDraftUseAllowed',
  'sequenceReleaseAllowed: false',
  'runtimeActivationAllowed: false',
  'visiblePixelMutation: false',
  'alphaMutation: false',
  'forcePush: false',
]) {
  assert.equal(core.includes(token), true, `core is missing ${token}`);
}
for (const forbidden of [
  'node:child_process',
  'execSync(',
  'spawnSync(',
  'shell: true',
  'candidatePromotion: true',
  'runtimeActivationAllowed: true',
  'forcePush: true',
]) {
  assert.equal(core.includes(forbidden), false, `core contains forbidden ${forbidden}`);
}

const mcp = content.get('tools/project_art_avatar_final_pass_provider_frame_finisher_mcp.mjs');
for (const token of [
  'evavo_art_avatar_final_pass_provider_frame_finisher_capabilities',
  'evavo_art_finish_avatar_final_pass_provider_candidate',
  'evavo_art_review_avatar_final_pass_provider_frame',
  'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_ROOTS',
  'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_MCP_ALLOW_WRITE',
  'visiblePixelMutation: false',
  'creativeApproval: false',
  'sequenceReleaseAllowed: false',
  'runtimeActivationAllowed: false',
]) {
  assert.equal(mcp.includes(token), true, `MCP is missing ${token}`);
}
assert.equal(mcp.includes('node:child_process'), false);
assert.equal(mcp.includes('shell:'), false);

const docs = content.get('docs/PROJECT_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER.md');
for (const token of [
  'visible pixels',
  'hidden RGB',
  'named-human',
  'hands and anatomy',
  'final-frame-admitted',
  'dependent in-between',
  'sequence release',
  'runtime activation',
]) {
  assert.equal(docs.toLowerCase().includes(token.toLowerCase()), true, `docs are missing ${token}`);
}

console.log('Project Art avatar provider frame-finisher static guard passed.');
console.log('- strict 8-bit RGBA PNG decoding and canonical re-encoding are required');
console.log('- only hidden RGB beneath alpha-zero pixels may change automatically');
console.log('- named-human art, anatomy, identity and continuity review admits the final hash');
console.log('- repair and reject outcomes remain outside in-between and sequence admission');
console.log('- sequence release, repository publication and runtime activation remain separate');
