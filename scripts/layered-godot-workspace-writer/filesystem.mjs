import { randomBytes } from "node:crypto";
import { constants as FS_CONSTANTS } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  realpath,
  rmdir,
  unlink,
} from "node:fs/promises";
import path from "node:path";

import { bytesSha256, fail } from "./contract.mjs";

const NOFOLLOW = FS_CONSTANTS.O_NOFOLLOW ?? 0;

export function sameFilesystemPath(left, right) {
  const normalize = (value) => {
    const output = path.normalize(value);
    return process.platform === "win32" ? output.toLowerCase() : output;
  };
  return normalize(left) === normalize(right);
}

export function filesystemIdentity(stats) {
  return Object.freeze({
    dev: String(stats.dev),
    ino: String(stats.ino),
    size: String(stats.size),
    mtimeNs:
      stats.mtimeNs !== undefined
        ? String(stats.mtimeNs)
        : String(BigInt(Math.trunc(Number(stats.mtimeMs) * 1_000_000))),
  });
}

export function sameFilesystemIdentity(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs
  );
}


function directoryIdentity(stats) {
  return Object.freeze({ dev: String(stats.dev), ino: String(stats.ino) });
}

function sameDirectoryIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

export function isMissing(error) {
  return error && typeof error === "object" && error.code === "ENOENT";
}

export async function lstatMaybe(filePath) {
  try {
    return await lstat(filePath, { bigint: true });
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

export function assertSafeRegular(stats, label, acceptedLinkCounts = [1n]) {
  if (stats.isSymbolicLink()) {
    fail(
      "LAYERED_GODOT_WRITE_SYMLINK_REJECTED",
      `${label} must not be a symbolic link.`,
    );
  }
  if (!stats.isFile()) {
    fail("LAYERED_GODOT_WRITE_TARGET_INVALID", `${label} must be a regular file.`);
  }
  if (!acceptedLinkCounts.includes(stats.nlink)) {
    fail(
      "LAYERED_GODOT_WRITE_HARDLINK_REJECTED",
      `${label} has an unsafe filesystem link count.`,
    );
  }
}

export async function assertDirectory(
  directoryPath,
  label,
  expectedIdentity = undefined,
) {
  const stats = await lstat(directoryPath, { bigint: true });
  if (stats.isSymbolicLink()) {
    fail(
      "LAYERED_GODOT_WRITE_SYMLINK_REJECTED",
      `${label} must not be a symbolic link.`,
    );
  }
  if (!stats.isDirectory()) {
    fail("LAYERED_GODOT_WRITE_ROOT_INVALID", `${label} must be a directory.`);
  }
  const currentIdentity = directoryIdentity(stats);
  if (
    expectedIdentity !== undefined &&
    !sameDirectoryIdentity(expectedIdentity, currentIdentity)
  ) {
    fail(
      "LAYERED_GODOT_WRITE_DIRECTORY_CHANGED",
      `${label} changed while the write transaction was being prepared.`,
    );
  }
  return currentIdentity;
}

export async function inspectWorkspaceRoot(workspaceRoot) {
  const rootIdentity = await assertDirectory(workspaceRoot, "workspaceRoot");
  const resolved = await realpath(workspaceRoot);
  if (!sameFilesystemPath(resolved, workspaceRoot)) {
    fail(
      "LAYERED_GODOT_WRITE_SYMLINK_REJECTED",
      "workspaceRoot or one of its ancestors resolves through a symbolic link.",
    );
  }
  return Object.freeze({
    path: workspaceRoot,
    realPath: resolved,
    identity: rootIdentity,
  });
}

export async function revalidateWorkspaceRoot(root) {
  await assertDirectory(root.path, "workspaceRoot", root.identity);
  const resolved = await realpath(root.path);
  if (!sameFilesystemPath(resolved, root.realPath)) {
    fail(
      "LAYERED_GODOT_WRITE_DIRECTORY_CHANGED",
      "workspaceRoot resolved path changed.",
    );
  }
}

export async function readStableRegularFile(
  filePath,
  label,
  expectedIdentity = undefined,
  acceptedLinkCounts = [1n],
) {
  const beforeStats = await lstat(filePath, { bigint: true });
  assertSafeRegular(beforeStats, label, acceptedLinkCounts);
  const beforeIdentity = filesystemIdentity(beforeStats);
  if (
    expectedIdentity !== undefined &&
    !sameFilesystemIdentity(beforeIdentity, expectedIdentity)
  ) {
    fail(
      "LAYERED_GODOT_WRITE_STALE_TARGET",
      `${label} changed before it could be read.`,
    );
  }

  const handle = await open(filePath, FS_CONSTANTS.O_RDONLY | NOFOLLOW);
  try {
    const openedStats = await handle.stat({ bigint: true });
    assertSafeRegular(openedStats, label, acceptedLinkCounts);
    if (!sameFilesystemIdentity(beforeIdentity, filesystemIdentity(openedStats))) {
      fail(
        "LAYERED_GODOT_WRITE_STALE_TARGET",
        `${label} changed while it was opened.`,
      );
    }
    const data = await handle.readFile();
    const afterStats = await handle.stat({ bigint: true });
    if (!sameFilesystemIdentity(beforeIdentity, filesystemIdentity(afterStats))) {
      fail(
        "LAYERED_GODOT_WRITE_STALE_TARGET",
        `${label} changed while it was read.`,
      );
    }
    return Object.freeze({
      data,
      sha256: bytesSha256(data),
      bytes: data.byteLength,
      identity: beforeIdentity,
    });
  } finally {
    await handle.close();
  }
}

export async function syncDirectory(directory) {
  let handle;
  try {
    handle = await open(directory, FS_CONSTANTS.O_RDONLY | NOFOLLOW);
    await handle.sync();
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !["EISDIR", "EINVAL", "EPERM", "EACCES", "ENOTSUP"].includes(error.code)
    ) {
      throw error;
    }
  } finally {
    if (handle) await handle.close();
  }
}

export function resolveWorkspaceTarget(root, relativePath) {
  const target = path.resolve(root, ...relativePath.split("/"));
  const relative = path.relative(path.resolve(root), target);
  if (
    relative.length === 0 ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    fail(
      "LAYERED_GODOT_WRITE_PATH_INVALID",
      `Output ${relativePath} escapes the selected workspace root.`,
    );
  }
  return target;
}

export async function ensureSafeParent(root, relativePath, createdDirectories) {
  await revalidateWorkspaceRoot(root);
  const segments = relativePath.split("/").slice(0, -1);
  let current = root.path;
  for (const segment of segments) {
    current = path.join(current, segment);
    let stats = await lstatMaybe(current);
    if (stats === null) {
      try {
        await mkdir(current, { mode: 0o755 });
        createdDirectories.push(current);
      } catch (error) {
        if (!error || typeof error !== "object" || error.code !== "EEXIST") {
          throw error;
        }
      }
      stats = await lstat(current, { bigint: true });
    }
    if (stats.isSymbolicLink()) {
      fail(
        "LAYERED_GODOT_WRITE_SYMLINK_REJECTED",
        `Parent directory ${current} must not be a symbolic link.`,
      );
    }
    if (!stats.isDirectory()) {
      fail(
        "LAYERED_GODOT_WRITE_PARENT_INVALID",
        `Parent path ${current} must be a directory.`,
      );
    }
  }
  return Object.freeze({
    path: current,
    identity: await assertDirectory(current, `parent ${relativePath}`),
  });
}

export async function createExactStage(parent, basename, expectedData) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const token = randomBytes(12).toString("hex");
    const stagePath = path.join(parent, `.${basename}.evavo-godot-stage-${token}`);
    let handle;
    try {
      handle = await open(
        stagePath,
        FS_CONSTANTS.O_WRONLY |
          FS_CONSTANTS.O_CREAT |
          FS_CONSTANTS.O_EXCL |
          NOFOLLOW,
        0o600,
      );
      await handle.writeFile(expectedData);
      await handle.sync();
      await handle.close();
      handle = undefined;
      const staged = await readStableRegularFile(stagePath, `stage ${stagePath}`);
      if (!staged.data.equals(expectedData)) {
        fail(
          "LAYERED_GODOT_WRITE_STAGE_INVALID",
          `Stage ${stagePath} did not retain the exact expected bytes.`,
        );
      }
      return Object.freeze({ path: stagePath, identity: staged.identity });
    } catch (error) {
      if (handle) await handle.close();
      if (error && typeof error === "object" && error.code === "EEXIST") {
        continue;
      }
      throw error;
    }
  }
  fail(
    "LAYERED_GODOT_WRITE_STAGE_INVALID",
    `Could not reserve a stage for ${basename}.`,
  );
}

export function createBackupPath(parent, basename) {
  return path.join(
    parent,
    `.${basename}.evavo-godot-backup-${randomBytes(12).toString("hex")}`,
  );
}

export async function removeCreatedDirectories(createdDirectories) {
  for (const directory of [...createdDirectories].reverse()) {
    try {
      await rmdir(directory);
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)
      ) {
        throw error;
      }
    }
  }
}

export async function unlinkExpected(filePath, expectedIdentity, label) {
  const existing = await lstatMaybe(filePath);
  if (existing === null) return;
  assertSafeRegular(existing, label);
  if (!sameFilesystemIdentity(filesystemIdentity(existing), expectedIdentity)) {
    fail(
      "LAYERED_GODOT_WRITE_ROLLBACK_INCOMPLETE",
      `${label} changed before cleanup and was left untouched.`,
    );
  }
  await unlink(filePath);
}
