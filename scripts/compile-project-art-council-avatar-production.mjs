#!/usr/bin/env node
import { closeSync, fsyncSync, lstatSync, openSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { compileCouncilAvatarProductionProgram } from './project-art/council-avatar-production-program.mjs';

function usage() {
  return 'Usage: node scripts/compile-project-art-council-avatar-production.mjs --output <create-only-plan.json>';
}

function parse(argv) {
  if (argv.length !== 2 || argv[0] !== '--output' || !argv[1]) {
    throw new Error(usage());
  }
  return path.resolve(argv[1]);
}

function writeCreateOnly(target, value) {
  const parent = path.dirname(target);
  const stat = lstatSync(parent);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('COUNCIL_AVATAR_OUTPUT_PARENT_INVALID');
  }
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  const handle = openSync(target, 'wx', 0o600);
  try {
    writeFileSync(handle, bytes);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  return bytes.length;
}

try {
  const output = parse(process.argv.slice(2));
  const program = compileCouncilAvatarProductionProgram();
  const bytes = writeCreateOnly(output, program);
  console.log(
    JSON.stringify({
      status: 'passed',
      schema: program.schema,
      programSha256: program.programSha256,
      characterCount: program.characterCount,
      identityMasterGenerationCount: program.identityMasterGenerationCount,
      totalPlannedImagesPerCharacter:
        program.animationStandard.totalPlannedImagesPerCharacter,
      output,
      bytes,
      providerExecution: false,
      runtimeActivation: false,
    }),
  );
} catch (error) {
  console.error(
    `[council-avatar-production] ERROR ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
