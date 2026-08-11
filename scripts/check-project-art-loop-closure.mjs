#!/usr/bin/env node

import {
  lstatSync,
  readFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const MAXIMUM_SOURCE_BYTES = 2 * 1024 * 1024;
const CONFLICT_MARKER = /^(?:<<<<<<<|=======|>>>>>>>)(?: |$)/mu;
const files = Object.freeze({
  compiler: 'scripts/compile-project-art-loop-closure.mjs',
  runtime: 'tools/run_project_art_loop_closure.py',
  tests: 'scripts/test-project-art-loop-closure.mjs',
  documentation: 'docs/PROJECT_ART_LOOP_CLOSURE.md',
  workflow: '.github/workflows/project-art-workbench.yml',
  package: 'package.json',
});

function snapshot(metadata) {
  return {
    mode: metadata.mode,
    device: metadata.dev,
    inode: metadata.ino,
    links: metadata.nlink,
    size: metadata.size,
    modifiedMs: metadata.mtimeMs,
    changedMs: metadata.ctimeMs,
  };
}

function sameSnapshot(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key]);
}

function read(relative) {
  const absolute = path.join(root, relative);
  let before;
  try {
    before = lstatSync(absolute);
  } catch {
    errors.push(`Missing Project Art loop-closure file: ${relative}`);
    return '';
  }
  if (
    before.isSymbolicLink() ||
    !before.isFile() ||
    before.nlink !== 1 ||
    before.size < 1 ||
    before.size > MAXIMUM_SOURCE_BYTES
  ) {
    errors.push(`Unsafe Project Art loop-closure file: ${relative}`);
    return '';
  }
  const beforeSnapshot = snapshot(before);
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  if (!sameSnapshot(beforeSnapshot, snapshot(after))) {
    errors.push(`Project Art loop-closure file changed during read: ${relative}`);
    return '';
  }
  let source;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    errors.push(`Project Art loop-closure file is not valid UTF-8: ${relative}`);
    return '';
  }
  if (source.startsWith('\uFEFF')) {
    errors.push(`Project Art loop-closure file has a UTF-8 BOM: ${relative}`);
  }
  if (CONFLICT_MARKER.test(source)) {
    errors.push(`Project Art loop-closure file has a conflict marker: ${relative}`);
  }
  return source;
}

function count(source, token) {
  return source.split(token).length - 1;
}

function requireTokens(label, source, tokens) {
  for (const token of tokens) {
    if (!source.includes(token)) errors.push(`${label} is missing: ${token}`);
  }
}

function forbidTokens(label, source, tokens) {
  for (const token of tokens) {
    if (source.includes(token)) errors.push(`${label} contains forbidden material: ${token}`);
  }
}

const source = Object.fromEntries(
  Object.entries(files).map(([key, value]) => [key, read(value)]),
);

requireTokens('Loop-closure compiler', source.compiler, [
  'evavo.project-art-loop-closure-request.v1',
  'evavo.project-art-loop-closure-plan.v1',
  'compileProjectArtLoopClosure',
  'fromFrameIndex: frames.length - 1',
  'toFrameIndex: 0',
  'identicalClosureAccepted: true',
  'PROJECT_ART_LOOP_CLOSURE_SOURCE_HASH_MISMATCH',
  'PROJECT_ART_LOOP_CLOSURE_REQUEST_INVALID',
  'PROJECT_ART_LOOP_CLOSURE_REQUEST_BYTES_MISMATCH',
  'canonicalJson(requestFromBytes) !== canonicalJson(request)',
  'requestSha256: hashBytes(requestBytes)',
  'PROJECT_ART_LOOP_CLOSURE_PATH_SYMLINK',
  'PROJECT_ART_LOOP_CLOSURE_DIMENSION_DRIFT',
  'PROJECT_ART_LOOP_CLOSURE_PIXEL_BUDGET_EXCEEDED',
  'sourceHashesRevalidatedBeforeExecution: true',
  'sourceHashesRevalidatedAfterExecution: true',
  'wholeRunAtomicPublication: true',
  'requiresExplicitExecution: true',
]);
forbidTokens('Loop-closure compiler', source.compiler, [
  'fetch(',
  'process.env',
  'child_process',
  'git push',
  'git commit',
  'force: true',
  'providerExecution: true',
  'targetRepositoryMutation: true',
]);

requireTokens('Loop-closure runtime', source.runtime, [
  'evavo.project-art-loop-closure-review.v1',
  'evavo.project-art-loop-closure-receipt.v1',
  'loop-closure-excessive-frame-change',
  'loop-closure-mean-channel-delta-exceeded',
  'loop-closure-alpha-change-exceeded',
  'loop-closure-centroid-shift-exceeded',
  'PROJECT_ART_LOOP_CLOSURE_LIMIT_DRIFT',
  'identicalClosureAccepted',
  'difference.png',
  'overlay.png',
  'onion-skin.png',
  'os.O_EXCL',
  'os.replace(staging, output)',
  'sourceHashesRevalidatedBeforeExecution',
  'sourceHashesRevalidatedAfterExecution',
  'wholeRunAtomicPublication',
  'creativeApprovalPerformed',
  'runtimeApprovalPerformed',
]);
forbidTokens('Loop-closure runtime', source.runtime, [
  'import requests',
  'import urllib',
  'import subprocess',
  'os.system(',
  'shell=True',
  'git push',
  'git commit',
  'providerExecution": true',
  'targetRepositoryMutation": true',
]);

requireTokens('Loop-closure adversarial tests', source.tests, [
  'Project Art loop-closure tests passed.',
  'identical first/last closure is accepted',
  'loop-closure-excessive-frame-change',
  'loop-closure-centroid-shift-exceeded',
  'PROJECT_ART_LOOP_CLOSURE_REQUEST_BYTES_MISMATCH',
  'different-request-bytes',
  'PROJECT_ART_LOOP_CLOSURE_SOURCE_IDENTITY_MISMATCH',
  'PROJECT_ART_LOOP_CLOSURE_FRAME_COUNT_INVALID',
  'PROJECT_ART_LOOP_CLOSURE_AUTHORITY_INVALID',
  'PROJECT_ART_LOOP_CLOSURE_SOURCE_HASH_MISMATCH',
  'PROJECT_ART_LOOP_CLOSURE_REQUEST_INVALID',
  'PROJECT_ART_LOOP_CLOSURE_LIMIT_DRIFT',
  'PROJECT_ART_LOOP_CLOSURE_PATH_SYMLINK',
]);

requireTokens('Loop-closure documentation', source.documentation, [
  '# Project Art loop-closure review',
  'final frame back to frame zero',
  'Exact identical endpoints are valid',
  'request bytes',
  'maximumChangedFraction',
  'maximumMeanChannelDelta',
  'maximumAlphaChangedFraction',
  'maximumCentroidShiftPixels',
  'difference.png',
  'overlay.png',
  'onion-skin.png',
  'No creative approval',
  'No source, provider, repository, Git, deployment or publication authority',
]);

const workflowPaths = [
  'scripts/compile-project-art-loop-closure.mjs',
  'scripts/check-project-art-loop-closure.mjs',
  'scripts/test-project-art-loop-closure.mjs',
  'tools/run_project_art_loop_closure.py',
  'docs/PROJECT_ART_LOOP_CLOSURE.md',
];
for (const workflowPath of workflowPaths) {
  const token = `- "${workflowPath}"`;
  if (count(source.workflow, token) !== 2) {
    errors.push(
      `Project Art workflow must trigger on pull_request and main push for ${workflowPath}`,
    );
  }
}
requireTokens('Project Art workflow loop boundary', source.workflow, [
  'Run final-to-first loop-closure adversary',
  'pnpm run project-art:loop:check',
  "grep -F 'evavo.project-art-loop-closure-plan.v1' scripts/compile-project-art-loop-closure.mjs",
  "grep -F 'PROJECT_ART_LOOP_CLOSURE_REQUEST_BYTES_MISMATCH' scripts/compile-project-art-loop-closure.mjs",
  "grep -F 'sourceHashesRevalidatedAfterExecution' tools/run_project_art_loop_closure.py",
  "grep -F '\"targetRepositoryMutation\": False' tools/run_project_art_loop_closure.py",
  "! grep -F 'git push' tools/run_project_art_loop_closure.py",
]);

let manifest;
try {
  manifest = JSON.parse(source.package);
} catch {
  errors.push('package.json is not valid JSON');
}
if (manifest) {
  const compile = manifest.scripts?.['project-art:loop:compile'];
  const run = manifest.scripts?.['project-art:loop:run'];
  const check = manifest.scripts?.['project-art:loop:check'];
  const projectCheck = manifest.scripts?.['project-art:check'];
  if (compile !== 'node scripts/compile-project-art-loop-closure.mjs') {
    errors.push('project-art:loop:compile script is missing or drifted');
  }
  if (run !== 'python tools/run_project_art_loop_closure.py') {
    errors.push('project-art:loop:run script is missing or drifted');
  }
  if (
    check !==
    'node scripts/check-project-art-loop-closure.mjs && node scripts/test-project-art-loop-closure.mjs'
  ) {
    errors.push('project-art:loop:check script is missing or drifted');
  }
  if (
    typeof projectCheck !== 'string' ||
    !projectCheck.includes('pnpm run project-art:loop:check') ||
    projectCheck.indexOf('pnpm run project-art:loop:check') <=
      projectCheck.indexOf('node scripts/test-project-art-workbench.mjs') ||
    projectCheck.indexOf('pnpm run project-art:workspace:mcp:check') <=
      projectCheck.indexOf('pnpm run project-art:loop:check')
  ) {
    errors.push('project-art:loop:check is not in the mandatory workbench guard order');
  }
}

const compilerModule = await import('./compile-project-art-loop-closure.mjs');
if (
  compilerModule.PROJECT_ART_LOOP_CLOSURE_REQUEST_SCHEMA !==
    'evavo.project-art-loop-closure-request.v1' ||
  compilerModule.PROJECT_ART_LOOP_CLOSURE_PLAN_SCHEMA !==
    'evavo.project-art-loop-closure-plan.v1' ||
  typeof compilerModule.compileProjectArtLoopClosure !== 'function'
) {
  errors.push('Project Art loop-closure compiler exports are incomplete');
}

if (errors.length) {
  console.error('Project Art loop-closure guard failed:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Project Art loop-closure guard passed.');
console.log('- final-to-first seam review is explicit, content-addressed and bounded');
console.log('- request object, request bytes and recorded request SHA-256 remain one exact identity');
console.log('- exact identical endpoints remain valid for deliberate seamless loops');
console.log('- excessive pixel, channel, alpha and centroid seam drift blocks review');
console.log('- source hashes are revalidated before and after atomic evidence publication');
console.log('- every loop implementation file is a first-class pull-request and main-push workflow trigger');
console.log('- the focused adversary is mandatory inside the Project Art workbench chain');
console.log('- no creative approval, source mutation, provider, repository, Git, deployment or publication authority was introduced');
