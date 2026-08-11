#!/usr/bin/env node

import {
  constants as fsConstants,
  closeSync,
  createReadStream,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';

export const PROJECT_ART_LOOP_CLOSURE_REQUEST_SCHEMA =
  'evavo.project-art-loop-closure-request.v1';
export const PROJECT_ART_LOOP_CLOSURE_PLAN_SCHEMA =
  'evavo.project-art-loop-closure-plan.v1';

const LIMITS = Object.freeze({
  maximumRequestBytes: 16 * 1024 * 1024,
  maximumSourceBytes: 512 * 1024 * 1024,
  maximumTotalSourceBytes: 2 * 1024 * 1024 * 1024,
  maximumDecodedPixels: 220_000_000,
  maximumFrames: 1_000,
});
const MAXIMUM_IMAGE_DIMENSION = 65_536;
const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,95}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const AUTHORITY_KEYS = Object.freeze([
  'providerExecution',
  'sourceMutation',
  'sourceDeletion',
  'candidateApproval',
  'candidatePromotion',
  'targetRepositoryMutation',
  'gitCommit',
  'gitPush',
  'publication',
  'deployment',
  'forcePush',
]);

export class ProjectArtLoopClosureError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ProjectArtLoopClosureError';
    this.code = code;
  }
}

function fail(code, message = code) {
  throw new ProjectArtLoopClosureError(code, message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function allowedKeys(value, allowed, label) {
  if (!isRecord(value)) {
    fail('PROJECT_ART_LOOP_CLOSURE_REQUEST_INVALID', `${label} must be an object.`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      fail(
        'PROJECT_ART_LOOP_CLOSURE_REQUEST_INVALID',
        `${label}.${key} is unsupported.`,
      );
    }
  }
}

function boundedString(value, label, maximum, fallback = null) {
  const selected = value ?? fallback;
  if (
    typeof selected !== 'string' ||
    selected.length < 1 ||
    selected.length > maximum ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(selected)
  ) {
    fail('PROJECT_ART_LOOP_CLOSURE_REQUEST_INVALID', `${label} is invalid.`);
  }
  return selected;
}

function finiteNumber(value, label, minimum, maximum, fallback) {
  const selected = value ?? fallback;
  if (
    typeof selected !== 'number' ||
    !Number.isFinite(selected) ||
    selected < minimum ||
    selected > maximum
  ) {
    fail(
      'PROJECT_ART_LOOP_CLOSURE_REQUEST_INVALID',
      `${label} is outside the supported numeric boundary.`,
    );
  }
  return Object.is(selected, -0) ? 0 : selected;
}

function identifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    fail('PROJECT_ART_LOOP_CLOSURE_IDENTIFIER_INVALID', `${label} is invalid.`);
  }
  return value;
}

function timestamp(value, label) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    fail(
      'PROJECT_ART_LOOP_CLOSURE_TIMESTAMP_INVALID',
      `${label} must be a canonical UTC timestamp.`,
    );
  }
  return value;
}

function canonicalPath(value, label) {
  boundedString(value, label, 4096);
  if (
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    value.includes('\\') ||
    value.includes('\0') ||
    path.posix.normalize(value) !== value ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    fail(
      'PROJECT_ART_LOOP_CLOSURE_PATH_INVALID',
      `${label} must be a canonical forward-slash relative path.`,
    );
  }
  return value;
}

function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      fail('PROJECT_ART_LOOP_CLOSURE_CANONICAL_JSON_INVALID');
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => {
        if (value[key] === undefined) {
          fail('PROJECT_ART_LOOP_CLOSURE_CANONICAL_JSON_INVALID');
        }
        return `${JSON.stringify(key)}:${canonicalJson(value[key])}`;
      })
      .join(',')}}`;
  }
  fail('PROJECT_ART_LOOP_CLOSURE_CANONICAL_JSON_INVALID');
}

function hashBytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseRequestBytes(value) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch {
    fail(
      'PROJECT_ART_LOOP_CLOSURE_UTF8_INVALID',
      'requestBytes are not valid UTF-8.',
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    fail(
      'PROJECT_ART_LOOP_CLOSURE_REQUEST_INVALID',
      'requestBytes are not valid JSON.',
    );
  }
}

export function withProjectArtLoopClosureDocumentHash(value) {
  const document = { ...value };
  delete document.documentSha256;
  return Object.freeze({
    ...document,
    documentSha256: hashBytes(Buffer.from(canonicalJson(document), 'utf8')),
  });
}

function snapshot(metadata) {
  return Object.freeze({
    mode: metadata.mode,
    device: metadata.dev,
    inode: metadata.ino,
    links: metadata.nlink,
    size: metadata.size,
    modifiedMs: metadata.mtimeMs,
    changedMs: metadata.ctimeMs,
  });
}

function sameSnapshot(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key]);
}

function regularFile(value, label, maximumBytes) {
  let metadata;
  try {
    metadata = lstatSync(value);
  } catch {
    fail('PROJECT_ART_LOOP_CLOSURE_FILE_MISSING', `${label} is missing.`);
  }
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    metadata.nlink !== 1 ||
    metadata.size < 1 ||
    metadata.size > maximumBytes
  ) {
    fail(
      'PROJECT_ART_LOOP_CLOSURE_FILE_UNSAFE',
      `${label} must be a bounded, single-link regular file.`,
    );
  }
  return snapshot(metadata);
}

function directory(value, label) {
  const resolved = path.resolve(value);
  let metadata;
  try {
    metadata = lstatSync(resolved);
  } catch {
    fail('PROJECT_ART_LOOP_CLOSURE_DIRECTORY_MISSING', `${label} is missing.`);
  }
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    fail(
      'PROJECT_ART_LOOP_CLOSURE_DIRECTORY_UNSAFE',
      `${label} must be a non-symbolic directory.`,
    );
  }
  return resolved;
}

function resolveFrame(root, relative, label) {
  const canonical = canonicalPath(relative, label);
  let current = root;
  for (const segment of canonical.split('/')) {
    current = path.join(current, segment);
    let metadata;
    try {
      metadata = lstatSync(current);
    } catch {
      fail('PROJECT_ART_LOOP_CLOSURE_FILE_MISSING', `${label} is missing.`);
    }
    if (metadata.isSymbolicLink()) {
      fail(
        'PROJECT_ART_LOOP_CLOSURE_PATH_SYMLINK',
        `${label} contains a symbolic path component.`,
      );
    }
  }
  const absolute = path.resolve(current);
  const relation = path.relative(root, absolute);
  if (relation.startsWith('..') || path.isAbsolute(relation) || absolute === root) {
    fail('PROJECT_ART_LOOP_CLOSURE_PATH_ESCAPE', `${label} escaped workspace-root.`);
  }
  return Object.freeze({ canonical, absolute });
}

async function stableHash(value, label) {
  const before = regularFile(value, label, LIMITS.maximumSourceBytes);
  let bytes = 0;
  const digest = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(value, {
      flags: fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
      highWaterMark: 1024 * 1024,
    });
    stream.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > LIMITS.maximumSourceBytes) {
        stream.destroy(new Error('source byte boundary exceeded'));
        return;
      }
      digest.update(chunk);
    });
    stream.on('error', reject);
    stream.on('end', resolve);
  }).catch((error) => {
    fail(
      'PROJECT_ART_LOOP_CLOSURE_FILE_READ_FAILED',
      `${label} could not be read safely: ${error.message}`,
    );
  });
  const after = regularFile(value, label, LIMITS.maximumSourceBytes);
  if (!sameSnapshot(before, after) || bytes !== before.size) {
    fail('PROJECT_ART_LOOP_CLOSURE_FILE_CHANGED', `${label} changed during read.`);
  }
  return Object.freeze({ sha256: digest.digest('hex'), bytes });
}

function pngHeader(value, label) {
  const descriptor = openSync(
    value,
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
  );
  try {
    const header = Buffer.alloc(33);
    if (
      readSync(descriptor, header, 0, header.length, 0) !== header.length ||
      !header.subarray(0, 8).equals(PNG_SIGNATURE) ||
      header.readUInt32BE(8) !== 13 ||
      header.toString('ascii', 12, 16) !== 'IHDR'
    ) {
      fail(
        'PROJECT_ART_LOOP_CLOSURE_PNG_INVALID',
        `${label} is not a canonical PNG master.`,
      );
    }
    const width = header.readUInt32BE(16);
    const height = header.readUInt32BE(20);
    const bitDepth = header[24];
    const colourType = header[25];
    const compression = header[26];
    const filter = header[27];
    const interlace = header[28];
    if (
      width < 1 ||
      height < 1 ||
      width > MAXIMUM_IMAGE_DIMENSION ||
      height > MAXIMUM_IMAGE_DIMENSION ||
      width * height > LIMITS.maximumDecodedPixels ||
      ![1, 2, 4, 8, 16].includes(bitDepth) ||
      ![0, 2, 3, 4, 6].includes(colourType) ||
      compression !== 0 ||
      filter !== 0 ||
      ![0, 1].includes(interlace)
    ) {
      fail(
        'PROJECT_ART_LOOP_CLOSURE_PNG_INVALID',
        `${label} has an unsupported PNG header.`,
      );
    }
    return Object.freeze({
      format: 'png',
      width,
      height,
      bitDepth,
      colourType,
      alphaChannel: colourType === 4 || colourType === 6,
      interlaced: interlace === 1,
    });
  } finally {
    closeSync(descriptor);
  }
}

function parseAuthority(value) {
  if (value === undefined) {
    return Object.freeze(
      Object.fromEntries(AUTHORITY_KEYS.map((key) => [key, false])),
    );
  }
  allowedKeys(value, AUTHORITY_KEYS, 'authority');
  for (const key of AUTHORITY_KEYS) {
    if (value[key] !== false) {
      fail(
        'PROJECT_ART_LOOP_CLOSURE_AUTHORITY_INVALID',
        `authority.${key} must be false.`,
      );
    }
  }
  return Object.freeze(
    Object.fromEntries(AUTHORITY_KEYS.map((key) => [key, false])),
  );
}

function parseExpected(value) {
  const input = value ?? {};
  allowedKeys(input, ['width', 'height', 'requireAlpha'], 'expected');
  const width = input.width ?? null;
  const height = input.height ?? null;
  if ((width === null) !== (height === null)) {
    fail(
      'PROJECT_ART_LOOP_CLOSURE_REQUEST_INVALID',
      'expected.width and expected.height must be supplied together.',
    );
  }
  if (
    width !== null &&
    (!Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > MAXIMUM_IMAGE_DIMENSION ||
      height > MAXIMUM_IMAGE_DIMENSION ||
      width * height > LIMITS.maximumDecodedPixels)
  ) {
    fail(
      'PROJECT_ART_LOOP_CLOSURE_REQUEST_INVALID',
      'expected canvas exceeds the decoded-image boundary.',
    );
  }
  return Object.freeze({
    width,
    height,
    requireAlpha: input.requireAlpha === true,
  });
}

function parseThresholds(value) {
  const input = value ?? {};
  allowedKeys(
    input,
    [
      'maximumChangedFraction',
      'maximumMeanChannelDelta',
      'maximumAlphaChangedFraction',
      'maximumCentroidShiftPixels',
    ],
    'thresholds',
  );
  return Object.freeze({
    maximumChangedFraction: finiteNumber(
      input.maximumChangedFraction,
      'thresholds.maximumChangedFraction',
      0,
      1,
      1,
    ),
    maximumMeanChannelDelta: finiteNumber(
      input.maximumMeanChannelDelta,
      'thresholds.maximumMeanChannelDelta',
      0,
      255,
      255,
    ),
    maximumAlphaChangedFraction: finiteNumber(
      input.maximumAlphaChangedFraction,
      'thresholds.maximumAlphaChangedFraction',
      0,
      1,
      1,
    ),
    maximumCentroidShiftPixels: finiteNumber(
      input.maximumCentroidShiftPixels,
      'thresholds.maximumCentroidShiftPixels',
      0,
      1_000_000,
      1_000_000,
    ),
  });
}

function parsePreview(value) {
  const input = value ?? {};
  allowedKeys(input, ['difference', 'overlay', 'onionSkin'], 'preview');
  return Object.freeze({
    difference: input.difference !== false,
    overlay: input.overlay !== false,
    onionSkin: input.onionSkin !== false,
  });
}

function parseFrame(value, index) {
  if (typeof value === 'string') {
    return Object.freeze({
      path: canonicalPath(value, `frames[${index}]`),
      expectedSha256: null,
    });
  }
  allowedKeys(value, ['path', 'expectedSha256'], `frames[${index}]`);
  const expectedSha256 = value.expectedSha256 ?? null;
  if (expectedSha256 !== null && !SHA256.test(expectedSha256)) {
    fail(
      'PROJECT_ART_LOOP_CLOSURE_SHA256_INVALID',
      `frames[${index}].expectedSha256 is invalid.`,
    );
  }
  return Object.freeze({
    path: canonicalPath(value.path, `frames[${index}].path`),
    expectedSha256,
  });
}

export async function compileProjectArtLoopClosure({
  workspaceRoot,
  request,
  requestBytes,
  compiledAt = new Date().toISOString(),
}) {
  const root = directory(workspaceRoot, 'workspace-root');
  timestamp(compiledAt, 'compiledAt');
  if (!Buffer.isBuffer(requestBytes) || requestBytes.length > LIMITS.maximumRequestBytes) {
    fail(
      'PROJECT_ART_LOOP_CLOSURE_REQUEST_INVALID',
      'requestBytes must remain inside the request boundary.',
    );
  }
  const requestFromBytes = parseRequestBytes(requestBytes);
  if (!isRecord(request) || request.schema !== PROJECT_ART_LOOP_CLOSURE_REQUEST_SCHEMA) {
    fail(
      'PROJECT_ART_LOOP_CLOSURE_REQUEST_INVALID',
      `Request must use ${PROJECT_ART_LOOP_CLOSURE_REQUEST_SCHEMA}.`,
    );
  }
  allowedKeys(
    request,
    [
      'schema',
      'reviewId',
      'projectId',
      'purpose',
      'frames',
      'expected',
      'thresholds',
      'preview',
      'authority',
    ],
    'request',
  );
  if (
    !Array.isArray(request.frames) ||
    request.frames.length < 2 ||
    request.frames.length > LIMITS.maximumFrames
  ) {
    fail(
      'PROJECT_ART_LOOP_CLOSURE_FRAME_COUNT_INVALID',
      `frames must contain 2-${LIMITS.maximumFrames} entries.`,
    );
  }

  const descriptors = request.frames.map(parseFrame);
  const paths = new Set();
  for (const descriptor of descriptors) {
    if (paths.has(descriptor.path)) {
      fail(
        'PROJECT_ART_LOOP_CLOSURE_FRAME_DUPLICATE',
        `Duplicate frame path: ${descriptor.path}.`,
      );
    }
    paths.add(descriptor.path);
    if (path.posix.extname(descriptor.path).toLowerCase() !== '.png') {
      fail(
        'PROJECT_ART_LOOP_CLOSURE_FRAME_FORMAT_INVALID',
        `Loop-closure masters must be PNG: ${descriptor.path}.`,
      );
    }
  }

  const expected = parseExpected(request.expected);
  const thresholds = parseThresholds(request.thresholds);
  const preview = parsePreview(request.preview);
  const authority = parseAuthority(request.authority);
  const frames = [];
  let totalBytes = 0;
  let totalPixels = 0;
  let canvas = null;

  for (const [index, descriptor] of descriptors.entries()) {
    const source = resolveFrame(root, descriptor.path, `frames[${index}]`);
    const identity = await stableHash(source.absolute, `frames[${index}]`);
    if (
      descriptor.expectedSha256 !== null &&
      descriptor.expectedSha256 !== identity.sha256
    ) {
      fail(
        'PROJECT_ART_LOOP_CLOSURE_SOURCE_HASH_MISMATCH',
        `Source SHA-256 mismatch: ${descriptor.path}.`,
      );
    }
    const image = pngHeader(source.absolute, `frames[${index}]`);
    totalBytes += identity.bytes;
    totalPixels += image.width * image.height;
    if (totalBytes > LIMITS.maximumTotalSourceBytes) {
      fail(
        'PROJECT_ART_LOOP_CLOSURE_SOURCE_BUDGET_EXCEEDED',
        'Frame set exceeds the total source-byte boundary.',
      );
    }
    if (totalPixels > LIMITS.maximumDecodedPixels) {
      fail(
        'PROJECT_ART_LOOP_CLOSURE_PIXEL_BUDGET_EXCEEDED',
        'Frame set exceeds the active decoded-image boundary.',
      );
    }
    if (canvas === null) {
      canvas = Object.freeze({ width: image.width, height: image.height });
    } else if (image.width !== canvas.width || image.height !== canvas.height) {
      fail(
        'PROJECT_ART_LOOP_CLOSURE_DIMENSION_DRIFT',
        `Frame dimensions drifted at ${descriptor.path}.`,
      );
    }
    if (
      expected.width !== null &&
      (image.width !== expected.width || image.height !== expected.height)
    ) {
      fail(
        'PROJECT_ART_LOOP_CLOSURE_DIMENSION_MISMATCH',
        `Frame dimensions do not match the expected canvas: ${descriptor.path}.`,
      );
    }
    frames.push(
      Object.freeze({
        frameIndex: index,
        path: descriptor.path,
        sha256: identity.sha256,
        bytes: identity.bytes,
        mediaType: 'image/png',
        image,
      }),
    );
  }

  const framePixels = canvas.width * canvas.height;
  const previewCount =
    Number(preview.difference) + Number(preview.overlay) + Number(preview.onionSkin);
  if (framePixels * (2 + previewCount) > LIMITS.maximumDecodedPixels) {
    fail(
      'PROJECT_ART_LOOP_CLOSURE_PIXEL_BUDGET_EXCEEDED',
      'Loop-closure seam and preview surfaces exceed the active decoded-image boundary.',
    );
  }
  if (canonicalJson(requestFromBytes) !== canonicalJson(request)) {
    fail(
      'PROJECT_ART_LOOP_CLOSURE_REQUEST_BYTES_MISMATCH',
      'requestBytes must encode the exact supplied request object.',
    );
  }

  return withProjectArtLoopClosureDocumentHash({
    schema: PROJECT_ART_LOOP_CLOSURE_PLAN_SCHEMA,
    reviewId: identifier(request.reviewId, 'reviewId'),
    projectId: identifier(request.projectId, 'projectId'),
    purpose: boundedString(
      request.purpose,
      'purpose',
      8192,
      'Validate the final-to-first seam of an exact animation frame sequence.',
    ),
    compiledAt,
    requestSha256: hashBytes(requestBytes),
    workspace: Object.freeze({
      root,
      sourcePathsAreRelative: true,
      symbolicLinksAllowed: false,
    }),
    frames: Object.freeze(frames),
    seam: Object.freeze({
      fromFrameIndex: frames.length - 1,
      toFrameIndex: 0,
      identicalClosureAccepted: true,
    }),
    expected,
    thresholds,
    preview,
    limits: LIMITS,
    execution: Object.freeze({
      runtime: 'python-pillow-loop-closure',
      entrypoint: 'tools/run_project_art_loop_closure.py',
      outputRootMustNotExist: true,
      wholeRunAtomicPublication: true,
      createOnlyReceipt: true,
      sourceHashesRevalidatedBeforeExecution: true,
      sourceHashesRevalidatedAfterExecution: true,
      requiresExplicitExecution: true,
    }),
    authority,
  });
}

function readRequest(value) {
  const before = regularFile(value, 'request', LIMITS.maximumRequestBytes);
  const bytes = readFileSync(value);
  const after = regularFile(value, 'request', LIMITS.maximumRequestBytes);
  if (!sameSnapshot(before, after) || bytes.length !== before.size) {
    fail('PROJECT_ART_LOOP_CLOSURE_FILE_CHANGED', 'request changed during read.');
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('PROJECT_ART_LOOP_CLOSURE_UTF8_INVALID', 'request is not valid UTF-8.');
  }
  let request;
  try {
    request = JSON.parse(text);
  } catch {
    fail('PROJECT_ART_LOOP_CLOSURE_REQUEST_INVALID', 'request is not valid JSON.');
  }
  return { request, requestBytes: bytes };
}

function argumentsMap(argv) {
  const allowed = new Set([
    '--workspace-root',
    '--request',
    '--output',
    '--compiled-at',
  ]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || value === undefined || value.startsWith('--')) {
      fail(
        'PROJECT_ART_LOOP_CLOSURE_ARGUMENT_INVALID',
        `Invalid argument near ${key ?? '<missing>'}.`,
      );
    }
    if (values.has(key)) {
      fail('PROJECT_ART_LOOP_CLOSURE_ARGUMENT_INVALID', `Duplicate argument: ${key}.`);
    }
    values.set(key, value);
  }
  for (const required of ['--workspace-root', '--request', '--output']) {
    if (!values.has(required)) {
      fail('PROJECT_ART_LOOP_CLOSURE_ARGUMENT_INVALID', `Missing ${required}.`);
    }
  }
  return values;
}

async function main() {
  const args = argumentsMap(process.argv.slice(2));
  const requestPath = path.resolve(args.get('--request'));
  const { request, requestBytes } = readRequest(requestPath);
  const plan = await compileProjectArtLoopClosure({
    workspaceRoot: args.get('--workspace-root'),
    request,
    requestBytes,
    compiledAt: args.get('--compiled-at') ?? new Date().toISOString(),
  });
  const target = path.resolve(args.get('--output'));
  directory(path.dirname(target), 'output parent');
  writeFileSync(target, `${JSON.stringify(plan, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  console.log('Project Art loop-closure plan compiled.');
  console.log(`- review: ${plan.reviewId}`);
  console.log(`- frames: ${plan.frames.length}`);
  console.log(`- seam: ${plan.seam.fromFrameIndex} -> ${plan.seam.toFrameIndex}`);
  console.log(`- plan SHA-256: ${plan.documentSha256}`);
  console.log('- no image, source, provider, repository, Git, deployment or publication mutation occurred');
}

const isEntrypoint =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) {
  main().catch((error) => {
    console.error(
      `${error?.code ?? 'PROJECT_ART_LOOP_CLOSURE_COMPILE_FAILED'}: ${error?.message ?? String(error)}`,
    );
    process.exit(1);
  });
}
