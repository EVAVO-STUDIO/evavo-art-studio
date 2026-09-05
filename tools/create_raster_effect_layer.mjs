#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createRasterEffectLayer } from "../packages/media/dist/index.js";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument ${JSON.stringify(token)}.`);
    const key = token.slice(2);
    if (key === "print-evidence") {
      args.printEvidence = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}.`);
    args[key] = value;
    index += 1;
  }
  return args;
}

function numeric(value, label, { integer = false } = {}) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed))) {
    throw new Error(`${label} must be ${integer ? "an integer" : "a finite number"}.`);
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.input !== "string" || typeof args.output !== "string" || typeof args.kind !== "string") {
    throw new Error(
      "Usage: node tools/create_raster_effect_layer.mjs --input <image> --output <png> --kind drop-shadow|outer-glow [--color <css-color>] [--opacity <0..1>] [--blur <sigma>] [--spread <px>] [--offset-x <px>] [--offset-y <px>] [--padding <px>] [--print-evidence]",
    );
  }
  if (args.kind !== "drop-shadow" && args.kind !== "outer-glow") {
    throw new Error("--kind must be drop-shadow or outer-glow.");
  }

  const inputPath = path.resolve(args.input);
  const outputPath = path.resolve(args.output);
  const spec = {
    kind: args.kind,
    ...(typeof args.color === "string" ? { color: args.color } : {}),
    ...(args.opacity === undefined ? {} : { opacity: numeric(args.opacity, "--opacity") }),
    ...(args.blur === undefined ? {} : { blurSigma: numeric(args.blur, "--blur") }),
    ...(args.spread === undefined ? {} : { spread: numeric(args.spread, "--spread", { integer: true }) }),
    ...(args["offset-x"] === undefined ? {} : { offsetX: numeric(args["offset-x"], "--offset-x", { integer: true }) }),
    ...(args["offset-y"] === undefined ? {} : { offsetY: numeric(args["offset-y"], "--offset-y", { integer: true }) }),
    ...(args.padding === undefined ? {} : { padding: numeric(args.padding, "--padding", { integer: true }) }),
  };

  const result = await createRasterEffectLayer(await readFile(inputPath), spec);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.buffer);

  const receipt = {
    ok: true,
    inputPath,
    outputPath,
    evidence: result.evidence,
  };
  if (args.printEvidence) process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  else process.stdout.write(`${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
