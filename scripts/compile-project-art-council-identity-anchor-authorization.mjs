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
  compileCouncilIdentityAnchorAuthorizationBundle,
  compileCouncilIdentityAnchorAuthorizationPlan,
  councilIdentityAnchorAuthorizationCapabilities,
  createCouncilIdentityAnchorAuthorizationReview,
  createCouncilIdentityAnchorAuthorizationReviewTemplate,
  validateCouncilIdentityAnchorAuthorizationBundle,
} from './project-art/council-identity-anchor-authorization.mjs';

const COMMAND_FLAGS = Object.freeze({
  summary: Object.freeze([]),
  capabilities: Object.freeze([]),
  template: Object.freeze(['--admission-bundle', '--output']),
  review: Object.freeze([
    '--admission-bundle',
    '--actor-id',
    '--occurred-at',
    '--expires-at',
    '--evidence-sha256',
    '--statement-file',
    '--output',
  ]),
  compile: Object.freeze([
    '--admission-bundle',
    '--review',
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
    '  compile-project-art-council-identity-anchor-authorization.mjs summary',
    '  compile-project-art-council-identity-anchor-authorization.mjs capabilities',
    '  compile-project-art-council-identity-anchor-authorization.mjs template --admission-bundle <v4.5-json> --output <create-only-json>',
    '  compile-project-art-council-identity-anchor-authorization.mjs review --admission-bundle <v4.5-json> --actor-id <human> --occurred-at <iso> --expires-at <iso> --evidence-sha256 <sha> --statement-file <text> --output <create-only-json>',
    '  compile-project-art-council-identity-anchor-authorization.mjs compile --admission-bundle <v4.5-json> --review <json> --compiled-at <iso> --output <create-only-json>',
    '  compile-project-art-council-identity-anchor-authorization.mjs validate --input <authorization-bundle-json>',
  ].join('\n');
}

function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length < 1 || (argv.length - 1) % 2 !== 0) {
    fail('COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_CLI_INVALID', usage());
  }
  const command = argv[0];
  const allowedFlags = COMMAND_FLAGS[command];
  if (!allowedFlags) {
    fail('COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_CLI_INVALID', usage());
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
      fail('COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_CLI_INVALID');
    }
    values.set(flag, value);
  }
  if (values.size !== allowedFlags.length) {
    fail('COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_CLI_INVALID', usage());
  }
  return Object.freeze({ command, values });
}

function required(values, flag) {
  const value = values.get(flag);
  if (!value) {
    fail('COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_CLI_INVALID', `Missing ${flag}.`);
  }
  return value;
}

function stableFile(file, label, maximumBytes = 16 * 1024 * 1024) {
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
    fail('COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_CLI_INPUT_INVALID', label);
  }
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  if (
    !['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every(
      (key) => before[key] === after[key],
    )
  ) {
    fail('COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_CLI_INPUT_CHANGED', label);
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
    fail('COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_CLI_JSON_INVALID', label);
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
    fail('COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_CLI_OUTPUT_PARENT_INVALID');
  }
  if (lstatSync(absolute, { throwIfNoEntry: false })) {
    fail('COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_CLI_OUTPUT_EXISTS');
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

export function runCouncilIdentityAnchorAuthorizationCli(
  argv = process.argv.slice(2),
) {
  const { command, values } = parseArgs(argv);
  if (command === 'summary') {
    const plan = compileCouncilIdentityAnchorAuthorizationPlan();
    return Object.freeze({
      status: 'passed',
      command,
      planSha256: plan.planSha256,
      admissionPlanSha256: plan.sourceAdmissionPlan.planSha256,
      campaignSha256: plan.sourceAdmissionPlan.campaignSha256,
      providerAdmissionsRequired: plan.counts.providerAdmissionsRequired,
      providerAuthorizationsCompiled: 0,
      runtimeAdaptersCompiled: 0,
      providerExecutionsPerformed: 0,
    });
  }
  if (command === 'capabilities') {
    return councilIdentityAnchorAuthorizationCapabilities();
  }
  if (command === 'template') {
    const admissionBundle = stableJson(
      required(values, '--admission-bundle'),
      'V4.5 admission bundle',
    );
    const template = createCouncilIdentityAnchorAuthorizationReviewTemplate(
      admissionBundle.value,
    );
    const output = writeCreateOnly(required(values, '--output'), template);
    return Object.freeze({
      status: 'passed',
      command,
      output: output.absolute,
      outputFileSha256: output.fileSha256,
      templateSha256: template.templateSha256,
      sourceAdmissionBundleSha256:
        template.sourceAdmissionBundle.bundleSha256,
      providerAuthorization: false,
      providerExecution: false,
    });
  }
  if (command === 'review') {
    const admissionBundle = stableJson(
      required(values, '--admission-bundle'),
      'V4.5 admission bundle',
    );
    const statementSource = stableFile(
      required(values, '--statement-file'),
      'authorization statement file',
      16 * 1024,
    );
    const review = createCouncilIdentityAnchorAuthorizationReview({
      admissionBundle: admissionBundle.value,
      actorId: required(values, '--actor-id'),
      occurredAt: required(values, '--occurred-at'),
      expiresAt: required(values, '--expires-at'),
      evidenceSha256: required(values, '--evidence-sha256'),
      statement: new TextDecoder('utf-8', { fatal: true }).decode(
        statementSource.bytes,
      ),
    });
    const output = writeCreateOnly(required(values, '--output'), review);
    return Object.freeze({
      status: 'passed',
      command,
      output: output.absolute,
      outputFileSha256: output.fileSha256,
      reviewSha256: review.reviewSha256,
      sourceAdmissionBundleSha256:
        review.sourceAdmissionBundle.bundleSha256,
      providerAuthorizationsApprovedForCompilation:
        review.maximumAuthorizationRecords,
      maximumProviderCallsTotal: review.maximumProviderCallsTotal,
      providerExecutionPerformed: false,
    });
  }
  if (command === 'compile') {
    const admissionBundle = stableJson(
      required(values, '--admission-bundle'),
      'V4.5 admission bundle',
    );
    const review = stableJson(
      required(values, '--review'),
      'V4.6 authorization review',
    );
    const bundle = compileCouncilIdentityAnchorAuthorizationBundle({
      admissionBundle: admissionBundle.value,
      review: review.value,
      compiledAt: required(values, '--compiled-at'),
    });
    const output = writeCreateOnly(required(values, '--output'), bundle);
    return Object.freeze({
      status: 'passed',
      command,
      output: output.absolute,
      outputFileSha256: output.fileSha256,
      bundleSha256: bundle.bundleSha256,
      providerAdmissionsBound: bundle.counts.providerAdmissionsBound,
      providerAuthorizationsCompiled:
        bundle.counts.providerAuthorizationsCompiled,
      runtimeAdaptersCompiled: 0,
      providerExecutionsPerformed: 0,
      durableConsumptionLedgerEstablished: false,
    });
  }
  const input = stableJson(
    required(values, '--input'),
    'V4.6 authorization bundle',
  );
  const result = validateCouncilIdentityAnchorAuthorizationBundle(input.value);
  return Object.freeze({ status: 'passed', command, ...result });
}

const invoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (invoked) {
  try {
    process.stdout.write(
      `${JSON.stringify(runCouncilIdentityAnchorAuthorizationCli(), null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error?.code ?? 'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_CLI_FAILED'}: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  }
}
