import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String((error as NodeJS.ErrnoException).code)
    : undefined;
}

export async function atomicWriteFile(
  targetPath: string,
  content: Uint8Array | string,
): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });
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
