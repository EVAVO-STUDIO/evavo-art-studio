import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants, createReadStream } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  opendir,
  realpath,
  rename,
  rm,
} from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';

export const WORKSPACE_CATALOG_REQUEST_SCHEMA =
  'evavo.persistent-artist-workspace-catalog-request.v1';
export const WORKSPACE_CATALOG_PLAN_SCHEMA =
  'evavo.persistent-artist-workspace-catalog-plan.v1';
export const WORKSPACE_CATALOG_SCHEMA =
  'evavo.persistent-artist-workspace-catalog.v1';
export const WORKSPACE_CATALOG_RECEIPT_SCHEMA =
  'evavo.persistent-artist-workspace-catalog-receipt.v1';
export const WORKSPACE_CATALOG_QUERY_RESULT_SCHEMA =
  'evavo.persistent-artist-workspace-catalog-query-result.v1';
export const WORKSPACE_CATALOG_VERIFICATION_SCHEMA =
  'evavo.persistent-artist-workspace-catalog-verification.v1';
export const WORKSPACE_MANIFEST_SCHEMA =
  'evavo.persistent-artist-workspace-manifest.v1';

const MAXIMUM_REQUEST_BYTES = 16 * 1024 * 1024;
const MAXIMUM_FILES_HARD = 50_000;
const MAXIMUM_FILE_BYTES_HARD = 2 * 1024 * 1024 * 1024;
const MAXIMUM_AGGREGATE_BYTES_HARD = 64 * 1024 * 1024 * 1024;
const MAXIMUM_HEADER_BYTES = 512 * 1024;
const MAXIMUM_DIFFERENCE_ITEMS = 1_000;

const WORKSPACE_AREAS = Object.freeze([
  'sources',
  'working',
  'versions',
  'masks',
  'scratch',
  'review',
  'masters',
  'exports',
  'manifests',
  'journals',
]);
const REQUIRED_WORKSPACE_DIRECTORIES = Object.freeze([
  ...WORKSPACE_AREAS,
  'manifests/storage-handoffs',
]);
const EXCLUDED_PREFIXES = Object.freeze([
  'manifests/catalogs/',
  'journals/catalogs/',
]);
const IMAGE_EXTENSIONS = new Set([
  '.png', '.apng', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tga', '.svg',
  '.dds', '.ktx', '.ktx2',
]);
const SOURCE_ART_EXTENSIONS = new Set([
  '.psd', '.psb', '.kra', '.xcf', '.ora', '.ase', '.aseprite', '.ai', '.eps',
  '.blend', '.clip', '.sai',
]);

export class PersistentWorkspaceCatalogError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PersistentWorkspaceCatalogError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PersistentWorkspaceCatalogError(code, message);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      fail('PERSISTENT_WORKSPACE_CATALOG_CANONICAL_JSON_INVALID',
        'Canonical JSON cannot contain non-finite numbers.');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  fail('PERSISTENT_WORKSPACE_CATALOG_CANONICAL_JSON_INVALID',
    `Unsupported canonical JSON value: ${typeof value}.`);
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function withDocumentHash(input, field = 'documentSha256') {
  if (!isRecord(input)) {
    fail('PERSISTENT_WORKSPACE_CATALOG_DOCUMENT_INVALID', 'Document must be an object.');
  }
  const unhashed = { ...input };
  delete unhashed[field];
  return Object.freeze({
    ...unhashed,
    [field]: sha256(canonicalJson(unhashed)),
  });
}

export function verifyDocumentHash(document, field = 'documentSha256') {
  if (!isRecord(document)) {
    fail('PERSISTENT_WORKSPACE_CATALOG_DOCUMENT_INVALID', 'Document must be an object.');
  }
  const digest = document[field];
  if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/u.test(digest)) {
    fail('PERSISTENT_WORKSPACE_CATALOG_DOCUMENT_HASH_INVALID',
      `${field} must be a lowercase SHA-256 digest.`);
  }
  const unhashed = { ...document };
  delete unhashed[field];
  const observed = sha256(canonicalJson(unhashed));
  if (observed !== digest) {
    fail('PERSISTENT_WORKSPACE_CATALOG_DOCUMENT_HASH_MISMATCH',
      `${field} does not match the canonical document.`);
  }
  return digest;
}

function boundedString(value, label, maximum = 4096, { allowEmpty = false } = {}) {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.trim().length === 0) ||
    value.length > maximum ||
    value.includes('\0')
  ) {
    fail('PERSISTENT_WORKSPACE_CATALOG_STRING_INVALID', `${label} must be a bounded string.`);
  }
  return value;
}

function safeId(value, label) {
  if (
    typeof value !== 'string' || value.length < 1 || value.length > 160 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
  ) {
    fail('PERSISTENT_WORKSPACE_CATALOG_ID_INVALID',
      `${label} must use 1-160 safe identifier characters.`);
  }
  return value;
}


function portableCatalogId(value, label = 'catalogId') {
  const identifier = safeId(value, label);
  if (identifier.includes(':') || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(identifier)) {
    fail('PERSISTENT_WORKSPACE_CATALOG_ID_INVALID',
      `${label} must be portable as a directory name and cannot contain a colon.`);
  }
  return identifier;
}

function boundedInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail('PERSISTENT_WORKSPACE_CATALOG_INTEGER_INVALID',
      `${label} must be an integer from ${minimum} through ${maximum}.`);
  }
  return value;
}

function timestamp(value, label) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    fail('PERSISTENT_WORKSPACE_CATALOG_TIMESTAMP_INVALID', `${label} must be an ISO timestamp.`);
  }
  return value;
}

function canonicalRelativePath(value, label) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 4096) {
    fail('PERSISTENT_WORKSPACE_CATALOG_PATH_INVALID', `${label} must be a bounded relative path.`);
  }
  if (value.includes('\0') || value.includes('\\')) {
    fail('PERSISTENT_WORKSPACE_CATALOG_PATH_INVALID',
      `${label} must use forward slashes and contain no NUL.`);
  }
  const candidate = path.posix.normalize(value);
  if (
    candidate !== value || candidate === '.' || candidate === '..' ||
    candidate.startsWith('../') || candidate.startsWith('/') || /^[A-Za-z]:/u.test(candidate)
  ) {
    fail('PERSISTENT_WORKSPACE_CATALOG_PATH_INVALID', `${label} must be canonical and relative.`);
  }
  return candidate;
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

function insideRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function requireDirectoryNoSymlink(directoryPath, label) {
  const lexical = path.resolve(directoryPath);
  const metadata = await lstat(lexical).catch((error) => {
    fail('PERSISTENT_WORKSPACE_CATALOG_ROOT_INVALID',
      `${label} could not be inspected: ${error.message}`);
  });
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    fail('PERSISTENT_WORKSPACE_CATALOG_ROOT_INVALID',
      `${label} must be an existing non-symbolic directory.`);
  }
  return realpath(lexical);
}

export async function readStableJsonFile(filePath, label = 'JSON file') {
  const absolute = path.resolve(filePath);
  const pathBefore = await lstat(absolute).catch((error) => {
    fail('PERSISTENT_WORKSPACE_CATALOG_INPUT_INVALID',
      `${label} could not be inspected: ${error.message}`);
  });
  if (pathBefore.isSymbolicLink() || !pathBefore.isFile() || pathBefore.nlink !== 1) {
    fail('PERSISTENT_WORKSPACE_CATALOG_INPUT_INVALID',
      `${label} must be a singly linked regular non-symbolic file.`);
  }
  if (pathBefore.size < 2 || pathBefore.size > MAXIMUM_REQUEST_BYTES) {
    fail('PERSISTENT_WORKSPACE_CATALOG_INPUT_INVALID',
      `${label} must be 2-${MAXIMUM_REQUEST_BYTES} bytes.`);
  }
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  let handle;
  try {
    handle = await open(absolute, flags);
  } catch (error) {
    if (error?.code === 'ELOOP') {
      fail('PERSISTENT_WORKSPACE_CATALOG_INPUT_INVALID', `${label} became symbolic.`);
    }
    throw error;
  }
  try {
    const handleBefore = await handle.stat();
    if (handleBefore.nlink !== 1 ||
      !sameSnapshot(fileSnapshot(pathBefore), fileSnapshot(handleBefore))) {
      fail('PERSISTENT_WORKSPACE_CATALOG_INPUT_CHANGED', `${label} changed before reading.`);
    }
    const bytes = await handle.readFile();
    const [handleAfter, pathAfter] = await Promise.all([handle.stat(), lstat(absolute)]);
    if (
      pathAfter.isSymbolicLink() || pathAfter.nlink !== 1 || bytes.length !== pathBefore.size ||
      !sameSnapshot(fileSnapshot(pathBefore), fileSnapshot(handleAfter)) ||
      !sameSnapshot(fileSnapshot(pathBefore), fileSnapshot(pathAfter))
    ) {
      fail('PERSISTENT_WORKSPACE_CATALOG_INPUT_CHANGED', `${label} changed while reading.`);
    }
    let value;
    try {
      value = JSON.parse(new TextDecoder('utf-8', { fatal: true })
        .decode(bytes).replace(/^\uFEFF/u, ''));
    } catch (error) {
      fail('PERSISTENT_WORKSPACE_CATALOG_INPUT_INVALID',
        `${label} is not valid UTF-8 JSON: ${error.message}`);
    }
    return { value, bytes, absolutePath: absolute };
  } finally {
    await handle.close();
  }
}

async function writeJsonCreateOnly(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const handle = await open(filePath, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  } finally {
    await handle.close();
  }
}

function mediaTypeFromPath(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.png':
    case '.apng': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.bmp': return 'image/bmp';
    case '.tga': return 'image/x-tga';
    case '.svg': return 'image/svg+xml';
    case '.dds': return 'image/vnd-ms.dds';
    case '.ktx': return 'image/ktx';
    case '.ktx2': return 'image/ktx2';
    case '.json': return 'application/json';
    case '.md': return 'text/markdown';
    case '.txt': return 'text/plain';
    default: return 'application/octet-stream';
  }
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function inspectJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > buffer.length) return null;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return null;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        format: 'jpeg',
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
        hasAlpha: false,
        animated: false,
      };
    }
    offset += length;
  }
  return null;
}

function inspectImageHeader(buffer, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (buffer.length >= 26 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    const text = buffer.toString('latin1');
    const colourType = buffer[25];
    return {
      format: extension === '.apng' || text.includes('acTL') ? 'apng' : 'png',
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      hasAlpha: colourType === 4 || colourType === 6 || text.includes('tRNS'),
      animated: text.includes('acTL'),
    };
  }
  const jpeg = inspectJpeg(buffer);
  if (jpeg) return jpeg;
  if (buffer.length >= 10 && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))) {
    const text = buffer.toString('latin1');
    return {
      format: 'gif',
      width: buffer.readUInt16LE(6),
      height: buffer.readUInt16LE(8),
      hasAlpha: text.includes('\x21\xF9\x04'),
      animated: (text.match(/\x2C/gu) || []).length > 1,
    };
  }
  if (buffer.length >= 30 && buffer.toString('ascii', 0, 2) === 'BM') {
    return {
      format: 'bmp',
      width: Math.abs(buffer.readInt32LE(18)),
      height: Math.abs(buffer.readInt32LE(22)),
      hasAlpha: buffer.readUInt16LE(28) === 32,
      animated: false,
    };
  }
  if (buffer.length >= 18 && extension === '.tga') {
    return {
      format: 'tga',
      width: buffer.readUInt16LE(12),
      height: buffer.readUInt16LE(14),
      hasAlpha: buffer[16] === 32 || (buffer[17] & 0x0f) > 0,
      animated: false,
    };
  }
  if (buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buffer.toString('ascii', 12, 16);
    if (kind === 'VP8X') {
      return {
        format: 'webp',
        width: 1 + readUInt24LE(buffer, 24),
        height: 1 + readUInt24LE(buffer, 27),
        hasAlpha: Boolean(buffer[20] & 0x10),
        animated: Boolean(buffer[20] & 0x02),
      };
    }
  }
  if (extension === '.svg') {
    const text = buffer.toString('utf8');
    const svg = text.match(/<svg\b[^>]*>/iu)?.[0] || '';
    const width = svg.match(/\bwidth=["']([0-9.]+)(?:px)?["']/iu)?.[1];
    const height = svg.match(/\bheight=["']([0-9.]+)(?:px)?["']/iu)?.[1];
    const viewBox = svg.match(/\bviewBox=["'][^"']*?([0-9.]+)[ ,]+([0-9.]+)["']/iu);
    return {
      format: 'svg',
      width: width ? Math.round(Number(width)) : viewBox ? Math.round(Number(viewBox[1])) : null,
      height: height ? Math.round(Number(height)) : viewBox ? Math.round(Number(viewBox[2])) : null,
      hasAlpha: true,
      animated: /<(?:animate|animateTransform|set)\b/iu.test(text),
    };
  }
  return null;
}

async function hashStableFile(absolutePath, limits) {
  const pathBefore = await lstat(absolutePath);
  if (pathBefore.isSymbolicLink() || !pathBefore.isFile()) {
    fail('PERSISTENT_WORKSPACE_CATALOG_ENTRY_INVALID',
      `Catalog entries must be regular non-symbolic files: ${absolutePath}`);
  }
  if (pathBefore.nlink !== 1) {
    fail('PERSISTENT_WORKSPACE_CATALOG_ENTRY_MULTIPLY_LINKED',
      `Catalog entries must have exactly one filesystem link: ${absolutePath}`);
  }
  if (pathBefore.size > limits.maximumFileBytes) {
    fail('PERSISTENT_WORKSPACE_CATALOG_FILE_LIMIT',
      `File exceeds maximumFileBytes: ${absolutePath}`);
  }
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  let handle;
  try {
    handle = await open(absolutePath, flags);
  } catch (error) {
    if (error?.code === 'ELOOP') {
      fail('PERSISTENT_WORKSPACE_CATALOG_ENTRY_INVALID',
        `Catalog entry became symbolic: ${absolutePath}`);
    }
    throw error;
  }
  try {
    const handleBefore = await handle.stat();
    if (handleBefore.nlink !== 1 ||
      !sameSnapshot(fileSnapshot(pathBefore), fileSnapshot(handleBefore))) {
      fail('PERSISTENT_WORKSPACE_CATALOG_ENTRY_CHANGED',
        `Catalog entry changed before hashing: ${absolutePath}`);
    }
    const headerLength = Math.min(pathBefore.size, MAXIMUM_HEADER_BYTES);
    const header = Buffer.alloc(headerLength);
    if (headerLength > 0) await handle.read(header, 0, headerLength, 0);
    const digest = createHash('sha256');
    await new Promise((resolve, reject) => {
      const stream = createReadStream(absolutePath, {
        fd: handle.fd,
        autoClose: false,
        start: 0,
      });
      stream.on('data', (chunk) => digest.update(chunk));
      stream.on('error', reject);
      stream.on('end', resolve);
    });
    const [handleAfter, pathAfter] = await Promise.all([handle.stat(), lstat(absolutePath)]);
    if (
      pathAfter.isSymbolicLink() || pathAfter.nlink !== 1 ||
      !sameSnapshot(fileSnapshot(pathBefore), fileSnapshot(handleAfter)) ||
      !sameSnapshot(fileSnapshot(pathBefore), fileSnapshot(pathAfter))
    ) {
      fail('PERSISTENT_WORKSPACE_CATALOG_ENTRY_CHANGED',
        `Catalog entry changed while hashing: ${absolutePath}`);
    }
    return {
      sha256: digest.digest('hex'),
      bytes: pathBefore.size,
      header,
    };
  } finally {
    await handle.close();
  }
}

function normalizedAreas(value) {
  if (value === undefined) return [...WORKSPACE_AREAS].sort();
  if (!Array.isArray(value) || value.length < 1 || value.length > WORKSPACE_AREAS.length) {
    fail('PERSISTENT_WORKSPACE_CATALOG_AREAS_INVALID',
      `includeAreas must contain 1-${WORKSPACE_AREAS.length} workspace areas.`);
  }
  const result = [...new Set(value.map((entry, index) => {
    const area = boundedString(entry, `includeAreas[${index}]`, 32);
    if (!WORKSPACE_AREAS.includes(area)) {
      fail('PERSISTENT_WORKSPACE_CATALOG_AREAS_INVALID', `Unsupported workspace area: ${area}.`);
    }
    return area;
  }))].sort();
  return result;
}

function normalizedTags(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 256) {
    fail('PERSISTENT_WORKSPACE_CATALOG_TAGS_INVALID', 'tags must contain at most 256 strings.');
  }
  return [...new Set(value.map((entry, index) =>
    boundedString(entry, `tags[${index}]`, 160)))].sort();
}

function normalizedLimits(value = {}) {
  if (!isRecord(value)) {
    fail('PERSISTENT_WORKSPACE_CATALOG_LIMITS_INVALID', 'limits must be an object.');
  }
  return {
    maximumFiles: boundedInteger(value.maximumFiles ?? 25_000,
      'limits.maximumFiles', 1, MAXIMUM_FILES_HARD),
    maximumFileBytes: boundedInteger(value.maximumFileBytes ?? MAXIMUM_FILE_BYTES_HARD,
      'limits.maximumFileBytes', 1, MAXIMUM_FILE_BYTES_HARD),
    maximumAggregateBytes: boundedInteger(
      value.maximumAggregateBytes ?? MAXIMUM_AGGREGATE_BYTES_HARD,
      'limits.maximumAggregateBytes', 1, MAXIMUM_AGGREGATE_BYTES_HARD),
  };
}

function fixedAuthority(write = false) {
  return {
    workspaceRead: true,
    workspaceCatalogWrite: write,
    imageBytesThroughMcp: false,
    sourceMutation: false,
    sourceDeletion: false,
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    storageWrite: false,
    targetRepositoryMutation: false,
    gitPublication: false,
    deployment: false,
    publication: false,
    forcePush: false,
  };
}

function assertAuthority(value, write, label) {
  if (canonicalJson(value) !== canonicalJson(fixedAuthority(write))) {
    fail('PERSISTENT_WORKSPACE_CATALOG_AUTHORITY_INVALID',
      `${label} authority changed after compilation.`);
  }
}

async function safeDirectoryChain(root, relativeDirectory, { create = false } = {}) {
  const canonical = canonicalRelativePath(relativeDirectory, 'directory');
  let current = root;
  for (const part of canonical.split('/')) {
    const next = path.join(current, part);
    let metadata;
    try {
      metadata = await lstat(next);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      if (!create) return next;
      await mkdir(next, { recursive: false, mode: 0o700 }).catch((createError) => {
        if (createError?.code !== 'EEXIST') throw createError;
      });
      metadata = await lstat(next);
    }
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      fail('PERSISTENT_WORKSPACE_CATALOG_DIRECTORY_INVALID',
        `Workspace directory is symbolic or not a directory: ${next}`);
    }
    const resolved = await realpath(next);
    if (!insideRoot(root, resolved)) {
      fail('PERSISTENT_WORKSPACE_CATALOG_PATH_ESCAPE', 'Workspace directory escaped its root.');
    }
    current = resolved;
  }
  return current;
}

async function loadWorkspace(workspaceRoot) {
  const root = await requireDirectoryNoSymlink(workspaceRoot, 'workspaceRoot');
  for (const relative of REQUIRED_WORKSPACE_DIRECTORIES) {
    await safeDirectoryChain(root, relative, { create: false });
    const metadata = await lstat(path.join(root, ...relative.split('/'))).catch(() => null);
    if (!metadata || metadata.isSymbolicLink() || !metadata.isDirectory()) {
      fail('PERSISTENT_WORKSPACE_CATALOG_WORKSPACE_INVALID',
        `Required workspace directory is missing or symbolic: ${relative}.`);
    }
  }
  const manifestPath = path.join(root, 'manifests', 'workspace.json');
  const { value: manifest } = await readStableJsonFile(manifestPath,
    'persistent workspace manifest');
  if (!isRecord(manifest) || manifest.schema !== WORKSPACE_MANIFEST_SCHEMA) {
    fail('PERSISTENT_WORKSPACE_CATALOG_WORKSPACE_INVALID',
      `Workspace manifest must use ${WORKSPACE_MANIFEST_SCHEMA}.`);
  }
  verifyDocumentHash(manifest);
  if (manifest.workspaceRoot !== root) {
    fail('PERSISTENT_WORKSPACE_CATALOG_WORKSPACE_INVALID',
      'Workspace manifest root does not match the opened workspace.');
  }
  return { root, manifest };
}

function classifyEntry(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return { extension, kind: 'image' };
  if (SOURCE_ART_EXTENSIONS.has(extension)) return { extension, kind: 'source-art' };
  if (extension === '.json' && relativePath.startsWith('manifests/')) {
    return { extension, kind: 'manifest' };
  }
  if (['.json', '.md', '.txt', '.yaml', '.yml', '.toml', '.xml', '.csv'].includes(extension)) {
    return { extension, kind: 'metadata' };
  }
  return { extension, kind: 'artifact' };
}

function excluded(relativePath) {
  return EXCLUDED_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
}

async function scanArea(root, area, limits, state) {
  const start = path.join(root, area);
  const stack = [{ absolute: start, relative: area }];
  while (stack.length > 0) {
    const current = stack.pop();
    const directory = await opendir(current.absolute);
    const entries = [];
    for await (const entry of directory) entries.push(entry);
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries.reverse()) {
      const relative = `${current.relative}/${entry.name}`;
      const absolute = path.join(current.absolute, entry.name);
      const metadata = await lstat(absolute);
      if (metadata.isSymbolicLink()) {
        fail('PERSISTENT_WORKSPACE_CATALOG_SYMBOLIC_ENTRY',
          `Workspace catalog refuses symbolic entries: ${relative}.`);
      }
      if (metadata.isDirectory()) {
        if (!excluded(`${relative}/`)) stack.push({ absolute, relative });
        continue;
      }
      if (!metadata.isFile()) {
        fail('PERSISTENT_WORKSPACE_CATALOG_ENTRY_INVALID',
          `Workspace catalog refuses special filesystem entries: ${relative}.`);
      }
      if (excluded(relative)) continue;
      if (state.entries.length >= limits.maximumFiles) {
        fail('PERSISTENT_WORKSPACE_CATALOG_FILE_COUNT_LIMIT',
          `Workspace contains more than ${limits.maximumFiles} catalogued files.`);
      }
      const resolved = await realpath(absolute);
      if (!insideRoot(root, resolved)) {
        fail('PERSISTENT_WORKSPACE_CATALOG_PATH_ESCAPE',
          `Workspace entry escaped its root: ${relative}.`);
      }
      const identity = await hashStableFile(resolved, limits);
      state.aggregateBytes += identity.bytes;
      if (state.aggregateBytes > limits.maximumAggregateBytes) {
        fail('PERSISTENT_WORKSPACE_CATALOG_AGGREGATE_LIMIT',
          `Workspace exceeds ${limits.maximumAggregateBytes} aggregate catalogued bytes.`);
      }
      const canonical = canonicalRelativePath(relative, 'workspace entry path');
      const classification = classifyEntry(canonical);
      const mediaType = mediaTypeFromPath(canonical);
      const image = IMAGE_EXTENSIONS.has(classification.extension)
        ? inspectImageHeader(identity.header, canonical)
        : null;
      state.entries.push({
        path: canonical,
        area,
        kind: classification.kind,
        extension: classification.extension,
        mediaType,
        bytes: identity.bytes,
        sha256: identity.sha256,
        ...(image ? { image } : {}),
      });
    }
  }
}

function increment(object, key, amount = 1) {
  object[key] = (object[key] ?? 0) + amount;
}

function summarize(entries, aggregateBytes) {
  const byArea = {};
  const byKind = {};
  const byMediaType = {};
  let imageCount = 0;
  let animatedImageCount = 0;
  for (const entry of entries) {
    increment(byArea, entry.area);
    increment(byKind, entry.kind);
    increment(byMediaType, entry.mediaType);
    if (entry.image) {
      imageCount += 1;
      if (entry.image.animated) animatedImageCount += 1;
    }
  }
  const groups = new Map();
  for (const entry of entries) {
    const paths = groups.get(entry.sha256) ?? [];
    paths.push(entry.path);
    groups.set(entry.sha256, paths);
  }
  const duplicateGroups = [...groups.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([digest, paths]) => ({ sha256: digest, paths: paths.sort() }))
    .sort((left, right) => left.sha256.localeCompare(right.sha256));
  return {
    statistics: {
      fileCount: entries.length,
      aggregateBytes,
      imageCount,
      animatedImageCount,
      duplicateGroupCount: duplicateGroups.length,
      duplicateFileCount: duplicateGroups.reduce((sum, group) => sum + group.paths.length, 0),
      byArea: Object.fromEntries(Object.entries(byArea).sort()),
      byKind: Object.fromEntries(Object.entries(byKind).sort()),
      byMediaType: Object.fromEntries(Object.entries(byMediaType).sort()),
    },
    duplicateGroups,
  };
}

async function scanWorkspace(root, includeAreas, limits) {
  const state = { entries: [], aggregateBytes: 0 };
  for (const area of includeAreas) await scanArea(root, area, limits, state);
  state.entries.sort((left, right) => left.path.localeCompare(right.path));
  const summary = summarize(state.entries, state.aggregateBytes);
  return {
    entries: state.entries,
    duplicateGroups: summary.duplicateGroups,
    statistics: summary.statistics,
  };
}

function exactRequestSha(request, requestBytes) {
  if (!Buffer.isBuffer(requestBytes) || requestBytes.length < 2 ||
    requestBytes.length > MAXIMUM_REQUEST_BYTES) {
    fail('PERSISTENT_WORKSPACE_CATALOG_REQUEST_INVALID',
      'Request bytes are outside the bounded JSON contract.');
  }
  let decoded;
  try {
    decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true })
      .decode(requestBytes).replace(/^\uFEFF/u, ''));
  } catch (error) {
    fail('PERSISTENT_WORKSPACE_CATALOG_REQUEST_INVALID',
      `Request bytes are not valid UTF-8 JSON: ${error.message}`);
  }
  if (!isRecord(request) || request.schema !== WORKSPACE_CATALOG_REQUEST_SCHEMA) {
    fail('PERSISTENT_WORKSPACE_CATALOG_REQUEST_INVALID',
      `Request must use ${WORKSPACE_CATALOG_REQUEST_SCHEMA}.`);
  }
  if (canonicalJson(decoded) !== canonicalJson(request)) {
    fail('PERSISTENT_WORKSPACE_CATALOG_REQUEST_MISMATCH',
      'Request bytes do not encode the supplied request object.');
  }
  return sha256(requestBytes);
}


function validDigest(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) {
    fail('PERSISTENT_WORKSPACE_CATALOG_DOCUMENT_INVALID', `${label} must be lowercase SHA-256.`);
  }
  return value;
}

function validateImageSummary(value, label) {
  if (!isRecord(value)) {
    fail('PERSISTENT_WORKSPACE_CATALOG_INVENTORY_INVALID', `${label} must be an object.`);
  }
  boundedString(value.format, `${label}.format`, 32);
  for (const field of ['width', 'height']) {
    if (value[field] !== null) boundedInteger(value[field], `${label}.${field}`, 1, 1_000_000);
  }
  if (typeof value.hasAlpha !== 'boolean' || typeof value.animated !== 'boolean') {
    fail('PERSISTENT_WORKSPACE_CATALOG_INVENTORY_INVALID',
      `${label} alpha and animation flags must be boolean.`);
  }
}

function validateInventory(document, includeAreas, limits, label) {
  if (!Array.isArray(document.entries) || document.entries.length > limits.maximumFiles) {
    fail('PERSISTENT_WORKSPACE_CATALOG_INVENTORY_INVALID',
      `${label}.entries exceeds the compiled file boundary.`);
  }
  const paths = new Set();
  let priorPath = null;
  let aggregateBytes = 0;
  for (let index = 0; index < document.entries.length; index += 1) {
    const entry = document.entries[index];
    if (!isRecord(entry)) {
      fail('PERSISTENT_WORKSPACE_CATALOG_INVENTORY_INVALID', `${label}.entries[${index}] must be an object.`);
    }
    const entryPath = canonicalRelativePath(entry.path, `${label}.entries[${index}].path`);
    if (priorPath !== null && priorPath.localeCompare(entryPath) >= 0) {
      fail('PERSISTENT_WORKSPACE_CATALOG_INVENTORY_INVALID', `${label}.entries must be strictly path-sorted.`);
    }
    priorPath = entryPath;
    if (paths.has(entryPath)) {
      fail('PERSISTENT_WORKSPACE_CATALOG_INVENTORY_INVALID', `Duplicate catalog path: ${entryPath}.`);
    }
    paths.add(entryPath);
    if (!includeAreas.includes(entry.area) || !entryPath.startsWith(`${entry.area}/`)) {
      fail('PERSISTENT_WORKSPACE_CATALOG_INVENTORY_INVALID',
        `${label}.entries[${index}] is outside its declared area.`);
    }
    if (!['image', 'source-art', 'manifest', 'metadata', 'artifact'].includes(entry.kind)) {
      fail('PERSISTENT_WORKSPACE_CATALOG_INVENTORY_INVALID',
        `${label}.entries[${index}].kind is unsupported.`);
    }
    boundedString(entry.extension, `${label}.entries[${index}].extension`, 32, { allowEmpty: true });
    if (entry.extension !== path.extname(entryPath).toLowerCase()) {
      fail('PERSISTENT_WORKSPACE_CATALOG_INVENTORY_INVALID',
        `${label}.entries[${index}].extension does not match its path.`);
    }
    boundedString(entry.mediaType, `${label}.entries[${index}].mediaType`, 160);
    boundedInteger(entry.bytes, `${label}.entries[${index}].bytes`, 0, limits.maximumFileBytes);
    validDigest(entry.sha256, `${label}.entries[${index}].sha256`);
    aggregateBytes += entry.bytes;
    if (aggregateBytes > limits.maximumAggregateBytes) {
      fail('PERSISTENT_WORKSPACE_CATALOG_INVENTORY_INVALID', `${label} exceeds maximumAggregateBytes.`);
    }
    if (entry.image !== undefined) validateImageSummary(entry.image, `${label}.entries[${index}].image`);
  }
  if (!Array.isArray(document.duplicateGroups) || !isRecord(document.statistics)) {
    fail('PERSISTENT_WORKSPACE_CATALOG_INVENTORY_INVALID',
      `${label} duplicateGroups and statistics are required.`);
  }
  const recomputed = summarize(document.entries, aggregateBytes);
  if (canonicalJson(recomputed.duplicateGroups) !== canonicalJson(document.duplicateGroups) ||
    canonicalJson(recomputed.statistics) !== canonicalJson(document.statistics)) {
    fail('PERSISTENT_WORKSPACE_CATALOG_INVENTORY_INVALID',
      `${label} summary does not match its exact entries.`);
  }
}

export function catalogCapabilities() {
  return Object.freeze({
    schema: 'evavo.persistent-artist-workspace-catalog-capabilities.v1',
    schemas: {
      request: WORKSPACE_CATALOG_REQUEST_SCHEMA,
      plan: WORKSPACE_CATALOG_PLAN_SCHEMA,
      catalog: WORKSPACE_CATALOG_SCHEMA,
      receipt: WORKSPACE_CATALOG_RECEIPT_SCHEMA,
      queryResult: WORKSPACE_CATALOG_QUERY_RESULT_SCHEMA,
      verification: WORKSPACE_CATALOG_VERIFICATION_SCHEMA,
    },
    workspaceAreas: WORKSPACE_AREAS,
    limits: {
      maximumFiles: MAXIMUM_FILES_HARD,
      maximumFileBytes: MAXIMUM_FILE_BYTES_HARD,
      maximumAggregateBytes: MAXIMUM_AGGREGATE_BYTES_HARD,
      maximumQueryResults: 1_000,
    },
    operations: ['compile', 'run', 'query', 'verify'],
    features: {
      exactSha256: true,
      exactByteLength: true,
      imageHeaderInspection: true,
      duplicateDetection: true,
      driftDetection: true,
      createOnlyPublication: true,
      atomicPublication: true,
      sourceMutation: false,
      imageBytesThroughMcp: false,
    },
  });
}

export async function compileWorkspaceCatalog({
  workspaceRoot,
  request,
  requestBytes,
  outputPath,
  compiledAt = new Date().toISOString(),
}) {
  const { root, manifest } = await loadWorkspace(workspaceRoot);
  timestamp(compiledAt, 'compiledAt');
  const requestSha256 = exactRequestSha(request, requestBytes);
  const catalogId = portableCatalogId(request.catalogId, 'catalogId');
  const includeAreas = normalizedAreas(request.includeAreas);
  const limits = normalizedLimits(request.limits);
  const tags = normalizedTags(request.tags);
  const finalRoot = path.join(root, 'manifests', 'catalogs', catalogId);
  try {
    await lstat(finalRoot);
    fail('PERSISTENT_WORKSPACE_CATALOG_OUTPUT_EXISTS',
      `Catalog output already exists: ${finalRoot}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const inventory = await scanWorkspace(root, includeAreas, limits);
  const plan = withDocumentHash({
    schema: WORKSPACE_CATALOG_PLAN_SCHEMA,
    catalogId,
    workspaceId: safeId(manifest.workspaceId, 'workspaceId'),
    projectId: safeId(manifest.projectId, 'projectId'),
    workspaceRoot: root,
    workspaceManifestSha256: manifest.documentSha256,
    requestSha256,
    compiledAt,
    title: boundedString(request.title ?? `${catalogId} workspace catalog`, 'title', 512),
    note: boundedString(request.note ?? 'Exact persistent Artist Workspace inventory.',
      'note', 8192),
    tags,
    includeAreas,
    limits,
    ...inventory,
    output: {
      directory: `manifests/catalogs/${catalogId}`,
      catalogPath: `manifests/catalogs/${catalogId}/catalog.json`,
      receiptPath: `manifests/catalogs/${catalogId}/receipt.json`,
    },
    execution: {
      readOnlyCompilation: true,
      revalidateBeforePublication: true,
      createOnlyPublication: true,
      atomicDirectoryRename: true,
      excludesPriorCatalogs: true,
      imageBytesThroughMcp: false,
    },
    authority: fixedAuthority(true),
  });
  if (outputPath) await writeJsonCreateOnly(path.resolve(outputPath), plan);
  return plan;
}

function validatePlan(plan) {
  if (!isRecord(plan) || plan.schema !== WORKSPACE_CATALOG_PLAN_SCHEMA) {
    fail('PERSISTENT_WORKSPACE_CATALOG_PLAN_INVALID',
      `Plan must use ${WORKSPACE_CATALOG_PLAN_SCHEMA}.`);
  }
  verifyDocumentHash(plan);
  portableCatalogId(plan.catalogId, 'catalogId');
  timestamp(plan.compiledAt, 'compiledAt');
  const includeAreas = normalizedAreas(plan.includeAreas);
  const limits = normalizedLimits(plan.limits);
  if (canonicalJson(includeAreas) !== canonicalJson(plan.includeAreas) ||
    canonicalJson(limits) !== canonicalJson(plan.limits)) {
    fail('PERSISTENT_WORKSPACE_CATALOG_PLAN_INVALID',
      'Plan areas or limits changed after compilation.');
  }
  validDigest(plan.workspaceManifestSha256, 'plan.workspaceManifestSha256');
  validDigest(plan.requestSha256, 'plan.requestSha256');
  boundedString(plan.workspaceRoot, 'plan.workspaceRoot', 8192);
  boundedString(plan.title, 'plan.title', 512);
  boundedString(plan.note, 'plan.note', 8192);
  normalizedTags(plan.tags);
  validateInventory(plan, includeAreas, limits, 'plan');
  const expectedOutput = {
    directory: `manifests/catalogs/${plan.catalogId}`,
    catalogPath: `manifests/catalogs/${plan.catalogId}/catalog.json`,
    receiptPath: `manifests/catalogs/${plan.catalogId}/receipt.json`,
  };
  if (canonicalJson(plan.output) !== canonicalJson(expectedOutput)) {
    fail('PERSISTENT_WORKSPACE_CATALOG_PLAN_INVALID', 'Plan output paths changed after compilation.');
  }
  assertAuthority(plan.authority, true, 'catalog plan');
  if (!isRecord(plan.execution) || plan.execution.readOnlyCompilation !== true ||
    plan.execution.revalidateBeforePublication !== true ||
    plan.execution.createOnlyPublication !== true ||
    plan.execution.atomicDirectoryRename !== true ||
    plan.execution.excludesPriorCatalogs !== true ||
    plan.execution.imageBytesThroughMcp !== false) {
    fail('PERSISTENT_WORKSPACE_CATALOG_PLAN_INVALID',
      'Plan execution boundary changed after compilation.');
  }
  return { includeAreas, limits };
}

export async function runWorkspaceCatalog(planInput) {
  const plan = structuredClone(planInput);
  const { includeAreas, limits } = validatePlan(plan);
  const { root, manifest } = await loadWorkspace(plan.workspaceRoot);
  if (manifest.documentSha256 !== plan.workspaceManifestSha256 ||
    manifest.workspaceId !== plan.workspaceId || manifest.projectId !== plan.projectId) {
    fail('PERSISTENT_WORKSPACE_CATALOG_WORKSPACE_CHANGED',
      'Workspace identity changed after catalog compilation.');
  }
  const observed = await scanWorkspace(root, includeAreas, limits);
  for (const key of ['entries', 'duplicateGroups', 'statistics']) {
    if (canonicalJson(observed[key]) !== canonicalJson(plan[key])) {
      fail('PERSISTENT_WORKSPACE_CATALOG_DRIFT',
        `Workspace ${key} changed after catalog compilation.`);
    }
  }
  const catalog = withDocumentHash({
    schema: WORKSPACE_CATALOG_SCHEMA,
    catalogId: plan.catalogId,
    workspaceId: plan.workspaceId,
    projectId: plan.projectId,
    workspaceRoot: root,
    workspaceManifestSha256: plan.workspaceManifestSha256,
    requestSha256: plan.requestSha256,
    sourcePlanSha256: plan.documentSha256,
    generatedAt: plan.compiledAt,
    title: plan.title,
    note: plan.note,
    tags: plan.tags,
    includeAreas,
    limits,
    entries: observed.entries,
    duplicateGroups: observed.duplicateGroups,
    statistics: observed.statistics,
    authority: fixedAuthority(false),
  });
  const receipt = withDocumentHash({
    schema: WORKSPACE_CATALOG_RECEIPT_SCHEMA,
    catalogId: plan.catalogId,
    workspaceId: plan.workspaceId,
    projectId: plan.projectId,
    workspaceRoot: root,
    sourcePlanSha256: plan.documentSha256,
    catalogSha256: catalog.documentSha256,
    generatedAt: plan.compiledAt,
    fileCount: observed.statistics.fileCount,
    aggregateBytes: observed.statistics.aggregateBytes,
    duplicateGroupCount: observed.statistics.duplicateGroupCount,
    output: plan.output,
    complete: true,
    authority: fixedAuthority(false),
  });
  const catalogsRoot = await safeDirectoryChain(root, 'manifests/catalogs', { create: true });
  const finalRoot = path.join(catalogsRoot, plan.catalogId);
  try {
    await lstat(finalRoot);
    fail('PERSISTENT_WORKSPACE_CATALOG_OUTPUT_EXISTS',
      `Catalog output already exists: ${finalRoot}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const stagingRoot = path.join(catalogsRoot,
    `.catalog-${plan.catalogId}-${randomUUID()}.staging`);
  await mkdir(stagingRoot, { recursive: false, mode: 0o700 });
  try {
    await writeJsonCreateOnly(path.join(stagingRoot, 'catalog.json'), catalog);
    await writeJsonCreateOnly(path.join(stagingRoot, 'receipt.json'), receipt);
    const { value: catalogReadback } = await readStableJsonFile(
      path.join(stagingRoot, 'catalog.json'), 'catalog readback');
    const { value: receiptReadback } = await readStableJsonFile(
      path.join(stagingRoot, 'receipt.json'), 'receipt readback');
    verifyDocumentHash(catalogReadback);
    verifyDocumentHash(receiptReadback);
    if (catalogReadback.documentSha256 !== catalog.documentSha256 ||
      receiptReadback.documentSha256 !== receipt.documentSha256) {
      fail('PERSISTENT_WORKSPACE_CATALOG_PUBLICATION_INVALID',
        'Catalog readback did not match the staged documents.');
    }
    await rename(stagingRoot, finalRoot);
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
  return Object.freeze({
    catalog,
    receipt,
    catalogPath: path.join(finalRoot, 'catalog.json'),
    receiptPath: path.join(finalRoot, 'receipt.json'),
  });
}

async function loadPublishedCatalog(workspaceRoot, catalogIdInput) {
  const catalogId = portableCatalogId(catalogIdInput, 'catalogId');
  const { root, manifest } = await loadWorkspace(workspaceRoot);
  const catalogPath = path.join(root, 'manifests', 'catalogs', catalogId, 'catalog.json');
  const { value: catalog } = await readStableJsonFile(catalogPath, 'published workspace catalog');
  if (!isRecord(catalog) || catalog.schema !== WORKSPACE_CATALOG_SCHEMA) {
    fail('PERSISTENT_WORKSPACE_CATALOG_PUBLISHED_INVALID',
      `Published catalog must use ${WORKSPACE_CATALOG_SCHEMA}.`);
  }
  verifyDocumentHash(catalog);
  portableCatalogId(catalog.catalogId, 'catalog.catalogId');
  validDigest(catalog.workspaceManifestSha256, 'catalog.workspaceManifestSha256');
  validDigest(catalog.requestSha256, 'catalog.requestSha256');
  validDigest(catalog.sourcePlanSha256, 'catalog.sourcePlanSha256');
  timestamp(catalog.generatedAt, 'catalog.generatedAt');
  const catalogAreas = normalizedAreas(catalog.includeAreas);
  const catalogLimits = normalizedLimits(catalog.limits);
  validateInventory(catalog, catalogAreas, catalogLimits, 'catalog');
  assertAuthority(catalog.authority, false, 'published catalog');
  if (catalog.catalogId !== catalogId || catalog.workspaceRoot !== root || catalog.workspaceId !== manifest.workspaceId ||
    catalog.projectId !== manifest.projectId ||
    catalog.workspaceManifestSha256 !== manifest.documentSha256) {
    fail('PERSISTENT_WORKSPACE_CATALOG_PUBLISHED_INVALID',
      'Published catalog is not bound to the opened workspace.');
  }
  normalizedAreas(catalog.includeAreas);
  normalizedLimits(catalog.limits);
  return { root, manifest, catalog, catalogPath };
}

function optionalInteger(value, label, minimum, maximum) {
  if (value === undefined) return undefined;
  return boundedInteger(value, label, minimum, maximum);
}

function normalizedQuery(value = {}) {
  if (!isRecord(value)) {
    fail('PERSISTENT_WORKSPACE_CATALOG_QUERY_INVALID', 'query must be an object.');
  }
  const query = {
    limit: boundedInteger(value.limit ?? 100, 'query.limit', 1, 1_000),
    offset: boundedInteger(value.offset ?? 0, 'query.offset', 0, MAXIMUM_FILES_HARD),
    duplicateOnly: value.duplicateOnly === true,
  };
  for (const field of ['area', 'kind', 'mediaType', 'extension', 'sha256',
    'pathPrefix', 'pathContains']) {
    if (value[field] !== undefined) query[field] = boundedString(value[field], `query.${field}`, 4096);
  }
  if (query.area !== undefined && !WORKSPACE_AREAS.includes(query.area)) {
    fail('PERSISTENT_WORKSPACE_CATALOG_QUERY_INVALID', `Unsupported query area: ${query.area}.`);
  }
  if (query.sha256 !== undefined && !/^[a-f0-9]{64}$/u.test(query.sha256)) {
    fail('PERSISTENT_WORKSPACE_CATALOG_QUERY_INVALID', 'query.sha256 must be lowercase SHA-256.');
  }
  if (query.extension !== undefined && !query.extension.startsWith('.')) {
    fail('PERSISTENT_WORKSPACE_CATALOG_QUERY_INVALID', 'query.extension must start with a dot.');
  }
  for (const field of ['minWidth', 'maxWidth', 'minHeight', 'maxHeight']) {
    const normalized = optionalInteger(value[field], `query.${field}`, 1, 1_000_000);
    if (normalized !== undefined) query[field] = normalized;
  }
  for (const field of ['hasAlpha', 'animated']) {
    if (value[field] !== undefined && typeof value[field] !== 'boolean') {
      fail('PERSISTENT_WORKSPACE_CATALOG_QUERY_INVALID', `query.${field} must be boolean.`);
    }
    if (value[field] !== undefined) query[field] = value[field];
  }
  return query;
}

function matchesQuery(entry, query, duplicatePaths) {
  if (query.area !== undefined && entry.area !== query.area) return false;
  if (query.kind !== undefined && entry.kind !== query.kind) return false;
  if (query.mediaType !== undefined && entry.mediaType !== query.mediaType) return false;
  if (query.extension !== undefined && entry.extension !== query.extension.toLowerCase()) return false;
  if (query.sha256 !== undefined && entry.sha256 !== query.sha256) return false;
  if (query.pathPrefix !== undefined && !entry.path.startsWith(query.pathPrefix)) return false;
  if (query.pathContains !== undefined && !entry.path.includes(query.pathContains)) return false;
  if (query.duplicateOnly && !duplicatePaths.has(entry.path)) return false;
  if (query.hasAlpha !== undefined && entry.image?.hasAlpha !== query.hasAlpha) return false;
  if (query.animated !== undefined && entry.image?.animated !== query.animated) return false;
  if (query.minWidth !== undefined && !(entry.image?.width >= query.minWidth)) return false;
  if (query.maxWidth !== undefined && !(entry.image?.width <= query.maxWidth)) return false;
  if (query.minHeight !== undefined && !(entry.image?.height >= query.minHeight)) return false;
  if (query.maxHeight !== undefined && !(entry.image?.height <= query.maxHeight)) return false;
  return true;
}

export async function queryWorkspaceCatalog({ workspaceRoot, catalogId, query = {} }) {
  const { catalog } = await loadPublishedCatalog(workspaceRoot, catalogId);
  const normalized = normalizedQuery(query);
  const duplicatePaths = new Set(catalog.duplicateGroups.flatMap((group) => group.paths));
  const matches = catalog.entries.filter((entry) => matchesQuery(entry, normalized, duplicatePaths));
  const entries = matches.slice(normalized.offset, normalized.offset + normalized.limit);
  return withDocumentHash({
    schema: WORKSPACE_CATALOG_QUERY_RESULT_SCHEMA,
    catalogId: catalog.catalogId,
    catalogSha256: catalog.documentSha256,
    workspaceId: catalog.workspaceId,
    projectId: catalog.projectId,
    query: normalized,
    totalMatches: matches.length,
    returned: entries.length,
    hasMore: normalized.offset + entries.length < matches.length,
    entries,
    authority: fixedAuthority(false),
  });
}

function mapEntries(entries) {
  return new Map(entries.map((entry) => [entry.path, entry]));
}

function boundedDifferences(items) {
  return {
    items: items.slice(0, MAXIMUM_DIFFERENCE_ITEMS),
    count: items.length,
    truncated: items.length > MAXIMUM_DIFFERENCE_ITEMS,
  };
}

export async function verifyWorkspaceCatalog({ workspaceRoot, catalogId }) {
  const { root, manifest, catalog } = await loadPublishedCatalog(workspaceRoot, catalogId);
  const includeAreas = normalizedAreas(catalog.includeAreas);
  const limits = normalizedLimits(catalog.limits);
  const observed = await scanWorkspace(root, includeAreas, limits);
  const expectedMap = mapEntries(catalog.entries);
  const observedMap = mapEntries(observed.entries);
  const missing = [];
  const changed = [];
  const unexpected = [];
  for (const [entryPath, expected] of expectedMap) {
    const current = observedMap.get(entryPath);
    if (!current) {
      missing.push(entryPath);
      continue;
    }
    if (canonicalJson(current) !== canonicalJson(expected)) {
      changed.push({ path: entryPath, expected, observed: current });
    }
  }
  for (const entryPath of observedMap.keys()) {
    if (!expectedMap.has(entryPath)) unexpected.push(entryPath);
  }
  missing.sort();
  changed.sort((left, right) => left.path.localeCompare(right.path));
  unexpected.sort();
  const current = missing.length === 0 && changed.length === 0 && unexpected.length === 0 &&
    canonicalJson(observed.duplicateGroups) === canonicalJson(catalog.duplicateGroups) &&
    canonicalJson(observed.statistics) === canonicalJson(catalog.statistics) &&
    manifest.documentSha256 === catalog.workspaceManifestSha256;
  return withDocumentHash({
    schema: WORKSPACE_CATALOG_VERIFICATION_SCHEMA,
    catalogId: catalog.catalogId,
    catalogSha256: catalog.documentSha256,
    workspaceId: catalog.workspaceId,
    projectId: catalog.projectId,
    verifiedAt: new Date().toISOString(),
    current,
    missing: boundedDifferences(missing),
    changed: boundedDifferences(changed),
    unexpected: boundedDifferences(unexpected),
    observedStatistics: observed.statistics,
    expectedStatistics: catalog.statistics,
    authority: fixedAuthority(false),
  });
}
