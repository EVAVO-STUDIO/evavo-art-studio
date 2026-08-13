#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  compileHmfCandidateAdmissionPlan,
  materializeHmfCandidateAdmission,
  verifyHmfCandidateAdmissionRuntime,
} from "./frame-body-candidate-admission.mjs";

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}
function usage() {
  return [
    "HEAVY METAL FIGHTING candidate admission runtime",
    "",
    "Usage:",
    "  node scripts/heavy-metal-fighting/frame-body-candidate-admission-cli.mjs verify",
    "  node scripts/heavy-metal-fighting/frame-body-candidate-admission-cli.mjs plan --submission-manifest-json <file> --dispatch-json <file> --binding-json <file> --outcome-json <file> --receipts-json <file> --workspace-root <root> --candidate-artifact-json <file> --evidence-artifact-json <file> [--occurred-at <canonical-UTC>]",
    "  node scripts/heavy-metal-fighting/frame-body-candidate-admission-cli.mjs materialize --plan-json <file>",
    "",
    "The plan command is read-only. Materialize is the explicit write-enabled boundary: it may create one governed candidate PNG, one provider-evidence sidecar, one admission record and advance one receipt chain to candidates-admitted. It never runs QA, approves or promotes art, writes steel-dominion, commits, pushes, deploys or publishes.",
  ].join("\n");
}
async function json(filePath, label) {
  if (!filePath) throw new Error(`${label} is required.\n\n${usage()}`);
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}
async function jsonArray(filePath, label) {
  const value = await json(filePath, label);
  if (!Array.isArray(value)) throw new Error(`${label} must contain a JSON array.`);
  return value;
}
async function run(argv = process.argv.slice(2)) {
  const command = argv[0] ?? "verify";
  if (command === "verify") return verifyHmfCandidateAdmissionRuntime();
  if (command === "materialize") {
    if (argv.length < 3) throw new Error(`materialize requires --plan-json.\n\n${usage()}`);
    return materializeHmfCandidateAdmission(await json(option(argv, "--plan-json"), "--plan-json"));
  }
  if (command === "plan") {
    const workspaceRoot = option(argv, "--workspace-root");
    if (!workspaceRoot) throw new Error(`plan requires --workspace-root.\n\n${usage()}`);
    return compileHmfCandidateAdmissionPlan({
      submissionManifest: await json(option(argv, "--submission-manifest-json"), "--submission-manifest-json"),
      runtimeDispatch: await json(option(argv, "--dispatch-json"), "--dispatch-json"),
      runtimeBinding: await json(option(argv, "--binding-json"), "--binding-json"),
      runtimeOutcome: await json(option(argv, "--outcome-json"), "--outcome-json"),
      receipts: await jsonArray(option(argv, "--receipts-json"), "--receipts-json"),
      workspaceRoot,
      candidateArtifact: await json(option(argv, "--candidate-artifact-json"), "--candidate-artifact-json"),
      evidenceArtifact: await json(option(argv, "--evidence-artifact-json"), "--evidence-artifact-json"),
      ...(option(argv, "--occurred-at") ? { occurredAt: option(argv, "--occurred-at") } : {}),
    });
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
