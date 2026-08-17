import { createHash } from 'node:crypto';
import path from 'node:path';

export const TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_REQUEST_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-provider-package-request.v1';
export const TOP_HAT_POSE_SLOT_PROVIDER_PACKAGE_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-provider-package.v1';
export const TOP_HAT_POSE_SLOT_PROVIDER_JOB_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-provider-job.v1';
export const TOP_HAT_POSE_SLOT_PROVIDER_METADATA_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-provider-metadata.v1';
export const TOP_HAT_POSE_SLOT_PROVIDER_CAPABILITIES_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-provider-capabilities.v1';

const IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,191}$/u;
export const ADAPTER_ID = /^[a-z0-9][a-z0-9._-]{0,95}$/u;
export const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const MAXIMUM_DOCUMENT_NODES = 32_768;
const MAXIMUM_DEPTH = 48;
const MAXIMUM_TEXT = 8_192;
export const MAXIMUM_BINDINGS_PER_JOB = 16;
export const MAXIMUM_AUTHORIZATION_WINDOW_MS = 24 * 60 * 60 * 1_000;
export const CHARACTER_ID = 'top-hat-man';

const AUTHORITY_KEYS = Object.freeze([
  'sourceMutation',
  'automaticGenerationAuthorization',
  'providerExecution',
  'imageMutation',
  'creativeDecision',
  'candidateApproval',
  'candidatePromotion',
  'poseSlotFilling',
  'sequenceRelease',
  'repositoryMutation',
  'gitCommit',
  'gitPush',
  'deployment',
  'publication',
  'runtimeActivation',
  'forcePush',
]);

export const MUST_AVOID = Object.freeze([
  'malformed hands or fingers',
  'broken wrists, duplicated limbs or missing digits',
  'face or character identity drift',
  'body-proportion or silhouette drift',
  'top-hat geometry drift',
  'wardrobe redesign',
  'camera, pivot, baseline or canvas-registration drift',
  'cropping or visible canvas-edge contact',
  'painted checkerboard, opaque matte or fake transparency',
  'green, magenta or other chroma spill',
  'dark or pale alpha fringe caused by association mismatch',
  'baked mouth visemes in the body master',
  'whole-body switching driven by speech visemes',
  'synthetic body in-betweening represented as authored pose art',
  'multiple candidates, contact sheets, labels or text in provider output',
]);

export class ProjectArtTopHatPoseSlotProviderPackageError extends Error {
  constructor(code, message = code) {
    super(message === code ? code : `${code}: ${message}`);
    this.name = 'ProjectArtTopHatPoseSlotProviderPackageError';
    this.code = code;
  }
}

export function fail(code, message = code) {
  throw new ProjectArtTopHatPoseSlotProviderPackageError(code, message);
}

export function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function exactKeys(value, keys, label) {
  if (!isRecord(value)) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_OBJECT_INVALID', `${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(
      'PROJECT_ART_TOP_HAT_PROVIDER_KEYS_INVALID',
      `${label} has unexpected or missing fields.`,
    );
  }
}

export function assertPassive(value) {
  const seen = new WeakSet();
  let nodes = 0;
  function visit(current, depth) {
    nodes += 1;
    if (nodes > MAXIMUM_DOCUMENT_NODES || depth > MAXIMUM_DEPTH) {
      fail('PROJECT_ART_TOP_HAT_PROVIDER_DOCUMENT_TOO_LARGE');
    }
    if (
      current === null ||
      typeof current === 'string' ||
      typeof current === 'boolean'
    ) {
      return;
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) {
        fail('PROJECT_ART_TOP_HAT_PROVIDER_NUMBER_INVALID');
      }
      return;
    }
    if (typeof current !== 'object' || ArrayBuffer.isView(current)) {
      fail('PROJECT_ART_TOP_HAT_PROVIDER_VALUE_INVALID');
    }
    if (seen.has(current)) {
      fail('PROJECT_ART_TOP_HAT_PROVIDER_DOCUMENT_CYCLIC');
    }
    seen.add(current);
    if (Object.getOwnPropertySymbols(current).length > 0) {
      fail('PROJECT_ART_TOP_HAT_PROVIDER_SYMBOL_FORBIDDEN');
    }
    for (const key of Reflect.ownKeys(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
        fail('PROJECT_ART_TOP_HAT_PROVIDER_ACCESSOR_FORBIDDEN');
      }
      visit(descriptor.value, depth + 1);
    }
    seen.delete(current);
  }
  visit(value, 0);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_CANONICAL_JSON_INVALID');
  }
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_CANONICAL_JSON_INVALID');
  }
  return value;
}

export function canonicalTopHatPoseSlotProviderPackageJson(value) {
  return JSON.stringify(canonical(value));
}

export function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256Document(value) {
  return sha256Bytes(
    Buffer.from(canonicalTopHatPoseSlotProviderPackageJson(value), 'utf8'),
  );
}

export function freezeClone(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeClone));
  if (isRecord(value)) {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, freezeClone(entry)]),
      ),
    );
  }
  return value;
}

export function boundedText(value, label, { minimum = 0, maximum = MAXIMUM_TEXT } = {}) {
  if (
    typeof value !== 'string' ||
    value.length < minimum ||
    value.length > maximum ||
    value.includes('\0')
  ) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_TEXT_INVALID', `${label} is invalid.`);
  }
  return value;
}

export function identifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_IDENTIFIER_INVALID', `${label} is invalid.`);
  }
  return value;
}

export function digest(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_SHA256_INVALID', `${label} is invalid.`);
  }
  return value;
}

export function timestamp(value, label) {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_TIMESTAMP_INVALID', `${label} is invalid.`);
  }
  return value;
}

export function canonicalPath(value, label) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 1024 ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.startsWith('/') ||
    value.startsWith('../') ||
    value.includes('/../') ||
    value.includes('//') ||
    /^[A-Za-z]:/u.test(value)
  ) {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_PATH_INVALID', `${label} is invalid.`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === '.' || normalized === '..') {
    fail('PROJECT_ART_TOP_HAT_PROVIDER_PATH_INVALID', `${label} is not canonical.`);
  }
  return value;
}

export function falseAuthority(value, label = 'authority') {
  exactKeys(value, AUTHORITY_KEYS, label);
  for (const key of AUTHORITY_KEYS) {
    if (value[key] !== false) {
      fail(
        'PROJECT_ART_TOP_HAT_PROVIDER_FALSE_AUTHORITY_REQUIRED',
        `${label}.${key} must remain false.`,
      );
    }
  }
  return Object.freeze(
    Object.fromEntries(AUTHORITY_KEYS.map((key) => [key, false])),
  );
}

export function createProjectArtTopHatPoseSlotProviderAuthority() {
  return falseAuthority(
    Object.fromEntries(AUTHORITY_KEYS.map((key) => [key, false])),
  );
}
