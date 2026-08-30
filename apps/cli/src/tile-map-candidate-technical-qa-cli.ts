#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { compileTileMapCandidateTechnicalQa } from "./tile-map-candidate-technical-qa.js";

async function main(): Promise<void> {
  const parsed = parseArgs({
    args: process.argv.slice(3),
    options: {
      package: { type: "string", short: "p" },
      review: { type: "string", short: "r" },
      output: { type: "string", short: "o" },
    },
    allowPositionals: false,
    strict: true,
  });
  if (!parsed.values.package || !parsed.values.review) {
    throw new Error("--package and --review are required");
  }
  const result = await compileTileMapCandidateTechnicalQa(
    parsed.values.package,
    parsed.values.review,
  );
  const content = `${JSON.stringify(result, null, 2)}\n`;
  if (parsed.values.output) {
    await writeFile(parsed.values.output, content, { encoding: "utf8", flag: "wx" });
  } else {
    process.stdout.write(content);
  }
  if (result.status !== "passed") process.exitCode = 2;
}

main().catch((error: unknown) => {
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code: unknown }).code)
    : "EVAVO_TILE_MAP_TECHNICAL_QA_CLI_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ error: { code, message } })}\n`);
  process.exitCode = 2;
});
