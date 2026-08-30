#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { compileTileMapCandidateQa } from "./tile-map-candidate-qa.js";

async function main(): Promise<void> {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    options: {
      package: { type: "string", short: "p" },
      review: { type: "string", short: "r" },
      policy: { type: "string" },
      output: { type: "string", short: "o" },
    },
    allowPositionals: false,
    strict: true,
  });
  if (!parsed.values.package || !parsed.values.review || !parsed.values.output) {
    throw new Error("--package, --review and --output are required");
  }
  const report = await compileTileMapCandidateQa(
    parsed.values.package,
    parsed.values.review,
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
      qa_fingerprint: report.qa_fingerprint,
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
      : "EVAVO_TILE_MAP_CANDIDATE_QA_CLI_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ error: { code, message } })}\n`);
  process.exitCode = 2;
});
