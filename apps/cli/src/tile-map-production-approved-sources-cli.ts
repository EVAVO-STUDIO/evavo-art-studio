#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { compileTileMapProductionApprovedSourcesManifest } from "./tile-map-production-approved-sources.js";

function routedArgs(): string[] {
  return process.argv[2]?.startsWith("--")
    ? process.argv.slice(2)
    : process.argv.slice(3);
}

async function main(): Promise<void> {
  const parsed = parseArgs({
    args: routedArgs(),
    options: {
      package: { type: "string", short: "p" },
      review: { type: "string", short: "r" },
      qa: { type: "string", short: "q" },
      boundary: { type: "string", short: "b" },
      proof: { type: "string" },
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
    !parsed.values.boundary ||
    !parsed.values.proof ||
    !parsed.values.approval ||
    !parsed.values.output
  ) {
    throw new Error(
      "--package, --review, --qa, --boundary, --proof, --approval and --output are required",
    );
  }
  const manifest = await compileTileMapProductionApprovedSourcesManifest(
    parsed.values.package,
    parsed.values.review,
    parsed.values.qa,
    parsed.values.boundary,
    parsed.values.proof,
    parsed.values.approval,
  );
  await writeFile(parsed.values.output, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  process.stdout.write(
    `${JSON.stringify({
      status: "production-art-approved-for-sprite-studio",
      output: parsed.values.output,
      manifest_fingerprint: manifest.manifest_fingerprint,
      candidate_qa_fingerprint: manifest.source_candidate_qa_fingerprint,
      boundary_qa_fingerprint: manifest.source_boundary_qa_fingerprint,
      proof_receipt_fingerprint: manifest.source_candidate_proof_receipt_fingerprint,
      approved_families: manifest.tasks.length,
    })}\n`,
  );
}

main().catch((error: unknown) => {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "EVAVO_TILE_MAP_PRODUCTION_APPROVAL_CLI_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ error: { code, message } })}\n`);
  process.exitCode = 2;
});
