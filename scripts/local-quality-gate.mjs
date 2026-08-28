#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

export * from "./local-quality-gate-library.mjs";
export {
  RUNTIME_CONTRACT_COMMAND,
  buildRuntimePlan,
  parseGateArguments,
  runCommand,
  runLocalQualityGate,
  runLocalQualityGateCli,
  safeWorktreeSnapshot,
  writeRuntimeReceipt,
} from "./local-quality-gate-guard.mjs";

import { runLocalQualityGateCli } from "./local-quality-gate-guard.mjs";

const isEntryPoint =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  runLocalQualityGateCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        error: {
          code: error?.code ?? "LOCAL_GATE_UNEXPECTED_ERROR",
          message: error instanceof Error ? error.message : String(error),
          result: error?.result,
          receiptPaths: error?.receiptPaths,
          receiptWriteError: error?.receiptWriteError,
        },
      })}\n`,
    );
    process.exitCode = 1;
  });
}
