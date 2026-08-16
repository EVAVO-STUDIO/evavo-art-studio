import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';

export const WORKSPACE_MANIFEST_SCHEMA = 'evavo.persistent-artist-workspace-manifest.v1';
export const WORKSPACE_INGEST_REQUEST_SCHEMA = 'evavo.persistent-artist-workspace-ingest-request.v1';
export const WORKSPACE_INGEST_PLAN_SCHEMA = 'evavo.persistent-artist-workspace-ingest-plan.v1';
export const WORKSPACE_INGEST_PROVENANCE_SCHEMA = 'evavo.persistent-artist-workspace-ingest-provenance.v1';
export const WORKSPACE_INGEST_RECEIPT_SCHEMA = 'evavo.persistent-artist-workspace-ingest-receipt.v1';
export const WORKSPACE_INGEST_COMMIT_SCHEMA = 'evavo.persistent-artist-workspace-ingest-commit.v1';

const MAXIMUM_REQUEST_BYTES = 16 * 1024 * 1024;
const MAXIMUM_SOURCE_BYTES = 2 * 1024 * 1024 * 1024;
const MAXIMUM_AGGREGATE_BYTES = 16 * 1024 * 1024 * 1024;
const MAXIMUM_ITEMS = 1_000;
const MAXIMUM_SOURCE_ROOTS = 64;
const MAXIMUM_TAGS = 256;
const MAXIMUM_PATH_CHARACTERS = 4_096;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const PORTABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const PORTABLE_DIRECTORY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/u;

class PersistentWorkspaceIngestError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PersistentWorkspaceIngestError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PersistentWorkspaceIngestError(code, message);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_DOCUMENT_INVALID', 'Canonical JSON cannot contain non-finite numbers.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_DOCUMENT_INVALID', `Unsupported canonical JSON value: ${typeof value}.`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function withDocumentHash(input, field = 'documentSha256') {
  const document = { ...input };
  delete document[field];
  return Object.freeze({ ...document, [field]: sha256(canonicalJson(document)) });
}

function verifyDocumentHash(document, field = 'documentSha256') {
  if (!isRecord(document) || typeof document[field] !== 'string' || !HASH_PATTERN.test(document[field])) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_DOCUMENT_HASH_INVALID', `${field} must be a lowercase SHA-256 digest.`);
  }
  const unhashed = { ...document };
  const expected = unhashed[field];
  delete unhashed[field];
  const observed = sha256(canonicalJson(unhashed));
  if (observed !== expected) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_DOCUMENT_HASH_MISMATCH', `${field} does not match canonical document bytes.`);
  }
  return expected;
}

function boundedString(value, label, maximum = 16_384, { allowEmpty = false } = {}) {
  if (
    typeof value !== 'string' ||
    value.includes('\0') ||
    value.length > maximum ||
    (!allowEmpty && value.trim().length === 0)
  ) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_STRING_INVALID', `${label} must be a bounded string containing no NUL.`);
  }
  return value;
}

function portableId(value, label) {
  if (typeof value !== 'string' || !PORTABLE_ID_PATTERN.test(value)) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_ID_INVALID', `${label} must be a portable identifier.`);
  }
  return value;
}

function portableDirectoryName(value, label) {
  const normalized = portableId(value, label).replaceAll(':', '-');
  if (!PORTABLE_DIRECTORY_PATTERN.test(normalized)) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_ID_INVALID', `${label} is not portable as a directory name.`);
  }
  return normalized;
}

function canonicalRelativePath(value, label) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > MAXIMUM_PATH_CHARACTERS ||
    value.includes('\0') ||
    value.includes('\\')
  ) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_PATH_INVALID', `${label} must be a bounded forward-slash relative path.`);
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized !== value ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/u.test(normalized)
  ) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_PATH_INVALID', `${label} must be a canonical relative path.`);
  }
  return normalized;
}

function timestamp(value, label) {
  const bounded = boundedString(value, label, 64);
  const parsed = new Date(bounded);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== bounded) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_TIMESTAMP_INVALID', `${label} must be an exact ISO-8601 UTC timestamp.`);
  }
  return bounded;
}

function normalizedTags(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAXIMUM_TAGS) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_TAGS_INVALID', `${label} must contain at most ${MAXIMUM_TAGS} strings.`);
  }
  return [...new Set(value.map((entry, index) => boundedString(entry, `${label}[${index}]`, 160)))].sort();
}

function fileSnapshot(metadata) {
  return {
    device: metadata.dev,
    inode: metadata.ino,
    mode: metadata.mode,
    links: metadata.nlink,
    size: metadata.size,
    modifiedMs: metadata.mtimeMs,
    changedMs: metadata.ctimeMs,
  };
}

function sameSnapshot(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key]);
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function requireDirectory(directoryPath, label) {
  const lexical = path.resolve(boundedString(directoryPath, label, 32_768));
  const metadata = await lstat(lexical).catch((error) => {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_ROOT_INVALID', `${label} could not be inspected: ${error.message}`);
  });
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_ROOT_INVALID', `${label} must be an existing non-symbolic directory.`);
  }
  return realpath(lexical);
}

async function readStableJsonFile(filePath, label) {
  const absolute = path.resolve(boundedString(filePath, label, 32_768));
  const pathBefore = await lstat(absolute).catch((error) => {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_INPUT_INVALID', `${label} could not be inspected: ${error.message}`);
  });
  if (!pathBefore.isFile() || pathBefore.isSymbolicLink() || pathBefore.nlink !== 1) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_INPUT_INVALID', `${label} must be a singly linked regular non-symbolic file.`);
  }
  if (pathBefore.size < 2 || pathBefore.size > MAXIMUM_REQUEST_BYTES) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_INPUT_INVALID', `${label} must be 2-${MAXIMUM_REQUEST_BYTES} bytes.`);
  }
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const handle = await open(absolute, flags).catch((error) => {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_INPUT_INVALID', `${label} could not be opened safely: ${error.message}`);
  });
  try {
    const handleBefore = await handle.stat();
    if (handleBefore.nlink !== 1 || !sameSnapshot(fileSnapshot(pathBefore), fileSnapshot(handleBefore))) {
      fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_INPUT_CHANGED', `${label} changed before it could be read.`);
    }
    const bytes = await handle.readFile();
    const [handleAfter, pathAfter] = await Promise.all([handle.stat(), lstat(absolute)]);
    if (
      pathAfter.isSymbolicLink() ||
      pathAfter.nlink !== 1 ||
      bytes.length !== pathBefore.size ||
      !sameSnapshot(fileSnapshot(pathBefore), fileSnapshot(handleAfter)) ||
      !sameSnapshot(fileSnapshot(pathBefore), fileSnapshot(pathAfter))
    ) {
      fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_INPUT_CHANGED', `${label} changed while it was being read.`);
    }
    let value;
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/u, '');
      value = JSON.parse(text);
    } catch (error) {
      fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_INPUT_INVALID', `${label} is not valid UTF-8 JSON: ${error.message}`);
    }
    return { value, bytes, absolutePath: absolute };
  } finally {
    await handle.close();
  }
}

function exactRequestDocument(request, requestBytes) {
  if (!Buffer.isBuffer(requestBytes) || requestBytes.length < 2 || requestBytes.length > MAXIMUM_REQUEST_BYTES) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_REQUEST_BYTES_INVALID', 'Request bytes are outside the bounded JSON boundary.');
  }
  let decoded;
  try {
    decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(requestBytes).replace(/^\uFEFF/u, ''));
  } catch (error) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_REQUEST_INVALID', `Request bytes are not valid UTF-8 JSON: ${error.message}`);
  }
  if (!isRecord(request) || request.schema !== WORKSPACE_INGEST_REQUEST_SCHEMA) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_REQUEST_INVALID', `Request must use ${WORKSPACE_INGEST_REQUEST_SCHEMA}.`);
  }
  if (canonicalJson(decoded) !== canonicalJson(request)) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_REQUEST_BYTES_MISMATCH', 'Request bytes must encode the exact supplied request object.');
  }
  return sha256(requestBytes);
}

function authority(value, trueKeys = []) {
  const keys = [
    'externalSourceRead',
    'workspaceIngest',
    'workspaceWrite',
    'storageWrite',
    'sourceMutation',
    'sourceDeletion',
    'providerExecution',
    'candidateApproval',
    'candidatePromotion',
    'targetRepositoryMutation',
    'gitPublication',
    'publication',
    'deployment',
    'runtimeActivation',
    'forcePush',
  ];
  if (value !== undefined && !isRecord(value)) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_AUTHORITY_INVALID', 'authority must be an object.');
  }
  for (const key of Object.keys(value ?? {})) {
    if (!keys.includes(key) || value[key] !== false) {
      fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_AUTHORITY_INVALID', `Request authority.${key} must be a supported false value.`);
    }
  }
  const allowed = new Set(trueKeys);
  return Object.fromEntries(keys.map((key) => [key, allowed.has(key)]));
}

function assertPlanAuthority(plan) {
  const expected = authority(undefined, ['externalSourceRead', 'workspaceIngest', 'workspaceWrite']);
  if (!isRecord(plan.authority) || canonicalJson(plan.authority) !== canonicalJson(expected)) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_AUTHORITY_INVALID', 'Plan authority changed after compilation.');
  }
}

function assertExecutionBoundary(plan) {
  const expected = {
    sourceReadOnly: true,
    immutableSourceCopies: true,
    editableWorkingCopies: true,
    createOnlyTargets: true,
    stagedBeforePublication: true,
    rollbackOnFailure: true,
    commitMarkerWrittenLast: true,
    sourceHashesRevalidated: true,
    bytesFlowThroughMcp: false,
  };
  if (!isRecord(plan.execution) || canonicalJson(plan.execution) !== canonicalJson(expected)) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_PLAN_INVALID', 'Plan execution boundary changed after compilation.');
  }
}

async function resolveExistingFile(root, relative, label) {
  const canonical = canonicalRelativePath(relative, label);
  const parts = canonical.split('/');
  let current = root;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const metadata = await lstat(current).catch((error) => {
      fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_SOURCE_INVALID', `${label} could not be inspected: ${error.message}`);
    });
    if (metadata.isSymbolicLink()) {
      fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_SOURCE_INVALID', `${label} contains a symbolic-link component.`);
    }
    if (index < parts.length - 1 && !metadata.isDirectory()) {
      fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_SOURCE_INVALID', `${label} contains a non-directory path component.`);
    }
  }
  const metadata = await lstat(current);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_SOURCE_INVALID', `${label} must be a singly linked regular non-symbolic file.`);
  }
  const resolved = await realpath(current);
  if (!inside(root, resolved)) fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_SOURCE_INVALID', `${label} escaped its approved source root.`);
  return { absolutePath: resolved, relativePath: canonical, metadata };
}

async function stableFileIdentity(filePath, label) {
  const pathBefore = await lstat(filePath);
  if (!pathBefore.isFile() || pathBefore.isSymbolicLink() || pathBefore.nlink !== 1) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_SOURCE_INVALID', `${label} must remain a singly linked regular non-symbolic file.`);
  }
  if (pathBefore.size < 1 || pathBefore.size > MAXIMUM_SOURCE_BYTES) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_SOURCE_TOO_LARGE', `${label} must be 1-${MAXIMUM_SOURCE_BYTES} bytes.`);
  }
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const handle = await open(filePath, flags).catch((error) => {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_SOURCE_INVALID', `${label} could not be opened safely: ${error.message}`);
  });
  try {
    const handleBefore = await handle.stat();
    if (handleBefore.nlink !== 1 || !sameSnapshot(fileSnapshot(pathBefore), fileSnapshot(handleBefore))) {
      fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_SOURCE_CHANGED', `${label} changed before hashing.`);
    }
    const digest = createHash('sha256');
    let bytes = 0;
    const stream = handle.createReadStream({ autoClose: false });
    for await (const chunk of stream) {
      bytes += chunk.length;
      if (bytes > MAXIMUM_SOURCE_BYTES) {
        fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_SOURCE_TOO_LARGE', `${label} exceeded the source byte limit while hashing.`);
      }
      digest.update(chunk);
    }
    const [handleAfter, pathAfter] = await Promise.all([handle.stat(), lstat(filePath)]);
    if (
      pathAfter.isSymbolicLink() ||
      pathAfter.nlink !== 1 ||
      bytes !== pathBefore.size ||
      !sameSnapshot(fileSnapshot(pathBefore), fileSnapshot(handleAfter)) ||
      !sameSnapshot(fileSnapshot(pathBefore), fileSnapshot(pathAfter))
    ) {
      fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_SOURCE_CHANGED', `${label} changed while hashing.`);
    }
    return {
      sha256: digest.digest('hex'),
      bytes,
      snapshot: fileSnapshot(pathBefore),
    };
  } finally {
    await handle.close();
  }
}

async function copyStableSource(sourcePath, targetPath, expected, label) {
  const before = await stableFileIdentity(sourcePath, label);
  if (before.sha256 !== expected.sha256 || before.bytes !== expected.bytes) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_SOURCE_CHANGED', `${label} no longer matches the compiled identity.`);
  }
  await mkdir(path.dirname(targetPath), { recursive: true });
  const sourceHandle = await open(sourcePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  const targetHandle = await open(targetPath, 'wx');
  try {
    const sourceBefore = await sourceHandle.stat();
    if (sourceBefore.nlink !== 1 || !sameSnapshot(expected.snapshot, fileSnapshot(sourceBefore))) {
      fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_SOURCE_CHANGED', `${label} changed before copy.`);
    }
    const digest = createHash('sha256');
    let bytes = 0;
    const stream = sourceHandle.createReadStream({ autoClose: false });
    for await (const chunk of stream) {
      bytes += chunk.length;
      if (bytes > MAXIMUM_SOURCE_BYTES) fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_SOURCE_TOO_LARGE', `${label} exceeded the source byte limit while copying.`);
      digest.update(chunk);
      await targetHandle.writeFile(chunk);
    }
    await targetHandle.sync();
    const [sourceAfter, pathAfter] = await Promise.all([sourceHandle.stat(), lstat(sourcePath)]);
    if (
      pathAfter.isSymbolicLink() ||
      pathAfter.nlink !== 1 ||
      !sameSnapshot(expected.snapshot, fileSnapshot(sourceAfter)) ||
      !sameSnapshot(expected.snapshot, fileSnapshot(pathAfter))
    ) {
      fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_SOURCE_CHANGED', `${label} changed during copy.`);
    }
    const copiedSha256 = digest.digest('hex');
    if (bytes !== expected.bytes || copiedSha256 !== expected.sha256) {
      fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_COPY_MISMATCH', `${label} copy does not match the compiled identity.`);
    }
    return { sha256: copiedSha256, bytes };
  } catch (error) {
    await unlink(targetPath).catch(() => undefined);
    throw error;
  } finally {
    await Promise.allSettled([sourceHandle.close(), targetHandle.close()]);
  }
}

function mediaTypeFromPath(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.png': return 'image/png';
    case '.apng': return 'image/apng';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.bmp': return 'image/bmp';
    case '.tga': return 'image/x-tga';
    case '.svg': return 'image/svg+xml';
    case '.psd': return 'image/vnd.adobe.photoshop';
    case '.ora': return 'image/openraster';
    case '.kra': return 'application/x-krita';
    case '.ase':
    case '.aseprite': return 'application/x-aseprite';
    case '.mp4':
    case '.m4v': return 'video/mp4';
    case '.mov': return 'video/quicktime';
    case '.webm': return 'video/webm';
    case '.mkv': return 'video/x-matroska';
    case '.avi': return 'video/x-msvideo';
    default: return 'application/octet-stream';
  }
}

async function inspectImage(filePath, bytes) {
  const handle = await open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const sample = Buffer.alloc(Math.min(bytes, 256 * 1024));
    const { bytesRead } = await handle.read(sample, 0, sample.length, 0);
    const buffer = sample.subarray(0, bytesRead);
    if (buffer.length >= 26 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      const colourType = buffer[25];
      return {
        format: 'png',
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
        hasAlpha: colourType === 4 || colourType === 6 || buffer.toString('latin1').includes('tRNS'),
      };
    }
    if (buffer.length >= 10 && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))) {
      return {
        format: 'gif',
        width: buffer.readUInt16LE(6),
        height: buffer.readUInt16LE(8),
        hasAlpha: buffer.toString('latin1').includes('\x21\xF9\x04'),
      };
    }
    if (buffer.length >= 26 && buffer.toString('ascii', 0, 2) === 'BM') {
      return {
        format: 'bmp',
        width: Math.abs(buffer.readInt32LE(18)),
        height: Math.abs(buffer.readInt32LE(22)),
        hasAlpha: buffer.readUInt16LE(28) === 32,
      };
    }
    if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) { offset += 1; continue; }
        const marker = buffer[offset + 1];
        offset += 2;
        if (marker === 0xd8 || marker === 0xd9) continue;
        if (offset + 2 > buffer.length) break;
        const length = buffer.readUInt16BE(offset);
        if (length < 2 || offset + length > buffer.length) break;
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && length >= 8) {
          return {
            format: 'jpeg',
            width: buffer.readUInt16BE(offset + 5),
            height: buffer.readUInt16BE(offset + 3),
            hasAlpha: false,
          };
        }
        offset += length;
      }
    }
    if (buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
      const type = buffer.toString('ascii', 12, 16);
      if (type === 'VP8X' && buffer.length >= 30) {
        return {
          format: 'webp',
          width: 1 + buffer.readUIntLE(24, 3),
          height: 1 + buffer.readUIntLE(27, 3),
          hasAlpha: (buffer[20] & 0x10) !== 0,
        };
      }
    }
    return null;
  } finally {
    await handle.close();
  }
}

async function loadWorkspaceManifest(workspaceRoot) {
  const root = await requireDirectory(workspaceRoot, 'workspaceRoot');
  const manifestPath = path.join(root, 'manifests', 'workspace.json');
  const { value: manifest } = await readStableJsonFile(manifestPath, 'workspace manifest');
  if (!isRecord(manifest) || manifest.schema !== WORKSPACE_MANIFEST_SCHEMA) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_MANIFEST_INVALID', `Workspace manifest must use ${WORKSPACE_MANIFEST_SCHEMA}.`);
  }
  verifyDocumentHash(manifest);
  if (path.resolve(manifest.workspaceRoot) !== root) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_MANIFEST_INVALID', 'Workspace manifest root does not match the opened workspace.');
  }
  for (const relative of ['sources', 'working', 'manifests', 'journals']) {
    const candidate = path.join(root, relative);
    const metadata = await lstat(candidate).catch((error) => {
      fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_MANIFEST_INVALID', `Workspace directory ${relative} is unavailable: ${error.message}`);
    });
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_MANIFEST_INVALID', `Workspace directory ${relative} must be a non-symbolic directory.`);
    }
  }
  return { root, manifest, manifestPath };
}

async function targetDoesNotExist(root, relative, label) {
  const canonical = canonicalRelativePath(relative, label);
  const absolute = path.join(root, ...canonical.split('/'));
  if (!inside(root, absolute)) fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_PATH_INVALID', `${label} escaped the workspace.`);
  try {
    await lstat(absolute);
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_TARGET_EXISTS', `${label} already exists: ${canonical}.`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return { relativePath: canonical, absolutePath: absolute };
}

async function safeDirectoryChain(root, relativeDirectory, createdDirectories, label) {
  const canonical = canonicalRelativePath(relativeDirectory, label);
  let current = root;
  for (const part of canonical.split('/')) {
    const next = path.join(current, part);
    let metadata;
    try {
      metadata = await lstat(next);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      try {
        await mkdir(next, { recursive: false, mode: 0o700 });
        createdDirectories.push(next);
      } catch (createError) {
        if (createError?.code !== 'EEXIST') throw createError;
      }
      metadata = await lstat(next);
    }
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_PATH_INVALID', `${label} contains a symbolic or non-directory component.`);
    }
    const resolved = await realpath(next);
    if (!inside(root, resolved)) fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_PATH_INVALID', `${label} escaped the workspace.`);
    current = resolved;
  }
  return current;
}

async function writeJsonCreateOnly(filePath, document) {
  const handle = await open(filePath, 'wx');
  try {
    await handle.writeFile(`${JSON.stringify(document, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function publishCreateOnly(stagedPath, finalPath) {
  await copyFile(stagedPath, finalPath, fsConstants.COPYFILE_EXCL);
  const [stagedIdentity, finalIdentity] = await Promise.all([
    stableFileIdentity(stagedPath, 'staged publication file'),
    stableFileIdentity(finalPath, 'published workspace file'),
  ]);
  if (stagedIdentity.sha256 !== finalIdentity.sha256 || stagedIdentity.bytes !== finalIdentity.bytes) {
    await unlink(finalPath).catch(() => undefined);
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_COPY_MISMATCH', 'Published workspace file does not match staged bytes.');
  }
  return finalIdentity;
}

export async function compileWorkspaceIngest({ workspaceRoot, request, requestBytes, outputPath, compiledAt = new Date().toISOString() }) {
  const { root, manifest } = await loadWorkspaceManifest(workspaceRoot);
  const requestSha256 = exactRequestDocument(request, requestBytes);
  timestamp(compiledAt, 'compiledAt');
  if (portableId(request.workspaceId, 'workspaceId') !== manifest.workspaceId) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_WORKSPACE_MISMATCH', 'Request workspaceId does not match the workspace manifest.');
  }
  const ingestId = portableDirectoryName(request.ingestId, 'ingestId');
  const createdBy = boundedString(request.createdBy ?? 'evavo-agent', 'createdBy', 256);
  const note = boundedString(request.note ?? 'External art ingest into the persistent Artist Workspace.', 'note', 8_192);
  if (!Array.isArray(request.sourceRoots) || request.sourceRoots.length < 1 || request.sourceRoots.length > MAXIMUM_SOURCE_ROOTS) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_REQUEST_INVALID', `sourceRoots must contain 1-${MAXIMUM_SOURCE_ROOTS} entries.`);
  }
  const sourceRoots = [];
  const sourceRootById = new Map();
  for (const [index, raw] of request.sourceRoots.entries()) {
    if (!isRecord(raw)) fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_REQUEST_INVALID', `sourceRoots[${index}] must be an object.`);
    const id = portableDirectoryName(raw.id, `sourceRoots[${index}].id`);
    if (sourceRootById.has(id)) fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_REQUEST_INVALID', `Duplicate source root id: ${id}.`);
    const sourceRootPath = await requireDirectory(raw.path, `sourceRoots[${index}].path`);
    if (inside(root, sourceRootPath) || inside(sourceRootPath, root)) {
      fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_ROOT_INVALID', `sourceRoots[${index}] must be disjoint from the persistent workspace.`);
    }
    const entry = Object.freeze({ id, path: sourceRootPath });
    sourceRoots.push(entry);
    sourceRootById.set(id, entry);
  }
  sourceRoots.sort((left, right) => left.id.localeCompare(right.id));

  if (!Array.isArray(request.items) || request.items.length < 1 || request.items.length > MAXIMUM_ITEMS) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_REQUEST_INVALID', `items must contain 1-${MAXIMUM_ITEMS} entries.`);
  }
  const assetIds = new Set();
  const targetPaths = new Set();
  const items = [];
  let aggregateSourceBytes = 0;
  for (const [index, raw] of request.items.entries()) {
    if (!isRecord(raw)) fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_REQUEST_INVALID', `items[${index}] must be an object.`);
    const assetId = portableDirectoryName(raw.assetId, `items[${index}].assetId`);
    if (assetIds.has(assetId)) fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_REQUEST_INVALID', `Duplicate assetId: ${assetId}.`);
    assetIds.add(assetId);
    const sourceRootId = portableDirectoryName(raw.sourceRootId, `items[${index}].sourceRootId`);
    const sourceRoot = sourceRootById.get(sourceRootId);
    if (!sourceRoot) fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_REQUEST_INVALID', `Unknown sourceRootId: ${sourceRootId}.`);
    const source = await resolveExistingFile(sourceRoot.path, raw.sourcePath, `items[${index}].sourcePath`);
    const identity = await stableFileIdentity(source.absolutePath, `items[${index}] source`);
    if (raw.expectedSha256 !== undefined && raw.expectedSha256 !== identity.sha256) {
      fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_SOURCE_HASH_MISMATCH', `items[${index}] does not match expectedSha256.`);
    }
    if (raw.expectedBytes !== undefined && raw.expectedBytes !== identity.bytes) {
      fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_SOURCE_HASH_MISMATCH', `items[${index}] does not match expectedBytes.`);
    }
    aggregateSourceBytes += identity.bytes;
    if (aggregateSourceBytes > MAXIMUM_AGGREGATE_BYTES) {
      fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_SOURCE_TOO_LARGE', `Aggregate source bytes exceed ${MAXIMUM_AGGREGATE_BYTES}.`);
    }
    const destinationPath = canonicalRelativePath(raw.destinationPath, `items[${index}].destinationPath`);
    const sourceDestination = `sources/${destinationPath}`;
    const workingDestination = `working/${destinationPath}`;
    for (const candidate of [sourceDestination, workingDestination]) {
      const folded = candidate.toLocaleLowerCase('en-US');
      if (targetPaths.has(folded)) fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_REQUEST_INVALID', `Duplicate or case-colliding target path: ${candidate}.`);
      targetPaths.add(folded);
      await targetDoesNotExist(root, candidate, `items[${index}] target`);
    }
    const provenancePath = `manifests/ingests/${ingestId}/items/${assetId}.json`;
    const provenanceFolded = provenancePath.toLocaleLowerCase('en-US');
    if (targetPaths.has(provenanceFolded)) fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_REQUEST_INVALID', `Duplicate provenance target: ${provenancePath}.`);
    targetPaths.add(provenanceFolded);
    await targetDoesNotExist(root, provenancePath, `items[${index}] provenance`);
    const image = await inspectImage(source.absolutePath, identity.bytes);
    items.push(Object.freeze({
      assetId,
      title: boundedString(raw.title ?? assetId, `items[${index}].title`, 512),
      role: boundedString(raw.role ?? 'external-art-source', `items[${index}].role`, 160),
      origin: boundedString(raw.origin ?? 'external-file', `items[${index}].origin`, 160),
      tags: normalizedTags(raw.tags, `items[${index}].tags`),
      sourceRootId,
      sourceRoot: sourceRoot.path,
      sourcePath: source.relativePath,
      sourceAbsolutePath: source.absolutePath,
      sourceSha256: identity.sha256,
      sourceBytes: identity.bytes,
      sourceSnapshot: identity.snapshot,
      mediaType: mediaTypeFromPath(source.relativePath),
      ...(image ? { image } : {}),
      destinationPath,
      immutableSourcePath: sourceDestination,
      workingCopyPath: workingDestination,
      provenancePath,
    }));
  }
  items.sort((left, right) => left.assetId.localeCompare(right.assetId));
  const receiptPath = `manifests/ingests/${ingestId}/receipt.json`;
  const commitPath = `manifests/ingests/${ingestId}/commit.json`;
  await targetDoesNotExist(root, receiptPath, 'ingest receipt');
  await targetDoesNotExist(root, commitPath, 'ingest commit marker');
  const plan = withDocumentHash({
    schema: WORKSPACE_INGEST_PLAN_SCHEMA,
    workspaceId: manifest.workspaceId,
    projectId: manifest.projectId,
    workspaceRoot: root,
    workspaceManifestSha256: manifest.documentSha256,
    ingestId,
    createdBy,
    note,
    compiledAt,
    requestSha256,
    tags: normalizedTags(request.tags, 'tags'),
    sourceRoots,
    items,
    itemCount: items.length,
    aggregateSourceBytes,
    receiptPath,
    commitPath,
    limits: {
      maximumItems: MAXIMUM_ITEMS,
      maximumSourceRoots: MAXIMUM_SOURCE_ROOTS,
      maximumSourceBytes: MAXIMUM_SOURCE_BYTES,
      maximumAggregateSourceBytes: MAXIMUM_AGGREGATE_BYTES,
    },
    execution: {
      sourceReadOnly: true,
      immutableSourceCopies: true,
      editableWorkingCopies: true,
      createOnlyTargets: true,
      stagedBeforePublication: true,
      rollbackOnFailure: true,
      commitMarkerWrittenLast: true,
      sourceHashesRevalidated: true,
      bytesFlowThroughMcp: false,
    },
    authority: authority(request.authority, ['externalSourceRead', 'workspaceIngest', 'workspaceWrite']),
  });
  if (outputPath) {
    const output = path.resolve(boundedString(outputPath, 'outputPath', 32_768));
    const outputParent = await realpath(path.dirname(output));
    if (!inside(root, outputParent)) fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_PATH_INVALID', 'Compiled plan output must stay inside the persistent workspace.');
    await writeJsonCreateOnly(output, plan);
  }
  return plan;
}

export async function runWorkspaceIngest(workspaceRoot, planInput) {
  const { root, manifest } = await loadWorkspaceManifest(workspaceRoot);
  const plan = structuredClone(planInput);
  if (!isRecord(plan) || plan.schema !== WORKSPACE_INGEST_PLAN_SCHEMA) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_PLAN_INVALID', `Plan must use ${WORKSPACE_INGEST_PLAN_SCHEMA}.`);
  }
  verifyDocumentHash(plan);
  assertPlanAuthority(plan);
  assertExecutionBoundary(plan);
  if (
    plan.workspaceRoot !== root ||
    plan.workspaceId !== manifest.workspaceId ||
    plan.projectId !== manifest.projectId ||
    plan.workspaceManifestSha256 !== manifest.documentSha256
  ) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_MANIFEST_CHANGED', 'Plan is not bound to the current persistent workspace manifest.');
  }
  const ingestId = portableDirectoryName(plan.ingestId, 'plan.ingestId');
  if (!isRecord(plan.limits) || canonicalJson(plan.limits) !== canonicalJson({
    maximumItems: MAXIMUM_ITEMS,
    maximumSourceRoots: MAXIMUM_SOURCE_ROOTS,
    maximumSourceBytes: MAXIMUM_SOURCE_BYTES,
    maximumAggregateSourceBytes: MAXIMUM_AGGREGATE_BYTES,
  })) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_PLAN_INVALID', 'Plan limits changed after compilation.');
  }
  if (!Array.isArray(plan.items) || plan.items.length < 1 || plan.items.length > MAXIMUM_ITEMS || plan.itemCount !== plan.items.length) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_PLAN_INVALID', 'Plan item count is invalid.');
  }
  const staging = path.join(root, 'journals', `.ingest-${ingestId}-staging-${randomUUID()}`);
  const stagedFiles = [];
  const publishedFiles = [];
  const createdDirectories = [];
  await mkdir(staging, { recursive: false, mode: 0o700 });
  try {
    let aggregateBytes = 0;
    const provenanceDocuments = [];
    for (const [index, item] of plan.items.entries()) {
      if (!isRecord(item)) fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_PLAN_INVALID', `items[${index}] must be an object.`);
      const sourceRoot = await requireDirectory(item.sourceRoot, `items[${index}].sourceRoot`);
      if (sourceRoot !== item.sourceRoot) fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_SOURCE_CHANGED', `items[${index}] source root changed.`);
      const source = await resolveExistingFile(sourceRoot, item.sourcePath, `items[${index}].sourcePath`);
      if (source.absolutePath !== item.sourceAbsolutePath) fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_SOURCE_CHANGED', `items[${index}] source path changed.`);
      const expected = {
        sha256: item.sourceSha256,
        bytes: item.sourceBytes,
        snapshot: item.sourceSnapshot,
      };
      const stagedSource = path.join(staging, 'sources', ...item.destinationPath.split('/'));
      const stagedWorking = path.join(staging, 'working', ...item.destinationPath.split('/'));
      await copyStableSource(source.absolutePath, stagedSource, expected, `items[${index}] source`);
      await mkdir(path.dirname(stagedWorking), { recursive: true });
      await copyFile(stagedSource, stagedWorking, fsConstants.COPYFILE_EXCL);
      const [stagedSourceIdentity, stagedWorkingIdentity] = await Promise.all([
        stableFileIdentity(stagedSource, `items[${index}] staged source`),
        stableFileIdentity(stagedWorking, `items[${index}] staged working copy`),
      ]);
      if (
        stagedSourceIdentity.sha256 !== item.sourceSha256 ||
        stagedWorkingIdentity.sha256 !== item.sourceSha256 ||
        stagedSourceIdentity.bytes !== item.sourceBytes ||
        stagedWorkingIdentity.bytes !== item.sourceBytes
      ) {
        fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_COPY_MISMATCH', `items[${index}] staged copies are not byte exact.`);
      }
      aggregateBytes += item.sourceBytes;
      if (aggregateBytes > MAXIMUM_AGGREGATE_BYTES) fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_SOURCE_TOO_LARGE', 'Runtime aggregate source bytes exceed the limit.');
      const provenance = withDocumentHash({
        schema: WORKSPACE_INGEST_PROVENANCE_SCHEMA,
        workspaceId: plan.workspaceId,
        projectId: plan.projectId,
        workspaceManifestSha256: plan.workspaceManifestSha256,
        ingestPlanSha256: plan.documentSha256,
        ingestId,
        assetId: item.assetId,
        title: item.title,
        role: item.role,
        origin: item.origin,
        tags: item.tags,
        ingestedAt: plan.compiledAt,
        createdBy: plan.createdBy,
        source: {
          rootId: item.sourceRootId,
          root: item.sourceRoot,
          relativePath: item.sourcePath,
          absolutePath: item.sourceAbsolutePath,
          sha256: item.sourceSha256,
          bytes: item.sourceBytes,
          mediaType: item.mediaType,
          ...(item.image ? { image: item.image } : {}),
        },
        workspaceCopies: {
          immutableSource: {
            path: item.immutableSourcePath,
            sha256: item.sourceSha256,
            bytes: item.sourceBytes,
          },
          workingCopy: {
            path: item.workingCopyPath,
            sha256: item.sourceSha256,
            bytes: item.sourceBytes,
            editable: true,
          },
        },
        sourceMutation: false,
        sourceDeletion: false,
        storageWrite: false,
        repositoryMutation: false,
        publication: false,
      });
      const stagedProvenance = path.join(staging, ...item.provenancePath.split('/'));
      await mkdir(path.dirname(stagedProvenance), { recursive: true });
      await writeJsonCreateOnly(stagedProvenance, provenance);
      stagedFiles.push(
        { stagedPath: stagedSource, finalRelative: item.immutableSourcePath },
        { stagedPath: stagedWorking, finalRelative: item.workingCopyPath },
        { stagedPath: stagedProvenance, finalRelative: item.provenancePath },
      );
      provenanceDocuments.push({ assetId: item.assetId, documentSha256: provenance.documentSha256 });
    }
    if (aggregateBytes !== plan.aggregateSourceBytes) {
      fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_PLAN_INVALID', 'Runtime aggregate source bytes do not match the compiled plan.');
    }
    const receipt = withDocumentHash({
      schema: WORKSPACE_INGEST_RECEIPT_SCHEMA,
      workspaceId: plan.workspaceId,
      projectId: plan.projectId,
      ingestId,
      ingestedAt: plan.compiledAt,
      ingestPlanSha256: plan.documentSha256,
      requestSha256: plan.requestSha256,
      itemCount: plan.items.length,
      aggregateSourceBytes: aggregateBytes,
      provenanceDocuments,
      immutableSourceCopies: plan.items.map((item) => ({ path: item.immutableSourcePath, sha256: item.sourceSha256, bytes: item.sourceBytes })),
      workingCopies: plan.items.map((item) => ({ path: item.workingCopyPath, sha256: item.sourceSha256, bytes: item.sourceBytes })),
      rollbackOnFailure: true,
      commitMarkerWrittenLast: true,
      sourceMutation: false,
      sourceDeletion: false,
      storageWrite: false,
      repositoryMutation: false,
      publication: false,
    });
    const stagedReceipt = path.join(staging, ...plan.receiptPath.split('/'));
    await mkdir(path.dirname(stagedReceipt), { recursive: true });
    await writeJsonCreateOnly(stagedReceipt, receipt);
    stagedFiles.push({ stagedPath: stagedReceipt, finalRelative: plan.receiptPath });

    const commitMarker = withDocumentHash({
      schema: WORKSPACE_INGEST_COMMIT_SCHEMA,
      workspaceId: plan.workspaceId,
      projectId: plan.projectId,
      ingestId,
      committedAt: plan.compiledAt,
      ingestPlanSha256: plan.documentSha256,
      receiptSha256: receipt.documentSha256,
      itemCount: plan.items.length,
      aggregateSourceBytes: aggregateBytes,
      committedPaths: stagedFiles.map((entry) => entry.finalRelative),
      allTargetsCreateOnly: true,
      rollbackCompletedBeforeFailureReturn: true,
      sourceMutation: false,
      sourceDeletion: false,
      storageWrite: false,
      repositoryMutation: false,
      publication: false,
    });
    const stagedCommit = path.join(staging, ...plan.commitPath.split('/'));
    await mkdir(path.dirname(stagedCommit), { recursive: true });
    await writeJsonCreateOnly(stagedCommit, commitMarker);

    for (const entry of [...stagedFiles, { stagedPath: stagedCommit, finalRelative: plan.commitPath }]) {
      const finalTarget = await targetDoesNotExist(root, entry.finalRelative, 'publication target');
      const parentRelative = path.posix.dirname(finalTarget.relativePath);
      if (parentRelative !== '.') await safeDirectoryChain(root, parentRelative, createdDirectories, 'publication parent');
      await publishCreateOnly(entry.stagedPath, finalTarget.absolutePath);
      publishedFiles.push(finalTarget.absolutePath);
    }

    for (const item of plan.items) {
      const after = await stableFileIdentity(item.sourceAbsolutePath, `source ${item.assetId}`);
      if (after.sha256 !== item.sourceSha256 || after.bytes !== item.sourceBytes || !sameSnapshot(after.snapshot, item.sourceSnapshot)) {
        fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_SOURCE_CHANGED', `Source ${item.assetId} changed during ingest.`);
      }
    }
    await rm(staging, { recursive: true, force: true });
    return {
      status: 'passed',
      schema: commitMarker.schema,
      workspaceId: plan.workspaceId,
      projectId: plan.projectId,
      ingestId,
      itemCount: plan.items.length,
      aggregateSourceBytes: aggregateBytes,
      receiptPath: plan.receiptPath,
      receiptSha256: receipt.documentSha256,
      commitPath: plan.commitPath,
      commitSha256: commitMarker.documentSha256,
      sourceMutation: false,
      sourceDeletion: false,
      storageWrite: false,
      repositoryMutation: false,
      publication: false,
    };
  } catch (error) {
    for (const filePath of [...publishedFiles].reverse()) await unlink(filePath).catch(() => undefined);
    for (const directoryPath of [...createdDirectories].reverse()) await rmdir(directoryPath).catch(() => undefined);
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function loadIngestRequest(filePath) {
  return readStableJsonFile(filePath, 'ingest request');
}

export async function loadIngestPlan(filePath) {
  const { value } = await readStableJsonFile(filePath, 'ingest plan');
  if (!isRecord(value) || value.schema !== WORKSPACE_INGEST_PLAN_SCHEMA) {
    fail('PERSISTENT_ARTIST_WORKSPACE_INGEST_PLAN_INVALID', `Plan must use ${WORKSPACE_INGEST_PLAN_SCHEMA}.`);
  }
  verifyDocumentHash(value);
  return value;
}

export function ingestCapabilities() {
  return Object.freeze({
    schema: 'evavo.persistent-artist-workspace-ingest-capabilities.v1',
    requestSchema: WORKSPACE_INGEST_REQUEST_SCHEMA,
    planSchema: WORKSPACE_INGEST_PLAN_SCHEMA,
    provenanceSchema: WORKSPACE_INGEST_PROVENANCE_SCHEMA,
    receiptSchema: WORKSPACE_INGEST_RECEIPT_SCHEMA,
    commitSchema: WORKSPACE_INGEST_COMMIT_SCHEMA,
    maximumItems: MAXIMUM_ITEMS,
    maximumSourceRoots: MAXIMUM_SOURCE_ROOTS,
    maximumSourceBytes: MAXIMUM_SOURCE_BYTES,
    maximumAggregateSourceBytes: MAXIMUM_AGGREGATE_BYTES,
    sourceReadOnly: true,
    immutableSourceCopies: true,
    editableWorkingCopies: true,
    createOnlyTargets: true,
    rollbackOnFailure: true,
    bytesFlowThroughMcp: false,
    authority: authority(undefined, []),
  });
}
