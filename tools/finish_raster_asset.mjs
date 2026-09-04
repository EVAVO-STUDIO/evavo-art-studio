#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { finishRasterAsset } from "../packages/media/dist/index.js";

const PRESETS = Object.freeze({
  "transparent-object": Object.freeze({
    ensureAlpha: true,
    trim: { threshold: 8, padding: 24 },
    normalize: true,
    sharpen: { sigma: 1 },
    format: "png",
  }),
  "web-support": Object.freeze({
    ensureAlpha: true,
    trim: { threshold: 8, padding: 32 },
    normalize: true,
    sharpen: { sigma: 1 },
    resize: { width: 1400, fit: "inside", withoutEnlargement: true },
    format: "webp",
    quality: 92,
  }),
  "web-hero": Object.freeze({
    ensureAlpha: true,
    normalize: true,
    sharpen: { sigma: 0.8 },
    resize: { width: 2400, fit: "inside", withoutEnlargement: true },
    format: "webp",
    quality: 92,
  }),
  "motion-layer": Object.freeze({
    ensureAlpha: true,
    trim: { threshold: 4, padding: 16 },
    sharpen: { sigma: 0.7 },
    format: "png",
  }),
});

function usage() {
  return [
    "Usage:",
    "  node tools/finish_raster_asset.mjs --input <image> --output <image> [options]",
    "",
    "Options:",
    "  --preset transparent-object|web-support|web-hero|motion-layer",
    "  --mask <image>          Alpha matte from any segmentation/background-removal provider",
    "  --spec <json>           JSON file containing RasterFinishSpec overrides",
    "  --print-evidence        Print the deterministic operation receipt",
  ].join("\n");
}

function parseArgs(argv) {
  const parsed = { printEvidence: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--print-evidence") {
      parsed.printEvidence = true;
      continue;
    }
    if (!token?.startsWith("--")) throw new Error(`Unexpected argument ${JSON.stringify(token)}.`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${token} requires a value.`);
    parsed[token.slice(2)] = value;
    index += 1;
  }
  return parsed;
}

function mergeSpec(base, overrides) {
  return {
    ...base,
    ...overrides,
    ...(base.trim || overrides.trim ? { trim: { ...(base.trim ?? {}), ...(overrides.trim ?? {}) } } : {}),
    ...(base.modulate || overrides.modulate
      ? { modulate: { ...(base.modulate ?? {}), ...(overrides.modulate ?? {}) } }
      : {}),
    ...(base.sharpen || overrides.sharpen
      ? { sharpen: { ...(base.sharpen ?? {}), ...(overrides.sharpen ?? {}) } }
      : {}),
    ...(base.resize || overrides.resize
      ? { resize: { ...(base.resize ?? {}), ...(overrides.resize ?? {}) } }
      : {}),
    ...(base.padding || overrides.padding
      ? { padding: { ...(base.padding ?? {}), ...(overrides.padding ?? {}) } }
      : {}),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.output) throw new Error(usage());

  const presetName = args.preset ?? "web-support";
  const preset = PRESETS[presetName];
  if (!preset) throw new Error(`Unknown preset ${JSON.stringify(presetName)}.\n${usage()}`);

  const specOverrides = args.spec
    ? JSON.parse(await readFile(path.resolve(args.spec), "utf8"))
    : {};
  const spec = mergeSpec(preset, specOverrides);
  if (args.mask) spec.mask = await readFile(path.resolve(args.mask));

  const input = await readFile(path.resolve(args.input));
  const result = await finishRasterAsset(input, spec);
  const outputPath = path.resolve(args.output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.buffer);

  const receipt = {
    ok: true,
    input: path.resolve(args.input),
    output: outputPath,
    preset: presetName,
    evidence: result.evidence,
  };
  console.log(JSON.stringify(args.printEvidence ? receipt : { ok: true, output: outputPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
