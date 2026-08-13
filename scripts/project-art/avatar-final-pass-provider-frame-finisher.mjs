import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

export const FRAME_FINISHER_PROTOCOL_VERSION = '2026-08-13.3';
export const FRAME_FINISHER_CAPABILITIES_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-frame-finisher-capabilities.v1';
export const FRAME_FINISHER_REPORT_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-frame-finisher-report.v1';
export const FRAME_REVIEW_REQUEST_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-frame-review-request.v1';
export const FRAME_REVIEW_DECISION_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-frame-review-decision.v1';
export const FRAME_REVIEW_OUTCOME_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-frame-review-outcome.v1';

const MATERIALIZATION_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-candidate-materialization.v1';
const FINISHER_REQUEST_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-candidate-finisher-request.v1';
const CANDIDATE_PROTOCOL_VERSION = '2026-08-13.2';
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;
const MAXIMUM_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAXIMUM_PNG_BYTES = 64 * 1024 * 1024;
const MAXIMUM_DECODED_BYTES = 256 * 1024 * 1024;
const MAXIMUM_CANVAS_EDGE = 8192;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const REVIEW_GATES = Object.freeze([
  'technical',
  'handsAndAnatomy',
  'faceIdentity',
  'silhouetteRegistration',
  'adjacentFrameContinuity',
  'loopClosure',
]);
const REVIEW_STATES = new Set(['pass', 'fail', 'not-applicable']);
const REVIEW_DECISIONS = new Set([
  'approve-final-frame',
  'repair-frame',
  'reject-frame',
]);

export class AvatarProviderFrameFinisherError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'AvatarProviderFrameFinisherError';
    this.code = code;
  }
}

function fail(code, message = code) {
  throw new AvatarProviderFrameFinisherError(code, message);
}

function assert(condition, code, message = code) {
  if (!condition) fail(code, message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys, label, code = 'AVATAR_FRAME_FINISHER_KEYS_INVALID') {
  assert(isRecord(value), code, `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(
    actual.length === expected.length &&
      actual.every((entry, index) => entry === expected[index]),
    code,
    `${label} has unexpected or missing fields.`,
  );
}

function boundedText(value, label, minimum = 1, maximum = 32_000) {
  assert(
    typeof value === 'string' &&
      value.length >= minimum &&
      value.length <= maximum &&
      !value.includes('\0'),
    'AVATAR_FRAME_FINISHER_TEXT_INVALID',
    `${label} is invalid.`,
  );
  return value;
}

function identifier(value, label) {
  assert(
    typeof value === 'string' && IDENTIFIER_PATTERN.test(value),
    'AVATAR_FRAME_FINISHER_IDENTIFIER_INVALID',
    `${label} is invalid.`,
  );
  return value;
}

function digest(value, label) {
  assert(
    typeof value === 'string' && SHA256_PATTERN.test(value),
    'AVATAR_FRAME_FINISHER_SHA256_INVALID',
    `${label} is invalid.`,
  );
  return value;
}

function timestamp(value, label) {
  assert(
    typeof value === 'string' &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value,
    'AVATAR_FRAME_FINISHER_TIMESTAMP_INVALID',
    `${label} must be an exact UTC ISO timestamp.`,
  );
  return value;
}

function canonicalRelativePath(value, label) {
  assert(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 1024 &&
      !value.includes('\\') &&
      !value.includes('\0') &&
      !value.startsWith('/') &&
      !value.startsWith('../') &&
      !value.includes('/../') &&
      !value.includes('//') &&
      !/^[A-Za-z]:/u.test(value),
    'AVATAR_FRAME_FINISHER_PATH_INVALID',
    `${label} must be a canonical relative path.`,
  );
  const normalized = path.posix.normalize(value);
  assert(
    normalized === value && normalized !== '.' && normalized !== '..',
    'AVATAR_FRAME_FINISHER_PATH_INVALID',
    `${label} is not canonical.`,
  );
  return value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  assert(
    value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)),
    'AVATAR_FRAME_FINISHER_JSON_INVALID',
  );
  return Object.is(value, -0) ? 0 : value;
}

export function canonicalFrameFinisherJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256FrameFinisherBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256FrameFinisherDocument(value) {
  return sha256FrameFinisherBytes(
    Buffer.from(canonicalFrameFinisherJson(value), 'utf8'),
  );
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function verifySelfHash(value, field, label) {
  assert(isRecord(value), 'AVATAR_FRAME_FINISHER_DOCUMENT_INVALID');
  const recorded = digest(value[field], `${label}.${field}`);
  const body = { ...value };
  delete body[field];
  assert(
    sha256FrameFinisherDocument(body) === recorded,
    'AVATAR_FRAME_FINISHER_SELF_HASH_MISMATCH',
    `${label}.${field} does not match canonical content.`,
  );
  return deepFreeze(value);
}

function stableJsonFile(filePath, label) {
  const absolute = realpathSync(path.resolve(filePath));
  const before = lstatSync(absolute);
  assert(
    before.isFile() && !before.isSymbolicLink() && before.nlink === 1,
    'AVATAR_FRAME_FINISHER_INPUT_FILE_INVALID',
    `${label} must be a single-link regular file.`,
  );
  assert(
    before.size >= 2 && before.size <= MAXIMUM_DOCUMENT_BYTES,
    'AVATAR_FRAME_FINISHER_INPUT_SIZE_INVALID',
  );
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(
      before[field] === after[field],
      'AVATAR_FRAME_FINISHER_INPUT_CHANGED',
      `${label} changed while being read.`,
    );
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('AVATAR_FRAME_FINISHER_UTF8_INVALID', `${label} is not UTF-8.`);
  }
  assert(
    text.charCodeAt(0) !== 0xfeff,
    'AVATAR_FRAME_FINISHER_BOM_FORBIDDEN',
  );
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail('AVATAR_FRAME_FINISHER_JSON_INVALID', `${label} is not JSON.`);
  }
  return Object.freeze({
    absolute,
    bytes,
    sha256: sha256FrameFinisherBytes(bytes),
    value: deepFreeze(canonicalize(value)),
  });
}

function errorCode(error) {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : undefined;
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function realDirectory(value, label) {
  const absolute = realpathSync(path.resolve(value));
  const metadata = lstatSync(absolute);
  assert(
    metadata.isDirectory() && !metadata.isSymbolicLink(),
    'AVATAR_FRAME_FINISHER_ROOT_INVALID',
    `${label} must be a real directory.`,
  );
  return absolute;
}

function ensureDirectoryChain(root, relativeDirectory) {
  if (!relativeDirectory || relativeDirectory === '.') return root;
  let current = root;
  for (const part of relativeDirectory.split('/')) {
    assert(
      part && part !== '.' && part !== '..',
      'AVATAR_FRAME_FINISHER_PATH_INVALID',
    );
    current = path.join(current, part);
    if (!existsSync(current)) {
      try {
        mkdirSync(current, { mode: 0o700 });
      } catch (error) {
        if (errorCode(error) !== 'EEXIST') throw error;
      }
    }
    const metadata = lstatSync(current);
    assert(
      metadata.isDirectory() && !metadata.isSymbolicLink(),
      'AVATAR_FRAME_FINISHER_PATH_COMPONENT_INVALID',
    );
    assert(
      isInside(root, realpathSync(current)),
      'AVATAR_FRAME_FINISHER_PATH_ESCAPE',
    );
  }
  return current;
}

function resolveWorkspaceFile(root, relative, label) {
  const canonical = canonicalRelativePath(relative, label);
  const absolute = path.join(root, ...canonical.split('/'));
  assert(isInside(root, absolute), 'AVATAR_FRAME_FINISHER_PATH_ESCAPE');
  const resolved = realpathSync(absolute);
  assert(isInside(root, resolved), 'AVATAR_FRAME_FINISHER_PATH_ESCAPE');
  const metadata = lstatSync(resolved);
  assert(
    metadata.isFile() && !metadata.isSymbolicLink() && metadata.nlink === 1,
    'AVATAR_FRAME_FINISHER_SOURCE_FILE_INVALID',
    `${label} must be a single-link regular file.`,
  );
  return resolved;
}

function stableBinaryFile(filePath, label) {
  const absolute = realpathSync(path.resolve(filePath));
  const before = lstatSync(absolute);
  assert(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1 &&
      before.size >= 57 &&
      before.size <= MAXIMUM_PNG_BYTES,
    'AVATAR_FRAME_FINISHER_SOURCE_FILE_INVALID',
    `${label} is outside the PNG file boundary.`,
  );
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(
      before[field] === after[field],
      'AVATAR_FRAME_FINISHER_SOURCE_CHANGED',
      `${label} changed while being read.`,
    );
  }
  return Object.freeze({ absolute, bytes, sha256: sha256FrameFinisherBytes(bytes) });
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0
        ? 0xedb88320 ^ (value >>> 1)
        : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBytes, data]);
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(body), 8 + data.length);
  return output;
}

function paeth(left, up, upperLeft) {
  const prediction = left + up - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const diagonalDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= diagonalDistance) return left;
  return upDistance <= diagonalDistance ? up : upperLeft;
}

function unfilterRows(inflated, width, height) {
  const stride = width * 4;
  const expected = height * (stride + 1);
  assert(
    inflated.length === expected,
    'AVATAR_FRAME_FINISHER_PNG_DECODED_SIZE_INVALID',
  );
  const pixels = Buffer.alloc(width * height * 4);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    assert(
      Number.isInteger(filter) && filter >= 0 && filter <= 4,
      'AVATAR_FRAME_FINISHER_PNG_FILTER_INVALID',
    );
    const rowOffset = y * stride;
    const previousOffset = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= 4 ? pixels[rowOffset + x - 4] : 0;
      const up = y > 0 ? pixels[previousOffset + x] : 0;
      const upperLeft = y > 0 && x >= 4
        ? pixels[previousOffset + x - 4]
        : 0;
      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = (raw + left) & 0xff;
      else if (filter === 2) value = (raw + up) & 0xff;
      else if (filter === 3) value = (raw + Math.floor((left + up) / 2)) & 0xff;
      else value = (raw + paeth(left, up, upperLeft)) & 0xff;
      pixels[rowOffset + x] = value;
    }
    sourceOffset += stride;
  }
  return pixels;
}

function pixelEvidence(pixels, width, height) {
  let visiblePixels = 0;
  let transparentPixels = 0;
  let partialAlphaPixels = 0;
  let hiddenRgbTransparentPixels = 0;
  let edgeVisiblePixels = 0;
  let minimumX = width;
  let minimumY = height;
  let maximumX = -1;
  let maximumY = -1;
  const visibleHasher = createHash('sha256');
  const alphaHasher = createHash('sha256');
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const alpha = pixels[offset + 3];
      alphaHasher.update(Buffer.from([alpha]));
      if (alpha === 0) {
        transparentPixels += 1;
        if (red !== 0 || green !== 0 || blue !== 0) {
          hiddenRgbTransparentPixels += 1;
        }
        continue;
      }
      visiblePixels += 1;
      if (alpha < 255) partialAlphaPixels += 1;
      visibleHasher.update(Buffer.from([red, green, blue, alpha]));
      minimumX = Math.min(minimumX, x);
      minimumY = Math.min(minimumY, y);
      maximumX = Math.max(maximumX, x);
      maximumY = Math.max(maximumY, y);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        edgeVisiblePixels += 1;
      }
    }
  }
  assert(visiblePixels > 0, 'AVATAR_FRAME_FINISHER_PNG_FULLY_TRANSPARENT');
  assert(transparentPixels > 0, 'AVATAR_FRAME_FINISHER_PNG_FULLY_OPAQUE');
  return Object.freeze({
    visiblePixels,
    transparentPixels,
    partialAlphaPixels,
    hiddenRgbTransparentPixels,
    edgeVisiblePixels,
    visibleBounds: Object.freeze({
      x: minimumX,
      y: minimumY,
      width: maximumX - minimumX + 1,
      height: maximumY - minimumY + 1,
    }),
    visiblePixelSha256: visibleHasher.digest('hex'),
    alphaSha256: alphaHasher.digest('hex'),
  });
}

export function inspectAvatarProviderFramePng(
  input,
  expectedWidth,
  expectedHeight,
) {
  const bytes = Buffer.from(input);
  assert(
    bytes.length >= 57 && bytes.length <= MAXIMUM_PNG_BYTES,
    'AVATAR_FRAME_FINISHER_PNG_SIZE_INVALID',
  );
  assert(
    bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
    'AVATAR_FRAME_FINISHER_PNG_SIGNATURE_INVALID',
  );
  let offset = PNG_SIGNATURE.length;
  let header = null;
  let sawIdat = false;
  let endedIdat = false;
  let sawEnd = false;
  const idat = [];
  let chunkIndex = 0;
  while (offset < bytes.length) {
    assert(offset + 12 <= bytes.length, 'AVATAR_FRAME_FINISHER_PNG_TRUNCATED');
    const length = bytes.readUInt32BE(offset);
    const chunkEnd = offset + 12 + length;
    assert(chunkEnd <= bytes.length, 'AVATAR_FRAME_FINISHER_PNG_TRUNCATED');
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = typeBytes.toString('ascii');
    assert(/^[A-Za-z]{4}$/u.test(type), 'AVATAR_FRAME_FINISHER_PNG_CHUNK_INVALID');
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const recordedCrc = bytes.readUInt32BE(offset + 8 + length);
    assert(
      crc32(Buffer.concat([typeBytes, data])) === recordedCrc,
      'AVATAR_FRAME_FINISHER_PNG_CRC_INVALID',
    );
    if (chunkIndex === 0) {
      assert(type === 'IHDR', 'AVATAR_FRAME_FINISHER_PNG_IHDR_INVALID');
    }
    if (['acTL', 'fcTL', 'fdAT'].includes(type)) {
      fail('AVATAR_FRAME_FINISHER_PNG_ANIMATION_FORBIDDEN');
    }
    if (type === 'IHDR') {
      assert(header === null && length === 13, 'AVATAR_FRAME_FINISHER_PNG_IHDR_INVALID');
      header = Object.freeze({
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      });
    } else if (type === 'IDAT') {
      assert(header !== null && !endedIdat, 'AVATAR_FRAME_FINISHER_PNG_IDAT_ORDER_INVALID');
      sawIdat = true;
      idat.push(data);
    } else {
      if (sawIdat) endedIdat = true;
      if (type === 'IEND') {
        assert(length === 0 && !sawEnd, 'AVATAR_FRAME_FINISHER_PNG_IEND_INVALID');
        sawEnd = true;
        assert(chunkEnd === bytes.length, 'AVATAR_FRAME_FINISHER_PNG_TRAILING_BYTES');
      } else if ((typeBytes[0] & 0x20) === 0 && type !== 'PLTE') {
        fail('AVATAR_FRAME_FINISHER_PNG_CRITICAL_CHUNK_UNSUPPORTED');
      }
    }
    offset = chunkEnd;
    chunkIndex += 1;
  }
  assert(header && sawIdat && sawEnd, 'AVATAR_FRAME_FINISHER_PNG_STRUCTURE_INVALID');
  assert(
    Number.isSafeInteger(header.width) &&
      Number.isSafeInteger(header.height) &&
      header.width >= 1 &&
      header.height >= 1 &&
      header.width <= MAXIMUM_CANVAS_EDGE &&
      header.height <= MAXIMUM_CANVAS_EDGE &&
      header.bitDepth === 8 &&
      header.colorType === 6 &&
      header.compression === 0 &&
      header.filter === 0 &&
      header.interlace === 0,
    'AVATAR_FRAME_FINISHER_PNG_FORMAT_INVALID',
  );
  if (expectedWidth !== undefined) {
    assert(header.width === expectedWidth, 'AVATAR_FRAME_FINISHER_PNG_WIDTH_MISMATCH');
  }
  if (expectedHeight !== undefined) {
    assert(header.height === expectedHeight, 'AVATAR_FRAME_FINISHER_PNG_HEIGHT_MISMATCH');
  }
  const expectedDecoded = header.height * (header.width * 4 + 1);
  assert(
    expectedDecoded <= MAXIMUM_DECODED_BYTES,
    'AVATAR_FRAME_FINISHER_PNG_DECODED_SIZE_INVALID',
  );
  let inflated;
  try {
    inflated = inflateSync(Buffer.concat(idat), {
      maxOutputLength: expectedDecoded,
    });
  } catch {
    fail('AVATAR_FRAME_FINISHER_PNG_DEFLATE_INVALID');
  }
  const pixels = unfilterRows(inflated, header.width, header.height);
  const evidence = pixelEvidence(pixels, header.width, header.height);
  return deepFreeze({
    sha256: sha256FrameFinisherBytes(bytes),
    byteLength: bytes.length,
    width: header.width,
    height: header.height,
    bitDepth: 8,
    colorType: 6,
    interlace: 0,
    ...evidence,
    pixels,
  });
}

export function encodeAvatarProviderFramePng(width, height, pixels) {
  assert(
    Number.isSafeInteger(width) &&
      Number.isSafeInteger(height) &&
      width >= 1 &&
      height >= 1 &&
      width <= MAXIMUM_CANVAS_EDGE &&
      height <= MAXIMUM_CANVAS_EDGE,
    'AVATAR_FRAME_FINISHER_CANVAS_INVALID',
  );
  const rgba = Buffer.from(pixels);
  assert(
    rgba.length === width * height * 4,
    'AVATAR_FRAME_FINISHER_PIXEL_BUFFER_INVALID',
  );
  const stride = width * 4;
  const filtered = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    const targetOffset = y * (stride + 1);
    filtered[targetOffset] = 0;
    rgba.copy(filtered, targetOffset + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(filtered, { level: 9 })),
    pngChunk('IEND'),
  ]);
}

function parseMaterialization(receiptInput, requestInput) {
  const receipt = verifySelfHash(
    receiptInput,
    'materializationSha256',
    'candidate materialization receipt',
  );
  const request = verifySelfHash(
    requestInput,
    'finisherRequestSha256',
    'candidate finisher request',
  );
  assert(
    receipt.schema === MATERIALIZATION_SCHEMA &&
      receipt.protocolVersion === CANDIDATE_PROTOCOL_VERSION &&
      receipt.status === 'candidate-materialized-awaiting-frame-finisher',
    'AVATAR_FRAME_FINISHER_MATERIALIZATION_SCHEMA_INVALID',
  );
  assert(
    request.schema === FINISHER_REQUEST_SCHEMA &&
      request.protocolVersion === CANDIDATE_PROTOCOL_VERSION,
    'AVATAR_FRAME_FINISHER_REQUEST_SCHEMA_INVALID',
  );
  assert(
    request.materializationId === receipt.materializationId &&
      isRecord(receipt.output) &&
      isRecord(receipt.finisherHandoff) &&
      isRecord(request.sourceCandidate) &&
      receipt.output.path === request.sourceCandidate.path &&
      receipt.output.sha256 === request.sourceCandidate.sha256 &&
      receipt.output.bytes === request.sourceCandidate.bytes &&
      receipt.output.width === request.sourceCandidate.width &&
      receipt.output.height === request.sourceCandidate.height &&
      receipt.output.reviewedTargetPath === request.reviewedTargetPath &&
      receipt.finisherHandoff.finisherRequestSha256 ===
        request.finisherRequestSha256 &&
      receipt.output.createOnly === true &&
      receipt.output.unapproved === true &&
      request.finalSha256RequiredBeforeInbetweenOrSequenceUse === true &&
      request.candidateApproval === false &&
      request.candidatePromotion === false &&
      request.runtimeActivationAllowed === false,
    'AVATAR_FRAME_FINISHER_SOURCE_CHAIN_INVALID',
  );
  canonicalRelativePath(request.sourceCandidate.path, 'source candidate path');
  canonicalRelativePath(request.reviewedTargetPath, 'reviewed target path');
  digest(request.sourceCandidate.sha256, 'source candidate sha256');
  assert(
    Number.isSafeInteger(request.sourceCandidate.bytes) &&
      request.sourceCandidate.bytes >= 57 &&
      request.sourceCandidate.bytes <= MAXIMUM_PNG_BYTES &&
      Number.isSafeInteger(request.sourceCandidate.width) &&
      Number.isSafeInteger(request.sourceCandidate.height),
    'AVATAR_FRAME_FINISHER_SOURCE_CHAIN_INVALID',
  );
  return Object.freeze({ receipt, request });
}

function outputPaths(sourcePath) {
  const relative = canonicalRelativePath(sourcePath, 'source candidate path');
  assert(relative.endsWith('.png'), 'AVATAR_FRAME_FINISHER_PATH_INVALID');
  const stem = relative.slice(0, -4);
  return Object.freeze({
    finished: `${stem}.finished.png`,
    report: `${stem}.frame-finisher.json`,
    reviewRequest: `${stem}.frame-review-request.json`,
    reviewOutcome: `${stem}.frame-review-outcome.json`,
  });
}

function absoluteOutputPaths(workspaceRoot, relativePaths) {
  const root = realDirectory(workspaceRoot, 'workspaceRoot');
  const parent = path.posix.dirname(relativePaths.finished);
  const parentAbsolute = ensureDirectoryChain(root, parent);
  const output = { root, parent: parentAbsolute };
  for (const [key, relative] of Object.entries(relativePaths)) {
    assert(
      path.posix.dirname(relative) === parent,
      'AVATAR_FRAME_FINISHER_BUNDLE_PATH_INVALID',
    );
    const absolute = path.join(parentAbsolute, path.posix.basename(relative));
    assert(isInside(root, absolute), 'AVATAR_FRAME_FINISHER_PATH_ESCAPE');
    output[key] = absolute;
  }
  return Object.freeze(output);
}

function writeStagedFile(filePath, bytes) {
  const handle = openSync(filePath, 'wx', 0o600);
  try {
    writeFileSync(handle, bytes);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

function safeUnlink(filePath) {
  try {
    unlinkSync(filePath);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }
}

function publishCreateOnlyBundle(parent, entries) {
  const finals = entries.map((entry) => entry.path);
  const present = finals.map((entry) => existsSync(entry));
  assert(
    present.every((entry) => entry === false),
    'AVATAR_FRAME_FINISHER_OUTPUT_ALREADY_EXISTS',
    'Frame-finisher bundle already exists or is partially published.',
  );
  const token = randomBytes(12).toString('hex');
  const staged = finals.map((finalPath, index) =>
    path.join(parent, `.${path.basename(finalPath)}.${token}.${index}.tmp`),
  );
  const linked = [];
  try {
    for (let index = 0; index < entries.length; index += 1) {
      writeStagedFile(staged[index], Buffer.from(entries[index].bytes));
    }
    for (let index = 0; index < entries.length; index += 1) {
      linkSync(staged[index], finals[index]);
      linked.push(finals[index]);
    }
    for (const temporary of staged) safeUnlink(temporary);
  } catch (error) {
    for (const finalPath of linked.reverse()) safeUnlink(finalPath);
    for (const temporary of staged) safeUnlink(temporary);
    throw error;
  }
  for (let index = 0; index < entries.length; index += 1) {
    const metadata = lstatSync(finals[index]);
    assert(
      metadata.isFile() &&
        !metadata.isSymbolicLink() &&
        metadata.nlink === 1 &&
        metadata.size === Buffer.byteLength(entries[index].bytes),
      'AVATAR_FRAME_FINISHER_PUBLICATION_INVALID',
    );
  }
}

function finisherAuthority() {
  return Object.freeze({
    sourceRead: true,
    deterministicPixelFinishing: true,
    finisherReportPersistence: true,
    reviewRequestPersistence: true,
    visiblePixelMutation: false,
    alphaMutation: false,
    canvasMutation: false,
    creativeReview: false,
    candidateApproval: false,
    candidatePromotion: false,
    dependentInbetweenAdmission: false,
    sequenceAdmission: false,
    sequenceRelease: false,
    repositoryMutation: false,
    gitMutation: false,
    deployment: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  });
}

function reviewAuthority(finalHashAdmission = false) {
  return Object.freeze({
    namedHumanReviewEvidence: true,
    finalFrameHashAdmission: finalHashAdmission,
    candidatePromotion: false,
    dependentInbetweenGeneration: false,
    sequenceRelease: false,
    repositoryMutation: false,
    gitMutation: false,
    deployment: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  });
}

function finishPixels(source) {
  const pixels = Buffer.from(source.pixels);
  let cleared = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (
      pixels[offset + 3] === 0 &&
      (pixels[offset] !== 0 || pixels[offset + 1] !== 0 || pixels[offset + 2] !== 0)
    ) {
      pixels[offset] = 0;
      pixels[offset + 1] = 0;
      pixels[offset + 2] = 0;
      cleared += 1;
    }
  }
  return Object.freeze({ pixels, cleared });
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function buildReviewRequest(chain, report, paths, createdAt) {
  const body = {
    schema: FRAME_REVIEW_REQUEST_SCHEMA,
    protocolVersion: FRAME_FINISHER_PROTOCOL_VERSION,
    reviewRequestId: `avatar-frame-review:${sha256FrameFinisherDocument({
      frameFinisherSha256: report.frameFinisherSha256,
      outputSha256: report.output.sha256,
    }).slice(0, 40)}`,
    createdAt,
    frameFinisherSha256: report.frameFinisherSha256,
    materializationSha256: chain.receipt.materializationSha256,
    finisherRequestSha256: chain.request.finisherRequestSha256,
    frameId: report.frameId,
    characterId: report.characterId,
    finishedFrame: Object.freeze({
      path: paths.finished,
      sha256: report.output.sha256,
      bytes: report.output.bytes,
      width: report.output.width,
      height: report.output.height,
      visibleBounds: report.output.visibleBounds,
      visiblePixelSha256: report.output.visiblePixelSha256,
      alphaSha256: report.output.alphaSha256,
    }),
    reviewedTargetPath: chain.request.reviewedTargetPath,
    requiredGates: REVIEW_GATES,
    requiredEvidence: Object.freeze([
      'native-scale-inspection',
      'contact-sheet-inspection',
      'canonical-identity-comparison',
      'adjacent-frame-continuity-comparison',
      'final-to-first-loop-closure-when-applicable',
    ]),
    finalSha256RequiredBeforeInbetweenOrSequenceUse: true,
    sequenceReleaseAllowed: false,
    runtimeActivationAllowed: false,
    authority: reviewAuthority(false),
  };
  return deepFreeze({
    ...body,
    reviewRequestSha256: sha256FrameFinisherDocument(body),
  });
}

function buildFinisherReport(chain, source, output, paths, cleared, finishedAt) {
  const body = {
    schema: FRAME_FINISHER_REPORT_SCHEMA,
    protocolVersion: FRAME_FINISHER_PROTOCOL_VERSION,
    status: 'frame-finished-awaiting-human-review',
    finishId: `avatar-frame-finish:${sha256FrameFinisherDocument({
      materializationSha256: chain.receipt.materializationSha256,
      finisherRequestSha256: chain.request.finisherRequestSha256,
      sourceSha256: source.sha256,
      outputSha256: output.sha256,
    }).slice(0, 40)}`,
    finishedAt,
    materializationId: chain.receipt.materializationId,
    sourceCommit: chain.request.sourceCommit,
    sessionId: chain.request.sessionId,
    characterId: chain.request.characterId,
    jobId: chain.request.jobId,
    frameId: chain.request.frameId,
    kind: chain.request.kind,
    operation: chain.request.operation,
    continuityPhase: chain.request.continuityPhase,
    source: Object.freeze({
      path: chain.request.sourceCandidate.path,
      sha256: source.sha256,
      bytes: source.byteLength,
      width: source.width,
      height: source.height,
      hiddenRgbTransparentPixels: source.hiddenRgbTransparentPixels,
      visibleBounds: source.visibleBounds,
      visiblePixelSha256: source.visiblePixelSha256,
      alphaSha256: source.alphaSha256,
      materializationSha256: chain.receipt.materializationSha256,
      finisherRequestSha256: chain.request.finisherRequestSha256,
    }),
    output: Object.freeze({
      path: paths.finished,
      sha256: output.sha256,
      bytes: output.byteLength,
      width: output.width,
      height: output.height,
      hiddenRgbTransparentPixels: output.hiddenRgbTransparentPixels,
      hiddenRgbPixelsCleared: cleared,
      visibleBounds: output.visibleBounds,
      visiblePixelSha256: output.visiblePixelSha256,
      alphaSha256: output.alphaSha256,
      createOnly: true,
      approvalState: 'unapproved',
    }),
    preservation: Object.freeze({
      visiblePixelsUnchanged:
        source.visiblePixelSha256 === output.visiblePixelSha256,
      alphaUnchanged: source.alphaSha256 === output.alphaSha256,
      canvasUnchanged:
        source.width === output.width && source.height === output.height,
      visibleBoundsUnchanged:
        canonicalFrameFinisherJson(source.visibleBounds) ===
        canonicalFrameFinisherJson(output.visibleBounds),
      registrationUnchanged: true,
      onlyHiddenTransparentRgbWasModified: true,
    }),
    requiredNextSteps: Object.freeze([
      'inspect-finished-frame-at-native-scale',
      'inspect-finished-frame-in-contact-sheet',
      'review-hands-anatomy-face-identity-and-silhouette',
      'review-adjacent-frame-continuity',
      'review-final-to-first-loop-closure-when-applicable',
      'record-named-human-frame-review-decision',
      'admit-final-frame-sha-before-inbetween-or-sequence-use',
    ]),
    approvals: Object.freeze({
      technical: false,
      creative: false,
      anatomy: false,
      identity: false,
      continuity: false,
      loop: false,
      runtime: false,
      publication: false,
    }),
    authority: finisherAuthority(),
  };
  return deepFreeze({
    ...body,
    frameFinisherSha256: sha256FrameFinisherDocument(body),
  });
}

function parseExistingFinishBundle(absolute, paths, chain) {
  const present = [absolute.finished, absolute.report, absolute.reviewRequest]
    .map((entry) => existsSync(entry));
  if (present.every((entry) => entry === false)) return null;
  assert(
    present.every((entry) => entry === true),
    'AVATAR_FRAME_FINISHER_PARTIAL_PUBLICATION',
  );
  const reportRecord = stableJsonFile(absolute.report, 'existing frame-finisher report');
  const reviewRecord = stableJsonFile(absolute.reviewRequest, 'existing frame-review request');
  const report = verifySelfHash(
    reportRecord.value,
    'frameFinisherSha256',
    'existing frame-finisher report',
  );
  const reviewRequest = verifySelfHash(
    reviewRecord.value,
    'reviewRequestSha256',
    'existing frame-review request',
  );
  const finished = stableBinaryFile(absolute.finished, 'existing finished frame');
  assert(
    report.schema === FRAME_FINISHER_REPORT_SCHEMA &&
      reviewRequest.schema === FRAME_REVIEW_REQUEST_SCHEMA &&
      report.source.materializationSha256 === chain.receipt.materializationSha256 &&
      report.source.finisherRequestSha256 === chain.request.finisherRequestSha256 &&
      report.output.path === paths.finished &&
      report.output.sha256 === finished.sha256 &&
      report.output.bytes === finished.bytes.length &&
      reviewRequest.frameFinisherSha256 === report.frameFinisherSha256 &&
      reviewRequest.finishedFrame.sha256 === finished.sha256,
    'AVATAR_FRAME_FINISHER_EXISTING_BUNDLE_MISMATCH',
  );
  return deepFreeze({
    status: report.status,
    reused: true,
    finishedFramePath: absolute.finished,
    reportPath: absolute.report,
    reviewRequestPath: absolute.reviewRequest,
    report,
    reviewRequest,
  });
}

export function finishAvatarFinalPassProviderFrame({
  workspaceRoot,
  materializationReceipt,
  finisherRequest,
  finishedAt = new Date().toISOString(),
}) {
  timestamp(finishedAt, 'finishedAt');
  const chain = parseMaterialization(materializationReceipt, finisherRequest);
  assert(
    Date.parse(finishedAt) >= Date.parse(chain.request.createdAt),
    'AVATAR_FRAME_FINISHER_TIME_INVALID',
  );
  const root = realDirectory(workspaceRoot, 'workspaceRoot');
  const sourcePath = resolveWorkspaceFile(
    root,
    chain.request.sourceCandidate.path,
    'source candidate',
  );
  const sourceFile = stableBinaryFile(sourcePath, 'source candidate');
  assert(
    sourceFile.sha256 === chain.request.sourceCandidate.sha256 &&
      sourceFile.bytes.length === chain.request.sourceCandidate.bytes,
    'AVATAR_FRAME_FINISHER_SOURCE_HASH_MISMATCH',
  );
  const source = inspectAvatarProviderFramePng(
    sourceFile.bytes,
    chain.request.sourceCandidate.width,
    chain.request.sourceCandidate.height,
  );
  const paths = outputPaths(chain.request.sourceCandidate.path);
  const absolute = absoluteOutputPaths(root, paths);
  const reused = parseExistingFinishBundle(absolute, paths, chain);
  if (reused) return reused;

  const finishedPixels = finishPixels(source);
  const outputBytes = encodeAvatarProviderFramePng(
    source.width,
    source.height,
    finishedPixels.pixels,
  );
  const output = inspectAvatarProviderFramePng(
    outputBytes,
    source.width,
    source.height,
  );
  assert(
    output.hiddenRgbTransparentPixels === 0 &&
      source.visiblePixelSha256 === output.visiblePixelSha256 &&
      source.alphaSha256 === output.alphaSha256 &&
      canonicalFrameFinisherJson(source.visibleBounds) ===
        canonicalFrameFinisherJson(output.visibleBounds),
    'AVATAR_FRAME_FINISHER_VISIBLE_PIXEL_DRIFT',
  );
  const report = buildFinisherReport(
    chain,
    source,
    output,
    paths,
    finishedPixels.cleared,
    finishedAt,
  );
  assert(
    report.preservation.visiblePixelsUnchanged === true &&
      report.preservation.alphaUnchanged === true &&
      report.preservation.canvasUnchanged === true &&
      report.preservation.visibleBoundsUnchanged === true,
    'AVATAR_FRAME_FINISHER_PRESERVATION_INVALID',
  );
  const reviewRequest = buildReviewRequest(
    chain,
    report,
    paths,
    finishedAt,
  );

  const sourceRecheck = stableBinaryFile(sourcePath, 'source candidate recheck');
  assert(
    sourceRecheck.sha256 === source.sha256 &&
      sourceRecheck.bytes.length === source.byteLength,
    'AVATAR_FRAME_FINISHER_SOURCE_CHANGED_BEFORE_PUBLICATION',
  );

  publishCreateOnlyBundle(absolute.parent, [
    { path: absolute.finished, bytes: outputBytes },
    { path: absolute.report, bytes: jsonBytes(report) },
    { path: absolute.reviewRequest, bytes: jsonBytes(reviewRequest) },
  ]);
  const published = stableBinaryFile(absolute.finished, 'published finished frame');
  assert(
    published.sha256 === output.sha256 &&
      published.bytes.length === output.byteLength,
    'AVATAR_FRAME_FINISHER_PUBLICATION_HASH_MISMATCH',
  );
  return deepFreeze({
    status: report.status,
    reused: false,
    finishedFramePath: absolute.finished,
    reportPath: absolute.report,
    reviewRequestPath: absolute.reviewRequest,
    report,
    reviewRequest,
  });
}

export function finishAvatarFinalPassProviderFrameFiles({
  workspaceRoot,
  materializationReceiptPath,
  finisherRequestPath,
  finishedAt,
}) {
  const receipt = stableJsonFile(
    materializationReceiptPath,
    'candidate materialization receipt',
  );
  const request = stableJsonFile(
    finisherRequestPath,
    'candidate finisher request',
  );
  return finishAvatarFinalPassProviderFrame({
    workspaceRoot,
    materializationReceipt: receipt.value,
    finisherRequest: request.value,
    ...(finishedAt ? { finishedAt } : {}),
  });
}

function parseReviewDecision(input, report, request) {
  const decision = verifySelfHash(
    input,
    'decisionSha256',
    'frame review decision',
  );
  exactKeys(
    decision,
    [
      'schema',
      'protocolVersion',
      'reviewId',
      'frameFinisherSha256',
      'reviewRequestSha256',
      'frameId',
      'decision',
      'reviewer',
      'gates',
      'evidence',
      'notes',
      'authority',
      'decisionSha256',
    ],
    'frame review decision',
  );
  assert(
    decision.schema === FRAME_REVIEW_DECISION_SCHEMA &&
      decision.protocolVersion === FRAME_FINISHER_PROTOCOL_VERSION &&
      decision.frameFinisherSha256 === report.frameFinisherSha256 &&
      decision.reviewRequestSha256 === request.reviewRequestSha256 &&
      decision.frameId === report.frameId &&
      REVIEW_DECISIONS.has(decision.decision),
    'AVATAR_FRAME_REVIEW_DECISION_BINDING_INVALID',
  );
  identifier(decision.reviewId, 'frame review decision.reviewId');
  exactKeys(
    decision.reviewer,
    ['actorClass', 'actorId', 'occurredAt', 'evidenceSha256'],
    'frame review decision.reviewer',
  );
  assert(
    decision.reviewer.actorClass === 'human',
    'AVATAR_FRAME_REVIEW_HUMAN_REQUIRED',
  );
  boundedText(decision.reviewer.actorId, 'frame review decision.reviewer.actorId', 1, 256);
  timestamp(decision.reviewer.occurredAt, 'frame review decision.reviewer.occurredAt');
  digest(decision.reviewer.evidenceSha256, 'frame review decision.reviewer.evidenceSha256');
  exactKeys(decision.gates, REVIEW_GATES, 'frame review decision.gates');
  for (const gate of REVIEW_GATES) {
    assert(
      REVIEW_STATES.has(decision.gates[gate]),
      'AVATAR_FRAME_REVIEW_GATE_INVALID',
      `frame review decision.gates.${gate} is invalid.`,
    );
  }
  exactKeys(
    decision.evidence,
    [
      'nativeScaleSha256',
      'contactSheetSha256',
      'identityReferenceSha256',
      'adjacentFramesSha256',
      'loopClosureSha256',
    ],
    'frame review decision.evidence',
  );
  for (const key of [
    'nativeScaleSha256',
    'contactSheetSha256',
    'identityReferenceSha256',
    'adjacentFramesSha256',
  ]) {
    digest(decision.evidence[key], `frame review decision.evidence.${key}`);
  }
  if (decision.gates.loopClosure === 'not-applicable') {
    assert(
      decision.evidence.loopClosureSha256 === null,
      'AVATAR_FRAME_REVIEW_LOOP_EVIDENCE_INVALID',
    );
  } else {
    digest(
      decision.evidence.loopClosureSha256,
      'frame review decision.evidence.loopClosureSha256',
    );
  }
  boundedText(decision.notes, 'frame review decision.notes', 0, 4096);
  assert(isRecord(decision.authority), 'AVATAR_FRAME_REVIEW_AUTHORITY_INVALID');
  for (const value of Object.values(decision.authority)) {
    assert(value === false, 'AVATAR_FRAME_REVIEW_FALSE_AUTHORITY_REQUIRED');
  }

  if (decision.decision === 'approve-final-frame') {
    for (const gate of REVIEW_GATES.filter((entry) => entry !== 'loopClosure')) {
      assert(
        decision.gates[gate] === 'pass',
        'AVATAR_FRAME_REVIEW_APPROVAL_GATE_FAILED',
        `Approved frame requires ${gate} to pass.`,
      );
    }
    assert(
      decision.gates.loopClosure === 'pass' ||
        decision.gates.loopClosure === 'not-applicable',
      'AVATAR_FRAME_REVIEW_APPROVAL_GATE_FAILED',
    );
  }
  return decision;
}

function parseFrameReport(reportInput, requestInput) {
  const report = verifySelfHash(
    reportInput,
    'frameFinisherSha256',
    'frame-finisher report',
  );
  const request = verifySelfHash(
    requestInput,
    'reviewRequestSha256',
    'frame-review request',
  );
  assert(
    report.schema === FRAME_FINISHER_REPORT_SCHEMA &&
      report.protocolVersion === FRAME_FINISHER_PROTOCOL_VERSION &&
      report.status === 'frame-finished-awaiting-human-review' &&
      request.schema === FRAME_REVIEW_REQUEST_SCHEMA &&
      request.protocolVersion === FRAME_FINISHER_PROTOCOL_VERSION &&
      request.frameFinisherSha256 === report.frameFinisherSha256 &&
      request.finishedFrame.sha256 === report.output.sha256 &&
      request.finishedFrame.path === report.output.path &&
      request.frameId === report.frameId &&
      request.finalSha256RequiredBeforeInbetweenOrSequenceUse === true &&
      request.sequenceReleaseAllowed === false &&
      request.runtimeActivationAllowed === false,
    'AVATAR_FRAME_REVIEW_SOURCE_CHAIN_INVALID',
  );
  return Object.freeze({ report, request });
}

function reviewOutcomeBody(chain, decision, reviewedAt) {
  const approved = decision.decision === 'approve-final-frame';
  const status = approved
    ? 'final-frame-admitted'
    : decision.decision === 'repair-frame'
      ? 'frame-repair-required'
      : 'frame-rejected';
  return {
    schema: FRAME_REVIEW_OUTCOME_SCHEMA,
    protocolVersion: FRAME_FINISHER_PROTOCOL_VERSION,
    status,
    reviewedAt,
    reviewId: decision.reviewId,
    frameId: chain.report.frameId,
    characterId: chain.report.characterId,
    frameFinisherSha256: chain.report.frameFinisherSha256,
    reviewRequestSha256: chain.request.reviewRequestSha256,
    reviewDecisionSha256: decision.decisionSha256,
    finishedFrame: Object.freeze({
      path: chain.report.output.path,
      sha256: chain.report.output.sha256,
      bytes: chain.report.output.bytes,
      width: chain.report.output.width,
      height: chain.report.output.height,
    }),
    finalFrameSha256: approved ? chain.report.output.sha256 : null,
    dependentInbetweenEndpointAllowed: approved,
    sequenceDraftUseAllowed: approved,
    sequenceReleaseAllowed: false,
    runtimeActivationAllowed: false,
    reviewer: decision.reviewer,
    gates: decision.gates,
    evidence: decision.evidence,
    notes: decision.notes,
    requiredNextSteps: approved
      ? Object.freeze([
          'bind-final-frame-sha-to-dependent-inbetween-or-sequence-draft',
          'rerun-sequence-timing-and-loop-closure',
          'obtain-separate-sequence-release-approval',
        ])
      : decision.decision === 'repair-frame'
        ? Object.freeze([
            'return-frame-to-explicit-repair-queue',
            'produce-a-new-candidate-under-fresh-authorization',
            'rerun-finishing-and-human-review',
          ])
        : Object.freeze([
            'exclude-frame-from-dependent-inbetween-and-sequence-use',
            'record-a-new-explicit-production-decision-before-replacement',
          ]),
    authority: reviewAuthority(approved),
  };
}

function writeJsonCreateOnly(filePath, value) {
  const handle = openSync(filePath, 'wx', 0o600);
  try {
    writeFileSync(handle, jsonBytes(value));
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

export function reviewAvatarFinalPassProviderFrame({
  workspaceRoot,
  frameFinisherReport,
  frameReviewRequest,
  frameReviewDecision,
  reviewedAt = new Date().toISOString(),
}) {
  timestamp(reviewedAt, 'reviewedAt');
  const chain = parseFrameReport(frameFinisherReport, frameReviewRequest);
  const decision = parseReviewDecision(
    frameReviewDecision,
    chain.report,
    chain.request,
  );
  assert(
    Date.parse(reviewedAt) >= Date.parse(decision.reviewer.occurredAt) &&
      Date.parse(decision.reviewer.occurredAt) >=
        Date.parse(chain.report.finishedAt),
    'AVATAR_FRAME_REVIEW_TIME_INVALID',
  );
  const root = realDirectory(workspaceRoot, 'workspaceRoot');
  const finishedPath = resolveWorkspaceFile(
    root,
    chain.report.output.path,
    'finished frame',
  );
  const finished = stableBinaryFile(finishedPath, 'finished frame');
  assert(
    finished.sha256 === chain.report.output.sha256 &&
      finished.bytes.length === chain.report.output.bytes,
    'AVATAR_FRAME_REVIEW_FINISHED_FRAME_DRIFT',
  );
  const inspected = inspectAvatarProviderFramePng(
    finished.bytes,
    chain.report.output.width,
    chain.report.output.height,
  );
  assert(
    inspected.hiddenRgbTransparentPixels === 0 &&
      inspected.visiblePixelSha256 === chain.report.output.visiblePixelSha256 &&
      inspected.alphaSha256 === chain.report.output.alphaSha256,
    'AVATAR_FRAME_REVIEW_FINISHED_FRAME_DRIFT',
  );
  const body = reviewOutcomeBody(chain, decision, reviewedAt);
  const outcome = deepFreeze({
    ...body,
    reviewOutcomeSha256: sha256FrameFinisherDocument(body),
  });
  const paths = outputPaths(chain.report.source.path);
  assert(paths.reviewOutcome.endsWith('.json'), 'AVATAR_FRAME_FINISHER_PATH_INVALID');
  const absolute = absoluteOutputPaths(root, paths);
  if (existsSync(absolute.reviewOutcome)) {
    const existingRecord = stableJsonFile(
      absolute.reviewOutcome,
      'existing frame-review outcome',
    );
    const existing = verifySelfHash(
      existingRecord.value,
      'reviewOutcomeSha256',
      'existing frame-review outcome',
    );
    assert(
      canonicalFrameFinisherJson(existing) ===
        canonicalFrameFinisherJson(outcome),
      'AVATAR_FRAME_REVIEW_EXISTING_OUTCOME_MISMATCH',
    );
    return deepFreeze({
      status: existing.status,
      reused: true,
      outcomePath: absolute.reviewOutcome,
      outcome: existing,
    });
  }
  writeJsonCreateOnly(absolute.reviewOutcome, outcome);
  return deepFreeze({
    status: outcome.status,
    reused: false,
    outcomePath: absolute.reviewOutcome,
    outcome,
  });
}

export function reviewAvatarFinalPassProviderFrameFiles({
  workspaceRoot,
  frameFinisherReportPath,
  frameReviewRequestPath,
  frameReviewDecisionPath,
  reviewedAt,
}) {
  const report = stableJsonFile(
    frameFinisherReportPath,
    'frame-finisher report',
  );
  const request = stableJsonFile(
    frameReviewRequestPath,
    'frame-review request',
  );
  const decision = stableJsonFile(
    frameReviewDecisionPath,
    'frame-review decision',
  );
  return reviewAvatarFinalPassProviderFrame({
    workspaceRoot,
    frameFinisherReport: report.value,
    frameReviewRequest: request.value,
    frameReviewDecision: decision.value,
    ...(reviewedAt ? { reviewedAt } : {}),
  });
}

export function avatarProviderFrameFinisherCapabilities() {
  return deepFreeze({
    schema: FRAME_FINISHER_CAPABILITIES_SCHEMA,
    protocolVersion: FRAME_FINISHER_PROTOCOL_VERSION,
    tools: Object.freeze([
      'evavo_art_avatar_final_pass_provider_frame_finisher_capabilities',
      'evavo_art_finish_avatar_final_pass_provider_candidate',
      'evavo_art_review_avatar_final_pass_provider_frame',
    ]),
    finishing: Object.freeze({
      strictPngSignatureAndCrc: true,
      apngRejected: true,
      exactCanvasAndRgbaRequired: true,
      hiddenTransparentRgbCleared: true,
      visiblePixelsPreserved: true,
      alphaPreserved: true,
      registrationPreserved: true,
      createOnlyTransactionalBundle: true,
      idempotentReadback: true,
    }),
    review: Object.freeze({
      namedHumanRequired: true,
      nativeScaleEvidenceRequired: true,
      contactSheetEvidenceRequired: true,
      identityEvidenceRequired: true,
      adjacentFrameEvidenceRequired: true,
      loopEvidenceRequiredWhenApplicable: true,
      finalFrameHashAdmission: true,
      repairAndRejectOutcomes: true,
    }),
    imageBytesThroughMcp: false,
    providerExecution: false,
    visiblePixelRetouching: false,
    anatomyRepair: false,
    creativeApprovalByTool: false,
    candidatePromotion: false,
    sequenceRelease: false,
    repositoryMutation: false,
    gitPublication: false,
    deployment: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  });
}
