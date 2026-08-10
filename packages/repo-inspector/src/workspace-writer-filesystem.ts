import { constants as fsConstants } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  open,
  realpath,
  rm,
} from "node:fs/promises";
import path from "node:path";

import {
  assertArtWorkspaceRelativePath,
  fail,
  isInside,
  sha256File,
} from "./workspace-writer-foundation.js";
import type {
  ArtWorkspaceWriterPolicy,
} from "./workspace-writer-types.js";

export interface ExistingFileEvidence {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly sha256: string;
  readonly sizeBytes: number;
}

function filesystemErrorCode(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || !("code" in value)) {
    return undefined;
  }
  const code = (value as { readonly code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function rethrowCreateOnlyError(error: unknown, target: string): never {
  if (filesystemErrorCode(error) === "EEXIST") {
    fail(
      "ART_WORKSPACE_TARGET_EXISTS",
      `Create-only target already exists: ${target}`,
    );
  }
  throw error;
}

async function openCreateOnly(target: string) {
  try {
    return await open(target, "wx", 0o600);
  } catch (error: unknown) {
    rethrowCreateOnlyError(error, target);
  }
}

async function ordinaryDirectory(directoryPath: string, label: string): Promise<string> {
  const evidence = await lstat(directoryPath).catch(() => undefined);
  if (!evidence?.isDirectory() || evidence.isSymbolicLink()) {
    fail("ART_WORKSPACE_ROOT_INVALID", `${label} must be an ordinary directory.`);
  }
  return realpath(directoryPath);
}

async function normalizeAllowedRoots(
  roots: readonly string[],
  label: string,
): Promise<readonly string[]> {
  if (roots.length === 0) {
    fail("ART_WORKSPACE_ROOTS_EMPTY", `${label} must contain at least one root.`);
  }
  return Promise.all(roots.map((root) => ordinaryDirectory(path.resolve(root), label)));
}

export async function resolveWorkspaceRoot(
  workspaceRoot: string,
  policy: ArtWorkspaceWriterPolicy,
): Promise<string> {
  const allowed = await normalizeAllowedRoots(
    policy.allowedWorkspaceRoots,
    "allowed workspace root",
  );
  const resolved = await ordinaryDirectory(path.resolve(workspaceRoot), "workspaceRoot");
  if (!allowed.some((root) => isInside(root, resolved))) {
    fail(
      "ART_WORKSPACE_ROOT_OUTSIDE_POLICY",
      "workspaceRoot is outside the configured writable roots.",
    );
  }
  return resolved;
}

export async function resolveImportFile(
  sourcePath: string,
  policy: ArtWorkspaceWriterPolicy,
): Promise<string> {
  const roots = policy.allowedImportRoots ?? policy.allowedWorkspaceRoots;
  const allowed = await normalizeAllowedRoots(roots, "allowed import root");
  const absolute = path.resolve(sourcePath);
  const evidence = await lstat(absolute).catch(() => undefined);
  if (!evidence?.isFile() || evidence.isSymbolicLink()) {
    fail(
      "ART_WORKSPACE_IMPORT_FILE_INVALID",
      "Imported source must be an ordinary file, not a symlink.",
    );
  }
  const resolved = await realpath(absolute);
  if (!allowed.some((root) => isInside(root, resolved))) {
    fail(
      "ART_WORKSPACE_IMPORT_OUTSIDE_POLICY",
      "Imported source is outside EVAVO_ART_IMPORT_ROOTS.",
    );
  }
  return resolved;
}

export async function assertNoSymlinkSegments(root: string, target: string): Promise<void> {
  if (!isInside(root, target)) {
    fail("ART_WORKSPACE_PATH_OUTSIDE_ROOT", "Resolved path escapes workspaceRoot.");
  }
  const relative = path.relative(root, target);
  let cursor = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    const evidence = await lstat(cursor).catch(() => undefined);
    if (evidence?.isSymbolicLink()) {
      fail("ART_WORKSPACE_SYMLINK_FORBIDDEN", `Symlink path component: ${cursor}`);
    }
  }
}

export async function ensureSafeParent(root: string, target: string): Promise<void> {
  const parent = path.dirname(target);
  if (!isInside(root, parent)) {
    fail("ART_WORKSPACE_PATH_OUTSIDE_ROOT", "Target parent escapes workspaceRoot.");
  }
  const relative = path.relative(root, parent);
  let cursor = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    const evidence = await lstat(cursor).catch(() => undefined);
    if (evidence) {
      if (!evidence.isDirectory() || evidence.isSymbolicLink()) {
        fail(
          "ART_WORKSPACE_PARENT_INVALID",
          `Target parent is not an ordinary directory: ${cursor}`,
        );
      }
      continue;
    }
    await mkdir(cursor);
  }
}

export function absoluteFromRelative(root: string, relativePath: string): string {
  const safe = assertArtWorkspaceRelativePath(relativePath);
  const absolute = path.resolve(root, ...safe.split("/"));
  if (!isInside(root, absolute)) {
    fail("ART_WORKSPACE_PATH_OUTSIDE_ROOT", "Path escapes workspaceRoot.");
  }
  return absolute;
}

export async function existingFile(
  root: string,
  relativePath: string,
  maximumBytes?: number,
): Promise<ExistingFileEvidence> {
  const safe = assertArtWorkspaceRelativePath(relativePath);
  const absolutePath = absoluteFromRelative(root, safe);
  await assertNoSymlinkSegments(root, absolutePath);
  const evidence = await lstat(absolutePath).catch(() => undefined);
  if (!evidence?.isFile() || evidence.isSymbolicLink()) {
    fail("ART_WORKSPACE_FILE_MISSING", `Expected ordinary file: ${safe}`);
  }
  if (maximumBytes !== undefined && evidence.size > maximumBytes) {
    fail(
      "ART_WORKSPACE_FILE_TOO_LARGE",
      `${safe} exceeds the configured ${maximumBytes}-byte limit.`,
    );
  }
  return {
    absolutePath,
    relativePath: safe,
    sha256: await sha256File(absolutePath),
    sizeBytes: evidence.size,
  };
}

export async function assertTargetAbsent(root: string, relativePath: string): Promise<string> {
  const safe = assertArtWorkspaceRelativePath(relativePath);
  const absolute = absoluteFromRelative(root, safe);
  await assertNoSymlinkSegments(root, path.dirname(absolute));
  const evidence = await lstat(absolute).catch(() => undefined);
  if (evidence) fail("ART_WORKSPACE_TARGET_EXISTS", `Target already exists: ${safe}`);
  return absolute;
}

export function strictBase64(value: string, maximumBytes: number): Buffer {
  const compact = value.replace(/\s+/gu, "");
  if (
    !compact ||
    compact.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      compact,
    )
  ) {
    fail("ART_WORKSPACE_BASE64_INVALID", "dataBase64 must be strict padded base64.");
  }
  const bytes = Buffer.from(compact, "base64");
  if (bytes.length > maximumBytes) {
    fail(
      "ART_WORKSPACE_BASE64_TOO_LARGE",
      `Decoded attachment exceeds ${maximumBytes} bytes.`,
    );
  }
  return bytes;
}


export async function readHeader(filePath: string, maximum = 64 * 1024): Promise<Buffer> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(maximum);
    const { bytesRead } = await handle.read(buffer, 0, maximum, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function writeJsonCreateOnly(filePath: string, value: unknown): Promise<void> {
  const handle = await openCreateOnly(filePath);
  let completed = false;
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    completed = true;
  } finally {
    await handle.close();
    if (!completed) await rm(filePath, { force: true }).catch(() => undefined);
  }
}

export async function writeBufferCreateOnly(
  target: string,
  bytes: Buffer,
  expectedSha256: string,
): Promise<void> {
  const handle = await openCreateOnly(target);
  let completed = false;
  try {
    await handle.writeFile(bytes);
    await handle.sync();
    completed = true;
  } finally {
    await handle.close();
    if (!completed) await rm(target, { force: true }).catch(() => undefined);
  }
  if (await sha256File(target) !== expectedSha256) {
    await rm(target, { force: true }).catch(() => undefined);
    fail(
      "ART_WORKSPACE_WRITE_VERIFY_FAILED",
      "Written attachment bytes failed SHA-256 verification.",
    );
  }
}

export async function copyCreateOnly(
  source: string,
  target: string,
  expectedSha256: string,
): Promise<void> {
  try {
    await copyFile(source, target, fsConstants.COPYFILE_EXCL);
  } catch (error: unknown) {
    rethrowCreateOnlyError(error, target);
  }
  try {
    const [sourceHash, targetHash] = await Promise.all([
      sha256File(source),
      sha256File(target),
    ]);
    if (sourceHash !== expectedSha256 || targetHash !== expectedSha256) {
      fail(
        "ART_WORKSPACE_COPY_VERIFY_FAILED",
        "Copied bytes or source bytes no longer match the approved SHA-256.",
      );
    }
  } catch (error: unknown) {
    await rm(target, { force: true }).catch(() => undefined);
    throw error;
  }
}
