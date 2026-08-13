import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, realpath, rm } from "node:fs/promises";
import path from "node:path";

export const SHA256 = /^[0-9a-f]{64}$/u;
export const ARTIFACT_ID = /^artifact_[0-9a-f]{64}$/u;
export const PROVIDER_REQUEST_ID = /^provider_[0-9a-f]{40}$/u;
export const SUBMISSION_KEY = /^hmf-provider-submit:[0-9a-f]{40}$/u;
const PROHIBITED_AUTHORITY = [
  "candidateApproval",
  "candidatePromotion",
  "targetRepositoryMutation",
  "gitMutation",
  "publication",
];

export function fail(message) {
  throw new Error(
    `HEAVY_METAL_FIGHTING_PROVIDER_CANDIDATE_ADMISSION_INVALID: ${message}`,
  );
}
export function assert(condition, message) {
  if (!condition) fail(message);
}
export function freeze(value) {
  if (value === null || typeof value !== "object" || ArrayBuffer.isView(value)) {
    return value;
  }
  if (Array.isArray(value)) value.forEach(freeze);
  else Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sorted(value[key])]),
    );
  }
  return value;
}
export function canonical(value) {
  return `${JSON.stringify(sorted(value), null, 2)}\n`;
}
export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
export function recordSha256(value) {
  return sha256(
    typeof value === "string" || Buffer.isBuffer(value)
      ? value
      : canonical(value),
  );
}
export function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
export function selfHashed(value, field, label) {
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object.`,
  );
  assert(
    SHA256.test(String(value[field] ?? "")),
    `${label}.${field} must be a SHA-256.`,
  );
  const body = { ...value };
  delete body[field];
  assert(
    value[field] === recordSha256(body),
    `${label}.${field} does not match canonical content.`,
  );
  return value;
}
export function canonicalTimestamp(value, label) {
  assert(
    typeof value === "string" && value.trim() === value,
    `${label} must be a canonical ISO-8601 timestamp.`,
  );
  const parsed = new Date(value);
  assert(
    Number.isFinite(parsed.getTime()) && parsed.toISOString() === value,
    `${label} must be a canonical ISO-8601 timestamp.`,
  );
  return value;
}
export function safeActorId(value) {
  assert(
    typeof value === "string" &&
      value.trim() === value &&
      value.length >= 1 &&
      value.length <= 256 &&
      !value.includes("\0"),
    "runtime actorId must contain 1 to 256 canonical characters.",
  );
  return value;
}
export function assertNoAuthority(authority, label, extra = []) {
  assert(
    authority && typeof authority === "object" && !Array.isArray(authority),
    `${label} authority is missing.`,
  );
  for (const key of [...PROHIBITED_AUTHORITY, ...extra]) {
    assert(
      authority[key] === false,
      `${label} gained prohibited ${key} authority.`,
    );
  }
}
export function safeRelative(value, label) {
  assert(
    typeof value === "string" && value.trim() === value && value.length > 0,
    `${label} must be a non-empty relative path.`,
  );
  assert(
    !value.includes("\\") &&
      !value.includes("\0") &&
      !path.posix.isAbsolute(value),
    `${label} must use a portable relative path.`,
  );
  const parts = value.split("/");
  assert(
    parts.every((part) => part && part !== "." && part !== ".."),
    `${label} contains an unsafe segment.`,
  );
  assert(path.posix.normalize(value) === value, `${label} is not canonical.`);
  return value;
}
function errorCode(error) {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : undefined;
}
export async function rootDirectory(input, label) {
  assert(typeof input === "string" && input.trim(), `${label} is required.`);
  const resolved = path.resolve(input);
  let info;
  try {
    info = await lstat(resolved);
  } catch (error) {
    if (errorCode(error) === "ENOENT") fail(`${label} does not exist.`);
    throw error;
  }
  assert(
    info.isDirectory() && !info.isSymbolicLink(),
    `${label} must be an existing non-symlink directory.`,
  );
  return realpath(resolved);
}
function containedPath(root, relative, label) {
  const portable = safeRelative(relative, label);
  const target = path.join(root, ...portable.split("/"));
  assert(
    target === root || target.startsWith(`${root}${path.sep}`),
    `${label} escaped its root.`,
  );
  return target;
}
export async function safeReadRegular(
  root,
  relative,
  label,
  allowMissing = false,
) {
  const filePath = containedPath(root, relative, label);
  const segments = safeRelative(relative, label).split("/");
  let current = root;
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (errorCode(error) === "ENOENT" && allowMissing) return null;
      if (errorCode(error) === "ENOENT") fail(`${label} was not found.`);
      throw error;
    }
    assert(!info.isSymbolicLink(), `${label} traverses a symbolic link.`);
    if (index < segments.length - 1) {
      assert(info.isDirectory(), `${label} parent is not a directory.`);
    } else {
      assert(info.isFile(), `${label} must be a regular file.`);
    }
  }
  const before = await lstat(filePath);
  const handle = await open(filePath, "r");
  try {
    const opened = await handle.stat();
    assert(
      opened.isFile() && opened.dev === before.dev && opened.ino === before.ino,
      `${label} changed while being opened.`,
    );
    const bytes = await handle.readFile();
    const after = await handle.stat();
    assert(
      after.dev === opened.dev &&
        after.ino === opened.ino &&
        after.size === opened.size &&
        after.mtimeMs === opened.mtimeMs,
      `${label} changed while being read.`,
    );
    return bytes;
  } finally {
    await handle.close();
  }
}
async function ensureSafeParent(root, relative, label) {
  const portable = safeRelative(relative, label);
  const segments = portable.split("/").slice(0, -1);
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const info = await lstat(current);
      assert(
        info.isDirectory() && !info.isSymbolicLink(),
        `${label} parent traverses a non-directory or symbolic link.`,
      );
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
      try {
        await mkdir(current);
      } catch (mkdirError) {
        if (errorCode(mkdirError) !== "EEXIST") throw mkdirError;
      }
      const created = await lstat(current);
      assert(
        created.isDirectory() && !created.isSymbolicLink(),
        `${label} parent could not be created safely.`,
      );
    }
  }
  return containedPath(root, portable, label);
}
export async function atomicCreateOrVerify(root, relative, bytes, label) {
  const target = await ensureSafeParent(root, relative, label);
  const existing = await safeReadRegular(root, relative, label, true);
  if (existing) {
    assert(existing.equals(bytes), `${label} already exists with different bytes.`);
    return "reused";
  }
  const temp = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await open(temp, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    try {
      await link(temp, target);
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      const concurrent = await safeReadRegular(root, relative, label);
      assert(
        concurrent.equals(bytes),
        `${label} was concurrently created with different bytes.`,
      );
      return "reused";
    }
    const admitted = await safeReadRegular(root, relative, label);
    assert(admitted.equals(bytes), `${label} failed post-write byte verification.`);
    return "created";
  } finally {
    if (handle) await handle.close().catch(() => {});
    await rm(temp, { force: true }).catch(() => {});
  }
}
