import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { SpriteAtlasInputError } from "./types.js";

function isWithin(base: string, candidate: string): boolean {
  const relative = path.relative(base, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String((error as NodeJS.ErrnoException).code)
    : undefined;
}

export async function resolveAllowedRoots(
  roots: readonly string[],
): Promise<readonly string[]> {
  if (roots.length === 0) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_ALLOWED_ROOTS_REQUIRED",
      "At least one allowed root is required for file access.",
    );
  }
  return [
    ...new Set(
      await Promise.all(roots.map((root) => realpath(path.resolve(root)))),
    ),
  ];
}

export async function resolveInputPath(
  candidate: string,
  allowedRoots: readonly string[],
): Promise<string> {
  const lexical = path.resolve(candidate);
  if (!allowedRoots.some((root) => isWithin(root, lexical))) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_PATH_OUTSIDE_ALLOWED_ROOTS",
      `${candidate} is outside the configured allowed roots.`,
    );
  }
  let resolved: string;
  try {
    resolved = await realpath(lexical);
  } catch (error: unknown) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_INPUT_NOT_FOUND",
      `${candidate} could not be resolved: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!allowedRoots.some((root) => isWithin(root, resolved))) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_PATH_OUTSIDE_ALLOWED_ROOTS",
      `${candidate} resolves outside the configured allowed roots.`,
    );
  }
  return resolved;
}

export async function resolveOutputDirectory(
  candidate: string,
  allowedRoots: readonly string[],
): Promise<string> {
  const resolved = path.resolve(candidate);
  if (!allowedRoots.some((root) => isWithin(root, resolved))) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_OUTPUT_OUTSIDE_ALLOWED_ROOTS",
      `${candidate} is outside the configured allowed roots.`,
    );
  }
  await mkdir(resolved, { recursive: true });
  const canonical = await realpath(resolved);
  if (!allowedRoots.some((root) => isWithin(root, canonical))) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_OUTPUT_OUTSIDE_ALLOWED_ROOTS",
      `${candidate} resolves outside the configured allowed roots.`,
    );
  }
  return canonical;
}

export async function readBoundedFile(
  filePath: string,
  maximumBytes: number,
): Promise<Buffer> {
  const details = await stat(filePath);
  if (!details.isFile()) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_INPUT_NOT_FILE",
      `${filePath} is not a regular file.`,
    );
  }
  if (details.size > maximumBytes) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_INPUT_TOO_LARGE",
      `${filePath} exceeds ${maximumBytes} bytes.`,
    );
  }
  return readFile(filePath);
}

export async function atomicWriteFile(
  targetPath: string,
  content: Uint8Array | string,
): Promise<void> {
  const nonce = randomUUID();
  const temporaryPath = `${targetPath}.tmp-${nonce}`;
  const backupPath = `${targetPath}.bak-${nonce}`;
  let existingMoved = false;

  try {
    await writeFile(temporaryPath, content);
    try {
      await rename(temporaryPath, targetPath);
      return;
    } catch (error: unknown) {
      if (!["EACCES", "EEXIST", "EPERM"].includes(errorCode(error) ?? "")) {
        throw error;
      }
    }

    try {
      await rename(targetPath, backupPath);
      existingMoved = true;
    } catch (error: unknown) {
      if (errorCode(error) !== "ENOENT") throw error;
    }

    try {
      await rename(temporaryPath, targetPath);
    } catch (writeError: unknown) {
      if (existingMoved) {
        try {
          await rename(backupPath, targetPath);
        } catch (restoreError: unknown) {
          throw new AggregateError(
            [writeError, restoreError],
            `Failed to replace and restore ${targetPath}.`,
          );
        }
      }
      throw writeError;
    }

    if (existingMoved) await rm(backupPath, { force: true });
  } finally {
    await rm(temporaryPath, { force: true });
    if (!existingMoved) await rm(backupPath, { force: true });
  }
}
