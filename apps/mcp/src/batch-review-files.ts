import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";

import { assertPathWithinAllowedRoots } from "@evavo/art-repo-inspector";

import {
  HARD_MAXIMUM_DISCOVERED_ENTRIES,
  HARD_MAXIMUM_FILES,
  IGNORED_DIRECTORIES,
  IMAGE_EXTENSIONS,
  MAXIMUM_FILE_BYTES,
  ArtBatchReviewError,
  type DiscoveredFile,
  type StableFile,
  portableRelative,
  samePath,
  sha256,
} from "./batch-review-contract.js";

function statIdentity(value: Awaited<ReturnType<typeof lstat>>): string {
  return [
    value.dev,
    value.ino,
    value.size,
    value.mtimeMs,
    value.ctimeMs,
    value.mode,
  ].join(":");
}

export async function canonicalDirectory(
  value: string,
  allowedRoots: readonly string[],
): Promise<string> {
  const safe = assertPathWithinAllowedRoots(value, allowedRoots);
  const requested = path.resolve(safe);
  const before = await lstat(requested);
  if (!before.isDirectory() || before.isSymbolicLink()) {
    throw new ArtBatchReviewError(
      "ART_BATCH_ROOT_INVALID",
      "Batch root must be a regular non-symlink directory.",
    );
  }
  const resolved = await realpath(requested);
  if (!samePath(requested, resolved)) {
    throw new ArtBatchReviewError(
      "ART_BATCH_ROOT_NONCANONICAL",
      "Batch root must use its canonical path without symbolic-link components.",
    );
  }
  return resolved;
}

export async function discoverImageFiles(input: {
  readonly root: string;
  readonly allowedRoots: readonly string[];
  readonly recursive: boolean;
  readonly maximumFiles: number;
  readonly maximumDepth: number;
}): Promise<{
  readonly files: readonly DiscoveredFile[];
  readonly ignoredDirectories: number;
  readonly unsupportedFiles: number;
  readonly visitedEntries: number;
}> {
  const files: DiscoveredFile[] = [];
  const portableKeys = new Map<string, string>();
  let ignoredDirectories = 0;
  let unsupportedFiles = 0;
  let visitedEntries = 0;

  const walk = async (directory: string, depth: number): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) =>
      left.name.localeCompare(right.name, "en", { sensitivity: "base" }),
    );
    for (const entry of entries) {
      visitedEntries += 1;
      if (visitedEntries > HARD_MAXIMUM_DISCOVERED_ENTRIES) {
        throw new ArtBatchReviewError(
          "ART_BATCH_DISCOVERY_LIMIT_EXCEEDED",
          `Batch discovery exceeded ${HARD_MAXIMUM_DISCOVERED_ENTRIES} filesystem entries.`,
        );
      }
      const absolute = path.join(directory, entry.name);
      const state = await lstat(absolute);
      if (state.isSymbolicLink()) {
        throw new ArtBatchReviewError(
          "ART_BATCH_SYMLINK_ENTRY",
          `Batch contains a symbolic-link entry: ${portableRelative(input.root, absolute)}`,
        );
      }
      if (state.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name.toLocaleLowerCase("en-US"))) {
          ignoredDirectories += 1;
          continue;
        }
        if (!input.recursive) {
          ignoredDirectories += 1;
          continue;
        }
        if (depth >= input.maximumDepth) {
          throw new ArtBatchReviewError(
            "ART_BATCH_DEPTH_LIMIT_EXCEEDED",
            `Batch traversal reached maximumDepth=${input.maximumDepth} at ${portableRelative(input.root, absolute)}.`,
          );
        }
        const resolvedDirectory = await realpath(absolute);
        if (!samePath(absolute, resolvedDirectory)) {
          throw new ArtBatchReviewError(
            "ART_BATCH_DIRECTORY_NONCANONICAL",
            `Batch directory uses a non-canonical path: ${portableRelative(input.root, absolute)}`,
          );
        }
        await walk(resolvedDirectory, depth + 1);
        continue;
      }
      if (!state.isFile()) {
        unsupportedFiles += 1;
        continue;
      }
      const extension = path.extname(entry.name).toLocaleLowerCase("en-US");
      if (!IMAGE_EXTENSIONS.has(extension)) {
        unsupportedFiles += 1;
        continue;
      }
      const safe = assertPathWithinAllowedRoots(absolute, input.allowedRoots);
      const resolvedFile = await realpath(safe);
      if (!samePath(absolute, resolvedFile)) {
        throw new ArtBatchReviewError(
          "ART_BATCH_FILE_NONCANONICAL",
          `Batch file uses a non-canonical path: ${portableRelative(input.root, absolute)}`,
        );
      }
      const relativePath = portableRelative(input.root, resolvedFile);
      const collisionKey = relativePath.toLocaleLowerCase("en-US");
      const prior = portableKeys.get(collisionKey);
      if (prior && prior !== relativePath) {
        throw new ArtBatchReviewError(
          "ART_BATCH_PORTABLE_COLLISION",
          `Batch contains a case-insensitive path collision: ${prior} and ${relativePath}`,
        );
      }
      portableKeys.set(collisionKey, relativePath);
      files.push({
        absolutePath: resolvedFile,
        relativePath,
        sizeBytes: state.size,
      });
      if (files.length > input.maximumFiles) {
        throw new ArtBatchReviewError(
          "ART_BATCH_FILE_LIMIT_EXCEEDED",
          `Batch contains more than maximumFiles=${input.maximumFiles} supported images. Review a narrower role folder or raise the limit up to ${HARD_MAXIMUM_FILES}.`,
        );
      }
    }
  };

  await walk(input.root, 0);
  files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath, "en", {
      sensitivity: "base",
    }),
  );
  if (files.length === 0) {
    throw new ArtBatchReviewError(
      "ART_BATCH_EMPTY",
      "Batch root contains no supported single-page image files.",
    );
  }
  return {
    files: Object.freeze(files),
    ignoredDirectories,
    unsupportedFiles,
    visitedEntries,
  };
}

export async function stableFileBytes(
  file: DiscoveredFile,
  allowedRoots: readonly string[],
): Promise<StableFile> {
  const safe = assertPathWithinAllowedRoots(file.absolutePath, allowedRoots);
  const requested = path.resolve(safe);
  const beforePath = await lstat(requested);
  if (!beforePath.isFile() || beforePath.isSymbolicLink()) {
    throw new ArtBatchReviewError(
      "ART_BATCH_FILE_INVALID",
      `${file.relativePath} is not a regular non-symlink file.`,
    );
  }
  if (beforePath.size < 1 || beforePath.size > MAXIMUM_FILE_BYTES) {
    throw new ArtBatchReviewError(
      "ART_BATCH_FILE_SIZE_INVALID",
      `${file.relativePath} exceeds the per-image ${MAXIMUM_FILE_BYTES}-byte review limit.`,
    );
  }
  const resolved = await realpath(requested);
  if (!samePath(requested, resolved)) {
    throw new ArtBatchReviewError(
      "ART_BATCH_FILE_NONCANONICAL",
      `${file.relativePath} changed to a non-canonical path before review.`,
    );
  }

  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
  let handle;
  try {
    handle = await open(resolved, flags);
  } catch (error: unknown) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { readonly code: unknown }).code)
        : "";
    if (!(["EINVAL", "ENOTSUP", "EOPNOTSUPP"] as const).includes(code as never)) {
      throw error;
    }
    handle = await open(resolved, constants.O_RDONLY);
  }

  try {
    const beforeDescriptor = await handle.stat();
    if (!beforeDescriptor.isFile() || beforeDescriptor.size !== beforePath.size) {
      throw new ArtBatchReviewError(
        "ART_BATCH_FILE_CHANGED",
        `${file.relativePath} changed before its exact bytes were read.`,
      );
    }
    const beforeIdentity = statIdentity(beforeDescriptor);
    const bytes = await handle.readFile();
    const afterDescriptor = await handle.stat();
    const afterPath = await lstat(resolved);
    if (
      beforeIdentity !== statIdentity(afterDescriptor) ||
      beforeIdentity !== statIdentity(afterPath) ||
      bytes.byteLength !== beforeDescriptor.size
    ) {
      throw new ArtBatchReviewError(
        "ART_BATCH_FILE_CHANGED",
        `${file.relativePath} changed while its exact bytes were being reviewed.`,
      );
    }
    return {
      bytes,
      sizeBytes: beforeDescriptor.size,
      sha256: sha256(bytes),
    };
  } finally {
    await handle.close();
  }
}
