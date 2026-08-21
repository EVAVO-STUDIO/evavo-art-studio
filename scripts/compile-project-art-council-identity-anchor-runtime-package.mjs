#!/usr/bin/env node
import {
  lstatSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compileCouncilIdentityAnchorRuntimePackagePlan,
  councilIdentityAnchorRuntimePackageCapabilities,
} from './project-art/council-identity-anchor-runtime-package.mjs';
import {
  materializeCouncilIdentityAnchorRuntimePackageStrict,
  validateCouncilIdentityAnchorRuntimePackageStrict,
} from './project-art/council-identity-anchor-runtime-package-strict.mjs';

const COMMAND_FLAGS = Object.freeze({
  summary: Object.freeze([]),
  capabilities: Object.freeze([]),
  materialize: Object.freeze([
    '--adapter-bundle',
    '--packaged-at',
    '--package-root',
  ]),
  validate: Object.freeze(['--package-root']),
});

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function usage() {
  return [
    'usage:',
    '  compile-project-art-council-identity-anchor-runtime-package.mjs summary',
    '  compile-project-art-council-identity-anchor-runtime-package.mjs capabilities',
    '  compile-project-art-council-identity-anchor-runtime-package.mjs materialize --adapter-bundle <v4.7-json> --packaged-at <iso> --package-root <new-absolute-directory>',
    '  compile-project-art-council-identity-anchor-runtime-package.mjs validate --package-root <absolute-directory>',
  ].join('\n');
}

function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length < 1 || (argv.length - 1) % 2 !== 0) {
    fail('COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_CLI_INVALID', usage());
  }
  const command = argv[0];
  const allowedFlags = COMMAND_FLAGS[command];
  if (!allowedFlags) {
    fail('COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_CLI_INVALID', usage());
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
      fail('COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_CLI_INVALID');
    }
    values.set(flag, value);
  }
  if (values.size !== allowedFlags.length) {
    fail('COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_CLI_INVALID', usage());
  }
  return Object.freeze({ command, values });
}

function required(values, flag) {
  const value = values.get(flag);
  if (!value) {
    fail('COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_CLI_INVALID', `Missing ${flag}.`);
  }
  return value;
}

function stableJson(file, label, maximumBytes = 64 * 1024 * 1024) {
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
    fail('COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_CLI_INPUT_INVALID', label);
  }
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  if (
    !['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every(
      (key) => before[key] === after[key],
    )
  ) {
    fail('COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_CLI_INPUT_CHANGED', label);
  }
  try {
    return Object.freeze({
      absolute,
      bytes,
      value: JSON.parse(
        new TextDecoder('utf-8', { fatal: true })
          .decode(bytes)
          .replace(/^\uFEFF/u, ''),
      ),
    });
  } catch {
    fail('COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_CLI_JSON_INVALID', label);
  }
}

export function runCouncilIdentityAnchorRuntimePackageCli(
  argv = process.argv.slice(2),
) {
  const { command, values } = parseArgs(argv);
  if (command === 'summary') {
    const plan = compileCouncilIdentityAnchorRuntimePackagePlan();
    return Object.freeze({
      status: 'passed',
      command,
      planSha256: plan.planSha256,
      adapterPlanSha256: plan.sourceAdapterPlan.planSha256,
      authorizationPlanSha256:
        plan.sourceAdapterPlan.authorizationPlanSha256,
      admissionPlanSha256: plan.sourceAdapterPlan.admissionPlanSha256,
      campaignSha256: plan.sourceAdapterPlan.campaignSha256,
      runtimeAdaptersRequired: plan.counts.runtimeAdaptersRequired,
      runtimeAdapterFilesPackaged: 0,
      providerExecutionsPerformed: 0,
    });
  }
  if (command === 'capabilities') {
    return councilIdentityAnchorRuntimePackageCapabilities();
  }
  if (command === 'materialize') {
    const adapterBundle = stableJson(
      required(values, '--adapter-bundle'),
      'V4.7 Runtime adapter bundle',
    );
    const result = materializeCouncilIdentityAnchorRuntimePackageStrict({
      adapterBundle: adapterBundle.value,
      packagedAt: required(values, '--packaged-at'),
      packageRoot: required(values, '--package-root'),
    });
    return Object.freeze({
      status: 'passed',
      command,
      packageRoot: result.packageRoot,
      manifestSha256: result.manifestSha256,
      manifestFileSha256: result.manifestFileSha256,
      sourceAdapterBundleSha256:
        result.manifest.sourceAdapterSummary.bundleSha256,
      runtimeAdapterFilesPackaged: result.adapterFileCount,
      strictManifestValidation: result.strictManifestValidation,
      providerExecutionsPerformed: 0,
      identityApprovalsEstablished: 0,
      runtimeActivation: false,
      websiteActivation: false,
    });
  }
  return Object.freeze({
    status: 'passed',
    command,
    ...validateCouncilIdentityAnchorRuntimePackageStrict({
      packageRoot: required(values, '--package-root'),
    }),
  });
}

const invoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (invoked) {
  try {
    process.stdout.write(
      `${JSON.stringify(runCouncilIdentityAnchorRuntimePackageCli(), null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error?.code ?? 'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_CLI_FAILED'}: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  }
}
