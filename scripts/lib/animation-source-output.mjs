import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  link,
  mkdir,
  open,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import {
  basename,
  dirname,
  join,
  parse,
  resolve,
  sep,
} from "node:path";

export const DEFAULT_ANIMATION_SOURCE_OUTPUT_BYTES =
  32 * 1024 * 1024;
export const MAX_ANIMATION_SOURCE_OUTPUT_BYTES =
  128 * 1024 * 1024;

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

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameFingerprint(left, right) {
  return (
    sameIdentity(left, right) &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function pathKey(value) {
  const absolute = resolve(value);
  return process.platform === "win32"
    ? absolute.toLocaleLowerCase("en-US")
    : absolute;
}

async function lstatOptional(path) {
  try {
    return await lstat(path, { bigint: true });
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function ensureOrdinaryDirectoryPath(path) {
  const absolute = resolve(path);
  const parsed = parse(absolute);
  const remainder = absolute.slice(parsed.root.length);
  const segments = remainder.split(sep).filter(Boolean);
  let cursor = parsed.root;

  for (const segment of segments) {
    cursor = resolve(cursor, segment);
    let state = await lstatOptional(cursor);
    if (!state) {
      try {
        await mkdir(cursor);
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
      state = await lstatOptional(cursor);
    }
    if (!state || state.isSymbolicLink() || !state.isDirectory()) {
      fail(
        "ANIMATION_SOURCE_OUTPUT_PARENT_INVALID",
        cursor,
      );
    }
  }
  return absolute;
}

async function canonicalCandidate(path) {
  const absolute = resolve(path);
  const parentReal = await realpath(dirname(absolute));
  return join(parentReal, basename(absolute));
}

async function canonicalProtectedPath(path) {
  const absolute = resolve(path);
  const state = await lstatOptional(absolute);
  if (state) return await realpath(absolute);
  return await canonicalCandidate(absolute);
}

async function assertNoProtectedCollision(
  destination,
  protectedPaths,
) {
  const destinationKey = pathKey(destination);
  const normalized = [];
  for (const entry of protectedPaths ?? []) {
    if (
      typeof entry !== "string" ||
      !entry.trim() ||
      entry.includes("\u0000")
    ) {
      fail(
        "ANIMATION_SOURCE_OUTPUT_PROTECTED_PATH_INVALID",
        String(entry),
      );
    }
    const absolute = resolve(entry);
    if (pathKey(absolute) === destinationKey) {
      fail(
        "ANIMATION_SOURCE_OUTPUT_PROTECTED_PATH_COLLISION",
        absolute,
      );
    }
    normalized.push(absolute);
  }

  const destinationCanonical = await canonicalCandidate(destination);
  const destinationCanonicalKey = pathKey(destinationCanonical);
  for (const absolute of normalized) {
    const protectedCanonical =
      await canonicalProtectedPath(absolute);
    if (pathKey(protectedCanonical) === destinationCanonicalKey) {
      fail(
        "ANIMATION_SOURCE_OUTPUT_PROTECTED_PATH_COLLISION",
        absolute,
      );
    }
  }
}

function serialize(value, maximumBytes) {
  let serialized;
  try {
    serialized = JSON.stringify(value, null, 2);
  } catch (error) {
    fail(
      "ANIMATION_SOURCE_OUTPUT_JSON_SERIALIZE_FAILED",
      error instanceof Error ? error.message : String(error),
    );
  }
  if (typeof serialized !== "string") {
    fail(
      "ANIMATION_SOURCE_OUTPUT_JSON_SERIALIZE_FAILED",
      "top-level value is not JSON-serializable",
    );
  }
  const bytes = Buffer.from(`${serialized}\n`, "utf8");
  if (bytes.length > maximumBytes) {
    fail(
      "ANIMATION_SOURCE_OUTPUT_TOO_LARGE",
      `${bytes.length}:${maximumBytes}`,
    );
  }
  return bytes;
}

function normalizeMaximumBytes(value) {
  if (value === undefined) {
    return DEFAULT_ANIMATION_SOURCE_OUTPUT_BYTES;
  }
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_ANIMATION_SOURCE_OUTPUT_BYTES
  ) {
    fail(
      "ANIMATION_SOURCE_OUTPUT_LIMIT_INVALID",
      String(value),
    );
  }
  return value;
}

async function snapshotExistingDestination(destination) {
  const state = await lstatOptional(destination);
  if (!state) return undefined;
  if (state.isSymbolicLink() || !state.isFile()) {
    fail(
      "ANIMATION_SOURCE_OUTPUT_DESTINATION_INVALID",
      destination,
    );
  }
  if (state.nlink !== 1n) {
    fail(
      "ANIMATION_SOURCE_OUTPUT_HARDLINK_FORBIDDEN",
      destination,
    );
  }
  return statFingerprint(state);
}

async function removeOwnedPath(
  path,
  expected,
  options = {},
) {
  try {
    const current = await lstat(path, { bigint: true });
    const fingerprint = statFingerprint(current);
    const owned = options.identityOnly === true
      ? sameIdentity(expected, fingerprint)
      : sameFingerprint(expected, fingerprint);
    if (owned) await rm(path, { force: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function writeTemporary(path, bytes) {
  const handle = await open(path, "wx", 0o600);
  let fingerprint;
  try {
    await handle.writeFile(bytes);
    await handle.sync();
    fingerprint = statFingerprint(
      await handle.stat({ bigint: true }),
    );
  } finally {
    await handle.close();
  }
  return fingerprint;
}

async function verifyPublished(destination, bytes) {
  const state = await lstat(destination, { bigint: true });
  if (
    state.isSymbolicLink() ||
    !state.isFile() ||
    state.nlink !== 1n
  ) {
    fail(
      "ANIMATION_SOURCE_OUTPUT_PUBLISH_VERIFY_FAILED",
      destination,
    );
  }
  if (state.size !== BigInt(bytes.length)) {
    fail(
      "ANIMATION_SOURCE_OUTPUT_PUBLISH_SIZE_MISMATCH",
      destination,
    );
  }
  const handle = await open(destination, "r");
  try {
    const buffer = Buffer.alloc(bytes.length);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        offset,
        buffer.length - offset,
        offset,
      );
      if (bytesRead === 0) {
        fail(
          "ANIMATION_SOURCE_OUTPUT_PUBLISH_SHORT_READ",
          destination,
        );
      }
      offset += bytesRead;
    }
    if (!buffer.equals(bytes)) {
      fail(
        "ANIMATION_SOURCE_OUTPUT_PUBLISH_BYTES_MISMATCH",
        destination,
      );
    }
  } finally {
    await handle.close();
  }
}

export async function writeAnimationSourceJson(
  path,
  value,
  options = {},
) {
  if (
    typeof path !== "string" ||
    !path.trim() ||
    path.includes("\u0000")
  ) {
    fail(
      "ANIMATION_SOURCE_OUTPUT_PATH_INVALID",
      String(path),
    );
  }
  if (
    options.replace !== undefined &&
    typeof options.replace !== "boolean"
  ) {
    fail(
      "ANIMATION_SOURCE_OUTPUT_REPLACE_INVALID",
      String(options.replace),
    );
  }

  const destination = resolve(path);
  const maximumBytes = normalizeMaximumBytes(options.maximumBytes);
  const bytes = serialize(value, maximumBytes);
  await ensureOrdinaryDirectoryPath(dirname(destination));
  await assertNoProtectedCollision(
    destination,
    options.protectedPaths ?? [],
  );

  const lockPath = `${destination}.lock`;
  const lockHandle = await open(lockPath, "wx", 0o600).catch(
    (error) => {
      if (error?.code === "EEXIST") {
        fail(
          "ANIMATION_SOURCE_OUTPUT_LOCKED",
          destination,
        );
      }
      throw error;
    },
  );
  let lockFingerprint;
  try {
    lockFingerprint = statFingerprint(
      await lockHandle.stat({ bigint: true }),
    );
    const existing = await snapshotExistingDestination(destination);
    if (existing && options.replace !== true) {
      fail(
        "ANIMATION_SOURCE_OUTPUT_EXISTS",
        destination,
      );
    }

    const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`;
    let temporaryFingerprint;
    let published = false;
    try {
      temporaryFingerprint = await writeTemporary(temporary, bytes);

      const current =
        await snapshotExistingDestination(destination);
      if (existing) {
        if (!current || !sameFingerprint(existing, current)) {
          fail(
            "ANIMATION_SOURCE_OUTPUT_DESTINATION_CHANGED",
            destination,
          );
        }
      } else if (current) {
        fail(
          "ANIMATION_SOURCE_OUTPUT_DESTINATION_APPEARED",
          destination,
        );
      }

      if (!existing) {
        try {
          await link(temporary, destination);
        } catch (error) {
          if (error?.code === "EEXIST") {
            fail(
              "ANIMATION_SOURCE_OUTPUT_DESTINATION_APPEARED",
              destination,
            );
          }
          throw error;
        }
        await removeOwnedPath(
          temporary,
          temporaryFingerprint,
          { identityOnly: true },
        );
        published = true;
      } else {
        try {
          await rename(temporary, destination);
        } catch (error) {
          fail(
            "ANIMATION_SOURCE_OUTPUT_ATOMIC_REPLACE_UNAVAILABLE",
            error instanceof Error ? error.message : destination,
          );
        }
        published = true;
      }

      await verifyPublished(destination, bytes);
      const digest = createHash("sha256")
        .update(bytes)
        .digest("hex");
      return Object.freeze({
        schema: "evavo.animation-source-output-write.v1",
        path: destination,
        byteLength: bytes.length,
        sha256: `sha256:${digest}`,
        replaced: Boolean(existing),
        createOnly: !existing,
        atomicPublish: true,
      });
    } finally {
      if (!published && temporaryFingerprint) {
        await removeOwnedPath(
          temporary,
          temporaryFingerprint,
          { identityOnly: true },
        ).catch(() => {});
      }
    }
  } finally {
    await lockHandle.close();
    if (lockFingerprint) {
      await removeOwnedPath(lockPath, lockFingerprint);
    }
  }
}
