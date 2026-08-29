import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  ANIMATION_SOURCE_BUNDLE_SCHEMA,
  ANIMATION_SOURCE_BUNDLE_SCHEMA_SHA256,
} from "./animation-source-bundle.mjs";
import {
  animationSourceGitBlobSha1,
  assertAnimationSourceContractRelativePath,
  readAnimationSourceContractFileStable,
  resolveAnimationSourceContractRoot,
} from "./animation-source-contract-lock-stable-file.mjs";

export const ANIMATION_SOURCE_CONTRACT_LOCK_SCHEMA =
  "evavo.animation-source-contract-lock.v1";
export const ANIMATION_SOURCE_CONTRACT_SET_DIGEST =
  "sha256:e8ea163a56364cf8fe40c61e9428f6861c891944f7e31f4ccb793f1a447b9314";
export const ANIMATION_SOURCE_CONTRACT_LOCK_PATH =
  "contracts/animation-source-bundle-v1.lock.json";
export const ANIMATION_SOURCE_CONTRACT_PATHS = Object.freeze([
  "contracts/animation-source-bundle-v1.schema.json",
  "contracts/fixtures/animation-source-bundle-v1.json",
  "scripts/lib/animation-source-bundle.mjs",
  "scripts/lib/animation-source-file-observer.mjs",
  "scripts/lib/animation-source-image-probes.mjs",
  "scripts/lib/animation-source-observation-common.mjs",
  "scripts/lib/animation-source-stable-observation.mjs",
]);

const LOCK_MAX_BYTES = 1024 * 1024;
const CONTRACT_FILE_MAX_BYTES = 8 * 1024 * 1024;
const SHA1 = /^[0-9a-f]{40}$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_OBJECT_REQUIRED", label);
  }
  return value;
}

function strict(value, allowed, required, label) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      fail("ANIMATION_SOURCE_CONTRACT_LOCK_UNKNOWN_FIELD", `${label}.${key}`);
    }
  }
  for (const key of required) {
    if (!(key in value)) {
      fail("ANIMATION_SOURCE_CONTRACT_LOCK_FIELD_REQUIRED", `${label}.${key}`);
    }
  }
}

function contractSetDigest(files) {
  const payload = [...files]
    .sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    )
    .map((entry) => `${entry.path}\0${entry.gitBlobSha1}\n`)
    .join("");
  return `sha256:${createHash("sha256").update(payload).digest("hex")}`;
}

export function assertAnimationSourceContractLock(value) {
  const input = object(value, "lock");
  const fields = [
    "schema",
    "contractSchema",
    "schemaSha256",
    "contractSetDigest",
    "files",
    "peerRepositories",
    "authority",
  ];
  strict(input, fields, fields, "lock");
  if (input.schema !== ANIMATION_SOURCE_CONTRACT_LOCK_SCHEMA) {
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_SCHEMA_INVALID");
  }
  if (input.contractSchema !== ANIMATION_SOURCE_BUNDLE_SCHEMA) {
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_CONTRACT_INVALID");
  }
  if (
    typeof input.schemaSha256 !== "string" ||
    !SHA256.test(input.schemaSha256) ||
    input.schemaSha256 !== `sha256:${ANIMATION_SOURCE_BUNDLE_SCHEMA_SHA256}`
  ) {
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_SCHEMA_DIGEST_INVALID");
  }
  if (
    !Array.isArray(input.files) ||
    input.files.length !== ANIMATION_SOURCE_CONTRACT_PATHS.length
  ) {
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_FILE_COUNT_INVALID");
  }

  const files = input.files.map((value, index) => {
    const label = `lock.files[${index}]`;
    const entry = object(value, label);
    strict(entry, ["path", "gitBlobSha1"], ["path", "gitBlobSha1"], label);
    const path = assertAnimationSourceContractRelativePath(
      entry.path,
      `${label}.path`,
    );
    if (typeof entry.gitBlobSha1 !== "string" || !SHA1.test(entry.gitBlobSha1)) {
      fail("ANIMATION_SOURCE_CONTRACT_LOCK_BLOB_INVALID", path);
    }
    return { path, gitBlobSha1: entry.gitBlobSha1 };
  });

  const paths = files.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) {
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_PATH_DUPLICATE");
  }
  if (JSON.stringify(paths) !== JSON.stringify(ANIMATION_SOURCE_CONTRACT_PATHS)) {
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_PATH_SET_INVALID");
  }
  const calculatedSetDigest = contractSetDigest(files);
  if (
    typeof input.contractSetDigest !== "string" ||
    !SHA256.test(input.contractSetDigest) ||
    input.contractSetDigest !== calculatedSetDigest ||
    calculatedSetDigest !== ANIMATION_SOURCE_CONTRACT_SET_DIGEST
  ) {
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_SET_DIGEST_INVALID");
  }

  if (
    !Array.isArray(input.peerRepositories) ||
    JSON.stringify(input.peerRepositories) !==
      JSON.stringify(["evavo-art-studio", "cel-animation-studio"])
  ) {
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_PEERS_INVALID");
  }

  const authority = object(input.authority, "lock.authority");
  strict(
    authority,
    ["networkRequired", "automaticRewrite", "repositoryMutation"],
    ["networkRequired", "automaticRewrite", "repositoryMutation"],
    "lock.authority",
  );
  for (const field of [
    "networkRequired",
    "automaticRewrite",
    "repositoryMutation",
  ]) {
    if (authority[field] !== false) {
      fail("ANIMATION_SOURCE_CONTRACT_LOCK_AUTHORITY_INVALID", field);
    }
  }

  return {
    schema: ANIMATION_SOURCE_CONTRACT_LOCK_SCHEMA,
    contractSchema: ANIMATION_SOURCE_BUNDLE_SCHEMA,
    schemaSha256: input.schemaSha256,
    contractSetDigest: calculatedSetDigest,
    files,
    peerRepositories: [...input.peerRepositories],
    authority: {
      networkRequired: false,
      automaticRewrite: false,
      repositoryMutation: false,
    },
  };
}

async function readLock(root, label) {
  const bytes = await readAnimationSourceContractFileStable(
    root,
    ANIMATION_SOURCE_CONTRACT_LOCK_PATH,
    label,
    LOCK_MAX_BYTES,
  );
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_JSON_INVALID", label);
  }
  return assertAnimationSourceContractLock(value);
}

async function verifyFiles(root, lock, label) {
  const evidence = [];
  for (const entry of lock.files) {
    const bytes = await readAnimationSourceContractFileStable(
      root,
      entry.path,
      label,
      CONTRACT_FILE_MAX_BYTES,
    );
    const actual = animationSourceGitBlobSha1(bytes);
    if (actual !== entry.gitBlobSha1) {
      fail(
        "ANIMATION_SOURCE_CONTRACT_LOCK_FILE_MISMATCH",
        `${label}:${entry.path}:${actual}`,
      );
    }
    evidence.push({
      path: entry.path,
      bytes: bytes.byteLength,
      gitBlobSha1: actual,
      stableIdentityVerified: true,
    });
  }
  return evidence;
}

function defaultPeerRoot(root) {
  const current = basename(root).toLowerCase();
  const peer = current === "evavo-art-studio"
    ? "cel-animation-studio"
    : current === "cel-animation-studio"
      ? "evavo-art-studio"
      : undefined;
  return peer ? resolve(dirname(root), peer) : undefined;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function verifyAnimationSourceContractLock(options = {}) {
  const localRoot = await resolveAnimationSourceContractRoot(
    options.repositoryRoot ??
      fileURLToPath(new URL("../..", import.meta.url)),
    "local",
  );
  const localLock = await readLock(localRoot, "local");
  const localEvidence = await verifyFiles(localRoot, localLock, "local");

  const peerCandidate = options.peerRoot
    ? resolve(options.peerRoot)
    : process.env.EVAVO_ANIMATION_SOURCE_PEER_ROOT
      ? resolve(process.env.EVAVO_ANIMATION_SOURCE_PEER_ROOT)
      : defaultPeerRoot(localRoot);
  const peerPresent = peerCandidate ? await exists(peerCandidate) : false;
  if (!peerPresent) {
    if (options.requirePeer) {
      fail("ANIMATION_SOURCE_CONTRACT_LOCK_PEER_REQUIRED");
    }
    return {
      schema: "evavo.animation-source-contract-lock-verification.v1",
      contractSetDigest: localLock.contractSetDigest,
      localEvidence,
      peer: { status: "not-present" },
      authority: {
        networkRequired: false,
        automaticRewrite: false,
        repositoryMutation: false,
      },
    };
  }

  const peerRoot = await resolveAnimationSourceContractRoot(
    peerCandidate,
    "peer",
  );
  const peerLock = await readLock(peerRoot, "peer");
  if (JSON.stringify(peerLock) !== JSON.stringify(localLock)) {
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_PEER_LOCK_MISMATCH");
  }
  const peerEvidence = await verifyFiles(peerRoot, peerLock, "peer");
  return {
    schema: "evavo.animation-source-contract-lock-verification.v1",
    contractSetDigest: localLock.contractSetDigest,
    localEvidence,
    peer: {
      status: "matched",
      root: peerRoot,
      evidence: peerEvidence,
    },
    authority: {
      networkRequired: false,
      automaticRewrite: false,
      repositoryMutation: false,
    },
  };
}
