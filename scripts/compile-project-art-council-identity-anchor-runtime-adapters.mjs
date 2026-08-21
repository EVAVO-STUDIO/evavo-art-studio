#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compileCouncilIdentityAnchorRuntimeAdapterBundle,
  compileCouncilIdentityAnchorRuntimeAdapterPlan,
  councilIdentityAnchorRuntimeAdapterCapabilities,
  validateCouncilIdentityAnchorRuntimeAdapterBundle,
} from './project-art/council-identity-anchor-runtime-adapters.mjs';

const COMMAND_FLAGS = Object.freeze({
  summary: Object.freeze([]),
  capabilities: Object.freeze([]),
  compile: Object.freeze([
    '--authorization-bundle',
    '--compiled-at',
    '--output',
  ]),
  validate: Object.freeze(['--input']),
});

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function usage() {
  return [
    'usage:',
    '  compile-project-art-council-identity-anchor-runtime-adapters.mjs summary',
    '  compile-project-art-council-identity-anchor-runtime-adapters.mjs capabilities',
    '  compile-project-art-council-identity-anchor-runtime-adapters.mjs compile --authorization-bundle <v4.6-json> --compiled-at <iso> --output <create-only-json>',
    '  compile-project-art-council-identity-anchor-runtime-adapters.mjs validate --input <v4.7-json>',
  ].join('\n');
}

function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length < 1 || (argv.length - 1) % 2 !== 0) {
    fail('COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_CLI_INVALID', usage());
  }
  const command = argv[0];
  const allowedFlags = COMMAND_FLAGS[command];
  if (!allowedFlags) {
    fail('COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_CLI_INVALID', usage());
  }
  const allowed = new Set(allowedFlags);
  const values = new Map();
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      typeof flag !== 'string' ||
      !allowed.has(flag) ||
      typeof value !== 'string' ||
      !value ||
      value.startsWith('--') ||
      /[\0\r\n]/u.test(value) ||
      values.has(flag)
    ) {
      fail('COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_CLI_INVALID');
    }
    values.set(flag, value);
  }
  if (values.size !== allowedFlags.length) {
    fail('COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_CLI_INVALID', usage());
  }
  return Object.freeze({ command, values });
}

function required(values, flag) {
  const value = values.get(flag);
  if (!value) {
    fail('COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_CLI_INVALID', `Missing ${flag}.`);
  }
  return value;
}

function stableFile(file, label, maximumBytes = 64 * 1024 * 1024) {
  const absolute = path.resolve(file);
  const before = lstatSync(absolute, { throwIfNoEntry: false });
  if (
    !before?.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size < 1 ||
    before.size > maximumBytes ||
    realpathSync(absolute) !== absolute
  ) {
    fail('COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_CLI_INPUT_INVALID', label);
  }
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  if (
    !['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every(
      (key) => before[key] === after[key],
    )
  ) {
    fail('COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_CLI_INPUT_CHANGED', label);
  }
  return Object.freeze({ absolute, bytes });
}

function stableJson(file, label) {
  const source = stableFile(file, label);
  try {
    return Object.freeze({
      ...source,
      value: JSON.parse(
        new TextDecoder('utf-8', { fatal: true })
          .decode(source.bytes)
          .replace(/^\uFEFF/u, ''),
      ),
    });
  } catch {
    fail('COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_CLI_JSON_INVALID', label);
  }
}

function createOnlyTarget(file) {
  const absolute = path.resolve(file);
  const parent = path.dirname(absolute);
  const state = lstatSync(parent, { throwIfNoEntry: false });
  if (
    !state?.isDirectory() ||
    state.isSymbolicLink() ||
    realpathSync(parent) !== path.resolve(parent)
  ) {
    fail('COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_CLI_OUTPUT_PARENT_INVALID');
  }
  if (lstatSync(absolute, { throwIfNoEntry: false })) {
    fail('COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_CLI_OUTPUT_EXISTS');
  }
  return absolute;
}

function writeCreateOnly(file, value) {
  const absolute = createOnlyTarget(file);
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  return Object.freeze({
    absolute,
    fileSha256: createHash('sha256').update(readFileSync(absolute)).digest('hex'),
  });
}

export function runCouncilIdentityAnchorRuntimeAdapterCli(
  argv = process.argv.slice(2),
) {
  const { command, values } = parseArgs(argv);
  if (command === 'summary') {
    const plan = compileCouncilIdentityAnchorRuntimeAdapterPlan();
    return Object.freeze({
      status: 'passed',
      command,
      planSha256: plan.planSha256,
      authorizationPlanSha256: plan.sourceAuthorizationPlan.planSha256,
      admissionPlanSha256: plan.sourceAuthorizationPlan.admissionPlanSha256,
      campaignSha256: plan.sourceAuthorizationPlan.campaignSha256,
      providerAuthorizationsRequired:
        plan.counts.providerAuthorizationsRequired,
      runtimeAdaptersCompiled: 0,
      providerExecutionsPerformed: 0,
    });
  }
  if (command === 'capabilities') {
    return councilIdentityAnchorRuntimeAdapterCapabilities();
  }
  if (command === 'compile') {
    const authorizationBundle = stableJson(
      required(values, '--authorization-bundle'),
      'V4.6 authorization bundle',
    );
    const bundle = compileCouncilIdentityAnchorRuntimeAdapterBundle({
      authorizationBundle: authorizationBundle.value,
      compiledAt: required(values, '--compiled-at'),
    });
    const output = writeCreateOnly(required(values, '--output'), bundle);
    return Object.freeze({
      status: 'passed',
      command,
      output: output.absolute,
      outputFileSha256: output.fileSha256,
      bundleSha256: bundle.bundleSha256,
      sourceAuthorizationBundleSha256:
        bundle.sourceAuthorizationSummary.bundleSha256,
      providerAuthorizationsBound:
        bundle.counts.providerAuthorizationsBound,
      runtimeAdaptersCompiled: bundle.counts.runtimeAdaptersCompiled,
      durableRuntimeReservationsEstablished: 0,
      providerExecutionsPerformed: 0,
    });
  }
  const input = stableJson(
    required(values, '--input'),
    'V4.7 Runtime adapter bundle',
  );
  const result = validateCouncilIdentityAnchorRuntimeAdapterBundle(input.value);
  return Object.freeze({ status: 'passed', command, ...result });
}

const invoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (invoked) {
  try {
    process.stdout.write(
      `${JSON.stringify(runCouncilIdentityAnchorRuntimeAdapterCli(), null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error?.code ?? 'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_CLI_FAILED'}: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  }
}
