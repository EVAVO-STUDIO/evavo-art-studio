#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const syntaxFiles = [
  'scripts/project-art/avatar-final-pass-provider-runtime-constants.mjs',
  'scripts/project-art/avatar-final-pass-provider-runtime-common.mjs',
  'scripts/project-art/avatar-final-pass-provider-runtime-batch.mjs',
  'scripts/project-art/avatar-final-pass-provider-runtime-dispatch-core.mjs',
  'scripts/project-art/avatar-final-pass-provider-runtime-binding.mjs',
  'scripts/project-art/avatar-final-pass-provider-runtime-outcome.mjs',
  'scripts/project-art/avatar-final-pass-provider-runtime-dispatch.mjs',
  'scripts/project-art/avatar-final-pass-provider-runtime-fixture.mjs',
  'scripts/project-art/avatar-final-pass-provider-runtime.mjs',
  'scripts/avatar-final-pass-provider-runtime-cli.mjs',
  'scripts/check-project-art-avatar-final-pass-provider-runtime.mjs',
  'scripts/check-project-art-avatar-final-pass-provider-runtime-suite.mjs',
  'scripts/test-project-art-avatar-final-pass-provider-runtime.mjs',
  'scripts/test-project-art-avatar-final-pass-provider-runtime-mcp.mjs',
  'tools/project_art_avatar_final_pass_provider_runtime_mcp.mjs',
];

function run(args, label) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 180_000,
    maxBuffer: 24 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}.`);
  }
}

for (const relative of syntaxFiles) {
  run(['--check', relative], `syntax check ${relative}`);
}
run(
  ['scripts/check-project-art-avatar-final-pass-provider-runtime.mjs'],
  'avatar final-pass provider runtime static guard',
);
run(
  ['--test', 'scripts/test-project-art-avatar-final-pass-provider-runtime.mjs'],
  'avatar final-pass provider runtime regressions',
);
run(
  [
    '--test',
    'scripts/test-project-art-avatar-final-pass-provider-runtime-mcp.mjs',
  ],
  'avatar final-pass provider runtime MCP regressions',
);

console.log('Project Art avatar final-pass provider runtime suite passed.');
