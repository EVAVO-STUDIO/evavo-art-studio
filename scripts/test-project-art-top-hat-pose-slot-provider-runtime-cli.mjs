#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  linkSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_RECEIPT_SCHEMA,
  TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_DISPATCH_RECEIPT_SCHEMA,
  parseProjectArtTopHatPoseSlotProviderRuntimeAdapter,
} from './project-art/top-hat-pose-slot-provider-runtime-adapter.mjs';
import {
  createReadyTopHatPoseSlotProviderRuntimeRequest,
  topHatPoseRuntimeFixtureCompiledAt as compiledAt,
} from './project-art/top-hat-pose-slot-provider-runtime-fixture.mjs';
import {
  parseAvatarFinalPassProviderRuntimeDispatch,
} from './project-art/avatar-final-pass-provider-runtime-dispatch.mjs';
import {
  writeProjectArtTopHatPoseSlotProviderRuntimeAdapter,
  writeProjectArtTopHatPoseSlotProviderRuntimeDispatch,
} from './top-hat-pose-slot-provider-runtime-cli.mjs';

function temporaryDirectory() {
  return mkdtempSync(
    path.join(os.tmpdir(), 'evavo-top-hat-provider-runtime-'),
  );
}

test('writes and independently verifies create-only adapter and dispatch records', () => {
  const root = temporaryDirectory();
  try {
    const requestPath = path.join(root, 'request.json');
    const adapterPath = path.join(root, 'adapter.json');
    const dispatchPath = path.join(root, 'dispatch.json');
    writeFileSync(
      requestPath,
      `${JSON.stringify(
        createReadyTopHatPoseSlotProviderRuntimeRequest(),
        null,
        2,
      )}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );

    const adapterReceipt =
      writeProjectArtTopHatPoseSlotProviderRuntimeAdapter({
        requestPath,
        outputPath: adapterPath,
        compiledAt,
      });
    assert.equal(
      adapterReceipt.schema,
      TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_ADAPTER_RECEIPT_SCHEMA,
    );
    assert.equal(adapterReceipt.slots, 6);
    assert.equal(adapterReceipt.readySlots, 6);
    assert.equal(
      adapterReceipt.providerExecutionPerformed,
      false,
    );
    assert.equal(
      lstatSync(adapterPath).mode & 0o777,
      0o600,
    );
    const adapter =
      parseProjectArtTopHatPoseSlotProviderRuntimeAdapter(
        JSON.parse(readFileSync(adapterPath, 'utf8')),
      );
    assert.equal(
      adapter.adapterSha256,
      adapterReceipt.adapterSha256,
    );

    const dispatchReceipt =
      writeProjectArtTopHatPoseSlotProviderRuntimeDispatch({
        adapterPath,
        slotId: 'presentation-open',
        outputPath: dispatchPath,
        compiledAt,
      });
    assert.equal(
      dispatchReceipt.schema,
      TOP_HAT_POSE_SLOT_PROVIDER_RUNTIME_DISPATCH_RECEIPT_SCHEMA,
    );
    assert.equal(dispatchReceipt.slotId, 'presentation-open');
    assert.equal(
      dispatchReceipt.providerExecutionPerformed,
      false,
    );
    assert.equal(
      dispatchReceipt.runtimeEnqueuePerformed,
      false,
    );
    assert.equal(
      lstatSync(dispatchPath).mode & 0o777,
      0o600,
    );
    const dispatch =
      parseAvatarFinalPassProviderRuntimeDispatch(
        JSON.parse(readFileSync(dispatchPath, 'utf8')),
      );
    assert.equal(
      dispatch.runtimeDispatchSha256,
      dispatchReceipt.runtimeDispatchSha256,
    );
    assert.equal(dispatch.frameId, 'presentation-open');
    assert.equal(
      dispatch.candidateAdmission.reviewedTargetPath,
      'assets/top-hat-man/candidates/top-hat-man-presentation-open-v1.alpha.png',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('refuses overwrite and preserves the first complete record', () => {
  const root = temporaryDirectory();
  try {
    const requestPath = path.join(root, 'request.json');
    const adapterPath = path.join(root, 'adapter.json');
    writeFileSync(
      requestPath,
      `${JSON.stringify(
        createReadyTopHatPoseSlotProviderRuntimeRequest(),
      )}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
    writeProjectArtTopHatPoseSlotProviderRuntimeAdapter({
      requestPath,
      outputPath: adapterPath,
      compiledAt,
    });
    const before = readFileSync(adapterPath);
    assert.throws(
      () =>
        writeProjectArtTopHatPoseSlotProviderRuntimeAdapter({
          requestPath,
          outputPath: adapterPath,
          compiledAt,
        }),
      (error) =>
        error.code ===
        'TOP_HAT_PROVIDER_RUNTIME_CLI_OUTPUT_EXISTS',
    );
    assert.deepEqual(readFileSync(adapterPath), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects symbolic inputs, unsafe paths and expired dispatch without partial output', () => {
  const root = temporaryDirectory();
  try {
    const realRequest = path.join(root, 'real-request.json');
    const linkedRequest = path.join(root, 'linked-request.json');
    const adapterPath = path.join(root, 'adapter.json');
    const expiredDispatchPath = path.join(
      root,
      'expired-dispatch.json',
    );
    writeFileSync(
      realRequest,
      `${JSON.stringify(
        createReadyTopHatPoseSlotProviderRuntimeRequest(),
      )}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
    symlinkSync(realRequest, linkedRequest);
    assert.throws(
      () =>
        writeProjectArtTopHatPoseSlotProviderRuntimeAdapter({
          requestPath: linkedRequest,
          outputPath: adapterPath,
          compiledAt,
        }),
      (error) =>
        error.code ===
        'TOP_HAT_PROVIDER_RUNTIME_CLI_INPUT_INVALID',
    );

    writeProjectArtTopHatPoseSlotProviderRuntimeAdapter({
      requestPath: realRequest,
      outputPath: adapterPath,
      compiledAt,
    });
    assert.throws(
      () =>
        writeProjectArtTopHatPoseSlotProviderRuntimeDispatch({
          adapterPath,
          slotId: 'blink-closed',
          outputPath: expiredDispatchPath,
          compiledAt: '2026-08-16T18:00:00.001Z',
        }),
      (error) =>
        error.code ===
        'TOP_HAT_PROVIDER_RUNTIME_AUTHORIZATION_EXPIRED',
    );
    assert.throws(
      () => lstatSync(expiredDispatchPath),
      (error) => error.code === 'ENOENT',
    );

    assert.throws(
      () =>
        writeProjectArtTopHatPoseSlotProviderRuntimeAdapter({
          requestPath: realRequest,
          outputPath: 'relative-adapter.json',
          compiledAt,
        }),
      (error) =>
        error.code ===
        'TOP_HAT_PROVIDER_RUNTIME_CLI_PATH_INVALID',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects multiply linked input evidence', () => {
  const root = temporaryDirectory();
  try {
    const requestPath = path.join(root, 'request.json');
    const secondLink = path.join(root, 'request-second-link.json');
    const adapterPath = path.join(root, 'adapter.json');
    writeFileSync(
      requestPath,
      `${JSON.stringify(
        createReadyTopHatPoseSlotProviderRuntimeRequest(),
      )}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
    try {
      linkSync(requestPath, secondLink);
    } catch (error) {
      if (
        process.platform === 'win32' &&
        ['EPERM', 'EACCES'].includes(error.code)
      ) {
        return;
      }
      throw error;
    }
    assert.throws(
      () =>
        writeProjectArtTopHatPoseSlotProviderRuntimeAdapter({
          requestPath,
          outputPath: adapterPath,
          compiledAt,
        }),
      (error) =>
        error.code ===
        'TOP_HAT_PROVIDER_RUNTIME_CLI_INPUT_INVALID',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

console.log(
  'Project Art Top Hat provider runtime CLI regressions passed.',
);
