#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  assert,
  sha256Document,
} from './project-art/avatar-final-pass-provider-runtime-common.mjs';
import {
  TOP_HAT_RUNTIME_EXPECTED_SLOTS,
} from './project-art/top-hat-pose-slot-provider-runtime-foundation.mjs';

const SCHEMA =
  'evavo.project-art-top-hat-pose-bank-frame-review-decision-manifest.v1';
const PROTOCOL_VERSION = '2026-08-19.1';

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function parseFlags(argv) {
  if (
    !Array.isArray(argv) ||
    argv.length !== 4 ||
    argv[0] !== '--decision-root' ||
    argv[2] !== '--output' ||
    typeof argv[1] !== 'string' ||
    typeof argv[3] !== 'string'
  ) {
    fail('TOP_HAT_FRAME_REVIEW_DECISION_MANIFEST_CLI_INVALID');
  }
  return Object.freeze({ decisionRoot: argv[1], output: argv[3] });
}

function absolutePath(value, label) {
  if (
    typeof value !== 'string' ||
    !path.isAbsolute(value) ||
    value.includes('\0') ||
    path.normalize(value) !== value
  ) {
    fail(
      'TOP_HAT_FRAME_REVIEW_DECISION_MANIFEST_PATH_INVALID',
      `${label} must be an absolute normalized path.`,
    );
  }
  return value;
}

function realDirectory(value) {
  const root = absolutePath(value, 'decisionRoot');
  const metadata = lstatSync(root);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    realpathSync(root) !== root
  ) {
    fail(
      'TOP_HAT_FRAME_REVIEW_DECISION_MANIFEST_PATH_INVALID',
      'decisionRoot must be a real ordinary directory.',
    );
  }
  return root;
}

function stableFileSha256(filePath, label) {
  const before = lstatSync(filePath);
  assert(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1 &&
      realpathSync(filePath) === filePath,
    'TOP_HAT_FRAME_REVIEW_DECISION_MANIFEST_INPUT_INVALID',
    `${label} must be a single-link ordinary file.`,
  );
  const bytes = readFileSync(filePath);
  const after = lstatSync(filePath);
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(
      before[key] === after[key],
      'TOP_HAT_FRAME_REVIEW_DECISION_MANIFEST_INPUT_CHANGED',
      `${label} changed while being hashed.`,
    );
  }
  return createHash('sha256').update(bytes).digest('hex');
}

function writeCreateOnly(filePath, value) {
  const parent = path.dirname(filePath);
  const parentMetadata = lstatSync(parent);
  assert(
    parentMetadata.isDirectory() &&
      !parentMetadata.isSymbolicLink() &&
      realpathSync(parent) === parent,
    'TOP_HAT_FRAME_REVIEW_DECISION_MANIFEST_OUTPUT_INVALID',
  );
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  let handle;
  try {
    handle = openSync(filePath, 'wx', 0o600);
    writeFileSync(handle, bytes);
    fsyncSync(handle);
  } finally {
    if (handle !== undefined) closeSync(handle);
  }
  const written = readFileSync(filePath);
  assert(
    written.equals(bytes),
    'TOP_HAT_FRAME_REVIEW_DECISION_MANIFEST_OUTPUT_VERIFY_FAILED',
  );
}

export function compileTopHatPoseBankFrameReviewDecisionManifest({
  decisionRoot: decisionRootInput,
}) {
  const decisionRoot = realDirectory(decisionRootInput);
  const slots = TOP_HAT_RUNTIME_EXPECTED_SLOTS.map((slotId) => {
    const decisionPath = path.join(
      decisionRoot,
      `${slotId}.frame-review-decision.json`,
    );
    return Object.freeze({
      slotId,
      decisionPath,
      decisionFileSha256: stableFileSha256(decisionPath, `${slotId} decision`),
    });
  });
  const body = {
    schema: SCHEMA,
    protocolVersion: PROTOCOL_VERSION,
    slots: Object.freeze(slots),
    policy: Object.freeze({
      decisionsExternallyAuthored: true,
      namedHumanRequired: true,
      automaticDecisionCreationAllowed: false,
    }),
  };
  return Object.freeze({
    ...body,
    decisionManifestSha256: sha256Document(body),
  });
}

export async function main(argv = process.argv.slice(2)) {
  const flags = parseFlags(argv);
  const output = absolutePath(flags.output, 'output');
  const manifest = compileTopHatPoseBankFrameReviewDecisionManifest({
    decisionRoot: absolutePath(flags.decisionRoot, 'decisionRoot'),
  });
  writeCreateOnly(output, manifest);
  process.stdout.write(
    `${JSON.stringify({
      status: 'decision-manifest-created-without-authoring-decisions',
      output,
      decisionManifestSha256: manifest.decisionManifestSha256,
      slots: manifest.slots.length,
      automaticDecisionCreationAllowed: false,
    }, null, 2)}\n`,
  );
  return manifest;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        status: 'failed',
        code:
          typeof error?.code === 'string'
            ? error.code
            : 'TOP_HAT_FRAME_REVIEW_DECISION_MANIFEST_FAILED',
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
