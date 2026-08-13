import { createHash } from 'node:crypto';
import path from 'node:path';

import {
  AVATAR_FINAL_PASS_PROVIDER_AUTHORITY_KEYS,
  IDENTIFIER_PATTERN,
  MAXIMUM_DOCUMENT_BYTES,
  MAXIMUM_TEXT,
  SHA1_PATTERN,
  SHA256_PATTERN,
} from './avatar-final-pass-provider-constants.mjs';

export class ProjectArtAvatarFinalPassProviderError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ProjectArtAvatarFinalPassProviderError';
    this.code = code;
  }
}

export function fail(code, message = code) {
  throw new ProjectArtAvatarFinalPassProviderError(code, message);
}

export function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function exactKeys(value, keys, label) {
  if (!isRecord(value)) {
    fail('AVATAR_FINAL_PASS_PROVIDER_OBJECT_INVALID', `${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(
      'AVATAR_FINAL_PASS_PROVIDER_KEYS_INVALID',
      `${label} has unexpected or missing fields.`,
    );
  }
}

export function identifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    fail('AVATAR_FINAL_PASS_PROVIDER_IDENTIFIER_INVALID', `${label} is invalid.`);
  }
  return value;
}

export function digest(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    fail('AVATAR_FINAL_PASS_PROVIDER_SHA256_INVALID', `${label} is invalid.`);
  }
  return value;
}

export function sourceRef(value, label) {
  if (typeof value !== 'string' || !SHA1_PATTERN.test(value)) {
    fail('AVATAR_FINAL_PASS_PROVIDER_SOURCE_REF_INVALID', `${label} is invalid.`);
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
    fail('AVATAR_FINAL_PASS_PROVIDER_TEXT_INVALID', `${label} is invalid.`);
  }
  return value;
}

export function canonicalPath(value, label) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 1024 ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.startsWith('/') ||
    value.startsWith('../') ||
    value.includes('/../') ||
    value.includes('//') ||
    /^[A-Za-z]:/u.test(value)
  ) {
    fail(
      'AVATAR_FINAL_PASS_PROVIDER_PATH_INVALID',
      `${label} must be a canonical forward-slash relative path.`,
    );
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === '.' || normalized === '..') {
    fail('AVATAR_FINAL_PASS_PROVIDER_PATH_INVALID', `${label} is not canonical.`);
  }
  return value;
}

export function timestamp(value, label) {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    fail('AVATAR_FINAL_PASS_PROVIDER_TIMESTAMP_INVALID', `${label} is invalid.`);
  }
  return value;
}

export function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    fail(
      'AVATAR_FINAL_PASS_PROVIDER_CANONICAL_JSON_INVALID',
      'Canonical JSON cannot contain non-finite numbers.',
    );
  }
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    fail(
      'AVATAR_FINAL_PASS_PROVIDER_CANONICAL_JSON_INVALID',
      'Canonical JSON contains an unsupported value.',
    );
  }
  return value;
}

export function canonicalAvatarFinalPassProviderJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256AvatarFinalPassProviderDocument(value) {
  return sha256Bytes(
    Buffer.from(canonicalAvatarFinalPassProviderJson(value), 'utf8'),
  );
}

export function parseJsonBytes(bytes, label) {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < 2 ||
    bytes.length > MAXIMUM_DOCUMENT_BYTES
  ) {
    fail(
      'AVATAR_FINAL_PASS_PROVIDER_DOCUMENT_BYTES_INVALID',
      `${label} is outside the document boundary.`,
    );
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('AVATAR_FINAL_PASS_PROVIDER_UTF8_INVALID', `${label} is not valid UTF-8.`);
  }
  if (text.charCodeAt(0) === 0xfeff) {
    fail('AVATAR_FINAL_PASS_PROVIDER_BOM_FORBIDDEN', `${label} contains a BOM.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    fail('AVATAR_FINAL_PASS_PROVIDER_JSON_INVALID', `${label} is not valid JSON.`);
  }
}

export function parseFalseAuthority(value, label = 'authority') {
  exactKeys(value, AVATAR_FINAL_PASS_PROVIDER_AUTHORITY_KEYS, label);
  for (const key of AVATAR_FINAL_PASS_PROVIDER_AUTHORITY_KEYS) {
    if (value[key] !== false) {
      fail(
        'AVATAR_FINAL_PASS_PROVIDER_FALSE_AUTHORITY_REQUIRED',
        `${label}.${key} must remain false.`,
      );
    }
  }
  return Object.freeze(
    Object.fromEntries(
      AVATAR_FINAL_PASS_PROVIDER_AUTHORITY_KEYS.map((key) => [key, false]),
    ),
  );
}

export function createAvatarFinalPassProviderAuthority() {
  return parseFalseAuthority(
    Object.fromEntries(
      AVATAR_FINAL_PASS_PROVIDER_AUTHORITY_KEYS.map((key) => [key, false]),
    ),
  );
}

export function verifyAllFalseAuthority(value, label) {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    fail(
      'AVATAR_FINAL_PASS_PROVIDER_UPSTREAM_AUTHORITY_INVALID',
      `${label} must be a non-empty all-false authority object.`,
    );
  }
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== false) {
      fail(
        'AVATAR_FINAL_PASS_PROVIDER_UPSTREAM_AUTHORITY_ESCALATED',
        `${label}.${key} must remain false.`,
      );
    }
  }
}

