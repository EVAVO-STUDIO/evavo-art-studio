#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { compileTileMapProviderRuntimeBatch } from "./tile-map-provider-batch.js";

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
  if (!parsed.values.input) throw new Error("--input is required");
  const result = await compileTileMapProviderRuntimeBatch(parsed.values.input);
  const content = `${JSON.stringify(result, null, 2)}\n`;
  if (parsed.values.output) {
    await writeFile(parsed.values.output, content, { encoding: "utf8", flag: "wx" });
  } else {
    process.stdout.write(content);
  }
}

main().catch((error: unknown) => {
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code: unknown }).code)
    : "EVAVO_TILE_MAP_PROVIDER_BATCH_CLI_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ error: { code, message } })}\n`);
  process.exitCode = 1;
});
