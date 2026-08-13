#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  compileHmfFrameBodySelectedCandidateMasteringPlan,
  materializeHmfFrameBodySelectedCandidateMaster,
  verifyHmfFrameBodySelectedCandidateMastering,
} from "./frame-body-selected-candidate-mastering.mjs";

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function usage() {
  return [
    "HEAVY METAL FIGHTING Frame body selected-candidate mastering",
    "",
    "Usage:",
    "  node scripts/heavy-metal-fighting/frame-body-selected-candidate-mastering-cli.mjs verify",
    "  node scripts/heavy-metal-fighting/frame-body-selected-candidate-mastering-cli.mjs plan --selection-decision-json <file> --workspace-root <root> --mastering-request-json <file>",
    "  node scripts/heavy-metal-fighting/frame-body-selected-candidate-mastering-cli.mjs materialize --mastering-plan-json <file>",
    "",
    "plan is read-only. materialize creates or exactly reuses one workspace master, persists one immutable mastering record, and appends exactly one mastered receipt. It does not approve the asset, promote it into the game repository, compile the final atlas, commit, push, deploy or publish.",
  ].join("\n");
}

async function json(filePath, label) {
  if (!filePath) throw new Error(`${label} is required.\n\n${usage()}`);
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}

async function run(argv = process.argv.slice(2)) {
  const command = argv[0] ?? "verify";
  if (command === "verify") {
    return verifyHmfFrameBodySelectedCandidateMastering();
  }
  if (command === "plan") {
    const workspaceRoot = option(argv, "--workspace-root");
    if (!workspaceRoot) throw new Error(`plan requires --workspace-root.\n\n${usage()}`);
    return compileHmfFrameBodySelectedCandidateMasteringPlan({
      selectionDecision: await json(
        option(argv, "--selection-decision-json"),
        "--selection-decision-json",
      ),
      workspaceRoot,
      masteringRequest: await json(
        option(argv, "--mastering-request-json"),
        "--mastering-request-json",
      ),
    });
  }
  if (command === "materialize") {
    return materializeHmfFrameBodySelectedCandidateMaster(
      await json(option(argv, "--mastering-plan-json"), "--mastering-plan-json"),
    );
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
