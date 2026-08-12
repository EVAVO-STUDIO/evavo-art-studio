#!/usr/bin/env node
import process from "node:process";

import {
  heavyMetalFightingBatch,
  heavyMetalFightingFramePlan,
  heavyMetalFightingHandoffTemplate,
  heavyMetalFightingMechanicalContract,
  heavyMetalFightingRuntimeSlot,
  heavyMetalFightingSourceCel,
  heavyMetalFightingStyleProof,
  heavyMetalFightingSummary,
  verifyHeavyMetalFightingStudio,
} from "./heavy-metal-fighting/studio-runtime.mjs";

const COMMANDS = Object.freeze([
  "verify",
  "summary",
  "contract",
  "frame",
  "cel",
  "slot",
  "batch",
  "style-proof",
  "handoff-template",
]);

function usage() {
  return [
    "HEAVY METAL FIGHTING Art Studio adapter",
    "",
    "Usage:",
    "  node scripts/heavy-metal-fighting-art-studio.mjs verify",
    "  node scripts/heavy-metal-fighting-art-studio.mjs summary",
    "  node scripts/heavy-metal-fighting-art-studio.mjs contract",
    "  node scripts/heavy-metal-fighting-art-studio.mjs frame <bastion|viper|citadel|mirage>",
    "  node scripts/heavy-metal-fighting-art-studio.mjs cel <frame-id> <0-119>",
    "  node scripts/heavy-metal-fighting-art-studio.mjs slot <frame-id> <current|planned-v2> <0-119>",
    "  node scripts/heavy-metal-fighting-art-studio.mjs batch <1-119>",
    "  node scripts/heavy-metal-fighting-art-studio.mjs style-proof",
    "  node scripts/heavy-metal-fighting-art-studio.mjs handoff-template <game-commit-sha> <live-slot-manifest-sha256>",
    "",
    "The adapter is planning and review only. It never calls a provider, approves art, mutates the game repository, commits, pushes or publishes.",
  ].join("\n");
}

async function run(argv = process.argv.slice(2)) {
  const [command = "summary", ...argumentsList] = argv;
  if (!COMMANDS.includes(command)) throw new Error(`Unknown command ${command}.\n\n${usage()}`);
  if (command === "verify") return verifyHeavyMetalFightingStudio();
  if (command === "summary") return heavyMetalFightingSummary();
  if (command === "contract") return heavyMetalFightingMechanicalContract();
  if (command === "style-proof") return heavyMetalFightingStyleProof();
  if (command === "frame") {
    if (argumentsList.length !== 1) throw new Error(`frame requires one Frame id.\n\n${usage()}`);
    return heavyMetalFightingFramePlan(argumentsList[0]);
  }
  if (command === "cel") {
    if (argumentsList.length !== 2 || !/^\d+$/.test(argumentsList[1])) throw new Error(`cel requires a Frame id and integer source index.\n\n${usage()}`);
    return heavyMetalFightingSourceCel(argumentsList[0], Number(argumentsList[1]));
  }
  if (command === "slot") {
    if (argumentsList.length !== 3 || !/^\d+$/.test(argumentsList[2])) throw new Error(`slot requires a Frame id, current or planned-v2, and an integer slot.\n\n${usage()}`);
    return heavyMetalFightingRuntimeSlot(argumentsList[0], argumentsList[1], Number(argumentsList[2]));
  }
  if (command === "batch") {
    if (argumentsList.length !== 1 || !/^\d+$/.test(argumentsList[0])) throw new Error(`batch requires one integer batch number.\n\n${usage()}`);
    return heavyMetalFightingBatch(Number(argumentsList[0]));
  }
  if (command === "handoff-template") {
    if (argumentsList.length !== 2) throw new Error(`handoff-template requires a game commit SHA and live slot-manifest SHA-256.\n\n${usage()}`);
    return heavyMetalFightingHandoffTemplate({
      gameRevisionSha: argumentsList[0],
      liveSlotManifestSha256: argumentsList[1],
    });
  }
  throw new Error(`Unhandled command ${command}.`);
}

run().then((result) => {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result?.status === "failed") process.exitCode = 1;
}).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
