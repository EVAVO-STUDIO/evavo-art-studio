#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { compileReviewedApprovedSourcesManifest } from "./tile-map-reviewed-approved-sources.js";

async function main(): Promise<void> {
  const parsed = parseArgs({
    args: process.argv.slice(3),
    options: {
      package: { type: "string", short: "p" },
      review: { type: "string", short: "r" },
      approval: { type: "string", short: "a" },
      output: { type: "string", short: "o" },
    },
    allowPositionals: false,
    strict: true,
  });
  if (!parsed.values.package || !parsed.values.review || !parsed.values.approval) {
    throw new Error("--package, --review and --approval are required");
  }
  const result = await compileReviewedApprovedSourcesManifest(
    parsed.values.package,
    parsed.values.review,
    parsed.values.approval,
  );
  const content = `${JSON.stringify(result, null, 2)}\n`;
  if (parsed.values.output) await writeFile(parsed.values.output, content, { encoding: "utf8", flag: "wx" });
  else process.stdout.write(content);
}

main().catch((error: unknown) => {
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code: unknown }).code)
    : "EVAVO_TILE_MAP_APPROVED_SOURCES_CLI_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ error: { code, message } })}\n`);
  process.exitCode = 1;
});
