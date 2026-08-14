#!/usr/bin/env node
import { constants } from "node:fs";
import { lstat, open, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  buildHmfFrameAtlasV3Layout,
  compileHmfFrameAtlasV3DeliveryPlanFile,
  verifyHmfFrameAtlasV3Delivery,
} from "./heavy-metal-fighting/frame-atlas-v3-delivery.mjs";
import {
  admitHmfAtlasV3GameValidationReceipt,
  HMF_ATLAS_V3_GAME_VALIDATION_MAXIMUM_RECEIPT_BYTES,
} from "./heavy-metal-fighting/frame-atlas-v3-game-validation-admission.mjs";

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}
function usage() {
  return [
    "HEAVY METAL FIGHTING Frame atlas-v3 delivery",
    "",
    "Usage:",
    "  node scripts/heavy-metal-fighting-frame-atlas-v3.mjs verify",
    "  node scripts/heavy-metal-fighting-frame-atlas-v3.mjs layout <bastion|viper|citadel|mirage>",
    "  node scripts/heavy-metal-fighting-frame-atlas-v3.mjs compile <frame> --workspace-root <root> --frame-receipts-json <file> --style-proof-approvals-json <file> --style-proof-receipts-json <file> --output <plan.json> [--compiled-at <UTC>]",
    "  node scripts/heavy-metal-fighting-frame-atlas-v3.mjs admit-game-validation --validation-receipt <steel-dominion-validation.json> --expected-game-head <40-char-sha>",
    "",
    "Build the compiled plan with:",
    "  python tools/build_heavy_metal_fighting_frame_atlas_v3.py --plan <plan.json> --output-root <new-create-only-delivery-directory>",
    "",
    "The compiler snapshots all caller input before asynchronous work. --output must be a new .json file inside the governed persistent Artist Workspace; it is staged, synchronised, atomically linked without replacement and read back byte-for-byte.",
    "",
    "admit-game-validation reads one completed steel-dominion local Godot validation receipt through a stable single-link regular-file boundary, rejects symbolic-link or junction path components, binds its exact bytes and six-suite semantics to the explicitly expected game commit, and emits read-only self-hashed Art Studio evidence. It does not read or mutate steel-dominion, activate its runtime, commit, push, deploy or publish.",
  ].join("\n");
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameStableFile(left, right) {
  return (
    sameFileIdentity(left, right) &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.nlink === right.nlink
  );
}

async function inspectValidationReceiptPathChain(resolved) {
  const parsed = path.parse(resolved);
  const segments = path.relative(parsed.root, resolved).split(path.sep).filter(Boolean);
  let current = parsed.root;
  const entries = [];
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    const info = await lstat(current, { bigint: true });
    if (info.isSymbolicLink()) {
      throw new Error(`--validation-receipt path may not contain a symbolic link or junction: ${current}`);
    }
    const final = index === segments.length - 1;
    if (!final && !info.isDirectory()) {
      throw new Error(`--validation-receipt parent path must remain a directory: ${current}`);
    }
    entries.push(Object.freeze({ path: current, info }));
  }
  if (entries.length === 0) {
    throw new Error("--validation-receipt must name a file, not a filesystem root.");
  }
  const initial = entries.at(-1).info;
  if (!initial.isFile()) {
    throw new Error("--validation-receipt must resolve to a regular file.");
  }
  if (initial.nlink !== 1n) {
    throw new Error("--validation-receipt must have exactly one filesystem link.");
  }
  if (
    initial.size < 1n ||
    initial.size > BigInt(HMF_ATLAS_V3_GAME_VALIDATION_MAXIMUM_RECEIPT_BYTES)
  ) {
    throw new Error(
      `--validation-receipt must be between 1 and ${HMF_ATLAS_V3_GAME_VALIDATION_MAXIMUM_RECEIPT_BYTES} bytes before reading.`,
    );
  }
  return Object.freeze(entries);
}

function assertPathChainUnchanged(before, after) {
  if (before.length !== after.length) {
    throw new Error("--validation-receipt path changed while being admitted.");
  }
  for (const [index, prior] of before.entries()) {
    const current = after[index];
    if (prior.path !== current.path || !sameFileIdentity(prior.info, current.info)) {
      throw new Error(`--validation-receipt path component changed identity while being admitted: ${prior.path}`);
    }
  }
}

async function readBoundedGameValidationReceipt(filePath) {
  const resolved = path.resolve(filePath);
  const initialChain = await inspectValidationReceiptPathChain(resolved);
  const initialPath = initialChain.at(-1).info;
  const noFollow = process.platform === "win32" ? 0 : (constants.O_NOFOLLOW ?? 0);
  const handle = await open(resolved, constants.O_RDONLY | noFollow);
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile()) {
      throw new Error("--validation-receipt must remain a regular file after opening.");
    }
    if (opened.nlink !== 1n) {
      throw new Error("--validation-receipt must remain a single-link file after opening.");
    }
    if (!sameStableFile(initialPath, opened)) {
      throw new Error("--validation-receipt changed identity or metadata before reading.");
    }
    const openedChain = await inspectValidationReceiptPathChain(resolved);
    assertPathChainUnchanged(initialChain, openedChain);

    const receiptBytes = Buffer.allocUnsafe(Number(opened.size));
    let offset = 0;
    while (offset < receiptBytes.length) {
      const { bytesRead } = await handle.read(
        receiptBytes,
        offset,
        receiptBytes.length - offset,
        offset,
      );
      if (bytesRead === 0) {
        throw new Error("--validation-receipt was truncated while being read.");
      }
      offset += bytesRead;
    }

    const growthProbe = Buffer.allocUnsafe(1);
    const { bytesRead: extraBytes } = await handle.read(
      growthProbe,
      0,
      growthProbe.length,
      offset,
    );
    const finalHandle = await handle.stat({ bigint: true });
    if (extraBytes !== 0 || !finalHandle.isFile() || !sameStableFile(opened, finalHandle)) {
      throw new Error("--validation-receipt changed while being read.");
    }

    const finalChain = await inspectValidationReceiptPathChain(resolved);
    assertPathChainUnchanged(openedChain, finalChain);
    if (!sameStableFile(finalHandle, finalChain.at(-1).info)) {
      throw new Error("--validation-receipt path changed identity after reading.");
    }
    return receiptBytes;
  } finally {
    await handle.close();
  }
}
async function jsonArray(filePath, label) {
  if (!filePath) throw new Error(`${label} is required.\n\n${usage()}`);
  const parsed = JSON.parse(await readFile(path.resolve(filePath), "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${label} must contain a JSON array.`);
  return parsed;
}
async function run(argv = process.argv.slice(2)) {
  const command = argv[0] ?? "verify";
  if (command === "verify") return verifyHmfFrameAtlasV3Delivery();
  if (command === "layout") {
    if (argv.length !== 2) throw new Error(`layout requires one Frame id.\n\n${usage()}`);
    return buildHmfFrameAtlasV3Layout(argv[1]);
  }
  if (command === "compile") {
    const frameId = argv[1];
    const workspaceRoot = option(argv.slice(2), "--workspace-root");
    const output = option(argv.slice(2), "--output");
    const compiledAt = option(argv.slice(2), "--compiled-at");
    if (!frameId || !workspaceRoot || !output) throw new Error(`compile requires frame, --workspace-root and --output.\n\n${usage()}`);
    const frameReceipts = await jsonArray(option(argv.slice(2), "--frame-receipts-json"), "--frame-receipts-json");
    const styleProofApprovalRecords = await jsonArray(option(argv.slice(2), "--style-proof-approvals-json"), "--style-proof-approvals-json");
    const styleProofReceipts = await jsonArray(option(argv.slice(2), "--style-proof-receipts-json"), "--style-proof-receipts-json");
    return compileHmfFrameAtlasV3DeliveryPlanFile({
      frameId,
      workspaceRoot,
      frameReceipts,
      styleProofApprovalRecords,
      styleProofReceipts,
      ...(compiledAt ? { compiledAt } : {}),
    }, output);
  }
  if (command === "admit-game-validation") {
    const validationReceipt = option(argv.slice(1), "--validation-receipt");
    const expectedGameHead = option(argv.slice(1), "--expected-game-head");
    if (!validationReceipt || !expectedGameHead) {
      throw new Error(`admit-game-validation requires --validation-receipt and --expected-game-head.\n\n${usage()}`);
    }
    const receiptBytes = await readBoundedGameValidationReceipt(validationReceipt);
    return admitHmfAtlasV3GameValidationReceipt({ receiptBytes, expectedGameHead });
  }
  throw new Error(`Unknown command ${command}.\n\n${usage()}`);
}

run().then((result) => {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result?.status === "failed") process.exitCode = 1;
}).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
