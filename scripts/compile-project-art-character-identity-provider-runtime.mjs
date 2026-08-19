#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compileCharacterIdentityProviderAdmission,
  compileCharacterIdentityProviderAuthorization,
  compileCharacterIdentityProviderRuntimeAdapter,
} from './project-art/character-identity-provider-runtime.mjs';

function fail(message) {
  const error = new Error(message);
  error.code = 'CHARACTER_IDENTITY_PROVIDER_COMPILER_CLI_INVALID';
  throw error;
}

function parseArgs(argv) {
  const command = argv[0];
  const values = new Map();
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      typeof flag !== 'string' ||
      !flag.startsWith('--') ||
      typeof value !== 'string' ||
      !value ||
      value.startsWith('--') ||
      values.has(flag) ||
      /[\0\r\n]/u.test(value)
    ) {
      fail('Arguments must be unique --name value pairs.');
    }
    values.set(flag, value);
  }
  return { command, values };
}

function requireValue(values, name) {
  const value = values.get(name);
  if (!value) fail(`Missing required flag ${name}.`);
  return value;
}

function readJson(file, label) {
  const absolute = path.resolve(file);
  const bytes = readFileSync(absolute);
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, ''));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { absolute, bytes, value };
}

function writeCreateOnly(file, value) {
  const absolute = path.resolve(file);
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  return absolute;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function usage() {
  return [
    'usage:',
    '  compile-project-art-character-identity-provider-runtime.mjs admit --identity-request <json> --job-id <id> --selection <json> --actor-id <human> --occurred-at <iso> --evidence-sha256 <sha> --output <json> [--anchor-execution-receipt <json>]',
    '  compile-project-art-character-identity-provider-runtime.mjs authorize --provider-admission <json> --actor-id <human> --occurred-at <iso> --expires-at <iso> --evidence-sha256 <sha> --output <json>',
    '  compile-project-art-character-identity-provider-runtime.mjs adapter --identity-request <json> --provider-admission <json> --authorization <json> --compiled-at <iso> --output <json>',
  ].join('\n');
}

export function runCharacterIdentityProviderCompilerCli(argv = process.argv.slice(2)) {
  const { command, values } = parseArgs(argv);
  if (!['admit', 'authorize', 'adapter'].includes(command)) fail(usage());

  if (command === 'admit') {
    const request = readJson(
      requireValue(values, '--identity-request'),
      'identity request',
    );
    const selection = readJson(requireValue(values, '--selection'), 'provider selection');
    const anchor = values.has('--anchor-execution-receipt')
      ? readJson(values.get('--anchor-execution-receipt'), 'anchor execution receipt')
      : null;
    const admission = compileCharacterIdentityProviderAdmission({
      identityRequest: request.value,
      jobId: requireValue(values, '--job-id'),
      selection: selection.value,
      actorId: requireValue(values, '--actor-id'),
      occurredAt: requireValue(values, '--occurred-at'),
      evidenceSha256: requireValue(values, '--evidence-sha256'),
      anchorExecutionReceipt: anchor?.value ?? null,
    });
    const output = writeCreateOnly(requireValue(values, '--output'), admission);
    return Object.freeze({
      status: 'passed',
      command,
      output,
      outputFileSha256: sha256(readFileSync(output)),
      providerAdmissionSha256: admission.providerAdmissionSha256,
      providerExecution: false,
      identityApproval: false,
    });
  }

  if (command === 'authorize') {
    const admission = readJson(
      requireValue(values, '--provider-admission'),
      'provider admission',
    );
    const authorization = compileCharacterIdentityProviderAuthorization({
      providerAdmission: admission.value,
      actorId: requireValue(values, '--actor-id'),
      occurredAt: requireValue(values, '--occurred-at'),
      expiresAt: requireValue(values, '--expires-at'),
      evidenceSha256: requireValue(values, '--evidence-sha256'),
    });
    const output = writeCreateOnly(requireValue(values, '--output'), authorization);
    return Object.freeze({
      status: 'passed',
      command,
      output,
      outputFileSha256: sha256(readFileSync(output)),
      authorizationSha256: authorization.authorizationSha256,
      maximumProviderCalls: 1,
      providerExecution: false,
      identityApproval: false,
    });
  }

  const request = readJson(
    requireValue(values, '--identity-request'),
    'identity request',
  );
  const admission = readJson(
    requireValue(values, '--provider-admission'),
    'provider admission',
  );
  const authorization = readJson(
    requireValue(values, '--authorization'),
    'provider authorization',
  );
  const adapter = compileCharacterIdentityProviderRuntimeAdapter({
    identityRequest: request.value,
    providerAdmission: admission.value,
    authorization: authorization.value,
    compiledAt: requireValue(values, '--compiled-at'),
  });
  const output = writeCreateOnly(requireValue(values, '--output'), adapter);
  return Object.freeze({
    status: 'passed',
    command,
    output,
    outputFileSha256: sha256(readFileSync(output)),
    adapterSha256: adapter.adapterSha256,
    providerExecution: false,
    identityApproval: false,
  });
}

const invoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (invoked) {
  try {
    process.stdout.write(
      `${JSON.stringify(runCharacterIdentityProviderCompilerCli(), null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error?.code ?? 'CHARACTER_IDENTITY_PROVIDER_COMPILER_CLI_FAILED'}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
