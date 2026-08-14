#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scripts = [
  ['scripts/check-project-art-avatar-sequence-release.mjs', 'static guard'],
  ['scripts/test-project-art-avatar-sequence-release.mjs', 'release regressions'],
  ['scripts/test-project-art-avatar-sequence-release-mcp.mjs', 'MCP regressions'],
];
for (const [relative, label] of scripts) {
  const argumentsList = relative.includes('/test-')
    ? ['--test', path.join(root, relative)]
    : [path.join(root, relative)];
  const result = spawnSync(process.execPath, argumentsList, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 180_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert.equal(result.status, 0, `${label} failed\n${result.stderr || result.stdout}`);
}
console.log('Project Art avatar sequence release suite passed.');
