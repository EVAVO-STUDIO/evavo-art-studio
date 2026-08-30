#!/usr/bin/env node
import { parseArgs } from "node:util";

import { renderTileMapCandidateProofs } from "./tile-map-candidate-proof.js";

async function main(): Promise<void> {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    options: {
      review: { type: "string", short: "r" },
      qa: { type: "string", short: "q" },
      output: { type: "string", short: "o" },
    },
    allowPositionals: false,
    strict: true,
  });
  if (!parsed.values.review || !parsed.values.qa || !parsed.values.output) {
    throw new Error("--review, --qa and --output are required");
  }
  const receipt = await renderTileMapCandidateProofs(
    parsed.values.review,
    parsed.values.qa,
    parsed.values.output,
  );
  process.stdout.write(
    `${JSON.stringify({
      status: receipt.status,
      output: parsed.values.output,
      receipt_fingerprint: receipt.receipt_fingerprint,
      proof_files: receipt.proof_files.length,
      creative_approval: false,
    })}\n`,
  );
}

main().catch((error: unknown) => {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "EVAVO_TILE_MAP_CANDIDATE_PROOF_CLI_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ error: { code, message } })}\n`);
  process.exitCode = 2;
});
