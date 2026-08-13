#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const syntaxFiles = [
  'scripts/project-art/avatar-final-pass-provider-constants.mjs',
  'scripts/project-art/avatar-final-pass-provider-common.mjs',
  'scripts/project-art/avatar-final-pass-provider-plan.mjs',
  'scripts/project-art/avatar-final-pass-provider-request.mjs',
  'scripts/project-art/avatar-final-pass-provider-references.mjs',
  'scripts/project-art/avatar-final-pass-provider-protocol.mjs',
  'scripts/project-art/avatar-final-pass-provider-test-fixture.mjs',
  'scripts/project-art/avatar-final-pass-provider.mjs',
  'scripts/compile-project-art-avatar-final-pass-provider.mjs',
  'scripts/check-project-art-avatar-final-pass-provider.mjs',
  'scripts/check-project-art-avatar-final-pass-provider-suite.mjs',
  'scripts/test-project-art-avatar-final-pass-provider.mjs',
  'scripts/test-project-art-avatar-final-pass-provider-mcp.mjs',
  'tools/project_art_avatar_final_pass_provider_mcp.mjs',
];

function run(args, label) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${label} failed with exit code ${result.status}.`);
  }
  if (result.stdout) process.stdout.write(result.stdout);
}

for (const relative of syntaxFiles) {
  run(['--check', relative], `syntax check ${relative}`);
}
run(
  ['scripts/check-project-art-avatar-final-pass-provider.mjs'],
  'avatar final-pass provider static guard',
);
run(
  ['--test', 'scripts/test-project-art-avatar-final-pass-provider.mjs'],
  'avatar final-pass provider regressions',
);
run(
  ['--test', 'scripts/test-project-art-avatar-final-pass-provider-mcp.mjs'],
  'avatar final-pass provider MCP regressions',
);

console.log('Project Art avatar final-pass provider suite passed.');
