#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const syntaxTargets = [
  "scripts/game-art-production/asset-fabricator-reference-common.mjs",
  "scripts/game-art-production/asset-fabricator-reference-policy.mjs",
  "scripts/game-art-production/asset-fabricator-reference-handoff.mjs",
  "scripts/game-art-production/asset-fabricator-material-handoff.mjs",
  "scripts/game-art-production/visual-continuity-3d-reference-adapter.mjs",
  "tools/visual_continuity_3d_reference_adapter_mcp.mjs",
];
const tests = [
  "scripts/game-art-production/asset-fabricator-reference-handoff.test.mjs",
  "scripts/game-art-production/asset-fabricator-reference-workflow.test.mjs",
  "scripts/game-art-production/visual-continuity-3d-reference-adapter.test.mjs",
  "tools/visual_continuity_3d_reference_adapter_mcp.test.mjs",
];

function run(args, label) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`${label} failed with exit code ${result.status}.`);
  }
  return result.stdout.trim();
}

for (const target of syntaxTargets) {
  run(["--check", target], `syntax check ${target}`);
}

const testOutput = run(
  ["--test", "--test-timeout=30000", ...tests],
  "asset fabricator tests",
);
const capabilities = JSON.parse(
  run(
    [
      "scripts/game-art-production/visual-continuity-3d-reference-adapter.mjs",
      "capabilities",
    ],
    "visual continuity 3D adapter capabilities",
  ),
);
if (
  capabilities.requestContract !==
    "evavo_art_visual_continuity_3d_reference_adapter_request_v1" ||
  capabilities.outputSchema !==
    "evavo.art.asset-fabricator-reference-handoff.v1" ||
  capabilities.receiver !== "evavo-3d-art-reference-brief" ||
  capabilities.receiverExecution !== false ||
  capabilities.automaticCreativeApproval !== false
) {
  throw new Error("visual continuity 3D adapter capability contract drifted.");
}

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      syntaxTargets,
      tests,
      adapter: {
        requestContract: capabilities.requestContract,
        outputSchema: capabilities.outputSchema,
        receiver: capabilities.receiver,
        workerTaskId: capabilities.workerTaskId,
        receiverExecution: capabilities.receiverExecution,
      },
      testOutputTail: testOutput.split(/\r?\n/u).slice(-8),
    },
    null,
    2,
  )}\n`,
);
