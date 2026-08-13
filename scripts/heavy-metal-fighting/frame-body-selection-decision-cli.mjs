#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  compileHmfFrameBodySelectionDecision,
  materializeHmfFrameBodySelectionDecision,
  verifyHmfFrameBodySelectionDecision,
} from "./frame-body-selection-decision.mjs";

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}
function usage() {
  return [
    "HEAVY METAL FIGHTING Frame body selection decision",
    "",
    "Usage:",
    "  node scripts/heavy-metal-fighting/frame-body-selection-decision-cli.mjs verify",
    "  node scripts/heavy-metal-fighting/frame-body-selection-decision-cli.mjs decision --creative-review-decision-json <file> --workspace-root <root> --human-decision-json <file>",
    "  node scripts/heavy-metal-fighting/frame-body-selection-decision-cli.mjs materialize --selection-decision-json <file>",
    "",
    "decision is read-only. materialize persists one immutable named-human selected-or-repair-requested decision and appends exactly one receipt. It does not master, promote, authorize a repair provider call, mutate candidate bytes, write steel-dominion, commit, push, deploy or publish.",
  ].join("\n");
}
async function json(filePath, label) {
  if (!filePath) throw new Error(`${label} is required.\n\n${usage()}`);
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}
async function run(argv = process.argv.slice(2)) {
  const command = argv[0] ?? "verify";
  if (command === "verify") return verifyHmfFrameBodySelectionDecision();
  if (command === "decision") {
    const workspaceRoot = option(argv, "--workspace-root");
    if (!workspaceRoot) throw new Error(`decision requires --workspace-root.\n\n${usage()}`);
    return compileHmfFrameBodySelectionDecision({
      creativeReviewDecision: await json(option(argv, "--creative-review-decision-json"), "--creative-review-decision-json"),
      workspaceRoot,
      humanDecision: await json(option(argv, "--human-decision-json"), "--human-decision-json"),
    });
  }
  if (command === "materialize") {
    return materializeHmfFrameBodySelectionDecision(await json(option(argv, "--selection-decision-json"), "--selection-decision-json"));
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
