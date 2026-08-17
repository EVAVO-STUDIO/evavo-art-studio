#!/usr/bin/env node
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  compileEvaDenseMotionReleaseEvidence,
  evaluateEvaDenseMotionReleaseEvidence,
} from './project-art/eva-dense-motion-release-evidence.mjs';

const MAXIMUM_REQUEST_BYTES = 16 * 1024 * 1024;
const ALLOWED_ARGUMENTS = new Set(['--request', '--output']);

function argumentsFor(argv) {
  if (argv.length % 2 !== 0) {
    throw new Error('Arguments must be supplied as --name value pairs.');
  }
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      !ALLOWED_ARGUMENTS.has(name) ||
      typeof value !== 'string' ||
      value.length === 0 ||
      value.startsWith('--') ||
      values.has(name)
    ) {
      throw new Error(`Invalid argument ${name ?? ''}.`);
    }
    values.set(name, value);
  }
  for (const required of ALLOWED_ARGUMENTS) {
    if (!values.has(required)) throw new Error(`Missing ${required}.`);
  }
  return values;
}

function stableJsonFile(filePath) {
  const lexical = path.resolve(filePath);
  const lexicalMetadata = lstatSync(lexical);
  const lexicalParent = path.dirname(lexical);
  if (
    lexicalMetadata.isSymbolicLink() ||
    realpathSync(lexicalParent) !== lexicalParent ||
    realpathSync(lexical) !== lexical
  ) {
    throw new Error('Request path cannot contain symbolic path components.');
  }
  const absolute = lexical;
  const before = lexicalMetadata;
  if (
    !before.isFile() ||
    before.nlink !== 1 ||
    before.size < 2 ||
    before.size > MAXIMUM_REQUEST_BYTES
  ) {
    throw new Error('Request must be a bounded single-link regular JSON file.');
  }
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    if (before[field] !== after[field]) {
      throw new Error('Request changed while it was being read.');
    }
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) throw new Error('UTF-8 BOM is forbidden.');
  return JSON.parse(text);
}

function writeCreateOnlyJson(outputPath, value) {
  const absolute = path.resolve(outputPath);
  const parent = path.dirname(absolute);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const parentMetadata = lstatSync(parent);
  if (!parentMetadata.isDirectory() || parentMetadata.isSymbolicLink()) {
    throw new Error('Output parent must be a non-symbolic directory.');
  }
  if (realpathSync(parent) !== parent) {
    throw new Error('Output path cannot traverse symbolic directory components.');
  }
  let descriptor;
  let completed = false;
  try {
    descriptor = openSync(absolute, 'wx', 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fsyncSync(descriptor);
    completed = true;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (!completed && descriptor !== undefined) {
      try {
        unlinkSync(absolute);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
  }
  return absolute;
}

export function runProjectArtEvaDenseMotionReleaseEvidenceCli(
  argv = process.argv.slice(2),
) {
  const values = argumentsFor(argv);
  const request = stableJsonFile(values.get('--request'));
  const evidence = compileEvaDenseMotionReleaseEvidence(request);
  const status = evaluateEvaDenseMotionReleaseEvidence(evidence);
  const output = writeCreateOnlyJson(values.get('--output'), evidence);
  return Object.freeze({
    status: 'passed',
    schema: evidence.schema,
    releaseEvidenceSha256: evidence.releaseEvidenceSha256,
    frameCount: evidence.frames.length,
    continuityEdgeCount: evidence.continuity.length,
    releaseEvidenceComplete: status.releaseEvidenceComplete,
    runtimeReceiptAssemblyReady: status.runtimeReceiptAssemblyReady,
    providerExecution: false,
    cloudinaryUpload: false,
    publicationAllowed: false,
    deploymentAllowed: false,
    runtimeActivationAllowed: false,
    output,
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.stdout.write(
      `${JSON.stringify(runProjectArtEvaDenseMotionReleaseEvidenceCli())}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: 'failed',
        code:
          error?.code ??
          'PROJECT_ART_EVA_DENSE_MOTION_RELEASE_EVIDENCE_CLI_FAILED',
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  }
}
