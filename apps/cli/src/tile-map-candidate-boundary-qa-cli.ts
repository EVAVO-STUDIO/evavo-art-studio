#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { compileTileMapCandidateBoundaryQa } from "./tile-map-candidate-boundary-qa.js";

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
      policy: { type: "string" },
      output: { type: "string", short: "o" },
    },
    allowPositionals: false,
    strict: true,
  });
  if (
    !parsed.values.package ||
    !parsed.values.review ||
    !parsed.values.qa ||
    !parsed.values.output
  ) {
    throw new Error("--package, --review, --qa and --output are required");
  }
  const report = await compileTileMapCandidateBoundaryQa(
    parsed.values.package,
    parsed.values.review,
    parsed.values.qa,
    parsed.values.policy,
  );
  await writeFile(parsed.values.output, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  process.stdout.write(
    `${JSON.stringify({
      status: report.status,
      output: parsed.values.output,
      boundary_qa_fingerprint: report.boundary_qa_fingerprint,
      summary: report.summary,
      creative_approval: false,
    })}\n`,
  );
  if (report.status === "blocked") process.exitCode = 2;
}

main().catch((error: unknown) => {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "EVAVO_TILE_MAP_BOUNDARY_QA_CLI_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ error: { code, message } })}\n`);
  process.exitCode = 2;
});
