#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import process from "node:process";

const result = spawnSync(
  process.execPath,
  [
    "--test",
    "tests/eva-idle-reviewed-source-generation-adapter.test.mjs",
    "tests/eva-idle-frame-ledger-intake.test.mjs",
    "tests/eva-idle-local-ai-candidate-batch.test.mjs",
  ],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "1",
      NO_PROXY: "*",
      no_proxy: "*",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    timeout: 20 * 60 * 1000,
    maxBuffer: 16 * 1024 * 1024,
  },
);

process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");

if (result.error || result.status !== 0) {
  process.stderr.write(
    `${JSON.stringify({
      status: "failed",
      error: result.error?.message ?? null,
      exitCode: result.status,
      hostedComputeUsed: false,
      providerExecutionPerformed: false,
      creativeApprovalGranted: false,
      runtimeActivationGranted: false,
      publicationGranted: false,
    })}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${JSON.stringify({
      status: "passed",
      checks: [
        "reviewed-source-generation-adapter",
        "frame-ledger-intake",
        "atomic-local-ai-candidate-batch",
      ],
      hostedComputeUsed: false,
      providerExecutionPerformed: false,
      creativeApprovalGranted: false,
      runtimeActivationGranted: false,
      publicationGranted: false,
    })}\n`,
  );
}
