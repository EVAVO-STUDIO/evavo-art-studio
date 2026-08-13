import { createHash } from 'node:crypto';
import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { types as utilTypes } from 'node:util';

import {
  ARTIFACT_ID_PATTERN,
  IDENTIFIER_PATTERN,
  MAXIMUM_DEPTH,
  MAXIMUM_DOCUMENT_BYTES,
  MAXIMUM_NODES,
  SHA1_PATTERN,
  SHA256_PATTERN,
} from './avatar-final-pass-provider-runtime-constants.mjs';

export class ProjectArtAvatarFinalPassProviderRuntimeError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ProjectArtAvatarFinalPassProviderRuntimeError';
    this.code = code;
  }
}

export function fail(code, message = code) {
  throw new ProjectArtAvatarFinalPassProviderRuntimeError(code, message);
}

export function assert(condition, code, message = code) {
  if (!condition) fail(code, message);
}

export function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function exactKeys(value, keys, label, code = 'AVATAR_PROVIDER_RUNTIME_KEYS_INVALID') {
  assert(isRecord(value), code, `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(
    actual.length === expected.length &&
      actual.every((key, index) => key === expected[index]),
    code,
    `${label} has unexpected or missing fields.`,
  );
}

export function identifier(value, label) {
  assert(
    typeof value === 'string' && IDENTIFIER_PATTERN.test(value),
    'AVATAR_PROVIDER_RUNTIME_IDENTIFIER_INVALID',
    `${label} is invalid.`,
  );
  return value;
}

export function digest(value, label) {
  assert(
    typeof value === 'string' && SHA256_PATTERN.test(value),
    'AVATAR_PROVIDER_RUNTIME_SHA256_INVALID',
    `${label} is invalid.`,
  );
  return value;
}

export function sourceRef(value, label) {
  assert(
    typeof value === 'string' && SHA1_PATTERN.test(value),
    'AVATAR_PROVIDER_RUNTIME_SOURCE_REF_INVALID',
    `${label} is invalid.`,
  );
  return value;
}

export function artifactId(value, label) {
  assert(
    typeof value === 'string' && ARTIFACT_ID_PATTERN.test(value),
    'AVATAR_PROVIDER_RUNTIME_ARTIFACT_ID_INVALID',
    `${label} must use artifact_<sha256> format.`,
  );
  return value;
}

export function boundedText(value, label, minimum = 1, maximum = 32_000) {
  assert(
    typeof value === 'string' &&
      value.length >= minimum &&
      value.length <= maximum &&
      !value.includes('\0'),
    'AVATAR_PROVIDER_RUNTIME_TEXT_INVALID',
    `${label} is invalid.`,
  );
  return value;
}

export function timestamp(value, label) {
  assert(
    typeof value === 'string' &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value,
    'AVATAR_PROVIDER_RUNTIME_TIMESTAMP_INVALID',
    `${label} must be an exact ISO timestamp.`,
  );
  return value;
}

export function canonicalPath(value, label) {
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
    'AVATAR_PROVIDER_RUNTIME_PATH_INVALID',
    `${label} must be a canonical forward-slash relative path.`,
  );
  const normalized = path.posix.normalize(value);
  assert(
    normalized === value && normalized !== '.' && normalized !== '..',
    'AVATAR_PROVIDER_RUNTIME_PATH_INVALID',
    `${label} is not canonical.`,
  );
  return value;
}

function snapshotValue(value, state, label, depth) {
  assert(
    depth <= MAXIMUM_DEPTH,
    'AVATAR_PROVIDER_RUNTIME_SNAPSHOT_DEPTH_EXCEEDED',
    `${label} exceeds the maximum nesting depth.`,
  );
  state.nodes += 1;
  assert(
    state.nodes <= MAXIMUM_NODES,
    'AVATAR_PROVIDER_RUNTIME_SNAPSHOT_SIZE_EXCEEDED',
    `${label} exceeds the maximum node count.`,
  );

  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    assert(
      Number.isFinite(value),
      'AVATAR_PROVIDER_RUNTIME_JSON_INVALID',
      `${label} contains a non-finite number.`,
    );
    return Object.is(value, -0) ? 0 : value;
  }
  assert(
    typeof value === 'object' && value !== undefined && !utilTypes.isProxy(value),
    'AVATAR_PROVIDER_RUNTIME_JSON_INVALID',
    `${label} contains a non-JSON or Proxy value.`,
  );
  assert(
    !ArrayBuffer.isView(value) && !(value instanceof ArrayBuffer),
    'AVATAR_PROVIDER_RUNTIME_JSON_INVALID',
    `${label} contains binary data.`,
  );
  assert(
    !state.seen.has(value),
    'AVATAR_PROVIDER_RUNTIME_JSON_INVALID',
    `${label} contains a cycle.`,
  );
  state.seen.add(value);

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const prototype = Object.getPrototypeOf(value);
  let output;

  if (Array.isArray(value)) {
    assert(
      prototype === Array.prototype,
      'AVATAR_PROVIDER_RUNTIME_JSON_INVALID',
      `${label} must use the intrinsic Array prototype.`,
    );
    assert(
      Reflect.ownKeys(descriptors).length === value.length + 1,
      'AVATAR_PROVIDER_RUNTIME_JSON_INVALID',
      `${label} must be dense and contain no extra properties.`,
    );
    output = new Array(value.length);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      assert(
        descriptor &&
          Object.hasOwn(descriptor, 'value') &&
          descriptor.enumerable &&
          !descriptor.get &&
          !descriptor.set,
        'AVATAR_PROVIDER_RUNTIME_JSON_INVALID',
        `${label}[${index}] must be an enumerable data property.`,
      );
      output[index] = snapshotValue(
        descriptor.value,
        state,
        `${label}[${index}]`,
        depth + 1,
      );
    }
  } else {
    assert(
      prototype === Object.prototype || prototype === null,
      'AVATAR_PROVIDER_RUNTIME_JSON_INVALID',
      `${label} must be a plain object.`,
    );
    output = {};
    for (const key of Reflect.ownKeys(descriptors)) {
      assert(
        typeof key === 'string',
        'AVATAR_PROVIDER_RUNTIME_JSON_INVALID',
        `${label} contains a symbol key.`,
      );
      const descriptor = descriptors[key];
      assert(
        Object.hasOwn(descriptor, 'value') &&
          descriptor.enumerable &&
          !descriptor.get &&
          !descriptor.set,
        'AVATAR_PROVIDER_RUNTIME_JSON_INVALID',
        `${label}.${key} must be an enumerable data property.`,
      );
      output[key] = snapshotValue(
        descriptor.value,
        state,
        `${label}.${key}`,
        depth + 1,
      );
    }
  }

  state.seen.delete(value);
  return output;
}

export function snapshotJsonValue(value, label = 'value') {
  return snapshotValue(value, { seen: new Set(), nodes: 0 }, label, 0);
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
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(snapshotJsonValue(value)));
}

export function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256Text(text) {
  return sha256Bytes(Buffer.from(text, 'utf8'));
}

export function sha256Document(value) {
  return sha256Text(canonicalJson(value));
}

export function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

export function verifySelfHash(value, field, label) {
  const snapshot = snapshotJsonValue(value, label);
  const recorded = digest(snapshot[field], `${label}.${field}`);
  const body = { ...snapshot };
  delete body[field];
  assert(
    sha256Document(body) === recorded,
    'AVATAR_PROVIDER_RUNTIME_SELF_HASH_MISMATCH',
    `${label}.${field} does not match canonical content.`,
  );
  return deepFreeze(snapshot);
}

export function parseAllFalseAuthority(value, keys, label) {
  exactKeys(value, keys, label, 'AVATAR_PROVIDER_RUNTIME_AUTHORITY_INVALID');
  const output = {};
  for (const key of keys) {
    assert(
      value[key] === false,
      'AVATAR_PROVIDER_RUNTIME_FALSE_AUTHORITY_REQUIRED',
      `${label}.${key} must remain false.`,
    );
    output[key] = false;
  }
  return Object.freeze(output);
}

export function createAuthority(keys, trueKeys = []) {
  const allowedTrue = new Set(trueKeys);
  return Object.freeze(
    Object.fromEntries(keys.map((key) => [key, allowedTrue.has(key)])),
  );
}

export function stableJsonFile(filePath, label) {
  const absolute = realpathSync(path.resolve(filePath));
  const before = lstatSync(absolute);
  assert(
    before.isFile() && !before.isSymbolicLink() && before.nlink === 1,
    'AVATAR_PROVIDER_RUNTIME_INPUT_FILE_INVALID',
    `${label} must be a single-link regular file.`,
  );
  assert(
    before.size >= 2 && before.size <= MAXIMUM_DOCUMENT_BYTES,
    'AVATAR_PROVIDER_RUNTIME_INPUT_SIZE_INVALID',
    `${label} is outside the document byte boundary.`,
  );
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(
      before[key] === after[key],
      'AVATAR_PROVIDER_RUNTIME_INPUT_CHANGED',
      `${label} changed while being read.`,
    );
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('AVATAR_PROVIDER_RUNTIME_UTF8_INVALID', `${label} is not valid UTF-8.`);
  }
  assert(
    text.charCodeAt(0) !== 0xfeff,
    'AVATAR_PROVIDER_RUNTIME_BOM_FORBIDDEN',
    `${label} contains a UTF-8 BOM.`,
  );
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    fail('AVATAR_PROVIDER_RUNTIME_JSON_INVALID', `${label} is not valid JSON.`);
  }
  return Object.freeze({
    absolute,
    bytes,
    sha256: sha256Bytes(bytes),
    value: deepFreeze(snapshotJsonValue(value, label)),
  });
}

export function writeJsonCreateOnly(outputPath, value) {
  const absolute = path.resolve(outputPath);
  const handle = openSync(absolute, 'wx', 0o600);
  try {
    writeFileSync(handle, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  } finally {
    closeSync(handle);
  }
  return absolute;
}

export function sameCanonical(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}
