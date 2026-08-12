#!/usr/bin/env node
import process from "node:process";

import {
  buildHmfFrameMoveBodyChoreography,
  verifyHmfFrameMoveBodyChoreography,
} from "./frame-move-body-choreography.mjs";

function usage() {
  return [
    "HEAVY METAL FIGHTING Frame move/body choreography",
    "",
    "Usage:",
    "  node scripts/heavy-metal-fighting/frame-move-body-choreography-cli.mjs verify",
    "  node scripts/heavy-metal-fighting/frame-move-body-choreography-cli.mjs frame <bastion|viper|citadel|mirage>",
    "",
    "Read-only production choreography. It does not generate images, change work-order hashes, mutate game timing, approve art, promote candidates or write steel-dominion.",
  ].join("\n");
}

async function run(argv = process.argv.slice(2)) {
  const command = argv[0] ?? "verify";
  if (command === "verify") {
    if (argv.length > 1) throw new Error(usage());
    return verifyHmfFrameMoveBodyChoreography();
  }
  if (command === "frame") {
    if (argv.length !== 2) throw new Error(usage());
    return buildHmfFrameMoveBodyChoreography(argv[1]);
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
