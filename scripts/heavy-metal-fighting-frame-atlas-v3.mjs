#!/usr/bin/env node
import { open, readFile } from "node:fs/promises";
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
    "admit-game-validation reads one completed steel-dominion local Godot validation receipt, binds its exact bytes and six-suite semantics to the explicitly expected game commit, and emits read-only self-hashed Art Studio evidence. It does not read or mutate steel-dominion, activate its runtime, commit, push, deploy or publish.",
  ].join("\n");
}

async function readBoundedGameValidationReceipt(filePath) {
  const resolved = path.resolve(filePath);
  const handle = await open(resolved, "r");
  try {
    const initial = await handle.stat();
    if (!initial.isFile()) {
      throw new Error("--validation-receipt must resolve to a regular file.");
    }
    if (
      !Number.isSafeInteger(initial.size) ||
      initial.size < 1 ||
      initial.size > HMF_ATLAS_V3_GAME_VALIDATION_MAXIMUM_RECEIPT_BYTES
    ) {
      throw new Error(
        `--validation-receipt must be between 1 and ${HMF_ATLAS_V3_GAME_VALIDATION_MAXIMUM_RECEIPT_BYTES} bytes before reading.`,
      );
    }

    const receiptBytes = Buffer.allocUnsafe(initial.size);
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
    const final = await handle.stat();
    if (
      extraBytes !== 0 ||
      !final.isFile() ||
      final.size !== initial.size
    ) {
      throw new Error("--validation-receipt changed size while being read.");
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
