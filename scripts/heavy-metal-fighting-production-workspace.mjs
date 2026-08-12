#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import process from "node:process";

import {
  heavyMetalFightingBatchPolicy,
  heavyMetalFightingStyleContract,
  heavyMetalFightingWorkspaceLayout,
  materializeHmfArtProductionWorkspace,
  verifyHmfArtProductionWorkspace,
} from "./heavy-metal-fighting/art-production-workspace.mjs";
import {
  buildHmfProductionBatchRegistry,
  heavyMetalFightingProductionRegistryBatch,
  heavyMetalFightingProductionRegistrySummary,
  heavyMetalFightingProductionRegistryUnit,
  verifyHmfProductionBatchRegistry,
} from "./heavy-metal-fighting/batch-registry.mjs";
import {
  buildHmfProductionWorkOrderBatch,
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionReceiptTemplate,
  heavyMetalFightingProductionRepairTemplate,
  heavyMetalFightingProductionWorkOrder,
  verifyHmfProductionWorkOrders,
} from "./heavy-metal-fighting/work-orders.mjs";

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}
function usage() {
  return [
    "HEAVY METAL FIGHTING production workspace",
    "",
    "Usage:",
    "  node scripts/heavy-metal-fighting-production-workspace.mjs verify",
    "  node scripts/heavy-metal-fighting-production-workspace.mjs layout",
    "  node scripts/heavy-metal-fighting-production-workspace.mjs style",
    "  node scripts/heavy-metal-fighting-production-workspace.mjs batch-policy",
    "  node scripts/heavy-metal-fighting-production-workspace.mjs registry-verify",
    "  node scripts/heavy-metal-fighting-production-workspace.mjs registry-summary",
    "  node scripts/heavy-metal-fighting-production-workspace.mjs registry",
    "  node scripts/heavy-metal-fighting-production-workspace.mjs registry-batch <1-179|hmf-b0001>",
    "  node scripts/heavy-metal-fighting-production-workspace.mjs registry-unit <unit-id>",
    "  node scripts/heavy-metal-fighting-production-workspace.mjs work-order-verify",
    "  node scripts/heavy-metal-fighting-production-workspace.mjs work-order-batch <1-179|hmf-b0001>",
    "  node scripts/heavy-metal-fighting-production-workspace.mjs work-order <unit-id>",
    "  node scripts/heavy-metal-fighting-production-workspace.mjs receipt-template <unit-id>",
    "  node scripts/heavy-metal-fighting-production-workspace.mjs repair-template <unit-id> --candidate-sha <sha256> --failure-codes <code,code> [--attempt <n>]",
    "  node scripts/heavy-metal-fighting-production-workspace.mjs resume-batch <1-179|hmf-b0001> [--receipts-json <path>]",
    "  node scripts/heavy-metal-fighting-production-workspace.mjs materialize --workspace-root <persistent-artist-workspace>",
    "",
    "The registry deterministically compiles the exact 1,573-image production campaign into 179 governed batches from existing HMF authorities.",
    "The work-order layer compiles immutable one-image jobs, receipt templates, bounded repairs and resume plans. It never calls a provider or approves/promotes art.",
    "materialize only creates governed subdirectories inside an already-created persistent Artist Workspace. It does not call providers, approve art, touch the game repository, commit, push or publish.",
  ].join("\n");
}
async function receiptsFromFile(filePath) {
  if (!filePath) return [];
  const parsed = JSON.parse(await readFile(filePath, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("--receipts-json must contain a JSON array of production receipts.");
  return parsed;
}
async function run(argv = process.argv.slice(2)) {
  const command = argv[0] ?? "verify";
  if (command === "verify") return verifyHmfArtProductionWorkspace();
  if (command === "layout") return heavyMetalFightingWorkspaceLayout();
  if (command === "style") return heavyMetalFightingStyleContract();
  if (command === "batch-policy") return heavyMetalFightingBatchPolicy();
  if (command === "registry-verify") return verifyHmfProductionBatchRegistry();
  if (command === "registry-summary") return heavyMetalFightingProductionRegistrySummary();
  if (command === "registry") return buildHmfProductionBatchRegistry();
  if (command === "registry-batch") {
    if (argv.length !== 2) throw new Error(`registry-batch requires one sequence or hmf-bXXXX id.\n\n${usage()}`);
    return heavyMetalFightingProductionRegistryBatch(argv[1]);
  }
  if (command === "registry-unit") {
    if (argv.length !== 2) throw new Error(`registry-unit requires one exact unit id.\n\n${usage()}`);
    return heavyMetalFightingProductionRegistryUnit(argv[1]);
  }
  if (command === "work-order-verify") return verifyHmfProductionWorkOrders();
  if (command === "work-order-batch") {
    if (argv.length !== 2) throw new Error(`work-order-batch requires one sequence or hmf-bXXXX id.\n\n${usage()}`);
    return buildHmfProductionWorkOrderBatch(argv[1]);
  }
  if (command === "work-order") {
    if (argv.length !== 2) throw new Error(`work-order requires one exact unit id.\n\n${usage()}`);
    return heavyMetalFightingProductionWorkOrder(argv[1]);
  }
  if (command === "receipt-template") {
    if (argv.length !== 2) throw new Error(`receipt-template requires one exact unit id.\n\n${usage()}`);
    return heavyMetalFightingProductionReceiptTemplate(argv[1]);
  }
  if (command === "repair-template") {
    const unitId = argv[1];
    const candidateSha256 = option(argv.slice(2), "--candidate-sha");
    const codes = option(argv.slice(2), "--failure-codes");
    const attempt = Number(option(argv.slice(2), "--attempt") ?? 1);
    if (!unitId || !candidateSha256 || !codes) throw new Error(`repair-template requires unit id, --candidate-sha and --failure-codes.\n\n${usage()}`);
    return heavyMetalFightingProductionRepairTemplate(unitId, { candidateSha256, failureCodes: codes.split(",").map((value) => value.trim()).filter(Boolean), attempt });
  }
  if (command === "resume-batch") {
    const batchId = argv[1];
    if (!batchId) throw new Error(`resume-batch requires one batch id or sequence.\n\n${usage()}`);
    const receipts = await receiptsFromFile(option(argv.slice(2), "--receipts-json"));
    return heavyMetalFightingProductionBatchResumePlan(batchId, receipts);
  }
  if (command === "materialize") {
    const workspaceRoot = option(argv.slice(1), "--workspace-root");
    if (!workspaceRoot) throw new Error(`materialize requires --workspace-root.\n\n${usage()}`);
    return materializeHmfArtProductionWorkspace(workspaceRoot);
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
