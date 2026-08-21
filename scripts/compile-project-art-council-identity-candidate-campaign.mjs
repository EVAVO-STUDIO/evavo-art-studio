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
  compileCouncilIdentityCandidateCampaign,
  councilIdentityCandidateCampaignCapabilities,
  validateCouncilIdentityCandidateCampaign,
} from './project-art/council-identity-candidate-campaign.mjs';

const COMMAND_FLAGS = Object.freeze({
  summary: Object.freeze([]),
  capabilities: Object.freeze([]),
  compile: Object.freeze(['--output']),
  validate: Object.freeze(['--input']),
});

function fail(message) {
  const error = new Error(message);
  error.code = 'COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_CLI_INVALID';
  throw error;
}

function usage() {
  return [
    'usage:',
    '  compile-project-art-council-identity-candidate-campaign.mjs summary',
    '  compile-project-art-council-identity-candidate-campaign.mjs capabilities',
    '  compile-project-art-council-identity-candidate-campaign.mjs compile --output <create-only-campaign.json>',
    '  compile-project-art-council-identity-candidate-campaign.mjs validate --input <campaign.json>',
  ].join('\n');
}

function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length < 1) fail(usage());
  const command = argv[0];
  const allowedFlags = COMMAND_FLAGS[command];
  if (!allowedFlags || (argv.length - 1) % 2 !== 0) fail(usage());
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
      fail(`Unsupported, duplicate or invalid argument for ${command}.`);
    }
    values.set(flag, value);
  }
  if (values.size !== allowedFlags.length) fail(usage());
  return { command, values };
}

function ordinaryFile(file, label) {
  const absolute = path.resolve(file);
  const before = lstatSync(absolute, { throwIfNoEntry: false });
  if (
    !before?.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    realpathSync(absolute) !== absolute
  ) {
    fail(`${label} must be an ordinary single-link file on a real path.`);
  }
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  if (
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs ||
    before.ino !== after.ino
  ) {
    fail(`${label} changed while being read.`);
  }
  return Object.freeze({ absolute, bytes });
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
    fail('Output parent must be a real directory.');
  }
  if (lstatSync(absolute, { throwIfNoEntry: false })) {
    fail('Output is create-only and already exists.');
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
  return absolute;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function runCouncilIdentityCandidateCampaignCompilerCli(
  argv = process.argv.slice(2),
) {
  const { command, values } = parseArgs(argv);
  if (command === 'summary') {
    const campaign = compileCouncilIdentityCandidateCampaign();
    return Object.freeze({
      status: 'passed',
      version: campaign.version,
      campaignSha256: campaign.campaignSha256,
      characters: campaign.counts.characters,
      anchorJobs: campaign.counts.anchorJobs,
      dependentJobs: campaign.counts.dependentJobs,
      totalJobs: campaign.counts.totalJobs,
      exactAdapterId: campaign.providerSelection.preferredAdapterId,
      exactModel: campaign.providerSelection.preferredModel,
      providerAdmission: false,
      providerAuthorization: false,
      providerExecution: false,
      identityApproval: false,
    });
  }
  if (command === 'capabilities') {
    return councilIdentityCandidateCampaignCapabilities();
  }
  if (command === 'compile') {
    const campaign = compileCouncilIdentityCandidateCampaign();
    const output = writeCreateOnly(values.get('--output'), campaign);
    return Object.freeze({
      status: 'passed',
      command,
      output,
      outputFileSha256: sha256(readFileSync(output)),
      campaignSha256: campaign.campaignSha256,
      totalJobs: campaign.counts.totalJobs,
      providerAdmission: false,
      providerAuthorization: false,
      providerExecution: false,
      identityApproval: false,
    });
  }
  const input = ordinaryFile(values.get('--input'), 'campaign input');
  let value;
  try {
    value = JSON.parse(input.bytes.toString('utf8').replace(/^\uFEFF/u, ''));
  } catch (error) {
    fail(
      `Campaign input is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const result = validateCouncilIdentityCandidateCampaign(value);
  return Object.freeze({
    status: 'passed',
    command,
    input: input.absolute,
    inputFileSha256: sha256(input.bytes),
    ...result,
  });
}

const invoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (invoked) {
  try {
    process.stdout.write(
      `${JSON.stringify(runCouncilIdentityCandidateCampaignCompilerCli(), null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error?.code ?? 'COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_CLI_FAILED'}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
