#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_RECEIPT_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_DISPATCH_RECEIPT_SCHEMA,
  compileProjectArtTopHatPoseSlotProviderRuntimeAdapter,
  compileProjectArtTopHatPoseSlotProviderRuntimeDispatch,
  parseProjectArtTopHatPoseSlotProviderRuntimeAdapter,
} from './project-art/top-hat-pose-slot-provider-runtime-adapter.mjs';
import {
  parseAvatarFinalPassProviderRuntimeDispatch,
} from './project-art/avatar-final-pass-provider-runtime-dispatch.mjs';
import {
  failTopHatProviderRuntimeCli as fail,
  readTopHatProviderRuntimeJsonFile as stableJsonFile,
  sha256TopHatProviderRuntimeBytes as sha256,
  writeTopHatProviderRuntimeJsonCreateOnly as writeCreateOnlyJson,
} from './project-art/top-hat-pose-slot-provider-runtime-cli-files.mjs';

export function writeProjectArtTopHatPoseSlotProviderRuntimeAdapter({
  requestPath,
  outputPath,
  compiledAt,
}) {
  const request = stableJsonFile(requestPath, 'requestPath');
  const adapter =
    compileProjectArtTopHatPoseSlotProviderRuntimeAdapter({
      request: request.value,
      ...(compiledAt ? { compiledAt } : {}),
    });
  const output = writeCreateOnlyJson({
    outputPath,
    value: adapter,
    verify: parseProjectArtTopHatPoseSlotProviderRuntimeAdapter,
  });
  return Object.freeze({
    schema:
      TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_RECEIPT_SCHEMA,
    sourceRequestPath: request.absolute,
    sourceRequestBytes: request.bytes.length,
    sourceRequestSha256: sha256(request.bytes),
    ...output,
    adapterSha256: adapter.adapterSha256,
    sourceProviderPackageSha256:
      adapter.sourceProviderPackageSha256,
    sourceProviderRequestSha256:
      adapter.sourceProviderRequestSha256,
    productionPlanSha256: adapter.productionPlanSha256,
    compiledAt: adapter.compiledAt,
    slots: adapter.counts.slots,
    readySlots: adapter.counts.readySlots,
    maximumProviderCalls: adapter.counts.maximumProviderCalls,
    providerExecutionPerformed: false,
    runtimeDispatchCompiled: false,
    candidateBytesMaterialized: false,
    candidateApprovalPerformed: false,
    poseSlotsFilled: false,
    runtimeActivationPerformed: false,
    repositoryMutationAuthority: false,
    publicationAuthority: false,
    forcePushAuthority: false,
  });
}

export function writeProjectArtTopHatPoseSlotProviderRuntimeDispatch({
  adapterPath,
  slotId,
  outputPath,
  compiledAt,
}) {
  const adapterInput = stableJsonFile(adapterPath, 'adapterPath');
  const adapter =
    parseProjectArtTopHatPoseSlotProviderRuntimeAdapter(
      adapterInput.value,
    );
  const dispatch =
    compileProjectArtTopHatPoseSlotProviderRuntimeDispatch({
      adapter,
      slotId,
      ...(compiledAt ? { compiledAt } : {}),
    });
  const output = writeCreateOnlyJson({
    outputPath,
    value: dispatch,
    verify: parseAvatarFinalPassProviderRuntimeDispatch,
  });
  return Object.freeze({
    schema:
      TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_DISPATCH_RECEIPT_SCHEMA,
    sourceAdapterPath: adapterInput.absolute,
    sourceAdapterBytes: adapterInput.bytes.length,
    sourceAdapterFileSha256: sha256(adapterInput.bytes),
    sourceAdapterSha256: adapter.adapterSha256,
    sourceProviderPackageSha256:
      adapter.sourceProviderPackageSha256,
    productionPlanSha256: adapter.productionPlanSha256,
    slotId,
    ...output,
    runtimeDispatchSha256: dispatch.runtimeDispatchSha256,
    genericBatchSha256: dispatch.batchSha256,
    providerRequestInputSha256:
      dispatch.providerRequestInputSha256,
    submissionIdempotencyKey:
      dispatch.submissionIdempotencyKey,
    compiledAt: dispatch.compiledAt,
    providerExecutionPerformed: false,
    runtimeEnqueuePerformed: false,
    candidateBytesMaterialized: false,
    candidateApprovalPerformed: false,
    poseSlotFilled: false,
    runtimeActivationPerformed: false,
    repositoryMutationAuthority: false,
    publicationAuthority: false,
    forcePushAuthority: false,
  });
}

function parseFlags(argv, allowed) {
  if (!Array.isArray(argv) || argv.length % 2 !== 0) {
    fail('TOP_HAT_PROVIDER_RUNTIME_CLI_INVALID');
  }
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(flag) || Object.hasOwn(result, flag)) {
      fail('TOP_HAT_PROVIDER_RUNTIME_CLI_INVALID');
    }
    result[flag] = value;
  }
  return result;
}

function parseCli(argv) {
  const [command, ...rest] = argv;
  if (command === 'adapt') {
    const flags = parseFlags(
      rest,
      new Set(['--request', '--output', '--compiled-at']),
    );
    if (!flags['--request'] || !flags['--output']) {
      fail('TOP_HAT_PROVIDER_RUNTIME_CLI_INVALID');
    }
    return Object.freeze({
      command,
      options: Object.freeze({
        requestPath: flags['--request'],
        outputPath: flags['--output'],
        ...(flags['--compiled-at']
          ? { compiledAt: flags['--compiled-at'] }
          : {}),
      }),
    });
  }
  if (command === 'dispatch') {
    const flags = parseFlags(
      rest,
      new Set([
        '--adapter',
        '--slot-id',
        '--output',
        '--compiled-at',
      ]),
    );
    if (
      !flags['--adapter'] ||
      !flags['--slot-id'] ||
      !flags['--output']
    ) {
      fail('TOP_HAT_PROVIDER_RUNTIME_CLI_INVALID');
    }
    return Object.freeze({
      command,
      options: Object.freeze({
        adapterPath: flags['--adapter'],
        slotId: flags['--slot-id'],
        outputPath: flags['--output'],
        ...(flags['--compiled-at']
          ? { compiledAt: flags['--compiled-at'] }
          : {}),
      }),
    });
  }
  fail(
    'TOP_HAT_PROVIDER_RUNTIME_CLI_INVALID',
    'Usage: node scripts/top-hat-pose-slot-provider-runtime-cli.mjs adapt --request <absolute-request.json> --output <absolute-adapter.json> [--compiled-at <ISO>] | dispatch --adapter <absolute-adapter.json> --slot-id <slot> --output <absolute-dispatch.json> [--compiled-at <ISO>]',
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  try {
    const parsed = parseCli(process.argv.slice(2));
    const receipt =
      parsed.command === 'adapt'
        ? writeProjectArtTopHatPoseSlotProviderRuntimeAdapter(
            parsed.options,
          )
        : writeProjectArtTopHatPoseSlotProviderRuntimeDispatch(
            parsed.options,
          );
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    const code =
      error?.code ?? 'TOP_HAT_PROVIDER_RUNTIME_CLI_FAILED';
    process.stderr.write(
      `${code}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
