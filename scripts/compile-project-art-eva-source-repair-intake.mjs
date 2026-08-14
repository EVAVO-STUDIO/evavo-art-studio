#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compileProjectArtEvaSourceRepairIntakeFile,
} from './project-art/eva-source-repair-intake.mjs';

function argumentsFor(argv) {
  if (argv.length % 2 !== 0) throw new Error('Arguments must be --name value pairs.');
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      !['--handoff', '--manifest', '--output', '--compiled-at'].includes(name) ||
      !value ||
      value.startsWith('--') ||
      values.has(name)
    ) {
      throw new Error(`Invalid argument ${name ?? ''}.`);
    }
    values.set(name, value);
  }
  for (const required of ['--handoff', '--manifest', '--output']) {
    if (!values.has(required)) throw new Error(`Missing ${required}.`);
  }
  return values;
}

export function runProjectArtEvaSourceRepairIntakeCli(
  argv = process.argv.slice(2),
) {
  const values = argumentsFor(argv);
  const intake = compileProjectArtEvaSourceRepairIntakeFile({
    handoffPath: values.get('--handoff'),
    materializationManifestPath: values.get('--manifest'),
    outputPath: values.get('--output'),
    ...(values.has('--compiled-at')
      ? { compiledAt: values.get('--compiled-at') }
      : {}),
  });
  return Object.freeze({
    status: 'passed',
    schema: intake.schema,
    intakeSha256: intake.intakeSha256,
    repairJobs: intake.counts.repairJobs,
    inbetweenJobs: intake.counts.inbetweenJobs,
    totalJobs: intake.counts.totalJobs,
    providerExecution: false,
    candidateApproval: false,
    runtimeActivationAllowed: false,
    output: path.resolve(values.get('--output')),
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.stdout.write(
      `${JSON.stringify(runProjectArtEvaSourceRepairIntakeCli())}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: 'failed',
        code: error?.code ?? 'EVA_SOURCE_REPAIR_INTAKE_CLI_FAILED',
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  }
}
