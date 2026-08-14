#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  compileHmfFrameBodyDeliveryReadinessPlan,
  materializeHmfFrameBodyDeliveryReadiness,
  verifyHmfFrameBodyDeliveryReadiness,
} from "./frame-body-delivery-readiness.mjs";

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function usage() {
  return [
    "HEAVY METAL FIGHTING Frame body delivery readiness",
    "",
    "Usage:",
    "  node scripts/heavy-metal-fighting/frame-body-delivery-readiness-cli.mjs verify",
    "  node scripts/heavy-metal-fighting/frame-body-delivery-readiness-cli.mjs plan --approval-plan-json <file> --workspace-root <root> --readiness-request-json <file>",
    "  node scripts/heavy-metal-fighting/frame-body-delivery-readiness-cli.mjs materialize --readiness-plan-json <file>",
    "",
    "plan is read-only. materialize persists one immutable delivery-readiness record and appends exactly one delivery-ready receipt. It does not compile the final atlas, promote the master, mutate a target repository, commit, push, deploy or publish.",
  ].join("\n");
}

async function json(filePath, label) {
  if (!filePath) throw new Error(`${label} is required.\n\n${usage()}`);
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}

async function run(argv = process.argv.slice(2)) {
  const command = argv[0] ?? "verify";
  if (command === "verify") return verifyHmfFrameBodyDeliveryReadiness();
  if (command === "plan") {
    const workspaceRoot = option(argv, "--workspace-root");
    if (!workspaceRoot) throw new Error(`plan requires --workspace-root.\n\n${usage()}`);
    return compileHmfFrameBodyDeliveryReadinessPlan({
      approvalPlan: await json(
        option(argv, "--approval-plan-json"),
        "--approval-plan-json",
      ),
      workspaceRoot,
      readinessRequest: await json(
        option(argv, "--readiness-request-json"),
        "--readiness-request-json",
      ),
    });
  }
  if (command === "materialize") {
    return materializeHmfFrameBodyDeliveryReadiness(
      await json(option(argv, "--readiness-plan-json"), "--readiness-plan-json"),
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
