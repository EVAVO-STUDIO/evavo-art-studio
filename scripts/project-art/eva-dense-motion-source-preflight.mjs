#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  CANVAS,
  EVA_DENSE_MOTION_FAMILY_ID,
  RAW_FRAMES,
} from './eva-dense-motion-work-order-data.mjs';
import { inspectPngStructure } from './png-structure-v1.mjs';

export const EVA_DENSE_MOTION_SOURCE_PREFLIGHT_SCHEMA =
  'evavo.project-art-eva-dense-motion-source-preflight.v2';
export const EVA_DENSE_MOTION_SOURCE_PREFLIGHT_CAPABILITIES_SCHEMA =
  'evavo.project-art-eva-dense-motion-source-preflight-capabilities.v1';
export const EVA_DENSE_MOTION_SOURCE_ORDINALS = Object.freeze([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
]);

const MAXIMUM_SOURCE_BYTES = 64 * 1024 * 1024;
const SHA1 = /^[a-f0-9]{40}$/u;
const ALLOWED_COLOR_TYPES = Object.freeze([2, 4, 6]);

function fail(code, message = code) {
  const error = new Error(message === code ? code : `${code}: ${message}`);
  error.code = code;
  throw error;
}

function authority() {
  return Object.freeze({
    sourceRead: true,
    sourceMutation: false,
    sourceDeletion: false,
    candidateCreation: false,
    candidateApproval: false,
    candidatePromotion: false,
    providerExecution: false,
    cloudinaryUpload: false,
    publication: false,
    runtimeActivation: false,
    repositoryMutation: false,
    gitMutation: false,
    forcePush: false,
  });
}

export function gitBlobSha1(bytes) {
  const value = Buffer.from(bytes);
  return createHash('sha1')
    .update(Buffer.from(`blob ${value.length}\0`, 'utf8'))
    .update(value)
    .digest('hex');
}

export function sha256(bytes) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

export function inspectPngHeader(bytesInput) {
  return inspectPngStructure(bytesInput, {
    expectedWidth: CANVAS.width,
    expectedHeight: CANVAS.height,
    expectedBitDepth: 8,
    allowedColorTypes: ALLOWED_COLOR_TYPES,
    requireNonInterlaced: true,
    maximumBytes: MAXIMUM_SOURCE_BYTES,
    errorPrefix: 'EVA_DENSE_SOURCE_PNG',
  });
}

export function sourceRelativePath(label) {
  return `assets/eva-female/ChatGPT Image Aug 9, 2026, ${label}.png`;
}

export function tenMasterSourceFrames() {
  return Object.freeze(
    RAW_FRAMES.map(([ordinal, label, sourceGitBlobSha1]) =>
      Object.freeze({
        ordinal,
        label,
        frameId:
          `${EVA_DENSE_MOTION_FAMILY_ID}-frame-` +
          String(ordinal).padStart(2, '0'),
        relativePath: sourceRelativePath(label),
        sourceGitBlobSha1,
      }),
    ),
  );
}

function canonicalRelativePath(value, label) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 2048 ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.startsWith('/') ||
    value.startsWith('../') ||
    value.includes('/../') ||
    value.includes('//') ||
    value === '.' ||
    value === '..' ||
    /^[A-Za-z]:/u.test(value) ||
    path.posix.normalize(value) !== value
  ) {
    fail('EVA_DENSE_SOURCE_RELATIVE_PATH_INVALID', label);
  }
  return value;
}

function validateFrames(frames) {
  if (!Array.isArray(frames) || frames.length !== EVA_DENSE_MOTION_SOURCE_ORDINALS.length) {
    fail('EVA_DENSE_SOURCE_FRAME_SET_INVALID');
  }
  const ordinals = frames.map((frame) => frame?.ordinal);
  if (
    ordinals.some(
      (ordinal, index) => ordinal !== EVA_DENSE_MOTION_SOURCE_ORDINALS[index],
    )
  ) {
    fail('EVA_DENSE_SOURCE_FRAME_ORDER_INVALID');
  }
  return Object.freeze(
    frames.map((frame, index) => {
      const ordinal = index + 1;
      const expectedFrameId =
        `${EVA_DENSE_MOTION_FAMILY_ID}-frame-` +
        String(ordinal).padStart(2, '0');
      if (
        frame.frameId !== expectedFrameId ||
        typeof frame.sourceGitBlobSha1 !== 'string' ||
        !SHA1.test(frame.sourceGitBlobSha1)
      ) {
        fail('EVA_DENSE_SOURCE_FRAME_IDENTITY_INVALID', expectedFrameId);
      }
      return Object.freeze({
        ordinal,
        frameId: expectedFrameId,
        relativePath: canonicalRelativePath(
          frame.relativePath,
          `${expectedFrameId}.relativePath`,
        ),
        sourceGitBlobSha1: frame.sourceGitBlobSha1,
      });
    }),
  );
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative !== '' &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative)
  );
}

async function realDirectory(value) {
  if (
    typeof value !== 'string' ||
    !path.isAbsolute(value) ||
    value.includes('\0') ||
    path.normalize(value) !== value
  ) {
    fail('EVA_DENSE_SOURCE_RUNTIME_ROOT_INVALID');
  }
  const metadata = await lstat(value);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    (await realpath(value)) !== value
  ) {
    fail('EVA_DENSE_SOURCE_RUNTIME_ROOT_UNSAFE');
  }
  return value;
}

async function readStableContainedSource(runtimeRoot, frame) {
  const sourcePath = path.join(runtimeRoot, ...frame.relativePath.split('/'));
  if (!inside(runtimeRoot, sourcePath)) {
    fail('EVA_DENSE_SOURCE_PATH_ESCAPE', frame.frameId);
  }
  const before = await lstat(sourcePath);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size < 45 ||
    before.size > MAXIMUM_SOURCE_BYTES
  ) {
    fail('EVA_DENSE_SOURCE_FILE_UNSAFE', frame.frameId);
  }
  const sourceReal = await realpath(sourcePath);
  if (sourceReal !== sourcePath || !inside(runtimeRoot, sourceReal)) {
    fail('EVA_DENSE_SOURCE_PATH_ESCAPE', frame.frameId);
  }
  const bytes = await readFile(sourceReal);
  const after = await lstat(sourceReal);
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    if (before[key] !== after[key]) {
      fail('EVA_DENSE_SOURCE_FILE_CHANGED', frame.frameId);
    }
  }
  return Object.freeze({ sourcePath: sourceReal, bytes });
}

async function inspectSourceSet({ runtimeRoot: runtimeRootInput, frames, includeBytes }) {
  const runtimeRoot = await realDirectory(runtimeRootInput);
  const sourceFrames = validateFrames(frames);
  const results = [];
  for (const frame of sourceFrames) {
    const source = await readStableContainedSource(runtimeRoot, frame);
    const actualGitBlobSha1 = gitBlobSha1(source.bytes);
    if (actualGitBlobSha1 !== frame.sourceGitBlobSha1) {
      fail('EVA_DENSE_SOURCE_GIT_BLOB_MISMATCH', `${frame.ordinal}`);
    }
    results.push(
      Object.freeze({
        ordinal: frame.ordinal,
        frameId: frame.frameId,
        relativePath: frame.relativePath,
        absolutePath: source.sourcePath,
        bytes: source.bytes.length,
        gitBlobSha1: actualGitBlobSha1,
        sha256: sha256(source.bytes),
        ...inspectPngHeader(source.bytes),
        ...(includeBytes ? { sourceBytes: Buffer.from(source.bytes) } : {}),
      }),
    );
  }
  return Object.freeze({
    schema: EVA_DENSE_MOTION_SOURCE_PREFLIGHT_SCHEMA,
    status: 'ten-source-frames-verified-read-only',
    ok: true,
    familyId: EVA_DENSE_MOTION_FAMILY_ID,
    runtimeRepository: 'EVAVO-STUDIO/evavo-avatar-runtime',
    runtimeRoot,
    sourceFrameCount: results.length,
    sourceOrdinals: EVA_DENSE_MOTION_SOURCE_ORDINALS,
    exactSourceIdentityVerified: true,
    exactCanvasVerified: true,
    fullPngStructureAndCrcVerified: true,
    idatDecodeVerified: true,
    scanlineReconstructionVerified: true,
    decodedPixelStatisticsRecorded: true,
    nonInterlacedVerified: true,
    noTrailingBytesVerified: true,
    allTenSourcesVerifiedBeforeMaterialization: true,
    sourceFrames: Object.freeze(results),
    authority: authority(),
  });
}

export async function preflightEvaDenseMotionSources({
  runtimeRoot,
  frames = tenMasterSourceFrames(),
} = {}) {
  return inspectSourceSet({ runtimeRoot, frames, includeBytes: false });
}

export async function loadEvaDenseMotionSourcesForMaterialization({
  runtimeRoot,
  frames = tenMasterSourceFrames(),
} = {}) {
  return inspectSourceSet({ runtimeRoot, frames, includeBytes: true });
}

export function evaDenseMotionSourcePreflightCapabilities() {
  return Object.freeze({
    schema: EVA_DENSE_MOTION_SOURCE_PREFLIGHT_CAPABILITIES_SCHEMA,
    exactTenSourceFrames: true,
    requiredOrdinals: EVA_DENSE_MOTION_SOURCE_ORDINALS,
    gitBlobIdentityVerification: true,
    stableReadVerification: true,
    realPathContainment: true,
    symlinkRejection: true,
    hardlinkRejection: true,
    canonicalCanvas: CANVAS,
    fullPngChunkStructureVerification: true,
    everyPngChunkCrcVerification: true,
    idatInflateVerification: true,
    scanlineFilterVerification: true,
    pixelReconstructionVerification: true,
    decodedPixelStatistics: true,
    nonInterlacedRequired: true,
    trailingBytesRejected: true,
    sourceMutation: false,
    candidateCreation: false,
    providerExecution: false,
    publication: false,
    runtimeActivation: false,
    authority: authority(),
  });
}

function parseArguments(argv) {
  if (!Array.isArray(argv) || argv.length === 0) {
    fail('EVA_DENSE_SOURCE_CLI_INVALID');
  }
  if (argv.length === 1 && argv[0] === '--help') return { help: true };
  if (argv.length !== 2 || argv[0] !== '--runtime-root' || !argv[1]) {
    fail('EVA_DENSE_SOURCE_CLI_INVALID');
  }
  return { runtimeRoot: argv[1] };
}

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isCli) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(
        'Usage: node scripts/project-art/eva-dense-motion-source-preflight.mjs --runtime-root <absolute-path-to-evavo-avatar-runtime>',
      );
    } else {
      console.log(JSON.stringify(await preflightEvaDenseMotionSources(options)));
    }
  } catch (error) {
    console.error(
      `[eva-dense-motion-source-preflight] ERROR ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  }
}
