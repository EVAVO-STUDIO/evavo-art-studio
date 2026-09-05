#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

import { rankMediaCandidates } from "../packages/media/dist/index.js";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument ${JSON.stringify(token)}.`);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}.`);
    args[key] = value;
    index += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.input !== "string") {
    throw new Error(
      "Usage: node tools/rank_media_candidates.mjs --input <json-file>",
    );
  }

  const inputPath = path.resolve(args.input);
  const parsed = JSON.parse(await readFile(inputPath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Media ranking input must be a JSON object.");
  }
  if (!Array.isArray(parsed.candidates)) throw new Error("Media ranking input requires candidates[].");
  if (!parsed.request || typeof parsed.request !== "object" || Array.isArray(parsed.request)) {
    throw new Error("Media ranking input requires request.");
  }

  const rankings = rankMediaCandidates(parsed.candidates, parsed.request);
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        request: parsed.request,
        candidateCount: parsed.candidates.length,
        rankings,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
