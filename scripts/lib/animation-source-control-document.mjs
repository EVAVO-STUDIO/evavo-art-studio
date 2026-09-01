import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  open,
} from "node:fs/promises";
import {
  parse,
  resolve,
  sep,
} from "node:path";
import { TextDecoder } from "node:util";

export const DEFAULT_ANIMATION_SOURCE_CONTROL_BYTES =
  8 * 1024 * 1024;
export const MAX_ANIMATION_SOURCE_CONTROL_BYTES =
  64 * 1024 * 1024;

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

function fail(code, detail) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

function bigintField(value, fallback) {
  return typeof value === "bigint"
    ? value
    : BigInt(Math.trunc(Number(value ?? fallback)));
}

function statFingerprint(value) {
  return Object.freeze({
    dev: bigintField(value.dev, 0),
    ino: bigintField(value.ino, 0),
    mode: bigintField(value.mode, 0),
    nlink: bigintField(value.nlink, 0),
    size: bigintField(value.size, 0),
    mtimeNs:
      typeof value.mtimeNs === "bigint"
        ? value.mtimeNs
        : BigInt(Math.trunc(Number(value.mtimeMs ?? 0) * 1_000_000)),
    ctimeNs:
      typeof value.ctimeNs === "bigint"
        ? value.ctimeNs
        : BigInt(Math.trunc(Number(value.ctimeMs ?? 0) * 1_000_000)),
  });
}

function sameFingerprint(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

async function lstatBigint(path) {
  return await lstat(path, { bigint: true });
}

async function assertExistingPathComponentsOrdinary(absolutePath) {
  const parsed = parse(absolutePath);
  const remainder = absolutePath.slice(parsed.root.length);
  const segments = remainder.split(sep).filter(Boolean);
  let cursor = parsed.root;

  for (let index = 0; index < segments.length; index += 1) {
    cursor = resolve(cursor, segments[index]);
    let state;
    try {
      state = await lstatBigint(cursor);
    } catch (error) {
      if (error?.code === "ENOENT") {
        fail(
          "ANIMATION_SOURCE_CONTROL_DOCUMENT_NOT_FOUND",
          absolutePath,
        );
      }
      throw error;
    }

    if (state.isSymbolicLink()) {
      fail(
        "ANIMATION_SOURCE_CONTROL_DOCUMENT_SYMLINK_FORBIDDEN",
        cursor,
      );
    }

    const isLast = index === segments.length - 1;
    if (!isLast && !state.isDirectory()) {
      fail(
        "ANIMATION_SOURCE_CONTROL_DOCUMENT_PARENT_INVALID",
        cursor,
      );
    }
  }
}

function normalizeMaximumBytes(value) {
  if (value === undefined) {
    return DEFAULT_ANIMATION_SOURCE_CONTROL_BYTES;
  }
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_ANIMATION_SOURCE_CONTROL_BYTES
  ) {
    fail(
      "ANIMATION_SOURCE_CONTROL_DOCUMENT_LIMIT_INVALID",
      String(value),
    );
  }
  return value;
}

async function readExact(handle, byteLength) {
  const output = Buffer.alloc(byteLength);
  let offset = 0;
  while (offset < byteLength) {
    const { bytesRead } = await handle.read(
      output,
      offset,
      byteLength - offset,
      offset,
    );
    if (bytesRead === 0) {
      fail(
        "ANIMATION_SOURCE_CONTROL_DOCUMENT_SHORT_READ",
        String(offset),
      );
    }
    offset += bytesRead;
  }
  return output;
}

function decodeJsonBytes(bytes, path) {
  const hasBom =
    bytes.length >= UTF8_BOM.length &&
    bytes.subarray(0, UTF8_BOM.length).equals(UTF8_BOM);
  const payload = hasBom ? bytes.subarray(UTF8_BOM.length) : bytes;

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(payload);
  } catch {
    fail(
      "ANIMATION_SOURCE_CONTROL_DOCUMENT_UTF8_INVALID",
      path,
    );
  }

  if (text.includes("\u0000")) {
    fail(
      "ANIMATION_SOURCE_CONTROL_DOCUMENT_NUL_FORBIDDEN",
      path,
    );
  }

  try {
    return Object.freeze({
      value: JSON.parse(text),
      hasBom,
    });
  } catch (error) {
    fail(
      "ANIMATION_SOURCE_CONTROL_DOCUMENT_JSON_INVALID",
      error instanceof Error ? error.message : path,
    );
  }
}

export async function readAnimationSourceControlDocument(
  path,
  options = {},
) {
  if (
    typeof path !== "string" ||
    !path.trim() ||
    path.includes("\u0000")
  ) {
    fail(
      "ANIMATION_SOURCE_CONTROL_DOCUMENT_PATH_INVALID",
      String(path),
    );
  }

  const absolutePath = resolve(path);
  const maximumBytes = normalizeMaximumBytes(options.maximumBytes);
  await assertExistingPathComponentsOrdinary(absolutePath);

  const pathBefore = await lstatBigint(absolutePath);
  if (!pathBefore.isFile() || pathBefore.isSymbolicLink()) {
    fail(
      "ANIMATION_SOURCE_CONTROL_DOCUMENT_FILE_REQUIRED",
      absolutePath,
    );
  }
  if (pathBefore.nlink !== 1n) {
    fail(
      "ANIMATION_SOURCE_CONTROL_DOCUMENT_HARDLINK_FORBIDDEN",
      absolutePath,
    );
  }

  const openFlags =
    constants.O_RDONLY |
    (typeof constants.O_NOFOLLOW === "number"
      ? constants.O_NOFOLLOW
      : 0);
  let handle;
  try {
    handle = await open(absolutePath, openFlags);
  } catch (error) {
    if (error?.code === "ELOOP") {
      fail(
        "ANIMATION_SOURCE_CONTROL_DOCUMENT_SYMLINK_FORBIDDEN",
        absolutePath,
      );
    }
    throw error;
  }

  try {
    const handleBefore = await handle.stat({ bigint: true });
    const before = statFingerprint(pathBefore);
    const openedBefore = statFingerprint(handleBefore);
    if (!sameFingerprint(before, openedBefore)) {
      fail(
        "ANIMATION_SOURCE_CONTROL_DOCUMENT_IDENTITY_CHANGED",
        absolutePath,
      );
    }
    if (!handleBefore.isFile() || handleBefore.nlink !== 1n) {
      fail(
        "ANIMATION_SOURCE_CONTROL_DOCUMENT_FILE_REQUIRED",
        absolutePath,
      );
    }
    if (handleBefore.size > BigInt(maximumBytes)) {
      fail(
        "ANIMATION_SOURCE_CONTROL_DOCUMENT_TOO_LARGE",
        `${handleBefore.size}:${maximumBytes}`,
      );
    }

    const byteLength = Number(handleBefore.size);
    const first = await readExact(handle, byteLength);
    const handleMiddle = await handle.stat({ bigint: true });
    const pathMiddle = await lstatBigint(absolutePath);
    if (
      !sameFingerprint(openedBefore, statFingerprint(handleMiddle)) ||
      !sameFingerprint(openedBefore, statFingerprint(pathMiddle))
    ) {
      fail(
        "ANIMATION_SOURCE_CONTROL_DOCUMENT_CHANGED_DURING_READ",
        absolutePath,
      );
    }

    const second = await readExact(handle, byteLength);
    const handleAfter = await handle.stat({ bigint: true });
    const pathAfter = await lstatBigint(absolutePath);
    if (
      !first.equals(second) ||
      !sameFingerprint(openedBefore, statFingerprint(handleAfter)) ||
      !sameFingerprint(openedBefore, statFingerprint(pathAfter))
    ) {
      fail(
        "ANIMATION_SOURCE_CONTROL_DOCUMENT_CHANGED_DURING_READ",
        absolutePath,
      );
    }

    const decoded = decodeJsonBytes(first, absolutePath);
    const digest = createHash("sha256").update(first).digest("hex");
    return Object.freeze({
      value: decoded.value,
      evidence: Object.freeze({
        schema:
          "evavo.animation-source-control-document-observation.v1",
        path: absolutePath,
        byteLength,
        sha256: `sha256:${digest}`,
        utf8Bom: decoded.hasBom,
        stableDoubleRead: true,
        ordinaryFile: true,
        singleLink: true,
      }),
    });
  } finally {
    await handle.close();
  }
}
