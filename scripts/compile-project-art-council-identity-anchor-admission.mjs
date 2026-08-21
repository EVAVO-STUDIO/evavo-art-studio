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
  compileCouncilIdentityAnchorAdmissionBundle,
  compileCouncilIdentityAnchorAdmissionPlan,
  councilIdentityAnchorAdmissionCapabilities,
  createCouncilIdentityAnchorAdmissionReview,
  createCouncilIdentityAnchorAdmissionReviewTemplate,
  validateCouncilIdentityAnchorAdmissionBundle,
} from './project-art/council-identity-anchor-admission.mjs';

const COMMAND_FLAGS = Object.freeze({
  summary: Object.freeze([]),
  capabilities: Object.freeze([]),
  template: Object.freeze(['--output']),
  review: Object.freeze([
    '--actor-id',
    '--occurred-at',
    '--expires-at',
    '--evidence-sha256',
    '--statement-file',
    '--output',
  ]),
  compile: Object.freeze(['--review', '--compiled-at', '--output']),
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
    '  compile-project-art-council-identity-anchor-admission.mjs summary',
    '  compile-project-art-council-identity-anchor-admission.mjs capabilities',
    '  compile-project-art-council-identity-anchor-admission.mjs template --output <create-only-json>',
    '  compile-project-art-council-identity-anchor-admission.mjs review --actor-id <human> --occurred-at <iso> --expires-at <iso> --evidence-sha256 <sha> --statement-file <text> --output <create-only-json>',
    '  compile-project-art-council-identity-anchor-admission.mjs compile --review <json> --compiled-at <iso> --output <create-only-json>',
    '  compile-project-art-council-identity-anchor-admission.mjs validate --input <bundle-json>',
  ].join('\n');
}

function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length < 1 || (argv.length - 1) % 2 !== 0) {
    fail('COUNCIL_IDENTITY_ANCHOR_ADMISSION_CLI_INVALID', usage());
  }
  const command = argv[0];
  const allowedFlags = COMMAND_FLAGS[command];
  if (!allowedFlags) fail('COUNCIL_IDENTITY_ANCHOR_ADMISSION_CLI_INVALID', usage());
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
      fail('COUNCIL_IDENTITY_ANCHOR_ADMISSION_CLI_INVALID');
    }
    values.set(flag, value);
  }
  if (values.size !== allowedFlags.length) {
    fail('COUNCIL_IDENTITY_ANCHOR_ADMISSION_CLI_INVALID', usage());
  }
  return Object.freeze({ command, values });
}

function required(values, flag) {
  const value = values.get(flag);
  if (!value) fail('COUNCIL_IDENTITY_ANCHOR_ADMISSION_CLI_INVALID', `Missing ${flag}.`);
  return value;
}

function stableFile(file, label, maximumBytes = 8 * 1024 * 1024) {
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
    fail('COUNCIL_IDENTITY_ANCHOR_ADMISSION_CLI_INPUT_INVALID', label);
  }
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  if (
    !['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every(
      (key) => before[key] === after[key],
    )
  ) {
    fail('COUNCIL_IDENTITY_ANCHOR_ADMISSION_CLI_INPUT_CHANGED', label);
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
    fail('COUNCIL_IDENTITY_ANCHOR_ADMISSION_CLI_JSON_INVALID', label);
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
    fail('COUNCIL_IDENTITY_ANCHOR_ADMISSION_CLI_OUTPUT_PARENT_INVALID');
  }
  if (lstatSync(absolute, { throwIfNoEntry: false })) {
    fail('COUNCIL_IDENTITY_ANCHOR_ADMISSION_CLI_OUTPUT_EXISTS');
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

export function runCouncilIdentityAnchorAdmissionCli(argv = process.argv.slice(2)) {
  const { command, values } = parseArgs(argv);
  if (command === 'summary') {
    const plan = compileCouncilIdentityAnchorAdmissionPlan();
    return Object.freeze({
      status: 'passed',
      command,
      planSha256: plan.planSha256,
      campaignSha256: plan.sourceCampaign.campaignSha256,
      anchorJobs: plan.counts.anchorJobs,
      providerAdmissionsCompiled: 0,
      providerAuthorizationsCompiled: 0,
      providerExecutionsPerformed: 0,
    });
  }
  if (command === 'capabilities') {
    return councilIdentityAnchorAdmissionCapabilities();
  }
  if (command === 'template') {
    const value = createCouncilIdentityAnchorAdmissionReviewTemplate();
    const output = writeCreateOnly(required(values, '--output'), value);
    return Object.freeze({
      status: 'passed',
      command,
      output: output.absolute,
      outputFileSha256: output.fileSha256,
      templateSha256: value.templateSha256,
      providerAdmission: false,
      providerExecution: false,
    });
  }
  if (command === 'review') {
    const statementSource = stableFile(
      required(values, '--statement-file'),
      'statement file',
      16 * 1024,
    );
    const review = createCouncilIdentityAnchorAdmissionReview({
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
      anchorJobsReviewed: review.maximumAdmissionRecords,
      providerAuthorization: false,
      providerExecution: false,
    });
  }
  if (command === 'compile') {
    const review = stableJson(required(values, '--review'), 'review');
    const bundle = compileCouncilIdentityAnchorAdmissionBundle({
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
      providerAdmissionsCompiled: bundle.counts.providerAdmissionsCompiled,
      providerAuthorizationsCompiled: 0,
      providerExecutionsPerformed: 0,
    });
  }
  const input = stableJson(required(values, '--input'), 'admission bundle');
  const result = validateCouncilIdentityAnchorAdmissionBundle(input.value);
  return Object.freeze({ status: 'passed', command, ...result });
}

const invoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (invoked) {
  try {
    process.stdout.write(
      `${JSON.stringify(runCouncilIdentityAnchorAdmissionCli(), null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error?.code ?? 'COUNCIL_IDENTITY_ANCHOR_ADMISSION_CLI_FAILED'}: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  }
}
