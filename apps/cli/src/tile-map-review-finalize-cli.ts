#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { finalizeTileMapReview } from "./tile-map-review-finalize.js";

async function main(): Promise<void> {
  const parsed = parseArgs({
    args: process.argv.slice(3),
    options: {
      review: { type: "string" },
      decisions: { type: "string" },
      output: { type: "string", short: "o" },
    },
    allowPositionals: false,
    strict: true,
  });
  if (!parsed.values.review || !parsed.values.decisions || !parsed.values.output) {
    throw new Error("Usage: evavo-art tile-map-review-finalize --review review.json --decisions decisions.json --output finalization.json");
  }
  const result = await finalizeTileMapReview(parsed.values.review, parsed.values.decisions);
  await writeFile(parsed.values.output, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ status: result.status, tasks: result.tasks.length, finalization_fingerprint: result.finalization_fingerprint, output: parsed.values.output })}\n`);
}

main().catch((error: unknown) => {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "EVAVO_TILE_MAP_FINALIZE_CLI_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ error: { code, message } })}\n`);
  process.exitCode = 1;
});
