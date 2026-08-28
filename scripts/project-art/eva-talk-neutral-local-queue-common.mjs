import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';


export const EVA_TALK_NEUTRAL_LOCAL_CAMPAIGN_SCHEMA =
  'evavo.project-art-eva-talk-neutral-local-materialization-campaign.v1';
export const EVA_TALK_NEUTRAL_LOCAL_PACKET_SCHEMA =
  'evavo.project-art-eva-talk-neutral-local-materialization-packet.v1';
export const EVA_TALK_NEUTRAL_LOCAL_QUEUE_MANIFEST_SCHEMA =
  'evavo.project-art-eva-talk-neutral-local-materialization-queue-manifest.v1';
export const EVA_TALK_NEUTRAL_LOCAL_CLAIM_SCHEMA =
  'evavo.project-art-eva-talk-neutral-local-materialization-claim.v1';
export const EVA_TALK_NEUTRAL_LOCAL_HEARTBEAT_SCHEMA =
  'evavo.project-art-eva-talk-neutral-local-materialization-heartbeat.v1';
export const EVA_TALK_NEUTRAL_LOCAL_OUTPUT_MANIFEST_SCHEMA =
  'evavo.project-art-eva-talk-neutral-local-materialization-output-manifest.v1';
export const EVA_TALK_NEUTRAL_LOCAL_COMPLETION_SCHEMA =
  'evavo.project-art-eva-talk-neutral-local-materialization-completion.v1';
export const EVA_TALK_NEUTRAL_LOCAL_FAILURE_SCHEMA =
  'evavo.project-art-eva-talk-neutral-local-materialization-failure.v1';
export const EVA_TALK_NEUTRAL_LOCAL_REQUEUE_SCHEMA =
  'evavo.project-art-eva-talk-neutral-local-materialization-requeue.v1';
export const EVA_TALK_NEUTRAL_LOCAL_STATUS_SCHEMA =
  'evavo.project-art-eva-talk-neutral-local-materialization-status.v1';
export const EVA_TALK_NEUTRAL_LOCAL_PROTOCOL_VERSION = '2026-08-28.1';

export const EVA_TALK_NEUTRAL_LOCAL_BATCH_COUNT = 8;
export const EVA_TALK_NEUTRAL_LOCAL_IMAGES_PER_BATCH = 10;
export const EVA_TALK_NEUTRAL_LOCAL_CANDIDATE_COUNT =
  EVA_TALK_NEUTRAL_LOCAL_BATCH_COUNT * EVA_TALK_NEUTRAL_LOCAL_IMAGES_PER_BATCH;
export const EVA_TALK_NEUTRAL_TARGET_FRAME_COUNT = 36;
export const EVA_TALK_NEUTRAL_CANVAS = Object.freeze({ width: 1024, height: 1536 });

const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
export const SHA256 = /^[a-f0-9]{64}$/u;
export const FAILURE_CODE = /^[A-Z][A-Z0-9_]{2,79}$/u;
const CLAIM_ID = /^eva-talk-neutral-batch-0[1-8]--[a-f0-9]{16}$/u;
export const MAXIMUM_JSON_BYTES = 8 * 1024 * 1024;
export const MAXIMUM_PNG_BYTES = 64 * 1024 * 1024;
export const MINIMUM_LEASE_SECONDS = 60;
export const MAXIMUM_LEASE_SECONDS = 3600;
export const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export const QUEUE_DIRECTORIES = Object.freeze([
  'pending',
  'claimed',
  'completed',
  'failed',
  'receipts',
  'receipts/requeue',
]);
const CLOSED_AUTHORITY_KEYS = Object.freeze([
  'networkAccess',
  'providerExecution',
  'paidExecution',
  'candidateApproval',
  'candidatePromotion',
  'sourceMutation',
  'repositoryMutation',
  'gitCommit',
  'gitPush',
  'publication',
  'runtimeActivation',
  'websiteActivation',
  'deployment',
  'forcePush',
]);

export class EvaTalkNeutralLocalQueueError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'EvaTalkNeutralLocalQueueError';
    this.code = code;
  }
}

export function fail(code, message = code) {
  throw new EvaTalkNeutralLocalQueueError(code, message);
}

export function assert(condition, code, message = code) {
  if (!condition) fail(code, message);
}

export function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function snapshot(value, label) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    fail('EVA_TALK_NEUTRAL_QUEUE_SNAPSHOT_INVALID', `${label} is not JSON-safe.`);
  }
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

export function canonicalEvaTalkNeutralLocalQueueJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function sha256EvaTalkNeutralLocalQueueBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256EvaTalkNeutralLocalQueueDocument(value) {
  return sha256EvaTalkNeutralLocalQueueBytes(
    Buffer.from(`${canonicalEvaTalkNeutralLocalQueueJson(value)}\n`, 'utf8'),
  );
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

export function exactKeys(value, expected, code) {
  assert(isRecord(value), code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(
    actual.length === wanted.length &&
      actual.every((key, index) => key === wanted[index]),
    code,
  );
}

export function identifier(value, label) {
  assert(
    typeof value === 'string' && IDENTIFIER.test(value),
    'EVA_TALK_NEUTRAL_QUEUE_IDENTIFIER_INVALID',
    `${label} is invalid.`,
  );
  return value;
}

export function timestamp(value, label) {
  assert(
    typeof value === 'string' && Number.isFinite(Date.parse(value)),
    'EVA_TALK_NEUTRAL_QUEUE_TIMESTAMP_INVALID',
    `${label} is invalid.`,
  );
  const normalized = new Date(value).toISOString();
  assert(
    value === normalized || value === normalized.replace('.000Z', 'Z'),
    'EVA_TALK_NEUTRAL_QUEUE_TIMESTAMP_INVALID',
    `${label} must be canonical UTC.`,
  );
  return normalized;
}

export function safeInteger(value, label, minimum, maximum) {
  assert(
    Number.isSafeInteger(value) && value >= minimum && value <= maximum,
    'EVA_TALK_NEUTRAL_QUEUE_INTEGER_INVALID',
    `${label} is invalid.`,
  );
  return value;
}

export function closedAuthority() {
  return Object.freeze(
    Object.fromEntries(CLOSED_AUTHORITY_KEYS.map((key) => [key, false])),
  );
}

export function assertClosedAuthority(value) {
  exactKeys(value, CLOSED_AUTHORITY_KEYS, 'EVA_TALK_NEUTRAL_QUEUE_AUTHORITY_INVALID');
  assert(
    CLOSED_AUTHORITY_KEYS.every((key) => value[key] === false),
    'EVA_TALK_NEUTRAL_QUEUE_AUTHORITY_INVALID',
  );
}

export function canonicalRelativePath(value, label) {
  assert(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 512 &&
      !value.includes('\0') &&
      !value.includes('\\') &&
      !path.posix.isAbsolute(value),
    'EVA_TALK_NEUTRAL_QUEUE_RELATIVE_PATH_INVALID',
    `${label} is invalid.`,
  );
  const normalized = path.posix.normalize(value);
  assert(
    normalized === value &&
      value !== '.' &&
      value !== '..' &&
      !value.startsWith('../') &&
      value.split('/').every((part) => part && part !== '.' && part !== '..'),
    'EVA_TALK_NEUTRAL_QUEUE_RELATIVE_PATH_INVALID',
    `${label} is not canonical.`,
  );
  return value;
}

export function normalizedAbsolutePath(value, label) {
  assert(
    typeof value === 'string' &&
      path.isAbsolute(value) &&
      !value.includes('\0') &&
      path.normalize(value) === value,
    'EVA_TALK_NEUTRAL_QUEUE_ROOT_INVALID',
    `${label} must be a normalized absolute path.`,
  );
  return value;
}

export function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function ensureRealDirectory(directory, label) {
  const absolute = normalizedAbsolutePath(path.resolve(directory), label);
  const metadata = lstatSync(absolute);
  assert(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      realpathSync(absolute) === absolute,
    'EVA_TALK_NEUTRAL_QUEUE_DIRECTORY_INVALID',
    `${label} must be a real directory.`,
  );
  return absolute;
}

export function createQueueRoot(queueRoot) {
  const absolute = normalizedAbsolutePath(path.resolve(queueRoot), 'queueRoot');
  if (!existsSync(absolute)) {
    const parent = ensureRealDirectory(path.dirname(absolute), 'queueRoot parent');
    assert(inside(parent, absolute), 'EVA_TALK_NEUTRAL_QUEUE_ROOT_INVALID');
    mkdirSync(absolute, { mode: 0o700 });
  }
  return ensureRealDirectory(absolute, 'queueRoot');
}

export function openQueueRoot(queueRoot) {
  return ensureRealDirectory(path.resolve(queueRoot), 'queueRoot');
}

export function resolveInside(root, relative, label) {
  const canonical = canonicalRelativePath(relative, label);
  const absolute = path.join(root, ...canonical.split('/'));
  assert(inside(root, absolute), 'EVA_TALK_NEUTRAL_QUEUE_PATH_ESCAPE');
  return absolute;
}

export function ensureDirectoryChain(root, relative) {
  let current = root;
  for (const part of relative.split('/').filter(Boolean)) {
    current = path.join(current, part);
    if (!existsSync(current)) mkdirSync(current, { mode: 0o700 });
    const metadata = lstatSync(current);
    assert(
      metadata.isDirectory() &&
        !metadata.isSymbolicLink() &&
        inside(root, realpathSync(current)),
      'EVA_TALK_NEUTRAL_QUEUE_DIRECTORY_INVALID',
    );
  }
  return current;
}

export function stableFile(filePath, label, maximumBytes = MAXIMUM_JSON_BYTES, minimumBytes = 1) {
  const requested = path.resolve(filePath);
  const before = lstatSync(requested);
  const absolute = realpathSync(requested);
  assert(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1 &&
      absolute === requested &&
      before.size >= minimumBytes &&
      before.size <= maximumBytes,
    'EVA_TALK_NEUTRAL_QUEUE_FILE_INVALID',
    label,
  );
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(before[key] === after[key], 'EVA_TALK_NEUTRAL_QUEUE_FILE_CHANGED', label);
  }
  return Object.freeze({ absolute, bytes, sha256: sha256EvaTalkNeutralLocalQueueBytes(bytes) });
}

export function stableJson(filePath, label) {
  const file = stableFile(filePath, label);
  let value;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
    assert(text.charCodeAt(0) !== 0xfeff, 'EVA_TALK_NEUTRAL_QUEUE_BOM_FORBIDDEN');
    value = JSON.parse(text);
  } catch (error) {
    if (error instanceof EvaTalkNeutralLocalQueueError) throw error;
    fail('EVA_TALK_NEUTRAL_QUEUE_JSON_INVALID', `${label} is invalid JSON.`);
  }
  return Object.freeze({ ...file, value });
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeCreateOnly(filePath, bytes) {
  const handle = openSync(filePath, 'wx', 0o600);
  try {
    writeFileSync(handle, bytes);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

export function writeJsonCreateOnly(filePath, value) {
  writeCreateOnly(filePath, jsonBytes(value));
}

export function removeFileIfPresent(filePath) {
  try {
    unlinkSync(filePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

export function directoryEntries(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .map((entry) => entry.name)
    .sort();
}

export function assertRealChildDirectory(root, directory, label) {
  const metadata = lstatSync(directory);
  assert(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      inside(root, realpathSync(directory)),
    'EVA_TALK_NEUTRAL_QUEUE_DIRECTORY_INVALID',
    label,
  );
  return directory;
}



export function claimIdentifier(value) {
  assert(
    typeof value === 'string' && CLAIM_ID.test(value),
    'EVA_TALK_NEUTRAL_QUEUE_CLAIM_ID_INVALID',
  );
  return value;
}
