import { createHash } from 'node:crypto';
import path from 'node:path';
import { TextDecoder } from 'node:util';

export const PROJECT_ART_AVATAR_SEQUENCE_PLAN_SCHEMA =
  'evavo.project-art-avatar-sequence-mastering-plan.v1';
export const PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_SCHEMA =
  'evavo.project-art-avatar-sequence-bundle.v1';
export const PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RECEIPT_SCHEMA =
  'evavo.project-art-avatar-sequence-bundle-receipt.v1';
export const PROJECT_ART_LOOP_CLOSURE_REQUEST_SCHEMA =
  'evavo.project-art-loop-closure-request.v1';
export const AVATAR_SEQUENCE_PACK_TARGET_SCHEMA =
  'evavo_avatar_sequence_pack_v2';
export const AVATAR_SEQUENCE_LOOP_EVIDENCE_TARGET_SCHEMA =
  'evavo_avatar_sequence_loop_closure_evidence_v1';

export const BUNDLE_AUTHORITY_KEYS = Object.freeze([
  'providerExecution',
  'sourceMutation',
  'sourceDeletion',
  'targetImageWrite',
  'candidateApproval',
  'candidatePromotion',
  'targetRepositoryMutation',
  'gitCommit',
  'gitPush',
  'publication',
  'deployment',
  'runtimeActivation',
  'forcePush',
]);

export const PLAN_AUTHORITY_KEYS = Object.freeze([
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

export const PLAN_EFFECT_KEYS = Object.freeze([
  'sourceMutation',
  'sourceDeletion',
  'targetImageWrite',
  'providerExecution',
  'candidateApproval',
  'candidatePromotion',
  'targetRepositoryMutation',
  'gitCommit',
  'gitPush',
  'publication',
  'deployment',
  'forcePush',
]);

export const RUNTIME_AUTHORITY_KEYS = Object.freeze([
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

export const REVIEW_DISCIPLINES = Object.freeze([
  'art',
  'animation',
  'runtime',
]);

export const LIMITS = Object.freeze({
  maximumPlanBytes: 64 * 1024 * 1024,
  maximumOutputDocumentBytes: 64 * 1024 * 1024,
  maximumFrames: 2_048,
  maximumClips: 256,
  maximumLoopRequests: 256,
  maximumOperations: 2_048,
  maximumOutputs: 260,
});

const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,95}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

export class ProjectArtAvatarSequenceBundleError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ProjectArtAvatarSequenceBundleError';
    this.code = code;
  }
}

export function fail(code, message = code) {
  throw new ProjectArtAvatarSequenceBundleError(code, message);
}

export function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function exactKeys(
  value,
  expected,
  label,
  code = 'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_INVALID',
) {
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

export function identifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_IDENTIFIER_INVALID',
      `${label} is invalid.`,
    );
  }
  return value;
}

export function digest(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_SHA256_INVALID',
      `${label} must be a lowercase SHA-256 digest.`,
    );
  }
  return value;
}

export function boundedString(value, label, maximum = 8192) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maximum ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  ) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_STRING_INVALID',
      `${label} is invalid.`,
    );
  }
  return value;
}

export function boundedInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_NUMBER_INVALID',
      `${label} must be an integer from ${minimum} through ${maximum}.`,
    );
  }
  return value;
}

export function timestamp(value, label) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_TIMESTAMP_INVALID',
      `${label} must be a canonical UTC timestamp.`,
    );
  }
  return value;
}

export function canonicalRelativePath(value, label) {
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
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_PATH_INVALID',
      `${label} must be a canonical forward-slash relative path.`,
    );
  }
  return value;
}

export function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_CANONICAL_JSON_INVALID');
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
          fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_CANONICAL_JSON_INVALID');
        }
        return `${JSON.stringify(key)}:${canonicalJson(value[key])}`;
      })
      .join(',')}}`;
  }
  fail('PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_CANONICAL_JSON_INVALID');
}

export function hashBytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function parseJsonBytes(value, label) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_UTF8_INVALID',
      `${label} is not valid UTF-8.`,
    );
  }
  if (text.startsWith('\uFEFF')) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_UTF8_INVALID',
      `${label} must not contain a UTF-8 BOM.`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_JSON_INVALID',
      `${label} is not valid JSON.`,
    );
  }
}

export function withDocumentHash(value) {
  const document = { ...value };
  delete document.documentSha256;
  return Object.freeze({
    ...document,
    documentSha256: hashBytes(Buffer.from(canonicalJson(document), 'utf8')),
  });
}

export function verifyDocumentHash(value, label) {
  if (!isRecord(value)) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_DOCUMENT_INVALID',
      `${label} must be an object.`,
    );
  }
  const supplied = digest(value.documentSha256, `${label}.documentSha256`);
  const unsigned = { ...value };
  delete unsigned.documentSha256;
  const observed = hashBytes(Buffer.from(canonicalJson(unsigned), 'utf8'));
  if (observed !== supplied) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_DOCUMENT_HASH_MISMATCH',
      `${label} canonical SHA-256 does not match its content.`,
    );
  }
  return supplied;
}

export function falseAuthority(keys = BUNDLE_AUTHORITY_KEYS) {
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, false])));
}

export function parseFalseAuthority(value, keys, label, code) {
  exactKeys(value, keys, label, code);
  for (const key of keys) {
    if (value[key] !== false) {
      fail(code, `${label}.${key} must remain false.`);
    }
  }
  return falseAuthority(keys);
}
