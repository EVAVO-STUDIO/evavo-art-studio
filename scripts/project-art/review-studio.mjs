import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, constants as fsConstants } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import path from 'node:path';

export const REVIEW_REQUEST_SCHEMA = 'evavo.project-art-review-request.v1';
export const REVIEW_PLAN_SCHEMA = 'evavo.project-art-review-plan.v1';
export const REVIEW_BUNDLE_SCHEMA = 'evavo.project-art-review-bundle.v1';
export const REVIEW_DRAFT_SCHEMA = 'evavo.project-art-review-decisions-draft.v1';
export const REVIEW_DECISIONS_SCHEMA = 'evavo.project-art-review-decisions.v1';
export const REVIEW_RECEIPT_SCHEMA = 'evavo.project-art-review-receipt.v1';

export const REVIEW_GATES = Object.freeze([
  'technical',
  'styleConsistency',
  'identityContinuity',
  'animationContinuity',
  'historicalAccuracy',
  'composition',
  'gameplayReadability',
  'runtimeReadiness',
]);

export const REVIEW_GATE_STATUSES = Object.freeze([
  'pass',
  'fail',
  'not-reviewed',
  'not-applicable',
]);

export const REVIEW_DISPOSITIONS = Object.freeze([
  'keep',
  'edit',
  'recreate',
  'generate-variation',
  'reference-only',
  'reject',
]);

const REVIEW_GROUP_KINDS = new Set([
  'comparison',
  'candidate-set',
  'animation',
  'atlas',
  'reference',
  'general',
]);
const REVIEW_ITEM_ROLES = new Set([
  'baseline',
  'candidate',
  'reference',
  'frame',
  'mask',
  'overlay',
  'atlas',
  'other',
]);
const REVIEWER_MODES = new Set([
  'human',
  'agent-assisted',
  'automated-technical',
  'hybrid',
]);
const PREVIEWABLE_EXTENSIONS = new Set([
  '.png',
  '.apng',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.svg',
]);
const DEFAULT_MAXIMUM_FILE_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAXIMUM_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const DEFAULT_MAXIMUM_JSON_BYTES = 16 * 1024 * 1024;
const AUTHORITY_KEYS = Object.freeze([
  'providerExecution',
  'runtimeSubmission',
  'candidateApproval',
  'candidatePromotion',
  'sourceMutation',
  'sourceDeletion',
  'targetRepositoryMutation',
  'gitCommit',
  'gitPush',
  'deployment',
  'publication',
  'forcePush',
]);

function falseAuthority() {
  return Object.fromEntries(AUTHORITY_KEYS.map((key) => [key, false]));
}

export class ProjectArtReviewError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProjectArtReviewError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ProjectArtReviewError(code, message);
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
      fail('PROJECT_ART_REVIEW_CANONICAL_JSON_INVALID', 'Canonical JSON cannot contain non-finite numbers.');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  fail(
    'PROJECT_ART_REVIEW_CANONICAL_JSON_INVALID',
    `Unsupported canonical JSON value: ${typeof value}.`,
  );
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function withSelfHash(value, field) {
  if (!isRecord(value)) fail('PROJECT_ART_REVIEW_DOCUMENT_INVALID', 'Document must be an object.');
  const body = { ...value };
  delete body[field];
  return Object.freeze({ ...body, [field]: sha256(canonicalJson(body)) });
}

function verifySelfHash(value, field) {
  if (!isRecord(value)) fail('PROJECT_ART_REVIEW_DOCUMENT_INVALID', 'Document must be an object.');
  const expected = value[field];
  if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/u.test(expected)) {
    fail('PROJECT_ART_REVIEW_HASH_INVALID', `${field} must be a lowercase SHA-256 digest.`);
  }
  const body = { ...value };
  delete body[field];
  const observed = sha256(canonicalJson(body));
  if (observed !== expected) {
    fail('PROJECT_ART_REVIEW_HASH_MISMATCH', `${field} does not match canonical document bytes.`);
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
    fail('PROJECT_ART_REVIEW_STRING_INVALID', `${label} must be a bounded string.`);
  }
  return value;
}

function boundedInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(
      'PROJECT_ART_REVIEW_INTEGER_INVALID',
      `${label} must be a safe integer from ${minimum} through ${maximum}.`,
    );
  }
  return value;
}

function safeId(value, label = 'id') {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 160 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
  ) {
    fail(
      'PROJECT_ART_REVIEW_ID_INVALID',
      `${label} must use 1-160 letters, numbers, dots, underscores, colons, or hyphens.`,
    );
  }
  return value;
}

function safeFileId(value) {
  return value.replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'item';
}

function canonicalRelativePath(value, label = 'path') {
  boundedString(value, label, 4096);
  if (value.includes('\\')) {
    fail('PROJECT_ART_REVIEW_PATH_INVALID', `${label} must use forward slashes.`);
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
    fail('PROJECT_ART_REVIEW_PATH_INVALID', `${label} must be a canonical relative path.`);
  }
  return normalized;
}

function canonicalTimestamp(value, label) {
  boundedString(value, label, 64);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail('PROJECT_ART_REVIEW_TIMESTAMP_INVALID', `${label} must be a canonical UTC timestamp.`);
  }
  return value;
}

async function readJsonBounded(filePath, label, maximumBytes = DEFAULT_MAXIMUM_JSON_BYTES) {
  const metadata = await lstat(filePath);
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size > maximumBytes) {
    fail(
      'PROJECT_ART_REVIEW_JSON_INVALID',
      `${label} must be a non-symbolic regular file no larger than ${maximumBytes} bytes.`,
    );
  }
  const bytes = await readFile(filePath);
  try {
    return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, ''));
  } catch (error) {
    fail('PROJECT_ART_REVIEW_JSON_INVALID', `${label} is not valid JSON: ${error.message}`);
  }
}

async function writeTextCreateOnly(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const handle = await open(filePath, 'wx');
  try {
    await handle.writeFile(content, 'utf8');
  } finally {
    await handle.close();
  }
}

async function writeJsonCreateOnly(filePath, value) {
  await writeTextCreateOnly(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function requireDirectoryNoSymlink(directoryPath, label) {
  const lexical = path.resolve(directoryPath);
  const metadata = await lstat(lexical);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    fail('PROJECT_ART_REVIEW_ROOT_INVALID', `${label} must be an existing non-symbolic directory.`);
  }
  return realpath(lexical);
}

function insideRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function resolveExistingWithinRoot(root, relative, label) {
  const canonical = canonicalRelativePath(relative, label);
  const parts = canonical.split('/');
  let current = root;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) {
      fail('PROJECT_ART_REVIEW_PATH_SYMLINK', `${label} contains a symbolic-link component.`);
    }
    if (index < parts.length - 1 && !metadata.isDirectory()) {
      fail('PROJECT_ART_REVIEW_PATH_INVALID', `${label} contains a non-directory component.`);
    }
  }
  const metadata = await lstat(current);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    fail('PROJECT_ART_REVIEW_SOURCE_INVALID', `${label} must resolve to a regular file.`);
  }
  const resolved = await realpath(current);
  if (!insideRoot(root, resolved)) {
    fail('PROJECT_ART_REVIEW_PATH_ESCAPE', `${label} escaped the workspace root.`);
  }
  return { absolutePath: resolved, relativePath: canonical, metadata };
}

async function resolveOutputWithinRoot(root, outputRoot) {
  let relative;
  if (path.isAbsolute(outputRoot)) {
    const absolute = path.resolve(outputRoot);
    if (!insideRoot(root, absolute) || absolute === root) {
      fail('PROJECT_ART_REVIEW_OUTPUT_INVALID', 'Output root must be a child of the workspace root.');
    }
    relative = path.relative(root, absolute).split(path.sep).join('/');
  } else {
    relative = canonicalRelativePath(outputRoot, 'outputRoot');
  }
  const canonical = canonicalRelativePath(relative, 'outputRoot');
  const parts = canonical.split('/');
  let current = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    current = path.join(current, parts[index]);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) {
        fail('PROJECT_ART_REVIEW_PATH_SYMLINK', 'Output root contains a symbolic-link component.');
      }
      if (!metadata.isDirectory()) {
        fail('PROJECT_ART_REVIEW_OUTPUT_INVALID', 'Output root contains a non-directory component.');
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      await mkdir(current);
    }
  }
  return { absolutePath: path.join(root, ...parts), relativePath: canonical };
}

async function ensureAbsent(filePath, label) {
  try {
    await lstat(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  fail('PROJECT_ART_REVIEW_CREATE_ONLY', `${label} already exists.`);
}

async function hashFileBounded(filePath, maximumBytes = DEFAULT_MAXIMUM_FILE_BYTES) {
  const metadata = await stat(filePath);
  if (!metadata.isFile() || metadata.size > maximumBytes) {
    fail(
      'PROJECT_ART_REVIEW_SOURCE_TOO_LARGE',
      `File must be regular and no larger than ${maximumBytes} bytes: ${filePath}`,
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

function mediaTypeFromPath(filePath) {
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
    case '.svg':
      return 'image/svg+xml';
    case '.tga':
      return 'image/x-tga';
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
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && length >= 8) {
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
  if (
    buffer.length >= 26 &&
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
    return {
      format: 'bmp',
      width: Math.abs(buffer.readInt32LE(18)),
      height: Math.abs(buffer.readInt32LE(22)),
      hasAlpha: buffer.readUInt16LE(28) === 32,
      animated: false,
    };
  }
  if (
    buffer.length >= 30 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
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
  return null;
}

async function inspectImageFile(filePath) {
  const metadata = await stat(filePath);
  const handle = await open(filePath, 'r');
  try {
    const length = Math.min(metadata.size, 512 * 1024);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, 0);
    return inspectImageHeader(buffer, filePath);
  } finally {
    await handle.close();
  }
}

function uniqueStringArray(value, label, maximumItems = 128, maximumLength = 4096) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximumItems) {
    fail('PROJECT_ART_REVIEW_ARRAY_INVALID', `${label} must be a bounded array.`);
  }
  const observed = new Set();
  return value.map((entry, index) => {
    const text = boundedString(entry, `${label}[${index}]`, maximumLength).trim();
    if (observed.has(text)) {
      fail('PROJECT_ART_REVIEW_ARRAY_DUPLICATE', `${label} contains a duplicate value.`);
    }
    observed.add(text);
    return text;
  });
}

function defaultGatesForKind(kind) {
  if (kind === 'animation') {
    return [
      'technical',
      'styleConsistency',
      'identityContinuity',
      'animationContinuity',
      'gameplayReadability',
      'runtimeReadiness',
    ];
  }
  if (kind === 'atlas') {
    return ['technical', 'gameplayReadability', 'runtimeReadiness'];
  }
  return ['technical', 'styleConsistency', 'composition', 'runtimeReadiness'];
}

function normalizeRequiredGates(value, kind, label) {
  const gates = value === undefined ? defaultGatesForKind(kind) : uniqueStringArray(value, label, 8, 64);
  for (const gate of gates) {
    if (!REVIEW_GATES.includes(gate)) {
      fail('PROJECT_ART_REVIEW_GATE_INVALID', `${label} contains unsupported gate ${gate}.`);
    }
  }
  return gates;
}

function validateUi(value) {
  if (value === undefined) {
    return {
      defaultBackground: 'checker',
      defaultFit: 'contain',
      defaultMode: 'grid',
      showPixelGrid: false,
      allowLinearSampling: true,
    };
  }
  if (!isRecord(value)) fail('PROJECT_ART_REVIEW_UI_INVALID', 'ui must be an object.');
  const defaultBackground = value.defaultBackground ?? 'checker';
  if (!['checker', 'white', 'black', 'chroma'].includes(defaultBackground)) {
    fail('PROJECT_ART_REVIEW_UI_INVALID', 'ui.defaultBackground is unsupported.');
  }
  const defaultFit = value.defaultFit ?? 'contain';
  if (!['contain', 'actual'].includes(defaultFit)) {
    fail('PROJECT_ART_REVIEW_UI_INVALID', 'ui.defaultFit is unsupported.');
  }
  const defaultMode = value.defaultMode ?? 'grid';
  if (!['grid', 'single', 'split', 'overlay', 'difference', 'flicker', 'animation'].includes(defaultMode)) {
    fail('PROJECT_ART_REVIEW_UI_INVALID', 'ui.defaultMode is unsupported.');
  }
  return {
    defaultBackground,
    defaultFit,
    defaultMode,
    showPixelGrid: value.showPixelGrid === true,
    allowLinearSampling: value.allowLinearSampling !== false,
  };
}

function validateGroupShape(group, label) {
  if (!isRecord(group)) fail('PROJECT_ART_REVIEW_GROUP_INVALID', `${label} must be an object.`);
  const id = safeId(group.id, `${label}.id`);
  const kind = boundedString(group.kind, `${label}.kind`, 64);
  if (!REVIEW_GROUP_KINDS.has(kind)) {
    fail('PROJECT_ART_REVIEW_GROUP_INVALID', `${label}.kind is unsupported.`);
  }
  const title = boundedString(group.title ?? id, `${label}.title`, 512);
  const description = boundedString(group.description ?? '', `${label}.description`, 8192, {
    allowEmpty: true,
  });
  const requiredGates = normalizeRequiredGates(group.requiredGates, kind, `${label}.requiredGates`);
  if (!Array.isArray(group.items) || group.items.length < 1 || group.items.length > 256) {
    fail('PROJECT_ART_REVIEW_GROUP_INVALID', `${label}.items must contain 1-256 entries.`);
  }
  const playback = isRecord(group.playback)
    ? {
        frameDurationMs: boundedInteger(
          group.playback.frameDurationMs ?? 83,
          `${label}.playback.frameDurationMs`,
          16,
          10_000,
        ),
        loop: group.playback.loop !== false,
      }
    : { frameDurationMs: 83, loop: true };
  return { id, kind, title, description, requiredGates, playback };
}

function validateGroupSemantics(group, label) {
  const roles = group.items.map((item) => item.role);
  if (group.kind === 'comparison' && (!roles.includes('baseline') || !roles.includes('candidate'))) {
    fail('PROJECT_ART_REVIEW_GROUP_INVALID', `${label} requires baseline and candidate items.`);
  }
  if (group.kind === 'candidate-set' && roles.filter((role) => role === 'candidate').length < 2) {
    fail('PROJECT_ART_REVIEW_GROUP_INVALID', `${label} requires at least two candidates.`);
  }
  if (group.kind === 'animation') {
    if (group.items.length < 2 || group.items.some((item) => item.role !== 'frame')) {
      fail('PROJECT_ART_REVIEW_GROUP_INVALID', `${label} requires at least two frame items.`);
    }
    const indexes = group.items.map((item) => item.frameIndex);
    if (new Set(indexes).size !== indexes.length) {
      fail('PROJECT_ART_REVIEW_GROUP_INVALID', `${label} frameIndex values must be unique.`);
    }
  }
  if (group.kind === 'atlas' && !roles.includes('atlas')) {
    fail('PROJECT_ART_REVIEW_GROUP_INVALID', `${label} requires an atlas item.`);
  }
}

export async function compileProjectArtReview(request, options = {}) {
  if (!isRecord(request) || request.schema !== REVIEW_REQUEST_SCHEMA) {
    fail('PROJECT_ART_REVIEW_REQUEST_INVALID', `Request schema must be ${REVIEW_REQUEST_SCHEMA}.`);
  }
  const reviewId = safeId(request.reviewId, 'reviewId');
  const projectId = safeId(request.projectId, 'projectId');
  const title = boundedString(request.title ?? reviewId, 'title', 512);
  const purpose = boundedString(request.purpose ?? '', 'purpose', 8192, { allowEmpty: true });
  const workspaceRoot = await requireDirectoryNoSymlink(options.workspaceRoot, 'workspaceRoot');
  const compiledAt = canonicalTimestamp(options.compiledAt ?? new Date().toISOString(), 'compiledAt');
  const maximumFileBytes = boundedInteger(
    options.maximumFileBytes ?? DEFAULT_MAXIMUM_FILE_BYTES,
    'maximumFileBytes',
    1,
    DEFAULT_MAXIMUM_FILE_BYTES,
  );
  const maximumTotalBytes = boundedInteger(
    options.maximumTotalBytes ?? DEFAULT_MAXIMUM_TOTAL_BYTES,
    'maximumTotalBytes',
    1,
    DEFAULT_MAXIMUM_TOTAL_BYTES,
  );
  if (!Array.isArray(request.groups) || request.groups.length < 1 || request.groups.length > 64) {
    fail('PROJECT_ART_REVIEW_REQUEST_INVALID', 'groups must contain 1-64 entries.');
  }
  const groupIds = new Set();
  const itemIds = new Set();
  let totalBytes = 0;
  let totalItems = 0;
  const groups = [];
  for (let groupIndex = 0; groupIndex < request.groups.length; groupIndex += 1) {
    const rawGroup = request.groups[groupIndex];
    const groupLabel = `groups[${groupIndex}]`;
    const shape = validateGroupShape(rawGroup, groupLabel);
    if (groupIds.has(shape.id)) {
      fail('PROJECT_ART_REVIEW_GROUP_DUPLICATE', `Duplicate group id: ${shape.id}.`);
    }
    groupIds.add(shape.id);
    const items = [];
    for (let itemIndex = 0; itemIndex < rawGroup.items.length; itemIndex += 1) {
      const rawItem = rawGroup.items[itemIndex];
      const itemLabel = `${groupLabel}.items[${itemIndex}]`;
      if (!isRecord(rawItem)) fail('PROJECT_ART_REVIEW_ITEM_INVALID', `${itemLabel} must be an object.`);
      const id = safeId(rawItem.id, `${itemLabel}.id`);
      if (itemIds.has(id)) {
        fail('PROJECT_ART_REVIEW_ITEM_DUPLICATE', `Duplicate item id: ${id}.`);
      }
      itemIds.add(id);
      const role = boundedString(rawItem.role ?? 'other', `${itemLabel}.role`, 64);
      if (!REVIEW_ITEM_ROLES.has(role)) {
        fail('PROJECT_ART_REVIEW_ITEM_INVALID', `${itemLabel}.role is unsupported.`);
      }
      const source = canonicalRelativePath(rawItem.source, `${itemLabel}.source`);
      const resolved = await resolveExistingWithinRoot(workspaceRoot, source, `${itemLabel}.source`);
      const identity = await hashFileBounded(resolved.absolutePath, maximumFileBytes);
      totalBytes += identity.bytes;
      if (totalBytes > maximumTotalBytes) {
        fail('PROJECT_ART_REVIEW_TOTAL_TOO_LARGE', 'Review source bytes exceed maximumTotalBytes.');
      }
      if (
        rawItem.expectedSha256 !== undefined &&
        (typeof rawItem.expectedSha256 !== 'string' || rawItem.expectedSha256 !== identity.sha256)
      ) {
        fail('PROJECT_ART_REVIEW_SOURCE_HASH_MISMATCH', `${itemLabel}.expectedSha256 changed.`);
      }
      const extension = path.extname(source).toLowerCase();
      const image = await inspectImageFile(resolved.absolutePath);
      const frameIndex = rawItem.frameIndex === undefined
        ? null
        : boundedInteger(rawItem.frameIndex, `${itemLabel}.frameIndex`, 0, 100_000);
      if (shape.kind === 'animation' && frameIndex === null) {
        fail('PROJECT_ART_REVIEW_ITEM_INVALID', `${itemLabel}.frameIndex is required for animation.`);
      }
      const assetPath = [
        'assets',
        `${String(groupIndex + 1).padStart(2, '0')}-${safeFileId(shape.id)}`,
        `${String(itemIndex + 1).padStart(3, '0')}-${safeFileId(id)}-${identity.sha256.slice(0, 12)}${extension || '.bin'}`,
      ].join('/');
      items.push({
        id,
        role,
        label: boundedString(rawItem.label ?? id, `${itemLabel}.label`, 512),
        notes: boundedString(rawItem.notes ?? '', `${itemLabel}.notes`, 8192, { allowEmpty: true }),
        source,
        assetPath,
        sha256: identity.sha256,
        sizeBytes: identity.bytes,
        mediaType: mediaTypeFromPath(source),
        previewable: PREVIEWABLE_EXTENSIONS.has(extension),
        frameIndex,
        image,
      });
      totalItems += 1;
      if (totalItems > 512) {
        fail('PROJECT_ART_REVIEW_REQUEST_INVALID', 'A review may contain at most 512 items.');
      }
    }
    if (shape.kind === 'animation') {
      items.sort((left, right) => left.frameIndex - right.frameIndex || left.id.localeCompare(right.id));
    }
    const group = { ...shape, items };
    validateGroupSemantics(group, groupLabel);
    groups.push(group);
  }
  const plan = {
    schema: REVIEW_PLAN_SCHEMA,
    reviewId,
    projectId,
    title,
    purpose,
    compiledAt,
    workspaceRoot,
    sourceSummary: {
      groupCount: groups.length,
      itemCount: totalItems,
      totalBytes,
      maximumFileBytes,
      maximumTotalBytes,
    },
    ui: validateUi(request.ui),
    groups,
    authority: falseAuthority(),
  };
  return withSelfHash(plan, 'planSha256');
}

export async function compileProjectArtReviewFile(requestPath, outputPath, options = {}) {
  const request = await readJsonBounded(requestPath, 'review request');
  const plan = await compileProjectArtReview(request, options);
  await writeJsonCreateOnly(outputPath, plan);
  return plan;
}

function browserData(plan) {
  return {
    schema: REVIEW_BUNDLE_SCHEMA,
    reviewId: plan.reviewId,
    projectId: plan.projectId,
    title: plan.title,
    purpose: plan.purpose,
    compiledAt: plan.compiledAt,
    planSha256: plan.planSha256,
    gates: REVIEW_GATES,
    gateStatuses: REVIEW_GATE_STATUSES,
    dispositions: REVIEW_DISPOSITIONS,
    ui: plan.ui,
    groups: plan.groups.map((group) => ({
      id: group.id,
      kind: group.kind,
      title: group.title,
      description: group.description,
      requiredGates: group.requiredGates,
      playback: group.playback,
      items: group.items.map((item) => ({
        id: item.id,
        role: item.role,
        label: item.label,
        notes: item.notes,
        source: item.source,
        assetPath: item.assetPath,
        sha256: item.sha256,
        sizeBytes: item.sizeBytes,
        mediaType: item.mediaType,
        previewable: item.previewable,
        frameIndex: item.frameIndex,
        image: item.image,
      })),
    })),
  };
}

function decisionTemplate(plan) {
  return {
    schema: REVIEW_DRAFT_SCHEMA,
    reviewId: plan.reviewId,
    projectId: plan.projectId,
    planSha256: plan.planSha256,
    reviewer: {
      mode: 'human',
      id: '',
      reviewedAt: '',
      reason: '',
    },
    decisions: plan.groups.flatMap((group) =>
      group.items.map((item) => ({
        groupId: group.id,
        itemId: item.id,
        sourceSha256: item.sha256,
        disposition: null,
        gates: Object.fromEntries(REVIEW_GATES.map((gate) => [gate, 'not-reviewed'])),
        strengths: [],
        preserve: [],
        defects: [],
        requiredChanges: [],
        avoid: [],
        notes: '',
      })),
    ),
  };
}

const INDEX_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data: blob:; media-src 'self'; style-src 'self'; script-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'">
  <title>EVAVO Project Art Review</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app" class="app-shell" aria-live="polite"></div>
  <script src="review-data.js"></script>
  <script src="app.js"></script>
</body>
</html>
`;

const STYLES_CSS = `:root {
  color-scheme: dark;
  --bg: #070709;
  --panel: #111115;
  --panel-2: #17171d;
  --line: #2a2a34;
  --muted: #9898a6;
  --text: #f5f5f7;
  --accent: #ff244e;
  --good: #49d17d;
  --warn: #ffbf47;
  --bad: #ff5c70;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--text); }
button, select, input, textarea { font: inherit; color: inherit; }
button, select, input[type="text"], textarea {
  border: 1px solid var(--line); background: var(--panel-2); border-radius: 8px;
}
button { cursor: pointer; padding: 8px 11px; }
button:hover, button:focus-visible { border-color: var(--accent); outline: none; }
button[aria-pressed="true"], .is-active { background: var(--accent); border-color: var(--accent); color: #fff; }
.app-shell { min-height: 100vh; display: grid; grid-template-columns: 270px minmax(0, 1fr) 360px; }
.sidebar, .review-panel { background: var(--panel); border-color: var(--line); overflow: auto; max-height: 100vh; position: sticky; top: 0; }
.sidebar { border-right: 1px solid var(--line); padding: 18px; }
.review-panel { border-left: 1px solid var(--line); padding: 18px; }
.brand { font-weight: 900; letter-spacing: .16em; font-size: 13px; color: var(--accent); }
.title { font-size: 22px; line-height: 1.1; margin: 12px 0 8px; }
.muted { color: var(--muted); }
.meta { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; overflow-wrap: anywhere; }
.group-list { display: grid; gap: 8px; margin-top: 20px; }
.group-button { text-align: left; display: grid; gap: 3px; width: 100%; }
.group-button span:last-child { color: var(--muted); font-size: 12px; }
.main { min-width: 0; padding: 16px; }
.toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 10px; position: sticky; top: 8px; z-index: 5; }
.toolbar .spacer { flex: 1; }
.stage { margin-top: 14px; border: 1px solid var(--line); border-radius: 14px; min-height: calc(100vh - 98px); overflow: hidden; position: relative; }
.stage-bg-checker { background-color: #c9c9c9; background-image: linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%); background-size: 24px 24px; background-position: 0 0,0 12px,12px -12px,-12px 0; }
.stage-bg-white { background: #fff; }
.stage-bg-black { background: #000; }
.stage-bg-chroma { background: #00b140; }
.canvas { min-height: calc(100vh - 100px); padding: 20px; overflow: auto; }
.grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(240px,1fr)); gap: 14px; }
.card { background: rgba(8,8,10,.92); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.card.is-selected { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb,var(--accent) 30%,transparent); }
.image-wrap { min-height: 220px; display: grid; place-items: center; overflow: auto; position: relative; }
.image-wrap.pixel-grid::after { content: ""; position: absolute; inset: 0; pointer-events: none; background-image: linear-gradient(to right,rgba(255,255,255,.16) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,.16) 1px,transparent 1px); background-size: 8px 8px; }
.review-image { display: block; max-width: 100%; max-height: 70vh; transform-origin: center; }
.review-image.sampling-pixel { image-rendering: pixelated; }
.review-image.fit-actual { max-width: none; max-height: none; }
.card-copy { padding: 12px; background: var(--panel); }
.card-copy strong { display: block; }
.card-copy dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; margin: 10px 0 0; font-size: 12px; }
.card-copy dt { color: var(--muted); }
.card-copy dd { margin: 0; overflow-wrap: anywhere; }
.focus-view { min-height: 70vh; display: grid; place-items: center; position: relative; overflow: auto; }
.split-view { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--line); }
.split-pane { min-height: 70vh; display: grid; place-items: center; overflow: auto; position: relative; }
.overlay-view { min-height: 70vh; display: grid; place-items: center; position: relative; overflow: auto; }
.overlay-view img { grid-area: 1 / 1; }
.overlay-view.difference img:last-child { mix-blend-mode: difference; opacity: 1 !important; }
.empty-preview { background: rgba(0,0,0,.72); padding: 18px; border-radius: 10px; text-align: center; }
.thumbnail-strip { position: absolute; left: 12px; right: 12px; bottom: 12px; display: flex; gap: 8px; overflow-x: auto; padding: 8px; background: rgba(0,0,0,.76); border-radius: 10px; }
.thumb { flex: 0 0 auto; width: 82px; height: 82px; object-fit: contain; border: 2px solid transparent; background: #111; }
.thumb.is-selected { border-color: var(--accent); }
.panel-section { border-top: 1px solid var(--line); padding-top: 16px; margin-top: 16px; }
.field { display: grid; gap: 6px; margin: 10px 0; }
.field label, .gate-row label { font-size: 12px; color: var(--muted); }
.field input, .field textarea, .field select, .gate-row select { width: 100%; padding: 9px; }
.field textarea { min-height: 74px; resize: vertical; }
.gates { display: grid; gap: 8px; }
.gate-row { display: grid; grid-template-columns: minmax(0,1fr) 130px; gap: 8px; align-items: center; }
.status { padding: 10px; border-radius: 8px; background: var(--panel-2); margin-top: 12px; font-size: 12px; }
.progress { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.progress-meter { flex: 1; height: 6px; border-radius: 99px; overflow: hidden; background: var(--line); }
.progress-meter span { display: block; height: 100%; background: var(--accent); }
.hidden { display: none !important; }
@media (max-width: 1180px) {
  .app-shell { grid-template-columns: 220px minmax(0,1fr); }
  .review-panel { grid-column: 1 / -1; position: static; max-height: none; border-left: 0; border-top: 1px solid var(--line); }
}
@media (max-width: 760px) {
  .app-shell { display: block; }
  .sidebar, .review-panel { position: static; max-height: none; border: 0; border-bottom: 1px solid var(--line); }
  .split-view { grid-template-columns: 1fr; }
}
`;

const APP_JS = `(() => {
  'use strict';
  const data = window.__EVAVO_REVIEW__;
  const template = window.__EVAVO_REVIEW_TEMPLATE__;
  if (!data || !template) throw new Error('Review bundle data is missing.');
  const state = {
    groupIndex: 0,
    selectedItemId: data.groups[0].items[0].id,
    mode: data.ui.defaultMode,
    background: data.ui.defaultBackground,
    fit: data.ui.defaultFit,
    sampling: 'pixel',
    pixelGrid: data.ui.showPixelGrid,
    zoom: 100,
    overlayOpacity: 50,
    playing: false,
    animationIndex: 0,
    timer: null,
    draft: structuredClone(template),
  };
  const app = document.getElementById('app');
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const lines = (value) => value.split(/\\r?\\n/u).map((entry) => entry.trim()).filter(Boolean);
  const currentGroup = () => data.groups[state.groupIndex];
  const currentItem = () => currentGroup().items.find((item) => item.id === state.selectedItemId) || currentGroup().items[0];
  const decisionFor = (itemId) => state.draft.decisions.find((decision) => decision.itemId === itemId);
  const imageNode = (item) => {
    if (!item.previewable) {
      const fallback = el('div', 'empty-preview');
      fallback.append(el('strong', '', item.label), el('p', 'muted', 'This format is retained and hash-bound but is not browser-previewable.'));
      return fallback;
    }
    const image = el('img', 'review-image');
    image.src = item.assetPath;
    image.alt = item.label;
    image.loading = 'eager';
    image.classList.toggle('sampling-pixel', state.sampling === 'pixel');
    image.classList.toggle('fit-actual', state.fit === 'actual');
    image.style.transform = 'scale(' + (state.zoom / 100) + ')';
    return image;
  };
  const imageWrap = (item) => {
    const wrap = el('div', 'image-wrap');
    wrap.classList.toggle('pixel-grid', state.pixelGrid);
    wrap.append(imageNode(item));
    return wrap;
  };
  const metadata = (item) => {
    const copy = el('div', 'card-copy');
    copy.append(el('strong', '', item.label), el('div', 'muted', item.role));
    const dl = el('dl');
    const pairs = [
      ['Source', item.source],
      ['SHA-256', item.sha256],
      ['Bytes', String(item.sizeBytes)],
      ['Media', item.mediaType],
      ['Size', item.image && item.image.width ? item.image.width + ' × ' + item.image.height : 'unknown'],
    ];
    for (const [name, value] of pairs) {
      dl.append(el('dt', '', name), el('dd', 'meta', value));
    }
    copy.append(dl);
    return copy;
  };
  const renderGrid = (canvas, group) => {
    const grid = el('div', 'grid');
    for (const item of group.items) {
      const card = el('button', 'card');
      card.type = 'button';
      card.classList.toggle('is-selected', item.id === state.selectedItemId);
      card.append(imageWrap(item), metadata(item));
      card.addEventListener('click', () => { state.selectedItemId = item.id; render(); });
      grid.append(card);
    }
    canvas.append(grid);
  };
  const thumbnailStrip = (group) => {
    const strip = el('div', 'thumbnail-strip');
    for (const item of group.items) {
      const button = el('button');
      button.type = 'button';
      button.title = item.label;
      button.className = 'thumb' + (item.id === state.selectedItemId ? ' is-selected' : '');
      if (item.previewable) {
        const image = el('img');
        image.src = item.assetPath;
        image.alt = item.label;
        image.className = 'thumb';
        image.classList.toggle('sampling-pixel', state.sampling === 'pixel');
        button.replaceChildren(image);
      } else {
        button.textContent = item.label.slice(0, 10);
      }
      button.addEventListener('click', () => { state.selectedItemId = item.id; render(); });
      strip.append(button);
    }
    return strip;
  };
  const baselineAndCandidate = (group) => {
    const baseline = group.items.find((item) => item.role === 'baseline') || group.items[0];
    const selected = currentItem();
    return [baseline, selected.id === baseline.id ? group.items.find((item) => item.id !== baseline.id) || baseline : selected];
  };
  const renderFocused = (canvas, group) => {
    if (state.mode === 'animation') return renderAnimation(canvas, group);
    const [baseline, selected] = baselineAndCandidate(group);
    if (state.mode === 'split') {
      const split = el('div', 'split-view');
      for (const item of [baseline, selected]) {
        const pane = el('div', 'split-pane');
        pane.classList.toggle('pixel-grid', state.pixelGrid);
        pane.append(imageNode(item));
        split.append(pane);
      }
      canvas.append(split, thumbnailStrip(group));
      return;
    }
    if (['overlay', 'difference', 'flicker'].includes(state.mode)) {
      const overlay = el('div', 'overlay-view' + (state.mode === 'difference' ? ' difference' : ''));
      overlay.classList.toggle('pixel-grid', state.pixelGrid);
      const first = imageNode(baseline);
      const second = imageNode(selected);
      second.style.opacity = String(state.overlayOpacity / 100);
      if (state.mode === 'flicker') {
        second.style.opacity = state.animationIndex % 2 === 0 ? '0' : '1';
      }
      overlay.append(first, second);
      canvas.append(overlay, thumbnailStrip(group));
      return;
    }
    const focus = el('div', 'focus-view');
    focus.classList.toggle('pixel-grid', state.pixelGrid);
    focus.append(imageNode(currentItem()), thumbnailStrip(group));
    canvas.append(focus);
  };
  const stopTimer = () => {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  };
  const startTimer = () => {
    stopTimer();
    if (!state.playing) return;
    const group = currentGroup();
    const duration = state.mode === 'flicker' ? 350 : group.playback.frameDurationMs;
    state.timer = setInterval(() => {
      state.animationIndex += 1;
      if (state.mode === 'animation') {
        const frames = group.items.filter((item) => item.role === 'frame');
        if (!group.playback.loop && state.animationIndex >= frames.length) {
          state.animationIndex = frames.length - 1;
          state.playing = false;
          stopTimer();
        }
      }
      renderStageOnly();
    }, duration);
  };
  const renderAnimation = (canvas, group) => {
    const frames = group.items.filter((item) => item.role === 'frame');
    if (frames.length < 1) {
      canvas.append(el('div', 'empty-preview', 'This group has no frame items.'));
      return;
    }
    const frame = frames[state.animationIndex % frames.length];
    const focus = el('div', 'focus-view');
    focus.classList.toggle('pixel-grid', state.pixelGrid);
    focus.append(imageNode(frame), thumbnailStrip(group));
    canvas.append(focus);
  };
  const renderStageOnly = () => {
    const stage = document.querySelector('.stage');
    if (!stage) return render();
    const canvas = el('div', 'canvas');
    const group = currentGroup();
    if (state.mode === 'grid') renderGrid(canvas, group);
    else renderFocused(canvas, group);
    stage.replaceChildren(canvas);
    stage.className = 'stage stage-bg-' + state.background;
    updateSelectedHeader();
  };
  const updateSelectedHeader = () => {
    const selected = document.querySelector('[data-selected-name]');
    if (selected) selected.textContent = currentItem().label;
  };
  const modeButton = (mode, label) => {
    const button = el('button', '', label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(state.mode === mode));
    button.addEventListener('click', () => {
      stopTimer();
      state.mode = mode;
      state.animationIndex = 0;
      state.playing = false;
      render();
    });
    return button;
  };
  const selectControl = (label, values, selected, onChange) => {
    const select = el('select');
    select.title = label;
    for (const value of values) {
      const option = el('option', '', value.label);
      option.value = value.value;
      option.selected = value.value === selected;
      select.append(option);
    }
    select.addEventListener('change', () => onChange(select.value));
    return select;
  };
  const renderSidebar = () => {
    const sidebar = el('aside', 'sidebar');
    sidebar.append(
      el('div', 'brand', 'EVAVO ART STUDIO'),
      el('h1', 'title', data.title),
      el('p', 'muted', data.purpose || 'Exact project-art review'),
      el('div', 'meta', 'Plan ' + data.planSha256),
    );
    const list = el('div', 'group-list');
    data.groups.forEach((group, index) => {
      const button = el('button', 'group-button');
      button.type = 'button';
      button.classList.toggle('is-active', index === state.groupIndex);
      button.append(el('span', '', group.title), el('span', '', group.kind + ' · ' + group.items.length + ' items'));
      button.addEventListener('click', () => {
        stopTimer();
        state.groupIndex = index;
        state.selectedItemId = group.items[0].id;
        state.animationIndex = 0;
        state.playing = false;
        state.mode = group.kind === 'animation' ? 'animation' : data.ui.defaultMode;
        render();
      });
      list.append(button);
    });
    sidebar.append(list);
    const completed = state.draft.decisions.filter((decision) => data.dispositions.includes(decision.disposition)).length;
    const progress = el('div', 'progress');
    const meter = el('div', 'progress-meter');
    const fill = el('span');
    fill.style.width = (100 * completed / state.draft.decisions.length) + '%';
    meter.append(fill);
    progress.append(meter, el('span', 'meta', completed + '/' + state.draft.decisions.length));
    sidebar.append(progress);
    return sidebar;
  };
  const renderToolbar = () => {
    const toolbar = el('div', 'toolbar');
    toolbar.append(
      modeButton('grid', 'Grid'),
      modeButton('single', 'Single'),
      modeButton('split', 'Split'),
      modeButton('overlay', 'Overlay'),
      modeButton('difference', 'Difference'),
      modeButton('flicker', 'Flicker'),
      modeButton('animation', 'Animate'),
    );
    const play = el('button', '', state.playing ? 'Pause' : 'Play');
    play.type = 'button';
    play.setAttribute('aria-pressed', String(state.playing));
    play.addEventListener('click', () => {
      state.playing = !state.playing;
      startTimer();
      render();
    });
    toolbar.append(play, el('span', 'spacer'));
    toolbar.append(selectControl('Background', [
      { value: 'checker', label: 'Checker' },
      { value: 'white', label: 'White' },
      { value: 'black', label: 'Black' },
      { value: 'chroma', label: 'Chroma' },
    ], state.background, (value) => { state.background = value; renderStageOnly(); }));
    toolbar.append(selectControl('Fit', [
      { value: 'contain', label: 'Fit' },
      { value: 'actual', label: 'Actual pixels' },
    ], state.fit, (value) => { state.fit = value; renderStageOnly(); }));
    toolbar.append(selectControl('Sampling', [
      { value: 'pixel', label: 'Nearest' },
      { value: 'linear', label: 'Linear' },
    ], state.sampling, (value) => { state.sampling = value; renderStageOnly(); }));
    const grid = el('button', '', 'Pixel grid');
    grid.type = 'button';
    grid.setAttribute('aria-pressed', String(state.pixelGrid));
    grid.addEventListener('click', () => { state.pixelGrid = !state.pixelGrid; render(); });
    toolbar.append(grid);
    const zoom = el('input');
    zoom.type = 'range'; zoom.min = '25'; zoom.max = '800'; zoom.step = '25'; zoom.value = String(state.zoom); zoom.title = 'Zoom';
    zoom.addEventListener('input', () => { state.zoom = Number(zoom.value); renderStageOnly(); });
    toolbar.append(zoom, el('span', 'meta', state.zoom + '%'));
    if (state.mode === 'overlay') {
      const opacity = el('input');
      opacity.type = 'range'; opacity.min = '0'; opacity.max = '100'; opacity.value = String(state.overlayOpacity); opacity.title = 'Overlay opacity';
      opacity.addEventListener('input', () => { state.overlayOpacity = Number(opacity.value); renderStageOnly(); });
      toolbar.append(opacity);
    }
    return toolbar;
  };
  const field = (labelText, value, onInput, type = 'textarea') => {
    const wrap = el('div', 'field');
    const label = el('label', '', labelText);
    const control = el(type);
    if (type === 'textarea') control.value = Array.isArray(value) ? value.join('\\n') : value || '';
    else control.value = value || '';
    control.addEventListener('input', () => onInput(control.value));
    wrap.append(label, control);
    return wrap;
  };
  const renderReviewPanel = () => {
    const panel = el('aside', 'review-panel');
    const item = currentItem();
    const decision = decisionFor(item.id);
    panel.append(el('div', 'brand', 'REVIEW DECISION'), el('h2', 'title', item.label));
    const selectedName = el('div', 'muted', item.role);
    selectedName.dataset.selectedName = 'true';
    panel.append(selectedName, el('div', 'meta', item.sha256));
    const dispositionWrap = el('div', 'field');
    dispositionWrap.append(el('label', '', 'Disposition'));
    const disposition = el('select');
    const empty = el('option', '', 'Select…'); empty.value = '';
    disposition.append(empty);
    for (const value of data.dispositions) {
      const option = el('option', '', value);
      option.value = value;
      option.selected = decision.disposition === value;
      disposition.append(option);
    }
    disposition.addEventListener('change', () => { decision.disposition = disposition.value || null; render(); });
    dispositionWrap.append(disposition);
    panel.append(dispositionWrap);
    const gateSection = el('section', 'panel-section');
    gateSection.append(el('h3', '', 'Review gates'));
    const gates = el('div', 'gates');
    for (const gate of data.gates) {
      const row = el('div', 'gate-row');
      const label = el('label', '', gate + (currentGroup().requiredGates.includes(gate) ? ' *' : ''));
      const select = el('select');
      for (const status of data.gateStatuses) {
        const option = el('option', '', status);
        option.value = status;
        option.selected = decision.gates[gate] === status;
        select.append(option);
      }
      select.addEventListener('change', () => { decision.gates[gate] = select.value; });
      row.append(label, select); gates.append(row);
    }
    gateSection.append(gates); panel.append(gateSection);
    panel.append(
      field('Strengths, one per line', decision.strengths, (value) => { decision.strengths = lines(value); }),
      field('Preserve, one per line', decision.preserve, (value) => { decision.preserve = lines(value); }),
      field('Defects, one per line', decision.defects, (value) => { decision.defects = lines(value); }),
      field('Required changes, one per line', decision.requiredChanges, (value) => { decision.requiredChanges = lines(value); }),
      field('Avoid, one per line', decision.avoid, (value) => { decision.avoid = lines(value); }),
      field('Notes', decision.notes, (value) => { decision.notes = value; }),
    );
    const reviewer = el('section', 'panel-section');
    reviewer.append(el('h3', '', 'Reviewer'));
    const modeWrap = el('div', 'field'); modeWrap.append(el('label', '', 'Mode'));
    const mode = el('select');
    for (const value of ['human','agent-assisted','automated-technical','hybrid']) {
      const option = el('option', '', value); option.value = value; option.selected = state.draft.reviewer.mode === value; mode.append(option);
    }
    mode.addEventListener('change', () => { state.draft.reviewer.mode = mode.value; }); modeWrap.append(mode);
    reviewer.append(modeWrap,
      field('Reviewer ID', state.draft.reviewer.id, (value) => { state.draft.reviewer.id = value; }, 'input'),
      field('Reason / review scope', state.draft.reviewer.reason, (value) => { state.draft.reviewer.reason = value; }),
    );
    panel.append(reviewer);
    const actions = el('section', 'panel-section');
    const exportButton = el('button', '', 'Export review draft');
    exportButton.type = 'button';
    exportButton.addEventListener('click', () => {
      state.draft.reviewer.reviewedAt = new Date().toISOString();
      const blob = new Blob([JSON.stringify(state.draft, null, 2) + '\\n'], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = data.reviewId + '-review-decisions-draft.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      setStatus('Draft exported. Run the governed finalizer to validate and seal it.');
    });
    const importInput = el('input'); importInput.type = 'file'; importInput.accept = 'application/json'; importInput.className = 'hidden';
    importInput.addEventListener('change', async () => {
      const file = importInput.files && importInput.files[0];
      if (!file) return;
      try {
        const candidate = JSON.parse(await file.text());
        if (candidate.schema !== data.schema.replace('bundle','decisions-draft') || candidate.reviewId !== data.reviewId || candidate.planSha256 !== data.planSha256) {
          throw new Error('The draft does not match this exact review plan.');
        }
        state.draft = candidate;
        setStatus('Draft imported.');
        render();
      } catch (error) { setStatus(error.message, true); }
    });
    const importButton = el('button', '', 'Import draft');
    importButton.type = 'button'; importButton.addEventListener('click', () => importInput.click());
    const status = el('div', 'status', 'Export creates a draft only. Finalization performs exact identity and gate validation; it does not approve or promote artwork.');
    status.dataset.status = 'true';
    actions.append(exportButton, importButton, importInput, status);
    panel.append(actions);
    return panel;
  };
  const setStatus = (message, isError = false) => {
    let status = document.querySelector('[data-status]');
    if (!status) return;
    status.textContent = message;
    status.style.color = isError ? 'var(--bad)' : 'var(--good)';
  };
  const renderMain = () => {
    const main = el('main', 'main');
    main.append(renderToolbar());
    const stage = el('section', 'stage stage-bg-' + state.background);
    const canvas = el('div', 'canvas');
    if (state.mode === 'grid') renderGrid(canvas, currentGroup());
    else renderFocused(canvas, currentGroup());
    stage.append(canvas);
    main.append(stage);
    return main;
  };
  const render = () => {
    stopTimer();
    app.replaceChildren(renderSidebar(), renderMain(), renderReviewPanel());
    if (state.playing) startTimer();
  };
  document.addEventListener('keydown', (event) => {
    if (event.target && ['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)) return;
    const group = currentGroup();
    const index = group.items.findIndex((item) => item.id === state.selectedItemId);
    if (event.key === 'ArrowRight') { state.selectedItemId = group.items[(index + 1) % group.items.length].id; render(); }
    if (event.key === 'ArrowLeft') { state.selectedItemId = group.items[(index - 1 + group.items.length) % group.items.length].id; render(); }
    if (event.key === ' ') { event.preventDefault(); state.playing = !state.playing; render(); }
  });
  render();
})();
`;

async function listFiles(root, current = root) {
  const entries = await import('node:fs/promises').then(({ readdir }) => readdir(current, { withFileTypes: true }));
  const results = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) {
      fail('PROJECT_ART_REVIEW_PATH_SYMLINK', 'Generated bundle must not contain symbolic links.');
    }
    if (entry.isDirectory()) results.push(...await listFiles(root, absolute));
    else if (entry.isFile()) results.push(absolute);
  }
  return results;
}

async function fileRecord(root, absolutePath) {
  const identity = await hashFileBounded(absolutePath, DEFAULT_MAXIMUM_FILE_BYTES);
  return {
    path: path.relative(root, absolutePath).split(path.sep).join('/'),
    sha256: identity.sha256,
    sizeBytes: identity.bytes,
  };
}

async function validatePlan(plan) {
  if (!isRecord(plan) || plan.schema !== REVIEW_PLAN_SCHEMA) {
    fail('PROJECT_ART_REVIEW_PLAN_INVALID', `Plan schema must be ${REVIEW_PLAN_SCHEMA}.`);
  }
  verifySelfHash(plan, 'planSha256');
  safeId(plan.reviewId, 'plan.reviewId');
  safeId(plan.projectId, 'plan.projectId');
  canonicalTimestamp(plan.compiledAt, 'plan.compiledAt');
  if (!isRecord(plan.authority)) {
    fail('PROJECT_ART_REVIEW_PLAN_AUTHORITY_INVALID', 'Plan authority must be an object.');
  }
  const observedAuthorityKeys = Object.keys(plan.authority).sort();
  const expectedAuthorityKeys = [...AUTHORITY_KEYS].sort();
  if (
    JSON.stringify(observedAuthorityKeys) !== JSON.stringify(expectedAuthorityKeys) ||
    AUTHORITY_KEYS.some((key) => plan.authority[key] !== false)
  ) {
    fail(
      'PROJECT_ART_REVIEW_PLAN_AUTHORITY_INVALID',
      'Review compilation cannot carry provider, approval, mutation, Git, deployment, publication, or force-push authority.',
    );
  }
  if (!isRecord(plan.sourceSummary)) {
    fail('PROJECT_ART_REVIEW_PLAN_INVALID', 'Plan sourceSummary must be an object.');
  }
  boundedInteger(plan.sourceSummary.maximumFileBytes, 'plan.sourceSummary.maximumFileBytes', 1, DEFAULT_MAXIMUM_FILE_BYTES);
  boundedInteger(plan.sourceSummary.maximumTotalBytes, 'plan.sourceSummary.maximumTotalBytes', 1, DEFAULT_MAXIMUM_TOTAL_BYTES);
  boundedInteger(plan.sourceSummary.totalBytes, 'plan.sourceSummary.totalBytes', 0, plan.sourceSummary.maximumTotalBytes);
  if (!Array.isArray(plan.groups) || plan.groups.length < 1 || plan.groups.length > 64) {
    fail('PROJECT_ART_REVIEW_PLAN_INVALID', 'Plan groups must contain 1-64 entries.');
  }
  const groupIds = new Set();
  const itemIds = new Set();
  let itemCount = 0;
  let totalBytes = 0;
  for (let groupIndex = 0; groupIndex < plan.groups.length; groupIndex += 1) {
    const group = plan.groups[groupIndex];
    const label = `plan.groups[${groupIndex}]`;
    if (!isRecord(group)) fail('PROJECT_ART_REVIEW_PLAN_INVALID', `${label} must be an object.`);
    safeId(group.id, `${label}.id`);
    if (groupIds.has(group.id) || !REVIEW_GROUP_KINDS.has(group.kind)) {
      fail('PROJECT_ART_REVIEW_PLAN_INVALID', `${label} identity or kind is invalid.`);
    }
    groupIds.add(group.id);
    normalizeRequiredGates(group.requiredGates, group.kind, `${label}.requiredGates`);
    if (!Array.isArray(group.items) || group.items.length < 1 || group.items.length > 256) {
      fail('PROJECT_ART_REVIEW_PLAN_INVALID', `${label}.items is invalid.`);
    }
    for (let itemIndex = 0; itemIndex < group.items.length; itemIndex += 1) {
      const item = group.items[itemIndex];
      const itemLabel = `${label}.items[${itemIndex}]`;
      if (!isRecord(item)) fail('PROJECT_ART_REVIEW_PLAN_INVALID', `${itemLabel} must be an object.`);
      safeId(item.id, `${itemLabel}.id`);
      if (itemIds.has(item.id) || !REVIEW_ITEM_ROLES.has(item.role)) {
        fail('PROJECT_ART_REVIEW_PLAN_INVALID', `${itemLabel} identity or role is invalid.`);
      }
      itemIds.add(item.id);
      canonicalRelativePath(item.source, `${itemLabel}.source`);
      canonicalRelativePath(item.assetPath, `${itemLabel}.assetPath`);
      if (!item.assetPath.startsWith('assets/')) {
        fail('PROJECT_ART_REVIEW_PLAN_INVALID', `${itemLabel}.assetPath must remain below assets/.`);
      }
      if (typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(item.sha256)) {
        fail('PROJECT_ART_REVIEW_PLAN_INVALID', `${itemLabel}.sha256 is invalid.`);
      }
      boundedInteger(item.sizeBytes, `${itemLabel}.sizeBytes`, 0, plan.sourceSummary.maximumFileBytes);
      totalBytes += item.sizeBytes;
      itemCount += 1;
    }
    validateGroupSemantics(group, label);
  }
  if (
    itemCount !== plan.sourceSummary.itemCount ||
    plan.groups.length !== plan.sourceSummary.groupCount ||
    totalBytes !== plan.sourceSummary.totalBytes
  ) {
    fail('PROJECT_ART_REVIEW_PLAN_INVALID', 'Plan source summary does not match the exact groups and items.');
  }
  validateUi(plan.ui);
  const root = await requireDirectoryNoSymlink(plan.workspaceRoot, 'plan.workspaceRoot');
  if (root !== plan.workspaceRoot) {
    fail('PROJECT_ART_REVIEW_PLAN_STALE', 'Workspace root identity changed after compilation.');
  }
  return root;
}

export async function buildProjectArtReviewBundle(plan, outputRoot) {
  const workspaceRoot = await validatePlan(plan);
  const output = await resolveOutputWithinRoot(workspaceRoot, outputRoot);
  await ensureAbsent(output.absolutePath, 'Review bundle output');
  const stagingPath = path.join(
    path.dirname(output.absolutePath),
    `.${path.basename(output.absolutePath)}.staging-${process.pid}-${randomUUID()}`,
  );
  await ensureAbsent(stagingPath, 'Review bundle staging path');
  await mkdir(stagingPath);
  try {
    for (const group of plan.groups) {
      for (const item of group.items) {
        const source = await resolveExistingWithinRoot(workspaceRoot, item.source, `source ${item.id}`);
        const identity = await hashFileBounded(source.absolutePath, plan.sourceSummary.maximumFileBytes);
        if (identity.sha256 !== item.sha256 || identity.bytes !== item.sizeBytes) {
          fail('PROJECT_ART_REVIEW_SOURCE_CHANGED', `Source changed after compilation: ${item.source}.`);
        }
        const target = path.join(stagingPath, ...item.assetPath.split('/'));
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(source.absolutePath, target, fsConstants.COPYFILE_EXCL);
        const copied = await hashFileBounded(target, plan.sourceSummary.maximumFileBytes);
        if (copied.sha256 !== item.sha256 || copied.bytes !== item.sizeBytes) {
          fail('PROJECT_ART_REVIEW_COPY_MISMATCH', `Copied review asset changed: ${item.id}.`);
        }
      }
    }
    const data = browserData(plan);
    const template = decisionTemplate(plan);
    const dataSource = `window.__EVAVO_REVIEW__ = ${JSON.stringify(data).replace(/</gu, '\\u003c')};\nwindow.__EVAVO_REVIEW_TEMPLATE__ = ${JSON.stringify(template).replace(/</gu, '\\u003c')};\n`;
    await writeTextCreateOnly(path.join(stagingPath, 'index.html'), INDEX_HTML);
    await writeTextCreateOnly(path.join(stagingPath, 'styles.css'), STYLES_CSS);
    await writeTextCreateOnly(path.join(stagingPath, 'app.js'), APP_JS);
    await writeTextCreateOnly(path.join(stagingPath, 'review-data.js'), dataSource);
    await writeJsonCreateOnly(path.join(stagingPath, 'review-plan.json'), plan);
    await writeJsonCreateOnly(path.join(stagingPath, 'decision-template.json'), template);
    const initialFiles = await listFiles(stagingPath);
    const manifest = withSelfHash({
      schema: REVIEW_BUNDLE_SCHEMA,
      reviewId: plan.reviewId,
      projectId: plan.projectId,
      planSha256: plan.planSha256,
      entrypoint: 'index.html',
      files: await Promise.all(initialFiles.map((file) => fileRecord(stagingPath, file))),
      networkAccessRequired: false,
      externalAssetsRequired: false,
      decisionOutputIsDraftOnly: true,
      authority: plan.authority,
    }, 'manifestSha256');
    await writeJsonCreateOnly(path.join(stagingPath, 'bundle-manifest.json'), manifest);
    const filesWithManifest = await listFiles(stagingPath);
    const receipt = withSelfHash({
      schema: 'evavo.project-art-review-bundle-receipt.v1',
      reviewId: plan.reviewId,
      projectId: plan.projectId,
      planSha256: plan.planSha256,
      manifestSha256: manifest.manifestSha256,
      fileCount: filesWithManifest.length,
      files: await Promise.all(filesWithManifest.map((file) => fileRecord(stagingPath, file))),
      outputPath: output.relativePath,
      sourceMutationPerformed: false,
      sourceDeletionPerformed: false,
      approvalPerformed: false,
      promotionPerformed: false,
      repositoryMutationPerformed: false,
      publicationPerformed: false,
    }, 'receiptSha256');
    await writeJsonCreateOnly(path.join(stagingPath, 'bundle-receipt.json'), receipt);
    await rename(stagingPath, output.absolutePath);
    return { outputRoot: output.absolutePath, manifest, receipt };
  } catch (error) {
    await rm(stagingPath, { recursive: true, force: true });
    throw error;
  }
}

export async function buildProjectArtReviewBundleFile(planPath, outputRoot) {
  const plan = await readJsonBounded(planPath, 'review plan');
  return buildProjectArtReviewBundle(plan, outputRoot);
}

function normalizeDraftStringArray(value, label) {
  return uniqueStringArray(value ?? [], label, 128, 4096);
}

function normalizeDefects(value, label) {
  if (!Array.isArray(value) || value.length > 128) {
    fail('PROJECT_ART_REVIEW_DECISION_INVALID', `${label} must be a bounded array.`);
  }
  return value.map((entry, index) => {
    if (typeof entry === 'string') {
      return {
        id: `defect-${String(index + 1).padStart(3, '0')}`,
        severity: 'major',
        summary: boundedString(entry, `${label}[${index}]`, 4096).trim(),
      };
    }
    if (!isRecord(entry)) {
      fail('PROJECT_ART_REVIEW_DECISION_INVALID', `${label}[${index}] must be text or an object.`);
    }
    const severity = entry.severity ?? 'major';
    if (!['minor', 'major', 'blocking'].includes(severity)) {
      fail('PROJECT_ART_REVIEW_DECISION_INVALID', `${label}[${index}].severity is unsupported.`);
    }
    return {
      id: safeId(entry.id ?? `defect-${String(index + 1).padStart(3, '0')}`, `${label}[${index}].id`),
      severity,
      summary: boundedString(entry.summary, `${label}[${index}].summary`, 4096).trim(),
    };
  });
}

function normalizeGates(value, label) {
  if (!isRecord(value)) fail('PROJECT_ART_REVIEW_DECISION_INVALID', `${label} must be an object.`);
  const gates = {};
  for (const gate of REVIEW_GATES) {
    const status = value[gate];
    if (!REVIEW_GATE_STATUSES.includes(status)) {
      fail('PROJECT_ART_REVIEW_DECISION_INVALID', `${label}.${gate} is unsupported.`);
    }
    gates[gate] = status;
  }
  const extras = Object.keys(value).filter((key) => !REVIEW_GATES.includes(key));
  if (extras.length > 0) {
    fail('PROJECT_ART_REVIEW_DECISION_INVALID', `${label} contains unsupported gates.`);
  }
  return gates;
}

function validateDecisionSemantics(decision, requiredGates, label) {
  for (const gate of requiredGates) {
    if (decision.gates[gate] === 'not-reviewed') {
      fail('PROJECT_ART_REVIEW_REQUIRED_GATE_MISSING', `${label} did not complete required gate ${gate}.`);
    }
  }
  const failed = REVIEW_GATES.filter((gate) => decision.gates[gate] === 'fail');
  if (decision.disposition === 'keep') {
    if (failed.length > 0 || decision.defects.length > 0 || decision.requiredChanges.length > 0) {
      fail('PROJECT_ART_REVIEW_KEEP_INVALID', `${label} cannot keep an item with failures or repair instructions.`);
    }
  }
  if (['edit', 'recreate', 'generate-variation'].includes(decision.disposition)) {
    if (failed.length < 1 || decision.defects.length < 1 || decision.requiredChanges.length < 1) {
      fail(
        'PROJECT_ART_REVIEW_REPAIR_INVALID',
        `${label} requires a failed gate, a defect, and a required change.`,
      );
    }
  }
  if (decision.disposition === 'reject' && decision.defects.length < 1 && decision.notes.trim().length === 0) {
    fail('PROJECT_ART_REVIEW_REJECT_INVALID', `${label} requires a defect or rejection note.`);
  }
}

function expectedItems(plan) {
  return plan.groups.flatMap((group) => group.items.map((item) => ({ group, item })));
}

export async function finalizeProjectArtReview(plan, draft, outputRoot) {
  const workspaceRoot = await validatePlan(plan);
  if (!isRecord(draft) || draft.schema !== REVIEW_DRAFT_SCHEMA) {
    fail('PROJECT_ART_REVIEW_DRAFT_INVALID', `Draft schema must be ${REVIEW_DRAFT_SCHEMA}.`);
  }
  if (
    draft.reviewId !== plan.reviewId ||
    draft.projectId !== plan.projectId ||
    draft.planSha256 !== plan.planSha256
  ) {
    fail('PROJECT_ART_REVIEW_DRAFT_STALE', 'Draft does not bind the exact review plan.');
  }
  if (!isRecord(draft.reviewer)) {
    fail('PROJECT_ART_REVIEW_REVIEWER_INVALID', 'reviewer must be an object.');
  }
  const mode = boundedString(draft.reviewer.mode, 'reviewer.mode', 64);
  if (!REVIEWER_MODES.has(mode)) {
    fail('PROJECT_ART_REVIEW_REVIEWER_INVALID', 'reviewer.mode is unsupported.');
  }
  const reviewer = {
    mode,
    id: boundedString(draft.reviewer.id, 'reviewer.id', 256).trim(),
    reviewedAt: canonicalTimestamp(draft.reviewer.reviewedAt, 'reviewer.reviewedAt'),
    reason: boundedString(draft.reviewer.reason ?? '', 'reviewer.reason', 8192, { allowEmpty: true }).trim(),
  };
  if (!Array.isArray(draft.decisions)) {
    fail('PROJECT_ART_REVIEW_DRAFT_INVALID', 'decisions must be an array.');
  }
  const expected = expectedItems(plan);
  if (draft.decisions.length !== expected.length) {
    fail('PROJECT_ART_REVIEW_DECISION_SET_INVALID', 'Draft must contain exactly one decision for every review item.');
  }
  const rawByItem = new Map();
  for (const raw of draft.decisions) {
    if (!isRecord(raw)) fail('PROJECT_ART_REVIEW_DECISION_INVALID', 'Each decision must be an object.');
    const itemId = safeId(raw.itemId, 'decision.itemId');
    if (rawByItem.has(itemId)) {
      fail('PROJECT_ART_REVIEW_DECISION_SET_INVALID', `Duplicate decision for ${itemId}.`);
    }
    rawByItem.set(itemId, raw);
  }
  const decisions = [];
  for (const [index, { group, item }] of expected.entries()) {
    const raw = rawByItem.get(item.id);
    if (!raw || raw.groupId !== group.id || raw.sourceSha256 !== item.sha256) {
      fail('PROJECT_ART_REVIEW_DECISION_IDENTITY_MISMATCH', `Decision identity changed for ${item.id}.`);
    }
    const disposition = raw.disposition;
    if (!REVIEW_DISPOSITIONS.includes(disposition)) {
      fail('PROJECT_ART_REVIEW_DECISION_INVALID', `Decision ${item.id} has no valid disposition.`);
    }
    const decision = {
      groupId: group.id,
      itemId: item.id,
      sourceSha256: item.sha256,
      disposition,
      gates: normalizeGates(raw.gates, `decisions[${index}].gates`),
      strengths: normalizeDraftStringArray(raw.strengths, `decisions[${index}].strengths`),
      preserve: normalizeDraftStringArray(raw.preserve, `decisions[${index}].preserve`),
      defects: normalizeDefects(raw.defects ?? [], `decisions[${index}].defects`),
      requiredChanges: normalizeDraftStringArray(raw.requiredChanges, `decisions[${index}].requiredChanges`),
      avoid: normalizeDraftStringArray(raw.avoid, `decisions[${index}].avoid`),
      notes: boundedString(raw.notes ?? '', `decisions[${index}].notes`, 16_384, { allowEmpty: true }).trim(),
    };
    validateDecisionSemantics(decision, group.requiredGates, `decision ${item.id}`);
    decisions.push(decision);
  }
  const sealed = withSelfHash({
    schema: REVIEW_DECISIONS_SCHEMA,
    reviewId: plan.reviewId,
    projectId: plan.projectId,
    planSha256: plan.planSha256,
    reviewer,
    decisions,
    independentApprovalPerformed: false,
    candidatePromotionPerformed: false,
    repositoryMutationPerformed: false,
    publicationPerformed: false,
  }, 'decisionSha256');
  const counts = Object.fromEntries(REVIEW_DISPOSITIONS.map((value) => [value, 0]));
  for (const decision of decisions) counts[decision.disposition] += 1;
  const nextActions = {
    independentApprovalCandidates: decisions.filter((entry) => entry.disposition === 'keep').map((entry) => entry.itemId),
    repairCandidates: decisions.filter((entry) => ['edit', 'recreate', 'generate-variation'].includes(entry.disposition)).map((entry) => entry.itemId),
    retainedReferenceOnly: decisions.filter((entry) => entry.disposition === 'reference-only').map((entry) => entry.itemId),
    rejected: decisions.filter((entry) => entry.disposition === 'reject').map((entry) => entry.itemId),
  };
  const receipt = withSelfHash({
    schema: REVIEW_RECEIPT_SCHEMA,
    reviewId: plan.reviewId,
    projectId: plan.projectId,
    planSha256: plan.planSha256,
    decisionSha256: sealed.decisionSha256,
    reviewedAt: reviewer.reviewedAt,
    reviewerMode: reviewer.mode,
    itemCount: decisions.length,
    dispositionCounts: counts,
    nextActions,
    authority: falseAuthority(),
  }, 'receiptSha256');
  const output = await resolveOutputWithinRoot(workspaceRoot, outputRoot);
  await ensureAbsent(output.absolutePath, 'Final review output');
  const stagingPath = path.join(
    path.dirname(output.absolutePath),
    `.${path.basename(output.absolutePath)}.staging-${process.pid}-${randomUUID()}`,
  );
  await ensureAbsent(stagingPath, 'Final review staging path');
  await mkdir(stagingPath);
  try {
    await writeJsonCreateOnly(path.join(stagingPath, 'review-decisions.json'), sealed);
    await writeJsonCreateOnly(path.join(stagingPath, 'review-receipt.json'), receipt);
    await rename(stagingPath, output.absolutePath);
    return { outputRoot: output.absolutePath, decisions: sealed, receipt };
  } catch (error) {
    await rm(stagingPath, { recursive: true, force: true });
    throw error;
  }
}

export async function finalizeProjectArtReviewFiles(planPath, draftPath, outputRoot) {
  const plan = await readJsonBounded(planPath, 'review plan');
  const draft = await readJsonBounded(draftPath, 'review decision draft');
  return finalizeProjectArtReview(plan, draft, outputRoot);
}

export function projectArtReviewCapabilities() {
  return Object.freeze({
    schema: 'evavo.project-art-review-capabilities.v1',
    requestSchema: REVIEW_REQUEST_SCHEMA,
    planSchema: REVIEW_PLAN_SCHEMA,
    bundleSchema: REVIEW_BUNDLE_SCHEMA,
    draftSchema: REVIEW_DRAFT_SCHEMA,
    decisionsSchema: REVIEW_DECISIONS_SCHEMA,
    receiptSchema: REVIEW_RECEIPT_SCHEMA,
    groupKinds: [...REVIEW_GROUP_KINDS],
    gates: REVIEW_GATES,
    gateStatuses: REVIEW_GATE_STATUSES,
    dispositions: REVIEW_DISPOSITIONS,
    visualModes: ['grid', 'single', 'split', 'overlay', 'difference', 'flicker', 'animation'],
    backgrounds: ['checker', 'white', 'black', 'chroma'],
    sourceIdentity: 'sha256-and-byte-length',
    bundle: {
      offline: true,
      createOnly: true,
      atomic: true,
      externalNetworkRequired: false,
      browserDraftOnly: true,
      finalizationRequired: true,
    },
    authority: falseAuthority(),
  });
}
