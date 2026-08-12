#!/usr/bin/env node
import process from "node:process";

import {
  heavyMetalFightingAssetAllocation,
  heavyMetalFightingAttractModePlan,
  heavyMetalFightingBatch,
  heavyMetalFightingCombatPresentationContract,
  heavyMetalFightingFrameMoveRoster,
  heavyMetalFightingFramePlan,
  heavyMetalFightingHandoffTemplate,
  heavyMetalFightingIntroPlan,
  heavyMetalFightingMechanicalContract,
  heavyMetalFightingMovePlan,
  heavyMetalFightingPilotPlan,
  heavyMetalFightingProductionReadiness,
  heavyMetalFightingRuntimeSlot,
  heavyMetalFightingScreenPlan,
  heavyMetalFightingSourceCel,
  heavyMetalFightingStyleProof,
  heavyMetalFightingSummary,
  heavyMetalFightingSuperPlan,
  verifyHeavyMetalFightingStudio,
} from "./heavy-metal-fighting/studio-runtime.mjs";

const COMMANDS = Object.freeze(["verify","summary","contract","presentation-contract","pilot","frame","moves","move","cel","slot","screen","super","intro","attract","readiness","assets","batch","style-proof","handoff-template"]);
function usage() {
  return [
    "HEAVY METAL FIGHTING Art Studio adapter", "", "Usage:",
    "  node scripts/heavy-metal-fighting-art-studio.mjs verify",
    "  node scripts/heavy-metal-fighting-art-studio.mjs summary",
    "  node scripts/heavy-metal-fighting-art-studio.mjs contract",
    "  node scripts/heavy-metal-fighting-art-studio.mjs presentation-contract",
    "  node scripts/heavy-metal-fighting-art-studio.mjs pilot <branka-kovac|miho-tagawa|esi-quartey|parvaneh-razi>",
    "  node scripts/heavy-metal-fighting-art-studio.mjs frame <bastion|viper|citadel|mirage>",
    "  node scripts/heavy-metal-fighting-art-studio.mjs moves <frame-id>",
    "  node scripts/heavy-metal-fighting-art-studio.mjs move <frame-id> <move-id>",
    "  node scripts/heavy-metal-fighting-art-studio.mjs cel <frame-id> <0-119>",
    "  node scripts/heavy-metal-fighting-art-studio.mjs slot <frame-id> <current|planned-v2> <0-119>",
    "  node scripts/heavy-metal-fighting-art-studio.mjs screen <screen-id>",
    "  node scripts/heavy-metal-fighting-art-studio.mjs super <frame-id>",
    "  node scripts/heavy-metal-fighting-art-studio.mjs intro",
    "  node scripts/heavy-metal-fighting-art-studio.mjs attract",
    "  node scripts/heavy-metal-fighting-art-studio.mjs readiness",
    "  node scripts/heavy-metal-fighting-art-studio.mjs assets [family-id]",
    "  node scripts/heavy-metal-fighting-art-studio.mjs batch <1-119>",
    "  node scripts/heavy-metal-fighting-art-studio.mjs style-proof",
    "  node scripts/heavy-metal-fighting-art-studio.mjs handoff-template <game-commit-sha> <live-slot-manifest-sha256>", "",
    "The adapter is planning and review only. It never calls a provider, approves art, mutates the game repository, commits, pushes or publishes.",
  ].join("\n");
}

async function run(argv = process.argv.slice(2)) {
  const [command = "summary", ...args] = argv;
  if (!COMMANDS.includes(command)) throw new Error(`Unknown command ${command}.\n\n${usage()}`);
  if (command === "verify") return verifyHeavyMetalFightingStudio();
  if (command === "summary") return heavyMetalFightingSummary();
  if (command === "contract") return heavyMetalFightingMechanicalContract();
  if (command === "presentation-contract") return heavyMetalFightingCombatPresentationContract();
  if (command === "style-proof") return heavyMetalFightingStyleProof();
  if (command === "intro") return heavyMetalFightingIntroPlan();
  if (command === "attract") return heavyMetalFightingAttractModePlan();
  if (command === "readiness") return heavyMetalFightingProductionReadiness();
  if (command === "pilot") { if (args.length !== 1) throw new Error(`pilot requires one Pilot id.\n\n${usage()}`); return heavyMetalFightingPilotPlan(args[0]); }
  if (command === "frame") { if (args.length !== 1) throw new Error(`frame requires one Frame id.\n\n${usage()}`); return heavyMetalFightingFramePlan(args[0]); }
  if (command === "moves") { if (args.length !== 1) throw new Error(`moves requires one Frame id.\n\n${usage()}`); return heavyMetalFightingFrameMoveRoster(args[0]); }
  if (command === "move") { if (args.length !== 2) throw new Error(`move requires a Frame id and move id.\n\n${usage()}`); return heavyMetalFightingMovePlan(args[0], args[1]); }
  if (command === "cel") { if (args.length !== 2 || !/^\d+$/.test(args[1])) throw new Error(`cel requires a Frame id and integer source index.\n\n${usage()}`); return heavyMetalFightingSourceCel(args[0], Number(args[1])); }
  if (command === "slot") { if (args.length !== 3 || !/^\d+$/.test(args[2])) throw new Error(`slot requires a Frame id, current or planned-v2, and an integer slot.\n\n${usage()}`); return heavyMetalFightingRuntimeSlot(args[0], args[1], Number(args[2])); }
  if (command === "screen") { if (args.length !== 1) throw new Error(`screen requires one screen id.\n\n${usage()}`); return heavyMetalFightingScreenPlan(args[0]); }
  if (command === "super") { if (args.length !== 1) throw new Error(`super requires one Frame id.\n\n${usage()}`); return heavyMetalFightingSuperPlan(args[0]); }
  if (command === "assets") { if (args.length > 1) throw new Error(`assets accepts zero or one family id.\n\n${usage()}`); return heavyMetalFightingAssetAllocation(args[0]); }
  if (command === "batch") { if (args.length !== 1 || !/^\d+$/.test(args[0])) throw new Error(`batch requires one integer batch number.\n\n${usage()}`); return heavyMetalFightingBatch(Number(args[0])); }
  if (command === "handoff-template") { if (args.length !== 2) throw new Error(`handoff-template requires a game commit SHA and live slot-manifest SHA-256.\n\n${usage()}`); return heavyMetalFightingHandoffTemplate({gameRevisionSha:args[0],liveSlotManifestSha256:args[1]}); }
  throw new Error(`Unhandled command ${command}.`);
}

run().then((result) => { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (result?.status === "failed") process.exitCode = 1; }).catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
