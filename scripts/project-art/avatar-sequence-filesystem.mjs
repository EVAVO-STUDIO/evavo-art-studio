import {
  constants as fsConstants,
  closeSync,
  createReadStream,
  lstatSync,
  openSync,
  readSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

import {
  LIMITS,
  MAXIMUM_IMAGE_DIMENSION,
  PNG_SIGNATURE,
  canonicalPath,
  fail,
} from './avatar-sequence-common.mjs';

function snapshot(metadata) {
  return Object.freeze({
    mode: metadata.mode,
    device: metadata.dev,
    inode: metadata.ino,
    links: metadata.nlink,
    size: metadata.size,
    modifiedMs: metadata.mtimeMs,
    changedMs: metadata.ctimeMs,
  });
}

function sameSnapshot(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key]);
}

function regularFile(value, label, maximumBytes) {
  let metadata;
  try {
    metadata = lstatSync(value);
  } catch {
    fail('PROJECT_ART_AVATAR_SEQUENCE_FILE_MISSING', `${label} is missing.`);
  }
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    metadata.nlink !== 1 ||
    metadata.size < 33 ||
    metadata.size > maximumBytes
  ) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_FILE_UNSAFE',
      `${label} must be a bounded, single-link regular file.`,
    );
  }
  return snapshot(metadata);
}

function directory(value, label) {
  const resolved = path.resolve(value);
  let metadata;
  try {
    metadata = lstatSync(resolved);
  } catch {
    fail('PROJECT_ART_AVATAR_SEQUENCE_DIRECTORY_MISSING', `${label} is missing.`);
  }
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_DIRECTORY_UNSAFE',
      `${label} must be a non-symbolic directory.`,
    );
  }
  return resolved;
}

function resolveSource(root, relative, label) {
  const canonical = canonicalPath(relative, label);
  let current = root;
  for (const segment of canonical.split('/')) {
    current = path.join(current, segment);
    let metadata;
    try {
      metadata = lstatSync(current);
    } catch {
      fail('PROJECT_ART_AVATAR_SEQUENCE_FILE_MISSING', `${label} is missing.`);
    }
    if (metadata.isSymbolicLink()) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_PATH_SYMLINK',
        `${label} contains a symbolic path component.`,
      );
    }
  }
  const absolute = path.resolve(current);
  const relation = path.relative(root, absolute);
  if (relation.startsWith('..') || path.isAbsolute(relation) || absolute === root) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_PATH_ESCAPE', `${label} escaped workspace-root.`);
  }
  return Object.freeze({ canonical, absolute });
}

function assertTargetAvailable(root, relative, sourceAbsolute, label) {
  const canonical = canonicalPath(relative, label);
  let current = root;
  const segments = canonical.split('/');
  for (let index = 0; index < segments.length - 1; index += 1) {
    current = path.join(current, segments[index]);
    let metadata;
    try {
      metadata = lstatSync(current);
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    if (metadata.isSymbolicLink()) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_PATH_SYMLINK',
        `${label} contains a symbolic path component.`,
      );
    }
    if (!metadata.isDirectory()) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_TARGET_PATH_INVALID',
        `${label} contains a non-directory parent.`,
      );
    }
  }
  const target = path.resolve(root, ...segments);
  if (target === sourceAbsolute) return;
  try {
    lstatSync(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  fail(
    'PROJECT_ART_AVATAR_SEQUENCE_TARGET_EXISTS',
    `${label} already exists; mastering copies are create-only.`,
  );
}

async function stableHash(value, label) {
  const before = regularFile(value, label, LIMITS.maximumSourceBytes);
  let bytes = 0;
  const digestValue = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(value, {
      flags: fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
      highWaterMark: 1024 * 1024,
    });
    stream.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > LIMITS.maximumSourceBytes) {
        stream.destroy(new Error('source byte boundary exceeded'));
        return;
      }
      digestValue.update(chunk);
    });
    stream.on('error', reject);
    stream.on('end', resolve);
  }).catch((error) => {
    fail(
      'PROJECT_ART_AVATAR_SEQUENCE_FILE_READ_FAILED',
      `${label} could not be read safely: ${error.message}`,
    );
  });
  const after = regularFile(value, label, LIMITS.maximumSourceBytes);
  if (!sameSnapshot(before, after) || bytes !== before.size) {
    fail('PROJECT_ART_AVATAR_SEQUENCE_FILE_CHANGED', `${label} changed during read.`);
  }
  return Object.freeze({ sha256: digestValue.digest('hex'), bytes });
}

function pngHeader(value, label) {
  const metadata = regularFile(value, label, LIMITS.maximumSourceBytes);
  const descriptor = openSync(
    value,
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
  );
  try {
    const headerBytes = Math.min(metadata.size, 1024 * 1024);
    const header = Buffer.alloc(headerBytes);
    if (readSync(descriptor, header, 0, header.length, 0) !== header.length) {
      fail('PROJECT_ART_AVATAR_SEQUENCE_PNG_INVALID', `${label} could not be read.`);
    }
    if (
      header.length < 33 ||
      !header.subarray(0, 8).equals(PNG_SIGNATURE) ||
      header.readUInt32BE(8) !== 13 ||
      header.toString('ascii', 12, 16) !== 'IHDR' ||
      header.includes(Buffer.from('acTL', 'ascii'))
    ) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_PNG_INVALID',
        `${label} must be a non-animated PNG master.`,
      );
    }
    const width = header.readUInt32BE(16);
    const height = header.readUInt32BE(20);
    const bitDepth = header[24];
    const colourType = header[25];
    const compression = header[26];
    const filter = header[27];
    const interlace = header[28];
    if (
      width < 1 ||
      height < 1 ||
      width > MAXIMUM_IMAGE_DIMENSION ||
      height > MAXIMUM_IMAGE_DIMENSION ||
      width * height > LIMITS.maximumDecodedPixels ||
      bitDepth !== 8 ||
      ![4, 6].includes(colourType) ||
      compression !== 0 ||
      filter !== 0 ||
      interlace !== 0
    ) {
      fail(
        'PROJECT_ART_AVATAR_SEQUENCE_PNG_INVALID',
        `${label} must be a non-interlaced 8-bit alpha PNG master.`,
      );
    }
    return Object.freeze({
      format: 'png',
      width,
      height,
      bitDepth,
      colourType,
      alphaChannel: true,
      animated: false,
      interlaced: false,
    });
  } finally {
    closeSync(descriptor);
  }
}


export {
  assertTargetAvailable,
  directory,
  pngHeader,
  regularFile,
  resolveSource,
  sameSnapshot,
  snapshot,
  stableHash,
};
