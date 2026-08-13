#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  compileHmfFrameBodyCreativeReviewDecision,
  compileHmfFrameBodyCreativeReviewPacket,
  materializeHmfFrameBodyCreativeReview,
  verifyHmfFrameBodyCreativeReview,
} from "./frame-body-creative-review.mjs";

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}
function usage() {
  return [
    "HEAVY METAL FIGHTING Frame body creative review",
    "",
    "Usage:",
    "  node scripts/heavy-metal-fighting/frame-body-creative-review-cli.mjs verify",
    "  node scripts/heavy-metal-fighting/frame-body-creative-review-cli.mjs packet --qa-report-json <file> --workspace-root <root>",
    "  node scripts/heavy-metal-fighting/frame-body-creative-review-cli.mjs decision --packet-json <file> --assessment-json <file>",
    "  node scripts/heavy-metal-fighting/frame-body-creative-review-cli.mjs materialize --decision-json <file>",
    "",
    "packet is read-only. decision validates one complete named-human assessment and compiles a recommendation-only selection template. materialize persists the immutable review evidence and appends creative-review-passed, but it never selects, authorizes repair, mutates the candidate, promotes art, writes steel-dominion, commits, pushes, deploys or publishes.",
  ].join("\n");
}
async function json(filePath, label) {
  if (!filePath) throw new Error(`${label} is required.\n\n${usage()}`);
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}
async function run(argv = process.argv.slice(2)) {
  const command = argv[0] ?? "verify";
  if (command === "verify") return verifyHmfFrameBodyCreativeReview();
  if (command === "packet") {
    const workspaceRoot = option(argv, "--workspace-root");
    if (!workspaceRoot) throw new Error(`packet requires --workspace-root.\n\n${usage()}`);
    return compileHmfFrameBodyCreativeReviewPacket({
      qaReport: await json(option(argv, "--qa-report-json"), "--qa-report-json"),
      workspaceRoot,
    });
  }
  if (command === "decision") {
    return compileHmfFrameBodyCreativeReviewDecision({
      packet: await json(option(argv, "--packet-json"), "--packet-json"),
      assessment: await json(option(argv, "--assessment-json"), "--assessment-json"),
    });
  }
  if (command === "materialize") {
    return materializeHmfFrameBodyCreativeReview(await json(option(argv, "--decision-json"), "--decision-json"));
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
