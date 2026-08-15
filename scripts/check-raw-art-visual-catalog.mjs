#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'tools/raw_art_visual_catalog.py',
  'tools/raw_art_visual_catalog_mcp.mjs',
  'scripts/test_raw_art_visual_catalog.py',
  'scripts/test-raw-art-visual-catalog-mcp.mjs',
  'docs/RAW_ART_VISUAL_CATALOG.md',
  'AGENTS.md',
];

const source = {};
for (const relativePath of files) {
  const target = path.join(root, relativePath);
  assert.equal(existsSync(target), true, `missing ${relativePath}`);
  const state = lstatSync(target);
  assert.equal(state.isFile(), true, `${relativePath} must be a file`);
  assert.equal(state.isSymbolicLink(), false, `${relativePath} must not be symbolic`);
  assert.ok(state.size > 0 && state.size < 2_000_000, `${relativePath} invalid size`);
  source[relativePath] = readFileSync(target, 'utf8');
  assert.equal(source[relativePath].startsWith('\uFEFF'), false, `${relativePath} has BOM`);
  assert.equal(source[relativePath].includes('\r'), false, `${relativePath} has CRLF`);
}

const syntax = spawnSync(process.execPath, ['--check', path.join(root, 'tools/raw_art_visual_catalog_mcp.mjs')], {
  cwd: root, encoding: 'utf8', shell: false, windowsHide: true,
});
assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);

const python = process.env.EVAVO_RAW_ART_VISUAL_PYTHON || process.env.EVAVO_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const pythonTests = spawnSync(python, ['-m', 'unittest', path.join(root, 'scripts/test_raw_art_visual_catalog.py')], {
  cwd: root, encoding: 'utf8', shell: false, windowsHide: true, timeout: 120_000,
});
assert.equal(pythonTests.status, 0, pythonTests.stderr || pythonTests.stdout);

const mcpTests = spawnSync(process.execPath, ['--test', path.join(root, 'scripts/test-raw-art-visual-catalog-mcp.mjs')], {
  cwd: root, encoding: 'utf8', shell: false, windowsHide: true, timeout: 120_000,
});
assert.equal(mcpTests.status, 0, mcpTests.stderr || mcpTests.stdout);

const combined = Object.values(source).join('\n');
for (const token of [
  'evavo.raw-art-visual-catalog.v1',
  'evavo.raw-art-visual-review-workbook.v1',
  'evavo.raw-art-visual-context-inspection.v1',
  'evavo_raw_art_visual_build_catalog',
  'evavo_raw_art_visual_inspect_context',
  'evavo_raw_art_visual_verify_catalog',
  'EVAVO_RAW_ART_VISUAL_MCP_ALLOW_WRITES',
  'confirmWrite=true',
  'imageBytesFlowThroughMcp: false',
  'visualArtifactPathsReturned: true',
  'originalsReadOnly',
  'requiresOriginalInspectionBeforeSelectionOrEdit',
  'likely-owner-desired-visual-direction',
  'RAW_ART_REVIEW_WORKBOOK.json',
  'GROUP_REVIEW_QUEUE.md',
  'frameOrderAuthoritative',
  'copyWorkbookBeforeRecordingDecisions',
  'sourceMutation": False',
  'gitPush: false',
]) assert.equal(combined.includes(token), true, `lost ${token}`);

for (const forbidden of [
  'shell: true',
  'sourceMutation: true',
  'sourceDeletion: true',
  'creativeApproval: true',
  'styleApproval: true',
  'gitPush: true',
]) assert.equal(combined.includes(forbidden), false, `forbidden ${forbidden}`);

console.log('RAW_ART visual catalog contracts passed.');
console.log('- every PNG is represented in a contact-sheet review packet');
console.log('- selected originals require full-resolution inspection before edit or style use');
console.log('- owner intent, style-family triage and frame-versus-variant evidence are explicit');
console.log('- agents can hash-resolve any shortlisted item back to its full-resolution source path');
console.log('- previews are create-only derivatives outside immutable RAW_ART');
console.log('- source, approval, runtime, repository and publication authority remain false');
