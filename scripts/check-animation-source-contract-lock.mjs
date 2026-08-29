#!/usr/bin/env node

import process from "node:process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export {
  ANIMATION_SOURCE_CONTRACT_LOCK_PATH,
  ANIMATION_SOURCE_CONTRACT_LOCK_SCHEMA,
  ANIMATION_SOURCE_CONTRACT_PATHS,
  ANIMATION_SOURCE_CONTRACT_SET_DIGEST,
  assertAnimationSourceContractLock,
  verifyAnimationSourceContractLock,
} from "./lib/animation-source-contract-lock.mjs";

import {
  verifyAnimationSourceContractLock,
} from "./lib/animation-source-contract-lock.mjs";

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function parseArguments(values) {
  const options = { requirePeer: false };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--require-peer") {
      if (options.requirePeer) {
        fail("ANIMATION_SOURCE_CONTRACT_LOCK_OPTION_DUPLICATE", value);
      }
      options.requirePeer = true;
      continue;
    }
    if (value === "--peer") {
      const peer = values[index + 1];
      if (!peer || peer.startsWith("--")) {
        fail("ANIMATION_SOURCE_CONTRACT_LOCK_PEER_VALUE_REQUIRED");
      }
      if (options.peer !== undefined) {
        fail("ANIMATION_SOURCE_CONTRACT_LOCK_OPTION_DUPLICATE", value);
      }
      options.peer = peer;
      index += 1;
      continue;
    }
    if (value === "--help" || value === "-h") {
      return { help: true };
    }
    fail("ANIMATION_SOURCE_CONTRACT_LOCK_OPTION_UNKNOWN", value);
  }
  return options;
}

function usage() {
  return [
    "Usage: node scripts/check-animation-source-contract-lock.mjs [--peer <repo-root>] [--require-peer]",
    "",
    "Checks stable local contract and verifier bytes and, when present or required, the sibling studio copy.",
  ].join("\n");
}

export async function runAnimationSourceContractLockCli(args) {
  const parsed = parseArguments(args);
  if (parsed.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = await verifyAnimationSourceContractLock({
    ...(parsed.peer ? { peerRoot: parsed.peer } : {}),
    requirePeer: parsed.requirePeer,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  runAnimationSourceContractLockCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
