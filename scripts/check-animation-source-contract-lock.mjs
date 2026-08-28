#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  access,
  readFile,
  stat,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ANIMATION_SOURCE_BUNDLE_SCHEMA,
  ANIMATION_SOURCE_BUNDLE_SCHEMA_SHA256,
} from "./lib/animation-source-bundle.mjs";

export const ANIMATION_SOURCE_CONTRACT_LOCK_SCHEMA =
  "evavo.animation-source-contract-lock.v1";

const LOCK_PATH =
  "contracts/animation-source-bundle-v1.lock.json";
const EXPECTED_PATHS = Object.freeze([
  "contracts/animation-source-bundle-v1.schema.json",
  "contracts/fixtures/animation-source-bundle-v1.json",
  "scripts/lib/animation-source-bundle.mjs",
]);
const SHA1 = /^[0-9a-f]{40}$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const SAFE_PATH = /^(?!\/)(?![A-Za-z]:)(?!.*\\)(?!.*\/\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[^\u0000-\u001f\u007f]+$/u;

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

function safeRelativePath(value, label) {
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
  const relativePath = safeRelativePath(path, path);
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

export function gitBlobSha1(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
  return createHash("sha1")
    .update(header)
    .update(bytes)
    .digest("hex");
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
  if (!Array.isArray(input.files) || input.files.length !== EXPECTED_PATHS.length) {
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_FILE_COUNT_INVALID");
  }

  const files = input.files.map((value, index) => {
    const label = `lock.files[${index}]`;
    const entry = object(value, label);
    strict(entry, ["path", "gitBlobSha1"], ["path", "gitBlobSha1"], label);
    const path = safeRelativePath(entry.path, `${label}.path`);
    if (typeof entry.gitBlobSha1 !== "string" || !SHA1.test(entry.gitBlobSha1)) {
      fail("ANIMATION_SOURCE_CONTRACT_LOCK_BLOB_INVALID", path);
    }
    return { path, gitBlobSha1: entry.gitBlobSha1 };
  });

  const paths = files.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) {
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_PATH_DUPLICATE");
  }
  if (JSON.stringify(paths) !== JSON.stringify(EXPECTED_PATHS)) {
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_PATH_SET_INVALID");
  }
  const calculatedSetDigest = contractSetDigest(files);
  if (
    typeof input.contractSetDigest !== "string" ||
    !SHA256.test(input.contractSetDigest) ||
    input.contractSetDigest !== calculatedSetDigest
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

async function readLock(root) {
  const value = JSON.parse(await readFile(contained(root, LOCK_PATH), "utf8"));
  return assertAnimationSourceContractLock(value);
}

async function verifyFiles(root, lock, label) {
  const evidence = [];
  for (const entry of lock.files) {
    const path = contained(root, entry.path);
    const details = await stat(path);
    if (!details.isFile()) {
      fail("ANIMATION_SOURCE_CONTRACT_LOCK_NOT_FILE", `${label}:${entry.path}`);
    }
    const bytes = await readFile(path);
    const actual = gitBlobSha1(bytes);
    if (actual !== entry.gitBlobSha1) {
      fail(
        "ANIMATION_SOURCE_CONTRACT_LOCK_FILE_MISMATCH",
        `${label}:${entry.path}:${actual}`,
      );
    }
    evidence.push({
      path: entry.path,
      bytes: details.size,
      gitBlobSha1: actual,
    });
  }
  return evidence;
}

function parseArguments(values) {
  const options = { requirePeer: false };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--require-peer") {
      options.requirePeer = true;
      continue;
    }
    if (value === "--peer") {
      const peer = values[index + 1];
      if (!peer || peer.startsWith("--")) {
        fail("ANIMATION_SOURCE_CONTRACT_LOCK_PEER_VALUE_REQUIRED");
      }
      if (options.peer !== undefined) {
        fail("ANIMATION_SOURCE_CONTRACT_LOCK_OPTION_DUPLICATE", "--peer");
      }
      options.peer = peer;
      index += 1;
      continue;
    }
    if (value === "--help" || value === "-h") {
      process.stdout.write(
        [
          "Usage: node scripts/check-animation-source-contract-lock.mjs [--peer <repo-root>] [--require-peer]",
          "",
          "Checks the local contract bytes and, when present or required, the sibling studio copy.",
          "",
        ].join("\n"),
      );
      process.exit(0);
    }
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_OPTION_UNKNOWN", value);
  }
  return options;
}

function defaultPeerRoot(repositoryRoot) {
  const current = basename(repositoryRoot).toLowerCase();
  const peer = current === "evavo-art-studio"
    ? "cel-animation-studio"
    : current === "cel-animation-studio"
      ? "evavo-art-studio"
      : undefined;
  return peer ? resolve(dirname(repositoryRoot), peer) : undefined;
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
  const repositoryRoot = resolve(
    options.repositoryRoot ??
      fileURLToPath(new URL("..", import.meta.url)),
  );
  const localLock = await readLock(repositoryRoot);
  const localEvidence = await verifyFiles(repositoryRoot, localLock, "local");

  const peerRoot = options.peerRoot
    ? resolve(options.peerRoot)
    : process.env.EVAVO_ANIMATION_SOURCE_PEER_ROOT
      ? resolve(process.env.EVAVO_ANIMATION_SOURCE_PEER_ROOT)
      : defaultPeerRoot(repositoryRoot);
  const peerPresent = peerRoot ? await exists(peerRoot) : false;
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

  const peerLock = await readLock(peerRoot);
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

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  const parsed = parseArguments(process.argv.slice(2));
  verifyAnimationSourceContractLock({
    ...(parsed.peer ? { peerRoot: parsed.peer } : {}),
    requirePeer: parsed.requirePeer,
  }).then(
    (result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    },
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
