#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(args, label) {
  const commandArgs = args.map((entry) =>
    entry.startsWith('-') ? entry : path.join(root, entry),
  );
  const result = spawnSync(process.execPath, commandArgs, {
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
  ['scripts/check-project-art-avatar-final-pass-provider-frame-finisher.mjs'],
  'frame-finisher static guard',
);
run(
  ['--test', 'scripts/test-project-art-avatar-final-pass-provider-frame-finisher.mjs'],
  'frame-finisher regressions',
);
run(
  ['--test', 'scripts/test-project-art-avatar-final-pass-provider-frame-finisher-mcp.mjs'],
  'frame-finisher MCP regressions',
);

console.log('Project Art avatar provider frame-finisher suite passed.');
