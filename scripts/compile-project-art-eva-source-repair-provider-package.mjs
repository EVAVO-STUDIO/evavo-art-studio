#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compileProjectArtEvaSourceRepairProviderAdmissionsTemplateFile,
  compileProjectArtEvaSourceRepairProviderPackageFile,
} from './project-art/eva-source-repair-provider-package.mjs';

function usage() {
  return [
    'Project Art EVA source-repair provider package',
    '',
    'Usage:',
    '  node scripts/compile-project-art-eva-source-repair-provider-package.mjs template --intake <intake.json> --output <admissions-template.json>',
    '  node scripts/compile-project-art-eva-source-repair-provider-package.mjs compile --intake <intake.json> --admissions <admissions.json> --output <provider-package.json> [--compiled-at <ISO>]',
    '',
    'Both commands write create-only private JSON. They do not execute a provider, approve a candidate, mutate a repository, publish, deploy or activate the runtime.',
  ].join('\n');
}

function parseOptions(argv, allowed) {
  if (argv.length % 2 !== 0) throw new Error(usage());
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      !allowed.includes(name) ||
      !value ||
      value.startsWith('--') ||
      values.has(name)
    ) {
      throw new Error(usage());
    }
    values.set(name, value);
  }
  return values;
}

function required(values, name) {
  const value = values.get(name);
  if (!value) throw new Error(`Missing ${name}.\n\n${usage()}`);
  return value;
}

export function runProjectArtEvaSourceRepairProviderPackageCli(
  argv = process.argv.slice(2),
) {
  const command = argv[0];
  if (command === 'template') {
    const options = parseOptions(argv.slice(1), ['--intake', '--output']);
    const result =
      compileProjectArtEvaSourceRepairProviderAdmissionsTemplateFile({
        intakePath: required(options, '--intake'),
        outputPath: required(options, '--output'),
      });
    return Object.freeze({
      status: 'passed',
      schema: result.template.schema,
      templateSha256: result.template.templateSha256,
      jobs: result.template.jobs.length,
      providerExecution: false,
      output: result.outputPath,
    });
  }
  if (command === 'compile') {
    const options = parseOptions(argv.slice(1), [
      '--intake',
      '--admissions',
      '--output',
      '--compiled-at',
    ]);
    const result = compileProjectArtEvaSourceRepairProviderPackageFile({
      intakePath: required(options, '--intake'),
      admissionsPath: required(options, '--admissions'),
      outputPath: required(options, '--output'),
      ...(options.get('--compiled-at')
        ? { compiledAt: options.get('--compiled-at') }
        : {}),
    });
    return Object.freeze({
      status: 'passed',
      schema: result.providerPackage.schema,
      packageSha256: result.providerPackage.packageSha256,
      ready: result.providerPackage.counts.ready,
      blocked: result.providerPackage.counts.blocked,
      explicitProviderSubmissionRequired: true,
      providerExecution: false,
      candidateApproval: false,
      runtimeActivationAllowed: false,
      output: result.outputPath,
    });
  }
  throw new Error(usage());
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.stdout.write(
      `${JSON.stringify(runProjectArtEvaSourceRepairProviderPackageCli())}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: 'failed',
        code: error?.code ?? 'EVA_SOURCE_REPAIR_PROVIDER_PACKAGE_CLI_FAILED',
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  }
}
