#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createTransparencyProofSheet } from "../packages/media/dist/index.js";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument ${JSON.stringify(token)}.`);
    const key = token.slice(2);
    if (key === "nearest" || key === "print-evidence") {
      args[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}.`);
    args[key] = value;
    index += 1;
  }
  return args;
}

function positiveInteger(value, label) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.input !== "string" || typeof args.output !== "string") {
    throw new Error(
      "Usage: node tools/create_transparency_proof.mjs --input <image> --output <proof.png> [--backgrounds #000000,#ffffff,#00ff00] [--max-preview <px>] [--nearest] [--print-evidence]",
    );
  }

  const backgrounds =
    typeof args.backgrounds === "string"
      ? args.backgrounds.split(",").map((entry) => entry.trim()).filter(Boolean)
      : undefined;
  const inputPath = path.resolve(args.input);
  const outputPath = path.resolve(args.output);
  const result = await createTransparencyProofSheet(await readFile(inputPath), {
    ...(backgrounds === undefined ? {} : { backgrounds }),
    ...(args.nearest === true ? { nearest: true } : {}),
    ...(args["max-preview"] === undefined
      ? {}
      : { maximumPreviewDimension: positiveInteger(args["max-preview"], "--max-preview") }),
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.png);

  const receipt = {
    ok: true,
    inputPath,
    outputPath,
    evidence: result.evidence,
    bytesReturned: false,
  };
  if (args["print-evidence"] === true) process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  else process.stdout.write(`${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
