#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const commands = [
  ['--check', 'scripts/project-art/eva-dense-motion-source-materialization.mjs'],
  ['--check', 'scripts/run-project-art-eva-dense-motion-source-materialization.mjs'],
  ['--test', 'scripts/test-project-art-eva-dense-motion-source-materialization.mjs'],
  ['--test', 'scripts/test-project-art-eva-dense-motion-source-materialization-static-guard.mjs'],
  ['--test', 'scripts/test-project-art-eva-dense-motion-ten-master.mjs'],
];

for (const args of commands) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    windowsHide: true,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write(
  `${JSON.stringify(
    {
      schema: 'evavo.project-art-eva-dense-motion-source-materialization-check.v1',
      status: 'valid',
      commands: commands.length,
      sourceFrames: 10,
      publicationAuthority: false,
      runtimeActivationAuthority: false,
    },
    null,
    2,
  )}\n`,
);
