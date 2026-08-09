import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  opendir,
  readFile,
  realpath,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_MAXIMUM_JSON_BYTES = 16 * 1024 * 1024;
export const DEFAULT_MAXIMUM_HASH_BYTES = 2 * 1024 * 1024 * 1024;
export const DEFAULT_MAXIMUM_FILES = 50_000;
export const DEFAULT_MAXIMUM_TEXT_BYTES = 4 * 1024 * 1024;

export class ProjectArtError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProjectArtError';
    this.code = code;
  }
}

export function fail(code, message) {
  throw new ProjectArtError(code, message);
}

export function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      fail('PROJECT_ART_CANONICAL_JSON_INVALID', 'Canonical JSON cannot contain non-finite numbers.');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  fail(
    'PROJECT_ART_CANONICAL_JSON_INVALID',
    `Unsupported canonical JSON value: ${typeof value}.`,
  );
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function withDocumentHash(input, field = 'documentSha256') {
  if (!isRecord(input)) {
    fail('PROJECT_ART_DOCUMENT_INVALID', 'Document must be an object.');
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
    fail('PROJECT_ART_DOCUMENT_INVALID', 'Document must be an object.');
  }
  const digest = document[field];
  if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/u.test(digest)) {
    fail('PROJECT_ART_DOCUMENT_HASH_INVALID', `${field} must be a lowercase SHA-256 digest.`);
  }
  const unhashed = { ...document };
  delete unhashed[field];
  const observed = sha256(canonicalJson(unhashed));
  if (observed !== digest) {
    fail('PROJECT_ART_DOCUMENT_HASH_MISMATCH', `${field} does not match canonical document bytes.`);
  }
  return digest;
}

export function safeId(value, label = 'id') {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 160 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
  ) {
    fail(
      'PROJECT_ART_ID_INVALID',
      `${label} must be 1-160 characters using letters, numbers, dot, underscore, colon, or hyphen.`,
    );
  }
  return value;
}

export function canonicalRelativePath(value, label = 'path') {
  if (typeof value !== 'string' || value.length < 1 || value.length > 4096) {
    fail('PROJECT_ART_PATH_INVALID', `${label} must be a non-empty bounded string.`);
  }
  if (value.includes('\0') || value.includes('\\')) {
    fail('PROJECT_ART_PATH_INVALID', `${label} must use forward slashes and contain no NUL.`);
  }
  const candidate = path.posix.normalize(value);
  if (
    candidate !== value ||
    candidate === '.' ||
    candidate === '..' ||
    candidate.startsWith('../') ||
    candidate.startsWith('/') ||
    /^[A-Za-z]:/u.test(candidate)
  ) {
    fail('PROJECT_ART_PATH_INVALID', `${label} must be a canonical relative path.`);
  }
  return candidate;
}

export function forwardSlash(value) {
  return value.split(path.sep).join('/');
}

export function boundedInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(
      'PROJECT_ART_INTEGER_INVALID',
      `${label} must be a safe integer from ${minimum} through ${maximum}.`,
    );
  }
  return value;
}

export function boundedNumber(value, label, minimum, maximum) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    fail(
      'PROJECT_ART_NUMBER_INVALID',
      `${label} must be a finite number from ${minimum} through ${maximum}.`,
    );
  }
  return value;
}

export function boundedString(value, label, maximum = 16_384, { allowEmpty = false } = {}) {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.trim().length === 0) ||
    value.length > maximum ||
    value.includes('\0')
  ) {
    fail('PROJECT_ART_STRING_INVALID', `${label} must be a bounded string.`);
  }
  return value;
}

export async function readJsonFileBounded(
  filePath,
  label = 'JSON file',
  maximumBytes = DEFAULT_MAXIMUM_JSON_BYTES,
) {
  const metadata = await stat(filePath);
  if (!metadata.isFile() || metadata.size > maximumBytes) {
    fail(
      'PROJECT_ART_JSON_INVALID',
      `${label} must be a regular file no larger than ${maximumBytes} bytes.`,
    );
  }
  const bytes = await readFile(filePath);
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, ''));
  } catch (error) {
    fail('PROJECT_ART_JSON_INVALID', `${label} is not valid JSON: ${error.message}`);
  }
  return { value, bytes };
}

export async function writeJsonCreateOnly(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const handle = await open(filePath, 'wx');
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  } finally {
    await handle.close();
  }
}

export async function requireDirectoryNoSymlink(directoryPath, label = 'directory') {
  const lexical = path.resolve(directoryPath);
  const metadata = await lstat(lexical);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    fail('PROJECT_ART_ROOT_INVALID', `${label} must be an existing non-symbolic directory.`);
  }
  return realpath(lexical);
}

async function rejectSymbolicComponents(root, relative, { requireLeaf = true } = {}) {
  const parts = relative.split('/');
  let current = root;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    let metadata;
    try {
      metadata = await lstat(current);
    } catch (error) {
      if (error?.code === 'ENOENT' && !requireLeaf && index === parts.length - 1) {
        return current;
      }
      throw error;
    }
    if (metadata.isSymbolicLink()) {
      fail('PROJECT_ART_PATH_SYMLINK', `Symbolic path components are not allowed: ${current}`);
    }
    if (index < parts.length - 1 && !metadata.isDirectory()) {
      fail('PROJECT_ART_PATH_INVALID', `Non-directory path component encountered: ${current}`);
    }
  }
  return current;
}

export async function resolveExistingWithinRoot(root, relative, label = 'source') {
  const canonical = canonicalRelativePath(relative, label);
  const candidate = await rejectSymbolicComponents(root, canonical, { requireLeaf: true });
  const metadata = await lstat(candidate);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    fail('PROJECT_ART_SOURCE_INVALID', `${label} must resolve to a regular non-symbolic file.`);
  }
  const resolved = await realpath(candidate);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootPrefix)) {
    fail('PROJECT_ART_PATH_ESCAPE', `${label} escaped its declared root.`);
  }
  return { absolutePath: resolved, relativePath: canonical, metadata };
}

export async function resolveFutureWithinRoot(root, relative, label = 'target') {
  const canonical = canonicalRelativePath(relative, label);
  const parentRelative = path.posix.dirname(canonical);
  if (parentRelative !== '.') {
    const parent = await rejectSymbolicComponents(root, parentRelative, { requireLeaf: false });
    const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    const lexicalParent = path.resolve(parent);
    if (lexicalParent !== root && !lexicalParent.startsWith(rootPrefix)) {
      fail('PROJECT_ART_PATH_ESCAPE', `${label} escaped its declared root.`);
    }
  }
  return { absolutePath: path.join(root, ...canonical.split('/')), relativePath: canonical };
}

export async function hashFileBounded(
  filePath,
  maximumBytes = DEFAULT_MAXIMUM_HASH_BYTES,
) {
  const metadata = await stat(filePath);
  if (!metadata.isFile()) {
    fail('PROJECT_ART_SOURCE_INVALID', `Cannot hash non-file path: ${filePath}`);
  }
  if (metadata.size > maximumBytes) {
    fail(
      'PROJECT_ART_SOURCE_TOO_LARGE',
      `File exceeds the ${maximumBytes}-byte hashing boundary: ${filePath}`,
    );
  }
  const digest = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => digest.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return { sha256: digest.digest('hex'), bytes: metadata.size };
}

export const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.apng',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.tga',
  '.svg',
  '.dds',
  '.ktx',
  '.ktx2',
]);

export const SOURCE_ART_EXTENSIONS = new Set([
  '.psd',
  '.psb',
  '.kra',
  '.xcf',
  '.ora',
  '.ase',
  '.aseprite',
  '.ai',
  '.eps',
  '.blend',
  '.clip',
  '.sai',
]);

export const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.json',
  '.jsonc',
  '.yaml',
  '.yml',
  '.toml',
  '.xml',
  '.csv',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.html',
  '.htm',
  '.gd',
  '.tscn',
  '.tres',
  '.godot',
  '.cs',
  '.shader',
  '.compute',
  '.prefab',
  '.unity',
  '.asset',
  '.meta',
  '.ini',
  '.uproject',
  '.uplugin',
  '.cpp',
  '.h',
  '.hpp',
  '.py',
  '.lua',
]);

export function mediaTypeFromPath(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.png':
    case '.apng':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.bmp':
      return 'image/bmp';
    case '.tga':
      return 'image/x-tga';
    case '.svg':
      return 'image/svg+xml';
    case '.dds':
      return 'image/vnd-ms.dds';
    case '.ktx':
      return 'image/ktx';
    case '.ktx2':
      return 'image/ktx2';
    default:
      return 'application/octet-stream';
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
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker) &&
      length >= 8
    ) {
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

export function inspectImageHeader(buffer, filePath = '') {
  const extension = path.extname(filePath).toLowerCase();
  if (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    const colourType = buffer[25];
    const text = buffer.toString('latin1');
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
    const bitsPerPixel = buffer.readUInt16LE(28);
    return {
      format: 'bmp',
      width: Math.abs(buffer.readInt32LE(18)),
      height: Math.abs(buffer.readInt32LE(22)),
      hasAlpha: bitsPerPixel === 32,
      animated: false,
    };
  }
  if (buffer.length >= 18 && extension === '.tga') {
    const bitsPerPixel = buffer[16];
    return {
      format: 'tga',
      width: buffer.readUInt16LE(12),
      height: buffer.readUInt16LE(14),
      hasAlpha: bitsPerPixel === 32 || (buffer[17] & 0x0f) > 0,
      animated: false,
    };
  }
  if (buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buffer.toString('ascii', 12, 16);
    if (kind === 'VP8X' && buffer.length >= 30) {
      return {
        format: 'webp',
        width: 1 + readUInt24LE(buffer, 24),
        height: 1 + readUInt24LE(buffer, 27),
        hasAlpha: Boolean(buffer[20] & 0x10),
        animated: Boolean(buffer[20] & 0x02),
      };
    }
    if (kind === 'VP8 ' && buffer.length >= 30) {
      return {
        format: 'webp',
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
        hasAlpha: false,
        animated: false,
      };
    }
    if (kind === 'VP8L' && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21);
      return {
        format: 'webp',
        width: 1 + (bits & 0x3fff),
        height: 1 + ((bits >> 14) & 0x3fff),
        hasAlpha: true,
        animated: false,
      };
    }
  }
  if (extension === '.svg') {
    const text = buffer.toString('utf8', 0, Math.min(buffer.length, 256 * 1024));
    const svg = text.match(/<svg\b[^>]*>/iu)?.[0] || '';
    const width = svg.match(/\bwidth=["']([0-9.]+)(?:px)?["']/iu)?.[1];
    const height = svg.match(/\bheight=["']([0-9.]+)(?:px)?["']/iu)?.[1];
    const viewBox = svg.match(/\bviewBox=["'][^"']*?([0-9.]+)[ ,]+([0-9.]+)["']/iu);
    const parsedWidth = width ? Math.round(Number(width)) : viewBox ? Math.round(Number(viewBox[1])) : null;
    const parsedHeight = height ? Math.round(Number(height)) : viewBox ? Math.round(Number(viewBox[2])) : null;
    return {
      format: 'svg',
      width: Number.isFinite(parsedWidth) ? parsedWidth : null,
      height: Number.isFinite(parsedHeight) ? parsedHeight : null,
      hasAlpha: true,
      animated: /<(?:animate|animateTransform|set)\b/iu.test(text),
    };
  }
  if (buffer.length >= 128 && buffer.toString('ascii', 0, 4) === 'DDS ') {
    return {
      format: 'dds',
      width: buffer.readUInt32LE(16),
      height: buffer.readUInt32LE(12),
      hasAlpha: true,
      animated: false,
    };
  }
  const ktx1 = Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ktx2 = Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length >= 44 && buffer.subarray(0, 12).equals(ktx1)) {
    return {
      format: 'ktx',
      width: buffer.readUInt32LE(36),
      height: buffer.readUInt32LE(40),
      hasAlpha: true,
      animated: false,
    };
  }
  if (buffer.length >= 28 && buffer.subarray(0, 12).equals(ktx2)) {
    return {
      format: 'ktx2',
      width: buffer.readUInt32LE(20),
      height: buffer.readUInt32LE(24),
      hasAlpha: true,
      animated: false,
    };
  }
  return null;
}

export async function inspectImageFile(filePath, maximumHeaderBytes = 512 * 1024) {
  const metadata = await stat(filePath);
  const handle = await open(filePath, 'r');
  try {
    const length = Math.min(metadata.size, maximumHeaderBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, 0);
    return inspectImageHeader(buffer, filePath);
  } finally {
    await handle.close();
  }
}

export const DEFAULT_EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  '.next',
  'dist',
  'build',
  'out',
  'coverage',
  '.cache',
  '.turbo',
  '.vercel',
  '.godot',
  'Library',
  'Temp',
  'Logs',
  'obj',
  'bin',
  'Binaries',
  'DerivedDataCache',
  'Intermediate',
  'Saved',
]);

export async function walkFilesBounded(
  root,
  {
    maximumFiles = DEFAULT_MAXIMUM_FILES,
    excludedDirectories = DEFAULT_EXCLUDED_DIRECTORIES,
  } = {},
) {
  boundedInteger(maximumFiles, 'maximumFiles', 1, 1_000_000);
  const results = [];
  const stack = [{ absolute: root, relative: '' }];
  while (stack.length > 0) {
    const current = stack.pop();
    const directory = await opendir(current.absolute);
    const entries = [];
    for await (const entry of directory) entries.push(entry);
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries.reverse()) {
      const relative = current.relative
        ? `${current.relative}/${entry.name}`
        : entry.name;
      const absolute = path.join(current.absolute, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!excludedDirectories.has(entry.name)) {
          stack.push({ absolute, relative });
        }
        continue;
      }
      if (!entry.isFile()) continue;
      results.push({ absolutePath: absolute, relativePath: relative });
      if (results.length > maximumFiles) {
        fail(
          'PROJECT_ART_SCAN_LIMIT',
          `File scan exceeded the configured ${maximumFiles}-file limit.`,
        );
      }
    }
  }
  results.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return results;
}

export function parseCliArguments(argv, { repeated = new Set() } = {}) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      result._.push(token);
      continue;
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      result[key] = true;
      continue;
    }
    index += 1;
    if (repeated.has(key)) {
      result[key] = [...(result[key] || []), value];
    } else if (result[key] !== undefined) {
      fail('PROJECT_ART_ARGUMENT_INVALID', `Argument --${key} may be supplied only once.`);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function parseRootBinding(value) {
  boundedString(value, 'art-root', 8192);
  const separator = value.indexOf('=');
  if (separator < 1 || separator === value.length - 1) {
    fail('PROJECT_ART_ARGUMENT_INVALID', '--art-root must use id=path form.');
  }
  return {
    id: safeId(value.slice(0, separator), 'art-root id'),
    path: value.slice(separator + 1),
  };
}

export function timestamp(value, label = 'timestamp') {
  if (typeof value !== 'string') {
    fail('PROJECT_ART_TIME_INVALID', `${label} must be a canonical UTC timestamp.`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    fail('PROJECT_ART_TIME_INVALID', `${label} must be a canonical UTC timestamp.`);
  }
  return value;
}
