import { createHash, randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { mkdir, open, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";

import { ArtifactStoreError } from "./types.js";

export interface FileLockOptions {
  readonly timeoutMs?: number;
  readonly staleAfterMs?: number;
  readonly retryDelayMs?: number;
}

export interface FileLockHandle {
  readonly token: string;
  readonly path: string;
  release(): Promise<void>;
}

type LockRecord = Readonly<{
  token: string;
  pid: number;
  host: string;
  createdAt: string;
  keyHash: string;
}>;

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String((error as NodeJS.ErrnoException).code)
    : undefined;
}

function lockName(key: string): string {
  return `${createHash("sha256").update(key).digest("hex")}.lock`;
}

async function lockToken(filePath: string): Promise<string | undefined> {
  try {
    const value = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    return value && typeof value === "object" && "token" in value
      ? String((value as { token: unknown }).token)
      : undefined;
  } catch {
    return undefined;
  }
}

export async function acquireFileLock(
  root: string,
  key: string,
  options: FileLockOptions = {},
): Promise<FileLockHandle> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const staleAfterMs = options.staleAfterMs ?? 120_000;
  const retryDelayMs = options.retryDelayMs ?? 25;
  const lockDirectory = path.join(root, "locks");
  await mkdir(lockDirectory, { recursive: true });
  const filePath = path.join(lockDirectory, lockName(key));
  const startedAt = Date.now();
  const token = randomUUID();
  const record: LockRecord = {
    token,
    pid: process.pid,
    host: hostname(),
    createdAt: new Date().toISOString(),
    keyHash: path.basename(filePath, ".lock"),
  };

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const handle = await open(filePath, "wx", 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }

      return {
        token,
        path: filePath,
        async release(): Promise<void> {
          if ((await lockToken(filePath)) === token) {
            await rm(filePath, { force: true });
          }
        },
      };
    } catch (error: unknown) {
      if (errorCode(error) !== "EEXIST") throw error;
      try {
        const details = await stat(filePath);
        if (Date.now() - details.mtimeMs > staleAfterMs) {
          await rm(filePath, { force: true });
          continue;
        }
      } catch (staleError: unknown) {
        if (errorCode(staleError) === "ENOENT") continue;
        throw staleError;
      }
      const elapsed = Date.now() - startedAt;
      const deterministicDelay = Math.min(
        250,
        retryDelayMs + Math.floor(elapsed / 200),
      );
      await wait(deterministicDelay);
    }
  }

  throw new ArtifactStoreError(
    "ARTIFACT_LOCK_TIMEOUT",
    `Timed out acquiring the artifact lock for ${key}.`,
  );
}

export async function withFileLock<T>(
  root: string,
  key: string,
  operation: () => Promise<T>,
  options: FileLockOptions = {},
): Promise<T> {
  const lock = await acquireFileLock(root, key, options);
  try {
    return await operation();
  } finally {
    await lock.release();
  }
}
