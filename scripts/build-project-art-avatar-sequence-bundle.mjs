#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_MANIFEST_SCHEMA,
  PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RECEIPT_SCHEMA,
  materializeProjectArtAvatarSequenceBundle,
} from './project-art/avatar-sequence-bundle.mjs';

function parseArguments(argv) {
  const allowed = new Set(['--plan', '--output', '--created-at']);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || value === undefined || value.startsWith('--')) {
      throw new Error(`Invalid argument near ${key ?? '<missing>'}.`);
    }
    if (values.has(key)) throw new Error(`Duplicate argument: ${key}.`);
    values.set(key, value);
  }
  for (const required of ['--plan', '--output']) {
    if (!values.has(required)) throw new Error(`Missing ${required}.`);
  }
  return values;
}

export async function buildProjectArtAvatarSequenceBundleFile(
  planPath,
  outputRoot,
  { createdAt = new Date().toISOString() } = {},
) {
  return materializeProjectArtAvatarSequenceBundle({
    planPath,
    outputRoot,
    createdAt,
  });
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const result = await buildProjectArtAvatarSequenceBundleFile(
    args.get('--plan'),
    args.get('--output'),
    { createdAt: args.get('--created-at') ?? new Date().toISOString() },
  );
  console.log(
    JSON.stringify({
      ...result,
      manifestSchema: PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_MANIFEST_SCHEMA,
      receiptSchema: PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RECEIPT_SCHEMA,
      sourceMutation: false,
      targetImageWrite: false,
      providerExecution: false,
      repositoryMutation: false,
      gitPush: false,
      publication: false,
    }),
  );
}

const isEntrypoint =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) {
  main().catch((error) => {
    console.error(
      `${error?.code ?? 'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_BUILD_FAILED'}: ${error?.message ?? String(error)}`,
    );
    process.exit(1);
  });
}
