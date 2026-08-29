#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { compileTileMapCandidateReview } from "./tile-map-candidate-review.js";

async function main(): Promise<void> {
  const parsed = parseArgs({
    args: process.argv.slice(3),
    options: {
      batch: { type: "string" },
      results: { type: "string" },
      output: { type: "string", short: "o" },
    },
    allowPositionals: false,
    strict: true,
  });
  if (!parsed.values.batch || !parsed.values.results || !parsed.values.output) {
    throw new Error("Usage: evavo-art tile-map-candidate-review --batch candidate-batch.json --results provider-results.json --output review.json");
  }
  const result = await compileTileMapCandidateReview(parsed.values.batch, parsed.values.results);
  await writeFile(parsed.values.output, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ status: result.status, candidates: result.candidates.length, review_fingerprint: result.review_fingerprint, output: parsed.values.output })}\n`);
}

main().catch((error: unknown) => {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "EVAVO_TILE_MAP_REVIEW_CLI_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ error: { code, message } })}\n`);
  process.exitCode = 1;
});
