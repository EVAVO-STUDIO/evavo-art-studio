import { createHash } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const MAXIMUM_INPUT_BYTES = 8 * 1024 * 1024;

export function failTopHatProviderRuntimeCli(code, message = code) {
  const error = new Error(message === code ? code : `${code}: ${message}`);
  error.code = code;
  throw error;
}

function absolutePath(value, label) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 4096 ||
    value.includes('\0') ||
    !path.isAbsolute(value)
  ) {
    failTopHatProviderRuntimeCli(
      'TOP_HAT_PROVIDER_RUNTIME_CLI_PATH_INVALID',
      `${label} must be an absolute path.`,
    );
  }
  return path.normalize(value);
}

export function readTopHatProviderRuntimeJsonFile(value, label) {
  const absolute = absolutePath(value, label);
  const pathBefore = lstatSync(absolute);
  if (
    !pathBefore.isFile() ||
    pathBefore.isSymbolicLink() ||
    pathBefore.nlink !== 1 ||
    pathBefore.size < 2 ||
    pathBefore.size > MAXIMUM_INPUT_BYTES ||
    realpathSync(absolute) !== path.resolve(absolute)
  ) {
    failTopHatProviderRuntimeCli(
      'TOP_HAT_PROVIDER_RUNTIME_CLI_INPUT_INVALID',
      `${label} must be a bounded single-link regular JSON file on an ordinary path.`,
    );
  }

  let handle;
  let bytes;
  try {
    handle = openSync(absolute, 'r');
    const descriptorBefore = fstatSync(handle);
    if (
      !descriptorBefore.isFile() ||
      descriptorBefore.nlink !== 1 ||
      descriptorBefore.dev !== pathBefore.dev ||
      descriptorBefore.ino !== pathBefore.ino ||
      descriptorBefore.size !== pathBefore.size
    ) {
      failTopHatProviderRuntimeCli(
        'TOP_HAT_PROVIDER_RUNTIME_CLI_INPUT_CHANGED',
        `${label} changed before its stable descriptor was acquired.`,
      );
    }
    bytes = readFileSync(handle);
    const descriptorAfter = fstatSync(handle);
    for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
      if (descriptorBefore[key] !== descriptorAfter[key]) {
        failTopHatProviderRuntimeCli(
          'TOP_HAT_PROVIDER_RUNTIME_CLI_INPUT_CHANGED',
          `${label} changed while being read.`,
        );
      }
    }
    const pathAfter = lstatSync(absolute);
    if (
      pathAfter.isSymbolicLink() ||
      pathAfter.dev !== descriptorAfter.dev ||
      pathAfter.ino !== descriptorAfter.ino ||
      pathAfter.size !== descriptorAfter.size
    ) {
      failTopHatProviderRuntimeCli(
        'TOP_HAT_PROVIDER_RUNTIME_CLI_INPUT_CHANGED',
        `${label} no longer names the inspected file.`,
      );
    }
  } finally {
    if (handle !== undefined) closeSync(handle);
  }

  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    failTopHatProviderRuntimeCli(
      'TOP_HAT_PROVIDER_RUNTIME_CLI_INPUT_UTF8_INVALID',
    );
  }
  if (text.charCodeAt(0) === 0xfeff) {
    failTopHatProviderRuntimeCli(
      'TOP_HAT_PROVIDER_RUNTIME_CLI_INPUT_BOM_FORBIDDEN',
    );
  }
  try {
    return Object.freeze({
      absolute,
      bytes,
      value: JSON.parse(text),
    });
  } catch {
    failTopHatProviderRuntimeCli(
      'TOP_HAT_PROVIDER_RUNTIME_CLI_INPUT_JSON_INVALID',
    );
  }
}

function outputTarget(value) {
  const absolute = absolutePath(value, 'outputPath');
  const parent = path.dirname(absolute);
  const metadata = lstatSync(parent);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    failTopHatProviderRuntimeCli(
      'TOP_HAT_PROVIDER_RUNTIME_CLI_OUTPUT_PARENT_INVALID',
    );
  }
  const resolvedParent = realpathSync(parent);
  if (resolvedParent !== path.resolve(parent)) {
    failTopHatProviderRuntimeCli(
      'TOP_HAT_PROVIDER_RUNTIME_CLI_OUTPUT_PARENT_INVALID',
    );
  }
  return path.join(resolvedParent, path.basename(absolute));
}

function safeUnlink(value) {
  try {
    unlinkSync(value);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

export function sha256TopHatProviderRuntimeBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function writeTopHatProviderRuntimeJsonCreateOnly({
  outputPath,
  value,
  verify,
}) {
  const target = outputTarget(outputPath);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  let handle;
  let created = false;
  let writeError = null;
  let writtenIdentity = null;
  try {
    handle = openSync(target, 'wx', 0o600);
    created = true;
    writeFileSync(handle, bytes);
    fsyncSync(handle);
    writtenIdentity = fstatSync(handle);
  } catch (error) {
    writeError = error;
  } finally {
    if (handle !== undefined) closeSync(handle);
  }
  if (writeError) {
    if (created) safeUnlink(target);
    if (writeError?.code === 'EEXIST') {
      failTopHatProviderRuntimeCli(
        'TOP_HAT_PROVIDER_RUNTIME_CLI_OUTPUT_EXISTS',
        'The output is create-only and already exists.',
      );
    }
    throw writeError;
  }

  try {
    const metadata = lstatSync(target);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.nlink !== 1 ||
      writtenIdentity === null ||
      metadata.dev !== writtenIdentity.dev ||
      metadata.ino !== writtenIdentity.ino ||
      metadata.size !== writtenIdentity.size ||
      (metadata.mode & 0o777) !== 0o600
    ) {
      failTopHatProviderRuntimeCli(
        'TOP_HAT_PROVIDER_RUNTIME_CLI_OUTPUT_VERIFY_FAILED',
      );
    }
    const written = readFileSync(target);
    if (!written.equals(bytes)) {
      failTopHatProviderRuntimeCli(
        'TOP_HAT_PROVIDER_RUNTIME_CLI_OUTPUT_VERIFY_FAILED',
      );
    }
    verify(JSON.parse(written.toString('utf8')));
  } catch (error) {
    if (created) safeUnlink(target);
    if (error?.code?.startsWith?.('TOP_HAT_PROVIDER_RUNTIME_')) {
      throw error;
    }
    failTopHatProviderRuntimeCli(
      'TOP_HAT_PROVIDER_RUNTIME_CLI_OUTPUT_VERIFY_FAILED',
      error instanceof Error ? error.message : String(error),
    );
  }
  return Object.freeze({
    outputPath: target,
    outputBytes: bytes.length,
    outputSha256: sha256TopHatProviderRuntimeBytes(bytes),
  });
}
