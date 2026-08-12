#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'scripts/raw-art-folder-workbench.mjs',
  'scripts/raw-art-folder/lib.mjs',
  'scripts/raw-art-folder/scan.mjs',
  'scripts/raw-art-folder/plan.mjs',
  'scripts/raw-art-folder/session.mjs',
  'scripts/avatar-frame-catalogue.mjs',
  'tools/raw_art_folder_mcp.mjs',
  'tools/avatar_frame_catalogue_mcp.mjs',
  'scripts/test-raw-art-folder-workbench.mjs',
  'scripts/test-avatar-frame-catalogue.mjs',
  'docs/RAW_ART_FOLDER_WORKBENCH.md',
  'docs/AVATAR_FRAME_CATALOGUE.md',
  'config/mcp.raw-art-folder.windows.example.json',
  '.github/workflows/raw-art-folder-workbench.yml',
];
const source = {};
for (const rel of files) {
  const target = path.join(root, rel);
  assert.equal(existsSync(target), true, `missing ${rel}`);
  const state = lstatSync(target);
  assert.equal(state.isFile(), true, `${rel} must be a file`);
  assert.equal(state.isSymbolicLink(), false, `${rel} must not be symbolic`);
  assert.ok(state.size > 0 && state.size < 2_000_000, `${rel} invalid size`);
  source[rel] = readFileSync(target, 'utf8');
  assert.equal(source[rel].startsWith('\uFEFF'), false, `${rel} has BOM`);
  assert.equal(source[rel].includes('\r'), false, `${rel} has CRLF`);
}
for (const rel of files.filter((value) => value.endsWith('.mjs'))) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, rel)], { cwd: root, encoding: 'utf8', shell: false, windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
const combined = Object.values(source).join('\n');
for (const token of [
  'evavo.raw-art-folder-inventory.v1',
  'evavo.raw-art-folder-decisions.v1',
  'evavo.raw-art-folder-session-plan.v1',
  'evavo.raw-art-folder-session-manifest.v1',
  'evavo.avatar-frame-review-packets.v1',
  'evavo.avatar-frame-sequence-decisions.v1',
  'evavo.avatar-frame-sequence-plan.v1',
  'exactDuplicates',
  'sequenceCandidates',
  'atlasCandidates',
  'semanticInferenceAuthoritative:false',
  'filenameOrderIsMeaning: false',
  'timestampOrderIsMeaning: false',
  'explicit-owner-reviewed-order',
  'normalNonForcePublicationOnly: true',
  'copy-create-only',
  'workspaceParent and RAW_ART must remain disjoint',
  'sourceMutation:false',
  'sourceDeletion:false',
  'gitPush:false',
  'forcePush:false',
]) assert.equal(combined.includes(token), true, `lost ${token}`);

for (const token of [
  'evavo_raw_art_folder_capabilities',
  'evavo_raw_art_folder_inspect',
  'evavo_raw_art_folder_verify_session',
  'evavo_raw_art_folder_write_inventory',
  'evavo_raw_art_folder_compile_session',
  'evavo_raw_art_folder_materialize_session',
  'EVAVO_RAW_ART_FOLDER_MCP_ALLOW_WRITES',
  'confirmWrite=true',
  'bytesFlowThroughMcp:false',
]) assert.equal(source['tools/raw_art_folder_mcp.mjs'].includes(token), true, `RAW_ART MCP lost ${token}`);

for (const token of [
  'evavo_avatar_frame_capabilities',
  'evavo_avatar_frame_review_packets',
  'evavo_avatar_frame_compile_sequence_plan',
  'evavo_avatar_frame_verify_sequence_plan',
  'EVAVO_AVATAR_FRAME_ALLOWED_ROOTS',
  'imageGeneration: false',
  'imageEditing: false',
  'runtimeActivation: false',
  'bytesFlowThroughMcp: false',
]) assert.equal(source['tools/avatar_frame_catalogue_mcp.mjs'].includes(token), true, `avatar MCP lost ${token}`);

for (const command of ['avatar-review', 'avatar-plan', 'avatar-verify-plan']) {
  assert.equal(source['scripts/raw-art-folder-workbench.mjs'].includes(command), true, `workbench lost ${command}`);
}

const config = JSON.parse(source['config/mcp.raw-art-folder.windows.example.json']);
const server = config.mcpServers?.['evavo-raw-art-folder-workbench'];
assert.ok(server);
assert.equal(server.env.EVAVO_RAW_ART_FOLDER_MCP_MODE, 'read-write');
assert.equal(server.env.EVAVO_RAW_ART_FOLDER_MCP_ALLOW_WRITES, 'true');
for (const token of ['contents: read', 'persist-credentials: false', 'scripts/raw-art-folder/**', 'node scripts/check-raw-art-folder-workbench.mjs']) {
  assert.equal(source['.github/workflows/raw-art-folder-workbench.yml'].includes(token), true, `workflow lost ${token}`);
}
for (const forbidden of ['shell: true', 'git push', '--force-with-lease', 'contents: write', 'pull-requests: write', 'sourceDeletion:true', 'sourceMutation:true', 'creativeApproval:true', 'semanticInferenceAuthoritative:true']) {
  assert.equal(combined.includes(forbidden), false, `forbidden ${forbidden}`);
}

const tests = spawnSync(process.execPath, ['--test', path.join(root, 'scripts/test-raw-art-folder-workbench.mjs'), path.join(root, 'scripts/test-avatar-frame-catalogue.mjs')], {
  cwd: root,
  encoding: 'utf8',
  shell: false,
  windowsHide: true,
  timeout: 120_000,
});
assert.equal(tests.status, 0, tests.stderr || tests.stdout);

console.log('RAW_ART folder and avatar frame catalogue contracts passed.');
console.log('- exact recursive inventory, duplicate, sequence and atlas grouping passed');
console.log('- avatar filename and timestamp hints remain non-semantic until explicit owner-reviewed sequence decisions');
console.log('- deterministic frame holds, destinations, Storage paths and repository targets are plan-only');
console.log('- reviewed decisions, create-only materialisation and independent verification passed');
console.log('- source mutation, image generation/editing, Storage, repository, Git, publication and runtime activation authority remain false');
