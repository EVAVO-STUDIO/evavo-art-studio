#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_STORAGE_REPOSITORY = path.resolve(REPOSITORY_ROOT, '..', 'evavo-storage');
const DEFAULT_TARGET_ROOT = path.join(
  REPOSITORY_ROOT,
  '.evavo',
  'project-art-production',
  'eva-female-v2-recovered',
);
const STORAGE_SCRIPT_RELATIVE = 'scripts/materialize-exact-storage-transaction.py';
const EXPECTED_WEBP_COUNT = 180;
const EXPECTED_EVIDENCE = Object.freeze([
  'atlas-manifest.json',
  'cross-clip-transition-evidence.json',
  'sequence-pack.json',
  'sequence-release.json',
]);
const EXPECTED_EVIDENCE_COUNT = EXPECTED_EVIDENCE.length;
const EXPECTED_ITEM_COUNT = EXPECTED_WEBP_COUNT + EXPECTED_EVIDENCE_COUNT;
const MAX_FILE_BYTES = 512 * 1024 * 1024;
const MAX_FILES = 5000;
const MAX_DEPTH = 16;

function value(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return undefined;
  return process.argv[index + 1];
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function safeId(input, label) {
  const text = String(input ?? '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(text)) {
    fail('EVA_RECOVERY_ARGUMENT_INVALID', `${label} is invalid.`);
  }
  return text;
}

function absoluteOrdinaryFile(input, label) {
  const resolved = path.resolve(input);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    fail('EVA_RECOVERY_INPUT_UNSAFE', `${label} must be one ordinary file.`);
  }
  return resolved;
}

function ensureRecoveryTarget(input) {
  const resolved = path.resolve(input);
  const governedRoot = path.join(REPOSITORY_ROOT, '.evavo', 'project-art-production');
  const relative = path.relative(governedRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    fail(
      'EVA_RECOVERY_TARGET_OUTSIDE_GOVERNED_ROOT',
      'EVA recovery target must be a child of .evavo/project-art-production.',
    );
  }
  fs.mkdirSync(governedRoot, { recursive: true });
  return resolved;
}

function sha256File(file) {
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) {
    fail('EVA_RECOVERY_OUTPUT_UNSAFE', `Recovered file is unsafe: ${file}`);
  }
  if (before.size < 1 || before.size > MAX_FILE_BYTES) {
    fail('EVA_RECOVERY_OUTPUT_BOUNDS', `Recovered file exceeds bounded hash size: ${file}`);
  }
  const digest = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    while (position < before.size) {
      const length = Math.min(buffer.length, before.size - position);
      const read = fs.readSync(fd, buffer, 0, length, position);
      if (read < 1) fail('EVA_RECOVERY_SHORT_READ', `Short read: ${file}`);
      digest.update(buffer.subarray(0, read));
      position += read;
    }
  } finally {
    fs.closeSync(fd);
  }
  const after = fs.lstatSync(file);
  if (
    after.size !== before.size
    || after.mtimeMs !== before.mtimeMs
    || after.ctimeMs !== before.ctimeMs
  ) {
    fail('EVA_RECOVERY_OUTPUT_CHANGED', `Recovered file changed during verification: ${file}`);
  }
  return { sha256: digest.digest('hex'), bytes: before.size };
}

function canonicalRelative(root, file) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  if (!relative || relative.startsWith('../') || path.posix.isAbsolute(relative)) {
    fail('EVA_RECOVERY_PATH_ESCAPE', 'Recovered path escaped the exact transaction root.');
  }
  return relative;
}

function walk(root, directory, depth, state) {
  if (depth > MAX_DEPTH) fail('EVA_RECOVERY_DEPTH_EXCEEDED', 'Recovered transaction directory depth exceeded.');
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail('EVA_RECOVERY_OUTPUT_UNSAFE', 'Recovered transaction contains an unsafe directory.');
  }
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
  for (const entry of entries) {
    if (state.fileCount >= MAX_FILES) fail('EVA_RECOVERY_FILE_COUNT_EXCEEDED', 'Recovered file-count boundary exceeded.');
    const absolute = path.join(directory, entry.name);
    const entryStat = fs.lstatSync(absolute);
    if (entryStat.isSymbolicLink()) {
      fail('EVA_RECOVERY_OUTPUT_UNSAFE', `Recovered transaction contains a symlink: ${canonicalRelative(root, absolute)}`);
    }
    if (entryStat.isDirectory()) {
      walk(root, absolute, depth + 1, state);
      continue;
    }
    if (!entryStat.isFile() || entryStat.nlink !== 1) {
      fail('EVA_RECOVERY_OUTPUT_UNSAFE', `Recovered transaction contains an unsafe entry: ${canonicalRelative(root, absolute)}`);
    }
    state.fileCount += 1;
    state.files.push({ path: canonicalRelative(root, absolute), ...sha256File(absolute) });
  }
}

function exactReceiptMap(receipt) {
  if (!Array.isArray(receipt.items) || receipt.items.length !== EXPECTED_ITEM_COUNT) {
    fail('EVA_RECOVERY_RECEIPT_COUNT_MISMATCH', 'Storage receipt does not contain the complete 184-item EVA transaction.');
  }
  const map = new Map();
  for (const item of receipt.items) {
    if (!item || typeof item.logicalPath !== 'string' || typeof item.sha256 !== 'string') {
      fail('EVA_RECOVERY_RECEIPT_INVALID', 'Storage receipt contains an invalid item identity.');
    }
    if (map.has(item.logicalPath)) fail('EVA_RECOVERY_RECEIPT_DUPLICATE', `Duplicate receipt path: ${item.logicalPath}`);
    map.set(item.logicalPath, item);
  }
  return map;
}

function verifyRecoveredTree(targetRoot, receipt) {
  const targetStat = fs.lstatSync(targetRoot);
  if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) {
    fail('EVA_RECOVERY_OUTPUT_UNSAFE', 'Recovered EVA transaction root is unsafe.');
  }
  const state = { fileCount: 0, files: [] };
  walk(targetRoot, targetRoot, 0, state);
  if (state.fileCount !== EXPECTED_ITEM_COUNT) {
    fail('EVA_RECOVERY_OUTPUT_COUNT_MISMATCH', `Recovered transaction contains ${state.fileCount} files; expected ${EXPECTED_ITEM_COUNT}.`);
  }
  const expected = exactReceiptMap(receipt);
  let webpCount = 0;
  const evidence = new Set();
  for (const file of state.files) {
    const item = expected.get(file.path);
    if (!item) fail('EVA_RECOVERY_OUTPUT_UNEXPECTED_FILE', `Unexpected recovered file: ${file.path}`);
    if (file.sha256 !== item.sha256 || file.bytes !== item.bytes) {
      fail('EVA_RECOVERY_OUTPUT_IDENTITY_MISMATCH', `Exact recovered identity mismatch: ${file.path}`);
    }
    if (file.path.toLowerCase().endsWith('.webp')) webpCount += 1;
    else evidence.add(path.posix.basename(file.path).toLowerCase());
  }
  if (webpCount !== EXPECTED_WEBP_COUNT) {
    fail('EVA_RECOVERY_WEBP_COUNT_MISMATCH', `Recovered WebP count is ${webpCount}; expected ${EXPECTED_WEBP_COUNT}.`);
  }
  const actualEvidence = [...evidence].sort();
  const expectedEvidence = [...EXPECTED_EVIDENCE].sort();
  if (JSON.stringify(actualEvidence) !== JSON.stringify(expectedEvidence)) {
    fail('EVA_RECOVERY_EVIDENCE_SET_MISMATCH', 'Recovered evidence file set does not match the reviewed EVA transaction contract.');
  }
  return {
    fileCount: state.fileCount,
    webpCount,
    evidenceCount: evidence.size,
    evidenceFiles: expectedEvidence,
  };
}

const manifest = value('--manifest');
const vaultId = value('--vault-id');
const storageRepository = path.resolve(value('--storage-repo') ?? process.env.EVAVO_STORAGE_REPOSITORY ?? DEFAULT_STORAGE_REPOSITORY);
const targetRoot = ensureRecoveryTarget(value('--target-root') ?? DEFAULT_TARGET_ROOT);
const python = value('--python') ?? process.env.EVAVO_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');

if (!manifest || !vaultId) {
  fail(
    'EVA_RECOVERY_USAGE',
    'usage: recover-eva-production-transaction.mjs --manifest <probe-or-storage-receipt.json> --vault-id <vault> [--target-root <dir>] [--storage-repo <evavo-storage>] [--python <python>]',
  );
}
const exactManifest = absoluteOrdinaryFile(manifest, 'manifest');
const exactVaultId = safeId(vaultId, 'vaultId');
const storageScript = absoluteOrdinaryFile(path.join(storageRepository, STORAGE_SCRIPT_RELATIVE), 'EVAVO Storage transaction materializer');

const execution = spawnSync(
  python,
  [
    storageScript,
    '--manifest', exactManifest,
    '--target-root', targetRoot,
    '--vault-id', exactVaultId,
    '--expected-item-count', String(EXPECTED_ITEM_COUNT),
    '--expected-webp-count', String(EXPECTED_WEBP_COUNT),
    '--expected-evidence-count', String(EXPECTED_EVIDENCE_COUNT),
  ],
  {
    cwd: storageRepository,
    encoding: 'utf8',
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

if (execution.error) {
  fail('EVA_RECOVERY_STORAGE_EXECUTION_FAILED', execution.error.message);
}
if (execution.status !== 0) {
  fail(
    'EVA_RECOVERY_STORAGE_EXECUTION_FAILED',
    String(execution.stderr || execution.stdout || 'EVAVO Storage recovery failed.').trim().slice(0, 2000),
  );
}

let receipt;
try {
  receipt = JSON.parse(String(execution.stdout || '').trim());
} catch (error) {
  fail('EVA_RECOVERY_STORAGE_RECEIPT_INVALID', `EVAVO Storage returned invalid recovery JSON: ${error.message}`);
}
if (
  receipt?.kind !== 'evavo-storage-exact-transaction-materialization'
  || receipt?.ok !== true
  || receipt?.itemCount !== EXPECTED_ITEM_COUNT
  || receipt?.webpCount !== EXPECTED_WEBP_COUNT
  || receipt?.evidenceCount !== EXPECTED_EVIDENCE_COUNT
  || receipt?.vaultId !== exactVaultId
) {
  fail('EVA_RECOVERY_STORAGE_RECEIPT_INVALID', 'EVAVO Storage recovery receipt does not satisfy the exact EVA transaction contract.');
}
for (const denied of ['storageWrite', 'catalogMutation', 'sourceMutation', 'regeneration', 'providerExecution', 'repositoryMutation', 'publication', 'deleteExisting', 'forcePush']) {
  if (receipt?.authority?.[denied] !== false) {
    fail('EVA_RECOVERY_AUTHORITY_ESCALATION', `Recovery receipt unexpectedly grants ${denied}.`);
  }
}

const verified = verifyRecoveredTree(targetRoot, receipt);
console.log(JSON.stringify({
  schema: 'evavo.eva-production-transaction-recovery-receipt.v1',
  status: 'passed',
  characterId: 'eva-female',
  sourceManifestSha256: receipt.sourceManifestSha256,
  storageReceiptSha256: receipt.receiptSha256,
  transactionInventorySha256: receipt.inventorySha256,
  itemCount: verified.fileCount,
  webpCount: verified.webpCount,
  evidenceCount: verified.evidenceCount,
  evidenceFiles: verified.evidenceFiles,
  exactByteIdentity: true,
  regeneration: false,
  sourceMutation: false,
  storageWrite: false,
  catalogMutation: false,
  providerExecution: false,
  repositoryMutation: false,
  runtimeActivation: false,
  websiteActivation: false,
  publication: false,
}));
