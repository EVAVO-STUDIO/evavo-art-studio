#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_MANIFEST_SCHEMA,
  PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RECEIPT_SCHEMA,
  verifyProjectArtAvatarSequenceBundle,
} from './project-art/avatar-sequence-bundle.mjs';

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== '--bundle-root' || !argv[1]) {
    throw new Error('Usage: --bundle-root <path>.');
  }
  return argv[1];
}

export async function verifyProjectArtAvatarSequenceBundleRoot(bundleRoot) {
  return verifyProjectArtAvatarSequenceBundle({ bundleRoot });
}

async function main() {
  const result = await verifyProjectArtAvatarSequenceBundleRoot(
    parseArguments(process.argv.slice(2)),
  );
  console.log(
    JSON.stringify({
      ...result,
      manifestSchema: PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_MANIFEST_SCHEMA,
      receiptSchema: PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RECEIPT_SCHEMA,
      verificationReadOnly: true,
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
      `${error?.code ?? 'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_VERIFY_FAILED'}: ${error?.message ?? String(error)}`,
    );
    process.exit(1);
  });
}
