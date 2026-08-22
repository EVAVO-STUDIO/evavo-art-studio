#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRANSACTION_RELATIVE = '.evavo/project-art-production/eva-female-v2';
const TRANSACTION_ROOT = path.join(REPOSITORY_ROOT, ...TRANSACTION_RELATIVE.split('/'));
const MAX_FILES = 5000;
const MAX_DEPTH = 16;
const MAX_HASH_BYTES = 512 * 1024 * 1024;
const INTERESTING_JSON = new Set([
  'sequence-release.json',
  'atlas-manifest.json',
  'cross-clip-transition-evidence.json',
  'sequence-pack.json',
]);

function sha256File(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new Error(`unsafe transaction file: ${file}`);
  }
  if (stat.size < 1 || stat.size > MAX_HASH_BYTES) {
    throw new Error(`transaction file exceeds bounded hash size: ${file}`);
  }
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    while (position < stat.size) {
      const length = Math.min(buffer.length, stat.size - position);
      const read = fs.readSync(fd, buffer, 0, length, position);
      if (read < 1) throw new Error(`short read: ${file}`);
      hash.update(buffer.subarray(0, read));
      position += read;
    }
  } finally {
    fs.closeSync(fd);
  }
  const after = fs.lstatSync(file);
  if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) {
    throw new Error(`transaction file changed during read: ${file}`);
  }
  return { sha256: hash.digest('hex'), bytes: stat.size };
}

function relative(file) {
  const value = path.relative(TRANSACTION_ROOT, file).split(path.sep).join('/');
  if (!value || value.startsWith('../') || path.posix.isAbsolute(value)) {
    throw new Error('transaction path escaped fixed root');
  }
  return value;
}

function walk(directory, depth, state) {
  if (depth > MAX_DEPTH) throw new Error('transaction directory depth exceeded');
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('transaction directory is unsafe');
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  for (const entry of entries) {
    if (state.scanned >= MAX_FILES) throw new Error('transaction file-count boundary exceeded');
    const absolute = path.join(directory, entry.name);
    const entryStat = fs.lstatSync(absolute);
    if (entryStat.isSymbolicLink()) throw new Error(`transaction contains symbolic link: ${relative(absolute)}`);
    if (entryStat.isDirectory()) {
      walk(absolute, depth + 1, state);
      continue;
    }
    if (!entryStat.isFile() || entryStat.nlink !== 1) throw new Error(`transaction contains unsafe entry: ${relative(absolute)}`);
    state.scanned += 1;
    const rel = relative(absolute);
    const lower = entry.name.toLowerCase();
    const isWebp = lower.endsWith('.webp');
    const isInterestingJson = INTERESTING_JSON.has(lower);
    if (!isWebp && !isInterestingJson) continue;
    const identity = sha256File(absolute);
    const record = { path: rel, ...identity };
    if (isWebp) state.webp.push(record);
    else state.json.push(record);
  }
}

const authority = Object.freeze({
  sourceMutation: false,
  providerExecution: false,
  creativeApproval: false,
  candidatePromotion: false,
  repositoryMutation: false,
  gitCommit: false,
  gitPush: false,
  runtimeActivation: false,
  websiteActivation: false,
  publication: false,
  forcePush: false,
});

if (!fs.existsSync(TRANSACTION_ROOT)) {
  console.log(JSON.stringify({
    schema: 'evavo_eva_production_transaction_probe_v1',
    characterId: 'eva-female',
    transaction: TRANSACTION_RELATIVE,
    found: false,
    scannedFileCount: 0,
    webpCount: 0,
    exactMasterCountCandidate: false,
    authority,
  }));
  process.exit(0);
}

const rootStat = fs.lstatSync(TRANSACTION_ROOT);
if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
  throw new Error('fixed EVA production transaction root is unsafe');
}

const state = { scanned: 0, webp: [], json: [] };
walk(TRANSACTION_ROOT, 0, state);
state.webp.sort((a, b) => a.path.localeCompare(b.path, 'en'));
state.json.sort((a, b) => a.path.localeCompare(b.path, 'en'));

console.log(JSON.stringify({
  schema: 'evavo_eva_production_transaction_probe_v1',
  characterId: 'eva-female',
  transaction: TRANSACTION_RELATIVE,
  found: true,
  scannedFileCount: state.scanned,
  webpCount: state.webp.length,
  exactMasterCountCandidate: state.webp.length === 180,
  webpFiles: state.webp,
  evidenceFiles: state.json,
  authority,
}));
