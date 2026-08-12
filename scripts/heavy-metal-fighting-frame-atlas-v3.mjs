#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  buildHmfFrameAtlasV3Layout,
  compileHmfFrameAtlasV3DeliveryPlanFile,
  verifyHmfFrameAtlasV3Delivery,
} from "./heavy-metal-fighting/frame-atlas-v3-delivery.mjs";

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
    "",
    "Build the compiled plan with:",
    "  python tools/build_heavy_metal_fighting_frame_atlas_v3.py --plan <plan.json> --output-root <new-create-only-delivery-directory>",
    "",
    "The compiler requires complete named-human-approved receipt chains and a complete four-phase style proof. The builder writes only to a new child directory beneath the governed persistent Artist Workspace export parent. Neither command writes to steel-dominion, commits, pushes, deploys or publishes.",
  ].join("\n");
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
  throw new Error(`Unknown command ${command}.\n\n${usage()}`);
}

run().then((result) => {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result?.status === "failed") process.exitCode = 1;
}).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
