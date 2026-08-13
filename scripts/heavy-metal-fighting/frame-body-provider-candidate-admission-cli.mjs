#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  admitHmfProviderCandidate,
  planHmfProviderCandidateAdmission,
  verifyHmfProviderCandidateAdmission,
} from "./frame-body-provider-candidate-admission.mjs";

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}
function usage() {
  return [
    "HEAVY METAL FIGHTING provider candidate admission",
    "",
    "Usage:",
    "  node scripts/heavy-metal-fighting/frame-body-provider-candidate-admission-cli.mjs verify",
    "  node scripts/heavy-metal-fighting/frame-body-provider-candidate-admission-cli.mjs plan --dispatch-json <file> --runtime-binding-json <file> --runtime-outcome-json <file> --receipts-json <file> --artifact-store-root <dir> --actor-id <id> --occurred-at <ISO>",
    "  node scripts/heavy-metal-fighting/frame-body-provider-candidate-admission-cli.mjs admit --write --dispatch-json <file> --runtime-binding-json <file> --runtime-outcome-json <file> --receipts-json <file> --artifact-store-root <dir> --workspace-root <dir> --actor-id <id> --occurred-at <ISO>",
    "",
    "plan validates the immutable runtime chain, artifact descriptors, provider evidence and exact 160x160 RGBA PNG without writing.",
    "admit requires the separate --write switch, materializes only the governed scratch candidate, and persists only the candidates-admitted receipt bundle.",
    "Neither command runs deterministic QA, creative review, approval, promotion, target-repository mutation, Git, deployment or publication.",
  ].join("\n");
}
async function json(filePath, label) {
  if (!filePath) throw new Error(`${label} is required.\n\n${usage()}`);
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}
async function receipts(filePath) {
  const value = await json(filePath, "--receipts-json");
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray(value.receipts)) {
    return value.receipts;
  }
  throw new Error(
    "--receipts-json must contain a receipt array or a receipt bundle with a receipts array.",
  );
}
async function commonInputs(argv) {
  return {
    dispatch: await json(option(argv, "--dispatch-json"), "--dispatch-json"),
    binding: await json(
      option(argv, "--runtime-binding-json"),
      "--runtime-binding-json",
    ),
    outcome: await json(
      option(argv, "--runtime-outcome-json"),
      "--runtime-outcome-json",
    ),
    options: {
      receipts: await receipts(option(argv, "--receipts-json")),
      artifactStoreRoot: option(argv, "--artifact-store-root"),
      actorId: option(argv, "--actor-id"),
      occurredAt: option(argv, "--occurred-at"),
    },
  };
}
async function run(argv = process.argv.slice(2)) {
  const command = argv[0] ?? "verify";
  if (command === "verify") return verifyHmfProviderCandidateAdmission();
  if (command === "plan") {
    const input = await commonInputs(argv.slice(1));
    return planHmfProviderCandidateAdmission(
      input.dispatch,
      input.binding,
      input.outcome,
      input.options,
    );
  }
  if (command === "admit") {
    const args = argv.slice(1);
    const input = await commonInputs(args);
    return admitHmfProviderCandidate(
      input.dispatch,
      input.binding,
      input.outcome,
      {
        ...input.options,
        workspaceRoot: option(args, "--workspace-root"),
        writeEnabled: args.includes("--write"),
      },
    );
  }
  throw new Error(`Unknown command ${command}.\n\n${usage()}`);
}

run()
  .then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result?.status === "failed") process.exitCode = 1;
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
