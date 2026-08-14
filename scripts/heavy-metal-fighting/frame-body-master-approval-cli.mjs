#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  compileHmfFrameBodyMasterApprovalDecision,
  materializeHmfFrameBodyMasterApprovalDecision,
  verifyHmfFrameBodyMasterApproval,
} from "./frame-body-master-approval.mjs";

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function usage() {
  return [
    "HEAVY METAL FIGHTING Frame body master approval",
    "",
    "Usage:",
    "  node scripts/heavy-metal-fighting/frame-body-master-approval-cli.mjs verify",
    "  node scripts/heavy-metal-fighting/frame-body-master-approval-cli.mjs plan --mastering-plan-json <file> --workspace-root <root> --human-approval-json <file>",
    "  node scripts/heavy-metal-fighting/frame-body-master-approval-cli.mjs materialize --approval-decision-json <file>",
    "",
    "plan is read-only. materialize persists one exact named-human approval decision and appends one named-human-approved receipt. It does not alter pixels, compile delivery readiness, promote into the game repository, build the final atlas, commit, push, deploy or publish.",
  ].join("\n");
}

async function json(filePath, label) {
  if (!filePath) {
    throw new Error(`${label} is required.\n\n${usage()}`);
  }
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}

async function run(argv = process.argv.slice(2)) {
  const command = argv[0] ?? "verify";
  if (command === "verify") {
    return verifyHmfFrameBodyMasterApproval();
  }
  if (command === "plan") {
    const workspaceRoot = option(argv, "--workspace-root");
    if (!workspaceRoot) {
      throw new Error(`plan requires --workspace-root.\n\n${usage()}`);
    }
    return compileHmfFrameBodyMasterApprovalDecision({
      masteringPlan: await json(
        option(argv, "--mastering-plan-json"),
        "--mastering-plan-json",
      ),
      workspaceRoot,
      humanApproval: await json(
        option(argv, "--human-approval-json"),
        "--human-approval-json",
      ),
    });
  }
  if (command === "materialize") {
    return materializeHmfFrameBodyMasterApprovalDecision(
      await json(
        option(argv, "--approval-decision-json"),
        "--approval-decision-json",
      ),
    );
  }
  throw new Error(`Unknown command ${command}.\n\n${usage()}`);
}

run().then((result) => {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result?.status === "failed") process.exitCode = 1;
}).catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
