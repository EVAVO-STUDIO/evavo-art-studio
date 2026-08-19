#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  executeCharacterIdentityProvider,
  parseCharacterIdentityProviderRuntimeAdapter,
} from './project-art/character-identity-provider-runtime.mjs';
import {
  parseAvatarFinalPassProviderRuntimeBinding,
  parseAvatarFinalPassProviderRuntimeDispatch,
} from './project-art/avatar-final-pass-provider-runtime-dispatch.mjs';
import {
  assert,
  sha256Document,
  verifySelfHash,
} from './project-art/avatar-final-pass-provider-runtime-common.mjs';

const REQUIRED_FLAGS = Object.freeze([
  '--adapter',
  '--expected-adapter-file-sha256',
  '--runtime-root',
  '--artifact-root',
  '--dispatch-output',
  '--binding-output',
  '--outcome-output',
  '--receipt-output',
]);
const OPTIONAL_FLAGS = Object.freeze(['--worker-id']);

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function parseFlags(argv) {
  if (!Array.isArray(argv) || argv.length % 2 !== 0) {
    fail('CHARACTER_IDENTITY_PROVIDER_EXECUTION_CLI_INVALID');
  }
  const allowed = new Set([...REQUIRED_FLAGS, ...OPTIONAL_FLAGS]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      !allowed.has(flag) ||
      values.has(flag) ||
      typeof value !== 'string' ||
      !value ||
      value.startsWith('--') ||
      /[\0\r\n]/u.test(value)
    ) {
      fail('CHARACTER_IDENTITY_PROVIDER_EXECUTION_CLI_INVALID');
    }
    values.set(flag, value);
  }
  for (const flag of REQUIRED_FLAGS) {
    if (!values.has(flag)) {
      fail(
        'CHARACTER_IDENTITY_PROVIDER_EXECUTION_CLI_INVALID',
        `Missing required flag ${flag}.`,
      );
    }
  }
  if (!/^[a-f0-9]{64}$/u.test(values.get('--expected-adapter-file-sha256'))) {
    fail(
      'CHARACTER_IDENTITY_PROVIDER_EXECUTION_CLI_INVALID',
      '--expected-adapter-file-sha256 must be a lowercase SHA-256.',
    );
  }
  return values;
}

function readStableJson(file, label) {
  const absolute = path.resolve(file);
  const before = lstatSync(absolute);
  if (!before.isFile() || before.isSymbolicLink()) {
    fail(
      'CHARACTER_IDENTITY_PROVIDER_EXECUTION_CLI_INPUT_INVALID',
      `${label} must be an ordinary file.`,
    );
  }
  const real = realpathSync(absolute);
  if (real !== absolute) {
    fail(
      'CHARACTER_IDENTITY_PROVIDER_EXECUTION_CLI_INPUT_INVALID',
      `${label} must resolve to itself.`,
    );
  }
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    fail(
      'CHARACTER_IDENTITY_PROVIDER_EXECUTION_CLI_INPUT_CHANGED',
      `${label} changed while being read.`,
    );
  }
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, ''));
  } catch (error) {
    fail(
      'CHARACTER_IDENTITY_PROVIDER_EXECUTION_CLI_INPUT_INVALID',
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return Object.freeze({ absolute, bytes, value });
}

function createOnlyTarget(value, label) {
  const absolute = path.resolve(value);
  const parent = path.dirname(absolute);
  const state = lstatSync(parent);
  if (
    !state.isDirectory() ||
    state.isSymbolicLink() ||
    realpathSync(parent) !== path.resolve(parent)
  ) {
    fail(
      'CHARACTER_IDENTITY_PROVIDER_EXECUTION_CLI_OUTPUT_PARENT_INVALID',
      `${label} parent must be a real directory.`,
    );
  }
  try {
    lstatSync(absolute);
    fail(
      'CHARACTER_IDENTITY_PROVIDER_EXECUTION_CLI_OUTPUT_EXISTS',
      `${label} is create-only and already exists.`,
    );
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return absolute;
}

function writeCreateOnlyJson(outputPath, value, verify) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  writeFileSync(outputPath, bytes, { mode: 0o600, flag: 'wx' });
  const reread = readStableJson(outputPath, outputPath);
  verify(reread.value);
  return Object.freeze({
    outputPath,
    fileSha256: createHash('sha256').update(reread.bytes).digest('hex'),
  });
}

function removeOwned(paths) {
  for (const file of [...paths].reverse()) {
    try {
      unlinkSync(file);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

function verifyOutcome(value, expected) {
  const parsed = verifySelfHash(
    value,
    'runtimeOutcomeSha256',
    'character identity provider outcome',
  );
  assert(
    parsed.runtimeOutcomeSha256 === expected.runtimeOutcomeSha256 &&
      parsed.runtimeDispatchSha256 === expected.runtimeDispatchSha256 &&
      parsed.runtimeBindingSha256 === expected.runtimeBindingSha256,
    'CHARACTER_IDENTITY_PROVIDER_EXECUTION_CLI_OUTCOME_VERIFY_FAILED',
  );
  return parsed;
}

function verifyReceipt(value, expected) {
  const parsed = verifySelfHash(
    value,
    'executionSha256',
    'character identity provider execution receipt',
  );
  assert(
    parsed.executionSha256 === expected.executionSha256 &&
      sha256Document(Object.fromEntries(Object.entries(parsed).filter(([key]) => key !== 'executionSha256'))) ===
        parsed.executionSha256,
    'CHARACTER_IDENTITY_PROVIDER_EXECUTION_CLI_RECEIPT_VERIFY_FAILED',
  );
  return parsed;
}

function pnpmExecutable() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function runBuild(args, label) {
  const result = spawnSync(pnpmExecutable(), args, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    windowsHide: true,
    stdio: 'inherit',
  });
  if (result.error) {
    fail(
      'CHARACTER_IDENTITY_PROVIDER_EXECUTION_BUILD_FAILED',
      `${label} failed to start: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    fail(
      'CHARACTER_IDENTITY_PROVIDER_EXECUTION_BUILD_FAILED',
      `${label} failed with exit code ${result.status}.`,
    );
  }
}

export async function runCharacterIdentityProviderExecution(
  argv,
  environment = process.env,
  { build = false } = {},
) {
  const flags = parseFlags(argv);
  const adapterInput = readStableJson(
    flags.get('--adapter'),
    'adapter',
  );
  const actualAdapterFileSha256 = createHash('sha256')
    .update(adapterInput.bytes)
    .digest('hex');
  if (actualAdapterFileSha256 !== flags.get('--expected-adapter-file-sha256')) {
    fail(
      'CHARACTER_IDENTITY_PROVIDER_EXECUTION_CLI_ADAPTER_SHA256_MISMATCH',
      'Adapter file SHA-256 does not match the reviewed expected digest.',
    );
  }
  const adapter = parseCharacterIdentityProviderRuntimeAdapter(adapterInput.value);
  const outputs = Object.freeze({
    dispatch: createOnlyTarget(flags.get('--dispatch-output'), 'dispatchOutput'),
    binding: createOnlyTarget(flags.get('--binding-output'), 'bindingOutput'),
    outcome: createOnlyTarget(flags.get('--outcome-output'), 'outcomeOutput'),
    receipt: createOnlyTarget(flags.get('--receipt-output'), 'receiptOutput'),
  });

  if (build) {
    runBuild(['run', 'build:domain'], 'Art Studio domain build');
    runBuild(
      ['--filter', '@evavo/art-studio-worker', 'build'],
      'Art Studio worker build',
    );
  }

  const execution = await executeCharacterIdentityProvider({
    adapter,
    runtimeRoot: path.resolve(flags.get('--runtime-root')),
    artifactRoot: path.resolve(flags.get('--artifact-root')),
    ...(flags.has('--worker-id') ? { workerId: flags.get('--worker-id') } : {}),
    environment,
  });

  const created = [];
  try {
    const dispatchWrite = writeCreateOnlyJson(
      outputs.dispatch,
      execution.dispatch,
      parseAvatarFinalPassProviderRuntimeDispatch,
    );
    created.push(dispatchWrite.outputPath);
    const bindingWrite = writeCreateOnlyJson(
      outputs.binding,
      execution.binding,
      (value) => parseAvatarFinalPassProviderRuntimeBinding(value, execution.dispatch),
    );
    created.push(bindingWrite.outputPath);
    const outcomeWrite = writeCreateOnlyJson(
      outputs.outcome,
      execution.outcome,
      (value) => verifyOutcome(value, execution.outcome),
    );
    created.push(outcomeWrite.outputPath);
    const receiptWrite = writeCreateOnlyJson(
      outputs.receipt,
      execution.receipt,
      (value) => verifyReceipt(value, execution.receipt),
    );
    created.push(receiptWrite.outputPath);

    return Object.freeze({
      status: execution.receipt.status,
      characterId: execution.receipt.characterId,
      setId: execution.receipt.setId,
      viewId: execution.receipt.viewId,
      adapterFileSha256: actualAdapterFileSha256,
      adapterSha256: adapter.adapterSha256,
      executionSha256: execution.receipt.executionSha256,
      runtimeDispatchSha256: execution.dispatch.runtimeDispatchSha256,
      runtimeBindingSha256: execution.binding.runtimeBindingSha256,
      runtimeOutcomeSha256: execution.outcome.runtimeOutcomeSha256,
      providerCallCount: execution.receipt.provider.providerCallCount,
      providerCallCountVerified:
        execution.receipt.provider.providerCallCountVerified,
      candidateArtifactId:
        execution.receipt.artifacts.candidate?.artifactId ?? null,
      evidenceArtifactId:
        execution.receipt.artifacts.evidence?.artifactId ?? null,
      outputFiles: Object.freeze({
        dispatch: dispatchWrite.outputPath,
        binding: bindingWrite.outputPath,
        outcome: outcomeWrite.outputPath,
        receipt: receiptWrite.outputPath,
      }),
      candidateBytesMaterialized: false,
      candidateApprovalPerformed: false,
      identityApprovalPerformed: false,
      publicationPerformed: false,
      runtimeActivationPerformed: false,
    });
  } catch (error) {
    removeOwned(created);
    throw error;
  }
}

const invoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (invoked) {
  try {
    const result = await runCharacterIdentityProviderExecution(
      process.argv.slice(2),
      process.env,
      { build: true },
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== 'succeeded') process.exitCode = 2;
  } catch (error) {
    process.stderr.write(
      `${error?.code ?? 'CHARACTER_IDENTITY_PROVIDER_EXECUTION_CLI_FAILED'}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
