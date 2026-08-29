#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { compileTileMapCandidateBatchFile } from "./tile-map-candidate-batch.js";

async function main(): Promise<void> {
  const parsed = parseArgs({
    args: process.argv.slice(3),
    options: {
      input: { type: "string", short: "i" },
      output: { type: "string", short: "o" },
    },
    allowPositionals: false,
    strict: true,
  });
  if (!parsed.values.input || !parsed.values.output) {
    throw new Error("Usage: evavo-art tile-map-candidate-batch --input source-package.json --output candidate-batch.json");
  }
  const result = await compileTileMapCandidateBatchFile(parsed.values.input);
  await writeFile(parsed.values.output, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ status: result.status, jobs: result.jobs.length, batch_fingerprint: result.batch_fingerprint, output: parsed.values.output })}\n`);
}

main().catch((error: unknown) => {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "EVAVO_TILE_MAP_CANDIDATE_CLI_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ error: { code, message } })}\n`);
  process.exitCode = 1;
});
