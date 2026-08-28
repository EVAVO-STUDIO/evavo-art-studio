import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";

import {
  MAX_LEGACY_SCAN_FILE_BYTES,
  failLegacy,
  sameFingerprint,
  statFingerprint,
} from "./animation-source-legacy-common-v2.mjs";

async function assertOrdinaryParents(root, trackedPath) {
  let cursor = root;
  for (const part of trackedPath.split("/").slice(0, -1)) {
    cursor = resolve(cursor, part);
    const state = await lstat(cursor, { bigint: true });
    if (state.isSymbolicLink() || !state.isDirectory()) {
      failLegacy("ANIMATION_SOURCE_LEGACY_V2_PARENT_INVALID", trackedPath);
    }
  }
}

async function readExact(handle, byteLength) {
  const output = Buffer.alloc(byteLength);
  let offset = 0;
  while (offset < byteLength) {
    const { bytesRead } = await handle.read(
      output, offset, byteLength - offset, offset,
    );
    if (bytesRead === 0) {
      failLegacy("ANIMATION_SOURCE_LEGACY_V2_SHORT_READ", String(offset));
    }
    offset += bytesRead;
  }
  return output;
}

export async function readTrackedCodeV2(root, trackedPath) {
  await assertOrdinaryParents(root, trackedPath);
  const file = resolve(root, ...trackedPath.split("/"));
  const relation = relative(root, file);
  if (relation === "" || relation === ".." ||
      relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    failLegacy("ANIMATION_SOURCE_LEGACY_V2_PATH_ESCAPED", trackedPath);
  }

  const pathBefore = await lstat(file, { bigint: true });
  if (pathBefore.isSymbolicLink() || !pathBefore.isFile() || pathBefore.nlink !== 1n) {
    failLegacy("ANIMATION_SOURCE_LEGACY_V2_FILE_INVALID", trackedPath);
  }
  if (pathBefore.size > BigInt(MAX_LEGACY_SCAN_FILE_BYTES)) {
    failLegacy(
      "ANIMATION_SOURCE_LEGACY_V2_FILE_TOO_LARGE",
      `${trackedPath}:${pathBefore.size}`,
    );
  }

  const flags = constants.O_RDONLY |
    (typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0);
  let handle;
  try {
    handle = await open(file, flags);
  } catch (error) {
    failLegacy(
      "ANIMATION_SOURCE_LEGACY_V2_FILE_OPEN_FAILED",
      error instanceof Error ? error.message : trackedPath,
    );
  }

  try {
    const opened = statFingerprint(await handle.stat({ bigint: true }));
    if (!sameFingerprint(statFingerprint(pathBefore), opened)) {
      failLegacy("ANIMATION_SOURCE_LEGACY_V2_FILE_CHANGED", trackedPath);
    }
    const byteLength = Number(pathBefore.size);
    const first = await readExact(handle, byteLength);
    const middleHandle = statFingerprint(await handle.stat({ bigint: true }));
    const middlePath = statFingerprint(await lstat(file, { bigint: true }));
    if (!sameFingerprint(opened, middleHandle) || !sameFingerprint(opened, middlePath)) {
      failLegacy("ANIMATION_SOURCE_LEGACY_V2_FILE_CHANGED", trackedPath);
    }
    const second = await readExact(handle, byteLength);
    const afterHandle = statFingerprint(await handle.stat({ bigint: true }));
    const afterPath = statFingerprint(await lstat(file, { bigint: true }));
    if (!first.equals(second) || !sameFingerprint(opened, afterHandle) ||
        !sameFingerprint(opened, afterPath)) {
      failLegacy("ANIMATION_SOURCE_LEGACY_V2_FILE_CHANGED", trackedPath);
    }
    let source;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(first);
    } catch {
      failLegacy("ANIMATION_SOURCE_LEGACY_V2_UTF8_INVALID", trackedPath);
    }
    return Object.freeze({ source, byteLength });
  } finally {
    await handle.close();
  }
}
