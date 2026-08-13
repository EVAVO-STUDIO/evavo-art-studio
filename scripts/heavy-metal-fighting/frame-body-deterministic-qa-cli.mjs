#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  compileHmfFrameBodyDeterministicQaPlan,
  materializeHmfFrameBodyDeterministicQa,
  verifyHmfFrameBodyDeterministicQa,
} from "./frame-body-deterministic-qa.mjs";

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}
function usage() {
  return [
    "HEAVY METAL FIGHTING Frame body deterministic QA",
    "",
    "Usage:",
    "  node scripts/heavy-metal-fighting/frame-body-deterministic-qa-cli.mjs verify",
    "  node scripts/heavy-metal-fighting/frame-body-deterministic-qa-cli.mjs plan --admission-record-json <file> --workspace-root <root> [--comparison-admissions-json <file>] [--occurred-at <canonical-UTC>]",
    "  node scripts/heavy-metal-fighting/frame-body-deterministic-qa-cli.mjs materialize --plan-json <file>",
    "",
    "plan is read-only. materialize may persist one immutable deterministic-QA report and, only when every automated check passes, append the deterministic-qa-passed receipt. A failure never fabricates a pass receipt, retries a provider, performs creative review, approves art, promotes art, writes steel-dominion, commits, pushes, deploys or publishes.",
  ].join("\n");
}
async function json(filePath, label) {
  if (!filePath) throw new Error(`${label} is required.\n\n${usage()}`);
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}
async function jsonArray(filePath, label) {
  if (!filePath) return [];
  const value = await json(filePath, label);
  if (!Array.isArray(value)) throw new Error(`${label} must contain a JSON array.`);
  return value;
}
async function run(argv = process.argv.slice(2)) {
  const command = argv[0] ?? "verify";
  if (command === "verify") return verifyHmfFrameBodyDeterministicQa();
  if (command === "materialize") {
    return materializeHmfFrameBodyDeterministicQa(await json(option(argv, "--plan-json"), "--plan-json"));
  }
  if (command === "plan") {
    const workspaceRoot = option(argv, "--workspace-root");
    if (!workspaceRoot) throw new Error(`plan requires --workspace-root.\n\n${usage()}`);
    return compileHmfFrameBodyDeterministicQaPlan({
      admissionRecord: await json(option(argv, "--admission-record-json"), "--admission-record-json"),
      workspaceRoot,
      comparisonAdmissionRecords: await jsonArray(option(argv, "--comparison-admissions-json"), "--comparison-admissions-json"),
      ...(option(argv, "--occurred-at") ? { occurredAt: option(argv, "--occurred-at") } : {}),
    });
  }
  throw new Error(`Unknown command ${command}.\n\n${usage()}`);
}

run().then((result) => {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (["failed", "qa-failed", "already-qa-failed"].includes(result?.status)) process.exitCode = 1;
}).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
