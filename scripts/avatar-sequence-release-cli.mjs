#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  avatarSequenceReleaseCapabilities,
  sealAvatarSequenceReleaseFiles,
} from './project-art/avatar-sequence-release.mjs';

function parsePairs(values) {
  const output = new Map();
  if (values.length % 2 !== 0) {
    throw new Error('arguments must be unique --name value pairs');
  }
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (
      typeof name !== 'string' ||
      !name.startsWith('--') ||
      typeof value !== 'string' ||
      value.startsWith('--') ||
      output.has(name)
    ) {
      throw new Error('arguments must be unique --name value pairs');
    }
    output.set(name, value);
  }
  return output;
}

function required(values, name) {
  const value = values.get(name);
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

export function runAvatarSequenceReleaseCli(argv = process.argv.slice(2)) {
  const command = argv[0];
  if (command === 'capabilities') {
    if (argv.length !== 1) throw new Error('capabilities takes no arguments');
    return avatarSequenceReleaseCapabilities();
  }
  if (command !== 'seal') {
    throw new Error('command must be capabilities or seal');
  }
  const values = parsePairs(argv.slice(1));
  const allowed = new Set(['--workspace-root', '--request', '--sealed-at']);
  for (const key of values.keys()) {
    if (!allowed.has(key)) throw new Error(`unsupported argument ${key}`);
  }
  const result = sealAvatarSequenceReleaseFiles({
    workspaceRoot: required(values, '--workspace-root'),
    requestPath: required(values, '--request'),
    ...(values.get('--sealed-at') ? { sealedAt: values.get('--sealed-at') } : {}),
  });
  return {
    status: result.status,
    reused: result.reused,
    outputDirectoryPath: result.outputDirectoryPath,
    releasePath: result.releasePath,
    runtimePackPath: result.runtimePackPath,
    receiptPath: result.receiptPath,
    releaseSha256: result.release.releaseSha256,
    runtimePackSha256: result.runtimePack.packSha256,
    receiptSha256: result.receipt.receiptSha256,
    sequenceReleaseSealed: true,
    runtimeActivationAllowed: false,
    repositoryMutation: false,
    gitPublication: false,
    forcePush: false,
  };
}

const directlyInvoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (directlyInvoked) {
  try {
    process.stdout.write(`${JSON.stringify(runAvatarSequenceReleaseCli())}\n`);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        ...(error?.code ? { code: error.code } : {}),
      })}\n`,
    );
    process.exitCode = 2;
  }
}
