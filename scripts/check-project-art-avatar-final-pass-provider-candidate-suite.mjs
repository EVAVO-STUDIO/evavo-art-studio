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
    timeout: 180_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}.`);
  }
}

run(
  'scripts/check-project-art-avatar-final-pass-provider-candidate.mjs',
  'avatar provider candidate static guard',
);
run(
  'scripts/test-project-art-avatar-final-pass-provider-candidate.mjs',
  'avatar provider candidate regressions',
);
run(
  'scripts/test-project-art-avatar-final-pass-provider-candidate-mcp.mjs',
  'avatar provider candidate MCP regressions',
);

console.log('Project Art avatar provider candidate suite passed.');
