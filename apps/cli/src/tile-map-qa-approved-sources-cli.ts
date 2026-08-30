#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { compileQaReviewedApprovedSourcesManifest } from "./tile-map-qa-approved-sources.js";

async function main(): Promise<void> {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    options: {
      package: { type: "string", short: "p" },
      review: { type: "string", short: "r" },
      qa: { type: "string", short: "q" },
      approval: { type: "string", short: "a" },
      output: { type: "string", short: "o" },
    },
    allowPositionals: false,
    strict: true,
  });
  if (
    !parsed.values.package ||
    !parsed.values.review ||
    !parsed.values.qa ||
    !parsed.values.approval ||
    !parsed.values.output
  ) {
    throw new Error("--package, --review, --qa, --approval and --output are required");
  }
  const manifest = await compileQaReviewedApprovedSourcesManifest(
    parsed.values.package,
    parsed.values.review,
    parsed.values.qa,
    parsed.values.approval,
  );
  await writeFile(parsed.values.output, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  process.stdout.write(
    `${JSON.stringify({
      status: "approved-for-sprite-studio",
      output: parsed.values.output,
      manifest_fingerprint: manifest.manifest_fingerprint,
      source_candidate_qa_fingerprint: manifest.source_candidate_qa_fingerprint,
      approved_families: manifest.tasks.length,
    })}\n`,
  );
}

main().catch((error: unknown) => {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "EVAVO_TILE_MAP_QA_APPROVED_SOURCES_CLI_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ error: { code, message } })}\n`);
  process.exitCode = 2;
});
