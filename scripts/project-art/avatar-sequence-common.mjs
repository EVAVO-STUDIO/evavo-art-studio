import { createHash } from 'node:crypto';
import path from 'node:path';
import { TextDecoder } from 'node:util';

import { fileURLToPath } from 'node:url';

export const PROJECT_ART_AVATAR_SEQUENCE_REQUEST_SCHEMA =
  'evavo.project-art-avatar-sequence-request.v1';
export const PROJECT_ART_AVATAR_SEQUENCE_PLAN_SCHEMA =
  'evavo.project-art-avatar-sequence-mastering-plan.v1';
export const AVATAR_SEQUENCE_PACK_TARGET_SCHEMA =
  'evavo_avatar_sequence_pack_v2';
export const AVATAR_SEQUENCE_LOOP_EVIDENCE_TARGET_SCHEMA =
  'evavo_avatar_sequence_loop_closure_evidence_v1';
export const PROJECT_ART_LOOP_CLOSURE_REQUEST_SCHEMA =
  'evavo.project-art-loop-closure-request.v1';

const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,95}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAXIMUM_IMAGE_DIMENSION = 32_768;
const LIMITS = Object.freeze({
  maximumRequestBytes: 16 * 1024 * 1024,
  maximumSourceBytes: 128 * 1024 * 1024,
  maximumTotalSourceBytes: 2 * 1024 * 1024 * 1024,
  maximumDecodedPixels: 300_000_000,
  maximumFrames: 2_048,
  maximumClips: 256,
  maximumFramesPerClip: 240,
  maximumMapEntries: 64,
});
const CLIP_KINDS = Object.freeze([
  'idle',
  'blink',
  'talk-in',
  'talk-loop',
  'talk-out',
  'talk-emotion',
  'listening',
  'thinking',
  'gesture',
  'wave',
  'sleep',
  'dance',
  'emotion',
]);
const LOOP_MODES = Object.freeze(['once', 'loop', 'ping-pong']);
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
const RUNTIME_AUTHORITY_KEYS = Object.freeze([
  'semanticAssignment',
  'assetApproval',
  'assetPromotion',
  'providerExecution',
  'repositoryMutation',
  'gitCommit',
  'gitPush',
  'publication',
  'forcePush',
]);
const REVIEW_DISCIPLINES = Object.freeze(['art', 'animation', 'runtime']);

export class ProjectArtAvatarSequenceError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ProjectArtAvatarSequenceError';
    this.code = code;
  }
}

function fail(code, message = code) {
  throw new ProjectArtAvatarSequenceError(code, message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected, label, code = 'PROJECT_ART_AVATAR_SEQUENCE_REQUEST_INVALID') {
  if (!isRecord(value)) fail(code, `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(code, `${label} has unsupported or missing fields.`);
  }
}

function identifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_IDENTIFIER_INVALID', `${label} is invalid.`);
  }
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_SHA256_INVALID',
      `${label} must be a lowercase SHA-256 digest.`,
    );
  }
  return value;
}

function boundedString(value, label, maximum = 8192) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maximum ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  ) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_STRING_INVALID', `${label} is invalid.`);
  }
  return value;
}

function boundedInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_NUMBER_INVALID',
      `${label} must be an integer from ${minimum} through ${maximum}.`,
    );
  }
  return value;
}

function finiteNumber(value, label, minimum, maximum) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_NUMBER_INVALID',
      `${label} is outside the admitted numeric boundary.`,
    );
  }
  return Object.is(value, -0) ? 0 : value;
}

function timestamp(value, label) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_TIMESTAMP_INVALID',
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
      'PROJECT_ART_AVATAR_SEQUENCE_PATH_INVALID',
      `${label} must be a canonical forward-slash relative path.`,
    );
  }
  return value;
}

function reviewedTargetPath(value, characterId, frameId, label) {
  const selected = canonicalPath(value, label);
  const prefixes = [
    `assets/${characterId}/reviewed/`,
    `characters/${characterId}/sequences/`,
  ];
  if (
    !prefixes.some((prefix) => selected.startsWith(prefix)) ||
    path.posix.extname(selected).toLowerCase() !== '.png' ||
    path.posix.basename(selected) !== `${frameId}.png` ||
    /ChatGPT Image|(?:^|\/)raw(?:\/|$)|unreviewed/iu.test(selected)
  ) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_TARGET_PATH_INVALID',
      `${label} must be a reviewed, frame-identity-named PNG path.`,
    );
  }
  return selected;
}

function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_CANONICAL_JSON_INVALID');
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
          fail('PROJECT_ART_AVATAR_SEQUENCE_CANONICAL_JSON_INVALID');
        }
        return `${JSON.stringify(key)}:${canonicalJson(value[key])}`;
      })
      .join(',')}}`;
  }
  fail('PROJECT_ART_AVATAR_SEQUENCE_CANONICAL_JSON_INVALID');
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
      'PROJECT_ART_AVATAR_SEQUENCE_UTF8_INVALID',
      'requestBytes are not valid UTF-8.',
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_REQUEST_INVALID',
      'requestBytes are not valid JSON.',
    );
  }
}

export function withProjectArtAvatarSequenceDocumentHash(value) {
  const document = { ...value };
  delete document.documentSha256;
  return Object.freeze({
    ...document,
    documentSha256: hashBytes(Buffer.from(canonicalJson(document), 'utf8')),
  });
}


export {
  AUTHORITY_KEYS,
  CLIP_KINDS,
  IDENTIFIER,
  LIMITS,
  LOOP_MODES,
  MAXIMUM_IMAGE_DIMENSION,
  PNG_SIGNATURE,
  REVIEW_DISCIPLINES,
  RUNTIME_AUTHORITY_KEYS,
  boundedInteger,
  boundedString,
  canonicalJson,
  canonicalPath,
  digest,
  exactKeys,
  fail,
  finiteNumber,
  hashBytes,
  identifier,
  isRecord,
  parseRequestBytes,
  reviewedTargetPath,
  timestamp,
};
