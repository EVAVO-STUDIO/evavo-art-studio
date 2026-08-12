#!/usr/bin/env node
import process from "node:process";

import {
  heavyMetalFightingBatchPolicy,
  heavyMetalFightingStyleContract,
  heavyMetalFightingWorkspaceLayout,
  materializeHmfArtProductionWorkspace,
  verifyHmfArtProductionWorkspace,
} from "./heavy-metal-fighting/art-production-workspace.mjs";

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
    "  node scripts/heavy-metal-fighting-production-workspace.mjs materialize --workspace-root <persistent-artist-workspace>",
    "",
    "materialize only creates governed subdirectories inside an already-created persistent Artist Workspace. It does not call providers, approve art, touch the game repository, commit, push or publish.",
  ].join("\n");
}

async function run(argv = process.argv.slice(2)) {
  const command = argv[0] ?? "verify";
  if (command === "verify") return verifyHmfArtProductionWorkspace();
  if (command === "layout") return heavyMetalFightingWorkspaceLayout();
  if (command === "style") return heavyMetalFightingStyleContract();
  if (command === "batch-policy") return heavyMetalFightingBatchPolicy();
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
