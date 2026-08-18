#!/usr/bin/env node
import { lstatSync, realpathSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  parseProjectArtTopHatPoseSlotProviderRuntimeAdapter,
} from './project-art/top-hat-pose-slot-provider-runtime-adapter.mjs';
import {
  parseAvatarFinalPassProviderRuntimeBinding,
  parseAvatarFinalPassProviderRuntimeDispatch,
} from './project-art/avatar-final-pass-provider-runtime-dispatch.mjs';
import {
  assert,
  sha256Document,
  verifySelfHash,
} from './project-art/avatar-final-pass-provider-runtime-common.mjs';
import {
  failTopHatProviderRuntimeCli as fail,
  readTopHatProviderRuntimeJsonFile as stableJsonFile,
  sha256TopHatProviderRuntimeBytes,
  writeTopHatProviderRuntimeJsonCreateOnly as writeCreateOnlyJson,
} from './project-art/top-hat-pose-slot-provider-runtime-cli-files.mjs';

const REQUIRED_FLAGS = Object.freeze([
  '--adapter',
  '--expected-adapter-file-sha256',
  '--slot-id',
  '--runtime-root',
  '--artifact-root',
  '--dispatch-output',
  '--binding-output',
  '--outcome-output',
  '--receipt-output',
]);
const OPTIONAL_FLAGS = Object.freeze(['--worker-id']);

function parseFlags(argv) {
  if (!Array.isArray(argv) || argv.length % 2 !== 0) {
    fail('TOP_HAT_PROVIDER_RUNTIME_EXECUTION_CLI_INVALID');
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
      fail('TOP_HAT_PROVIDER_RUNTIME_EXECUTION_CLI_INVALID');
    }
    values.set(flag, value);
  }
  for (const flag of REQUIRED_FLAGS) {
    if (!values.has(flag)) {
      fail(
        'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_CLI_INVALID',
        `Missing required flag ${flag}.`,
      );
    }
  }
  const expectedSha256 = values.get('--expected-adapter-file-sha256');
  if (!/^[a-f0-9]{64}$/u.test(expectedSha256)) {
    fail(
      'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_CLI_INVALID',
      '--expected-adapter-file-sha256 must be a lowercase SHA-256.',
    );
  }
  return values;
}

function createOnlyTarget(value, label) {
  const absolute = path.resolve(value);
  if (value.includes('\0')) {
    fail(
      'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_CLI_PATH_INVALID',
      `${label} is invalid.`,
    );
  }
  const parent = path.dirname(absolute);
  const parentState = lstatSync(parent);
  if (
    !parentState.isDirectory() ||
    parentState.isSymbolicLink() ||
    realpathSync(parent) !== path.resolve(parent)
  ) {
    fail(
      'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_CLI_OUTPUT_PARENT_INVALID',
      `${label} parent must be a real directory on an ordinary path.`,
    );
  }
  try {
    lstatSync(absolute);
    fail(
      'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_CLI_OUTPUT_EXISTS',
      `${label} is create-only and already exists.`,
    );
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return absolute;
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
    'Top Hat runtime outcome',
  );
  assert(
    parsed.runtimeOutcomeSha256 === expected.runtimeOutcomeSha256 &&
      parsed.runtimeDispatchSha256 === expected.runtimeDispatchSha256 &&
      parsed.runtimeBindingSha256 === expected.runtimeBindingSha256,
    'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_CLI_OUTCOME_VERIFY_FAILED',
  );
  return parsed;
}

function verifyReceipt(value, expected) {
  assert(
    value && typeof value === 'object' && !Array.isArray(value),
    'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_CLI_RECEIPT_VERIFY_FAILED',
  );
  const { executionSha256, ...body } = value;
  assert(
    executionSha256 === expected.executionSha256 &&
      sha256Document(body) === executionSha256,
    'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_CLI_RECEIPT_VERIFY_FAILED',
  );
  return value;
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
      'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_BUILD_FAILED',
      `${label} failed to start: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    fail(
      'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_BUILD_FAILED',
      `${label} failed with exit code ${result.status}.`,
    );
  }
}

export async function runTopHatPoseSlotProviderExecution(
  argv,
  environment = process.env,
  { build = false } = {},
) {
  const flags = parseFlags(argv);
  const adapterInput = stableJsonFile(
    path.resolve(flags.get('--adapter')),
    'adapterPath',
  );
  const actualAdapterFileSha256 = sha256TopHatProviderRuntimeBytes(
    adapterInput.bytes,
  );
  if (actualAdapterFileSha256 !== flags.get('--expected-adapter-file-sha256')) {
    fail(
      'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_CLI_ADAPTER_SHA256_MISMATCH',
      'Adapter file SHA-256 does not match the reviewed expected digest.',
    );
  }
  const adapter = parseProjectArtTopHatPoseSlotProviderRuntimeAdapter(
    adapterInput.value,
  );
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

  const { executeTopHatPoseSlotProvider } = await import(
    './project-art/top-hat-pose-slot-provider-execution.mjs'
  );
  const execution = await executeTopHatPoseSlotProvider({
    adapter,
    slotId: flags.get('--slot-id'),
    runtimeRoot: path.resolve(flags.get('--runtime-root')),
    artifactRoot: path.resolve(flags.get('--artifact-root')),
    ...(flags.has('--worker-id') ? { workerId: flags.get('--worker-id') } : {}),
    environment,
  });

  const created = [];
  try {
    const dispatchWrite = writeCreateOnlyJson({
      outputPath: outputs.dispatch,
      value: execution.dispatch,
      verify: parseAvatarFinalPassProviderRuntimeDispatch,
    });
    created.push(dispatchWrite.outputPath);

    const bindingWrite = writeCreateOnlyJson({
      outputPath: outputs.binding,
      value: execution.binding,
      verify: (value) =>
        parseAvatarFinalPassProviderRuntimeBinding(value, execution.dispatch),
    });
    created.push(bindingWrite.outputPath);

    let outcomeWrite = null;
    if (execution.outcome !== null) {
      outcomeWrite = writeCreateOnlyJson({
        outputPath: outputs.outcome,
        value: execution.outcome,
        verify: (value) => verifyOutcome(value, execution.outcome),
      });
      created.push(outcomeWrite.outputPath);
    }

    const receiptWrite = writeCreateOnlyJson({
      outputPath: outputs.receipt,
      value: execution.receipt,
      verify: (value) => verifyReceipt(value, execution.receipt),
    });
    created.push(receiptWrite.outputPath);

    return Object.freeze({
      status: execution.receipt.status,
      slotId: execution.receipt.slotId,
      sourceAdapterSha256: execution.receipt.sourceAdapterSha256,
      adapterFileSha256: actualAdapterFileSha256,
      executionSha256: execution.receipt.executionSha256,
      runtimeDispatchSha256: execution.dispatch.runtimeDispatchSha256,
      runtimeBindingSha256: execution.binding.runtimeBindingSha256,
      runtimeOutcomeSha256: execution.outcome?.runtimeOutcomeSha256 ?? null,
      providerCallCount: execution.receipt.provider.providerCallCount,
      providerCallCountVerified:
        execution.receipt.provider.providerCallCountVerified,
      outputFiles: Object.freeze({
        dispatch: dispatchWrite.outputPath,
        binding: bindingWrite.outputPath,
        outcome: outcomeWrite?.outputPath ?? null,
        receipt: receiptWrite.outputPath,
      }),
      candidateMaterializationPerformed: false,
      candidateApprovalPerformed: false,
      poseSlotFilled: false,
      sequenceReleased: false,
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
    const result = await runTopHatPoseSlotProviderExecution(
      process.argv.slice(2),
      process.env,
      { build: true },
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== 'succeeded') process.exitCode = 2;
  } catch (error) {
    const code = error?.code ?? 'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_CLI_FAILED';
    process.stderr.write(
      `${code}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
