#!/usr/bin/env node
import process from "node:process";

import {
  buildHmfBodyChoreographyOverlayBatch,
  heavyMetalFightingBodyChoreographyOverlay,
  verifyHmfBodyChoreographyOverlays,
} from "./frame-body-choreography-overlay.mjs";

function usage() {
  return [
    "HEAVY METAL FIGHTING body choreography overlays",
    "",
    "Usage:",
    "  node scripts/heavy-metal-fighting/frame-body-choreography-overlay-cli.mjs verify",
    "  node scripts/heavy-metal-fighting/frame-body-choreography-overlay-cli.mjs work-order <unitId>",
    "  node scripts/heavy-metal-fighting/frame-body-choreography-overlay-cli.mjs batch <hmf-bNNNN|number>",
    "",
    "Overlays are supplemental and hash-bound. They do not mutate base work orders or receipt chains and do not execute providers, approve art or write the game repository.",
  ].join("\n");
}

async function run(argv = process.argv.slice(2)) {
  const command = argv[0] ?? "verify";
  if (command === "verify") {
    if (argv.length > 1) throw new Error(usage());
    return verifyHmfBodyChoreographyOverlays();
  }
  if (command === "work-order") {
    if (argv.length !== 2) throw new Error(usage());
    return heavyMetalFightingBodyChoreographyOverlay(argv[1]);
  }
  if (command === "batch") {
    if (argv.length !== 2) throw new Error(usage());
    const identifier = /^\d+$/u.test(argv[1]) ? Number(argv[1]) : argv[1];
    return buildHmfBodyChoreographyOverlayBatch(identifier);
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
