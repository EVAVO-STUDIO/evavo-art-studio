#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(relative, label) {
  const result = spawnSync(process.execPath, [path.join(root, relative)], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 300_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}.`);
}

run('scripts/check-artist-workspace-agent-suite-v1.mjs', 'Artist Workspace agent suite v1 compatibility guard');
run('scripts/check-artist-workspace-avatar-provider-integration.mjs', 'Artist Workspace avatar provider v2 integration guard');
run('scripts/check-artist-workspace-avatar-provider-runtime-integration.mjs', 'Artist Workspace avatar provider runtime v3 integration guard');
run('scripts/check-artist-workspace-avatar-provider-candidate-integration.mjs', 'Artist Workspace avatar provider candidate v4 integration guard');
run('scripts/check-artist-workspace-avatar-provider-frame-finisher-integration.mjs', 'Artist Workspace avatar provider frame-finisher v5 integration guard');
run('scripts/check-artist-workspace-avatar-sequence-release-integration.mjs', 'Artist Workspace avatar sequence release v6 integration guard');

console.log('Artist Workspace agent suite combined guard passed.');
console.log('- v1 workspace, ingest, catalog and resumable-job contracts remain compatible');
console.log('- v2 retains the governed avatar final-pass provider compiler');
console.log('- v3 retains exact durable runtime dispatch, binding and outcome normalization');
console.log('- v4 retains strict create-only provider candidate materialization');
console.log('- v5 retains deterministic pixel finishing and named-human final-frame admission');
console.log('- v6 adds reviewed-frame, loop-evidence and timing-bound sequence release sealing');
console.log('- one existing consolidated workflow validates all six contracts');
