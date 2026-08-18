#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  MOBILE_IDENTITY_APPROVAL_SCHEMA,
  compileMobileIdentityProductionBrief,
  validateMobileIdentityRasterApproval,
} from './mobile-identity-contract.mjs';

export {
  MOBILE_IDENTITY_APPROVAL_SCHEMA,
  MOBILE_IDENTITY_SCHEMA,
  compileMobileIdentityProductionBrief,
  validateMobileIdentityRasterApproval,
} from './mobile-identity-contract.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(file) {
  assert(typeof file === 'string' && file.length > 0, 'input path is required');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeCreateOnly(file, value) {
  assert(typeof file === 'string' && file.length > 0, 'output path is required');
  const target = path.resolve(file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const handle = await fs.open(target, 'wx');
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
  } finally {
    await handle.close();
  }
}

function parseArguments(argv) {
  const command = argv[0];
  const values = new Map();
  for (let index = 1; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    assert(name?.startsWith('--') && value && !value.startsWith('--') && !values.has(name), 'arguments must be unique --name value pairs');
    values.set(name, value);
  }
  return { command, values };
}

export async function runMobileIdentityCli(argv = process.argv.slice(2)) {
  const { command, values } = parseArguments(argv);
  if (command === 'compile') {
    const input = await readJson(values.get('--brief'));
    const output = compileMobileIdentityProductionBrief(input);
    await writeCreateOnly(values.get('--output'), output);
    return {
      status: 'ok',
      schema: output.schema,
      output: path.resolve(values.get('--output')),
      productionSha256: output.productionSha256,
      creativeMasterType: output.creativeMaster.type,
    };
  }
  if (command === 'validate-approval') {
    const approval = await readJson(values.get('--approval'));
    validateMobileIdentityRasterApproval(approval);
    return {
      status: 'ok',
      schema: MOBILE_IDENTITY_APPROVAL_SCHEMA,
      approved: true,
      candidateSha256: approval.candidateSha256,
      sourceType: approval.sourceType,
    };
  }
  if (command === 'execute-authorized') {
    for (const required of ['--authorization', '--receipt']) {
      assert(values.get(required), `${required} is required`);
    }
    const { runAuthorizedRawArtProviderWorkerCli } = await import('./run-authorized-raw-art-provider-worker.mjs');
    const forwarded = [
      '--authorization', values.get('--authorization'),
      '--worker-id', values.get('--worker-id') ?? 'mobile-identity-worker',
      '--command', values.get('--worker-command') ?? 'until-idle',
      '--receipt', values.get('--receipt'),
    ];
    if (values.get('--concurrency')) forwarded.push('--concurrency', values.get('--concurrency'));
    return runAuthorizedRawArtProviderWorkerCli(forwarded);
  }
  throw new Error('command must be compile, validate-approval or execute-authorized');
}

const directlyInvoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (directlyInvoked) {
  runMobileIdentityCli()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : String(error) })}\n`);
      process.exitCode = 2;
    });
}
