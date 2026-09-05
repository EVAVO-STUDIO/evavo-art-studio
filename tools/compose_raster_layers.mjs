#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { composeRasterLayers } from "../packages/media/dist/index.js";

const MAX_LAYERS = 256;

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

function resolveFrom(baseDir, filePath) {
  return path.isAbsolute(filePath) ? path.normalize(filePath) : path.resolve(baseDir, filePath);
}

async function materializeSpec(specPath) {
  const parsed = JSON.parse(await readFile(specPath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Composite spec must be a JSON object.");
  }
  if (!Array.isArray(parsed.layers)) throw new Error("Composite spec requires a layers array.");
  if (parsed.layers.length > MAX_LAYERS) {
    throw new Error(`Composite spec supports at most ${MAX_LAYERS} layers.`);
  }
  if (parsed.canvas !== undefined) {
    if (!parsed.canvas || typeof parsed.canvas !== "object" || Array.isArray(parsed.canvas)) {
      throw new Error("Composite spec canvas must be an object when provided.");
    }
    if (!Number.isInteger(parsed.canvas.width) || !Number.isInteger(parsed.canvas.height)) {
      throw new Error("Composite spec canvas requires integer width and height.");
    }
  }

  const baseDir = path.dirname(specPath);
  const layers = [];
  for (let index = 0; index < parsed.layers.length; index += 1) {
    const layer = parsed.layers[index];
    if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
      throw new Error(`layers[${index}] must be an object.`);
    }
    if (typeof layer.inputPath !== "string" || !layer.inputPath) {
      throw new Error(`layers[${index}].inputPath is required.`);
    }
    const inputPath = resolveFrom(baseDir, layer.inputPath);
    const prepared = {
      ...layer,
      input: await readFile(inputPath),
    };
    delete prepared.inputPath;

    if (layer.maskPath !== undefined) {
      if (typeof layer.maskPath !== "string" || !layer.maskPath) {
        throw new Error(`layers[${index}].maskPath must be a non-empty string.`);
      }
      prepared.mask = await readFile(resolveFrom(baseDir, layer.maskPath));
      delete prepared.maskPath;
    }
    layers.push(prepared);
  }

  return {
    ...parsed,
    layers,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.spec !== "string" || typeof args.output !== "string") {
    throw new Error(
      "Usage: node tools/compose_raster_layers.mjs --spec <json-file> --output <image> [--base <image>] [--print-evidence]",
    );
  }

  const specPath = path.resolve(args.spec);
  const outputPath = path.resolve(args.output);
  const base = typeof args.base === "string" ? await readFile(path.resolve(args.base)) : null;
  const spec = await materializeSpec(specPath);
  const result = await composeRasterLayers(base, spec);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.buffer);

  const receipt = {
    ok: true,
    specPath,
    basePath: typeof args.base === "string" ? path.resolve(args.base) : null,
    outputPath,
    layerCount: spec.layers.length,
    evidence: result.evidence,
  };
  if (args.printEvidence) process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  else process.stdout.write(`${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
