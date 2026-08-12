#!/usr/bin/env node
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
    "  node scripts/heavy-metal-fighting-production-workspace.mjs materialize --workspace-root <persistent-artist-workspace>",
    "",
    "The registry deterministically compiles the exact 1,573-image production campaign into 179 governed batches from existing HMF authorities. It never calls providers or approves/promotes art.",
    "materialize only creates governed subdirectories inside an already-created persistent Artist Workspace. It does not call providers, approve art, touch the game repository, commit, push or publish.",
  ].join("\n");
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
