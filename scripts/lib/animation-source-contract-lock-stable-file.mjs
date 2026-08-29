import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import {
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

const SAFE_PATH = /^(?!\/)(?![A-Za-z]:)(?!.*\\)(?!.*\/\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[^\u0000-\u001f\u007f]+$/u;

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

export function assertAnimationSourceContractRelativePath(value, label) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 1024 ||
    value.normalize("NFC") !== value ||
    !SAFE_PATH.test(value)
  ) {
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_PATH_INVALID", label);
  }
  return value;
}

function contained(root, path) {
  const relativePath = assertAnimationSourceContractRelativePath(path, path);
  const candidate = resolve(root, ...relativePath.split("/"));
  const lexical = relative(root, candidate);
  if (
    lexical === "" ||
    lexical === ".." ||
    lexical.startsWith(`..${sep}`) ||
    isAbsolute(lexical)
  ) {
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_PATH_ESCAPES_ROOT", path);
  }
  return candidate;
}

function isContained(root, candidate) {
  const relation = relative(root, candidate);
  return (
    relation !== "" &&
    relation !== ".." &&
    !relation.startsWith(`..${sep}`) &&
    !isAbsolute(relation)
  );
}

function bigintText(value) {
  return typeof value === "bigint" ? value.toString() : String(value);
}

function fingerprint(value) {
  return {
    dev: bigintText(value.dev),
    ino: bigintText(value.ino),
    mode: bigintText(value.mode),
    nlink: bigintText(value.nlink),
    size: bigintText(value.size),
    mtimeNs: bigintText(value.mtimeNs),
    ctimeNs: bigintText(value.ctimeNs),
    birthtimeNs: bigintText(value.birthtimeNs),
  };
}

function sameFingerprint(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function pathState(path, missingCode, detail) {
  try {
    return await lstat(path, { bigint: true });
  } catch (error) {
    if (error?.code === "ENOENT") fail(missingCode, detail);
    throw error;
  }
}

export async function resolveAnimationSourceContractRoot(value, label) {
  let root;
  try {
    root = await realpath(resolve(value));
  } catch (error) {
    if (error?.code === "ENOENT") {
      fail("ANIMATION_SOURCE_CONTRACT_LOCK_ROOT_MISSING", label);
    }
    throw error;
  }
  const details = await lstat(root);
  if (!details.isDirectory()) {
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_ROOT_NOT_DIRECTORY", label);
  }
  return root;
}

export async function readAnimationSourceContractFileStable(
  root,
  relativePath,
  label,
  maximumBytes,
) {
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    maximumBytes > 64 * 1024 * 1024
  ) {
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_MAX_BYTES_INVALID", relativePath);
  }

  const candidate = contained(root, relativePath);
  const detail = `${label}:${relativePath}`;
  const pathBefore = await pathState(
    candidate,
    "ANIMATION_SOURCE_CONTRACT_LOCK_FILE_MISSING",
    detail,
  );
  if (pathBefore.isSymbolicLink()) {
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_SYMLINK_FORBIDDEN", detail);
  }
  if (!pathBefore.isFile()) {
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_NOT_FILE", detail);
  }
  if (pathBefore.size < 1n || pathBefore.size > BigInt(maximumBytes)) {
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_FILE_SIZE_INVALID", detail);
  }

  let candidateReal;
  try {
    candidateReal = await realpath(candidate);
  } catch (error) {
    if (error?.code === "ENOENT") {
      fail("ANIMATION_SOURCE_CONTRACT_LOCK_PATH_REPLACED", detail);
    }
    throw error;
  }
  if (!isContained(root, candidateReal)) {
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_REALPATH_ESCAPES_ROOT", detail);
  }

  const flags =
    fsConstants.O_RDONLY |
    (typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0);
  const handle = await open(candidateReal, flags);
  let openedFingerprint;
  let bytes;
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile()) {
      fail("ANIMATION_SOURCE_CONTRACT_LOCK_NOT_FILE", detail);
    }
    openedFingerprint = fingerprint(opened);
    if (!sameFingerprint(fingerprint(pathBefore), openedFingerprint)) {
      fail(
        "ANIMATION_SOURCE_CONTRACT_LOCK_IDENTITY_CHANGED_BEFORE_OPEN",
        detail,
      );
    }
    bytes = await handle.readFile();
    const afterHandle = await handle.stat({ bigint: true });
    if (
      bytes.byteLength !== Number(afterHandle.size) ||
      !sameFingerprint(openedFingerprint, fingerprint(afterHandle))
    ) {
      fail(
        "ANIMATION_SOURCE_CONTRACT_LOCK_FILE_CHANGED_WHILE_READING",
        detail,
      );
    }
  } finally {
    await handle.close();
  }

  const pathAfter = await pathState(
    candidate,
    "ANIMATION_SOURCE_CONTRACT_LOCK_PATH_REPLACED",
    detail,
  );
  let realAfter;
  try {
    realAfter = await realpath(candidate);
  } catch (error) {
    if (error?.code === "ENOENT") {
      fail("ANIMATION_SOURCE_CONTRACT_LOCK_PATH_REPLACED", detail);
    }
    throw error;
  }
  if (
    pathAfter.isSymbolicLink() ||
    !pathAfter.isFile() ||
    !sameFingerprint(openedFingerprint, fingerprint(pathAfter)) ||
    realAfter !== candidateReal
  ) {
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_PATH_REPLACED", detail);
  }
  return bytes;
}

export function animationSourceGitBlobSha1(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
  return createHash("sha1")
    .update(header)
    .update(bytes)
    .digest("hex");
}
