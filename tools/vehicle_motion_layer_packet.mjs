#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildVehicleMotionLayerPacket } from "../packages/media/dist/index.js";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error("Arguments must be --key value pairs.");
    args[key.slice(2)] = value;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.spec || !args.output) {
    throw new Error("Usage: node tools/vehicle_motion_layer_packet.mjs --input <transparent vehicle.png> --spec <reviewed anchors.json> --output <create-only directory>");
  }
  const inputPath = path.resolve(args.input);
  const specPath = path.resolve(args.spec);
  const outputPath = path.resolve(args.output);
  const spec = JSON.parse(await readFile(specPath, "utf8"));
  const result = await buildVehicleMotionLayerPacket(await readFile(inputPath), spec);
  await mkdir(outputPath, { recursive: false });
  for (const layer of result.layers) await writeFile(path.join(outputPath, `${layer.id}.png`), layer.buffer, { flag: "wx" });
  const receipt = { ...result.evidence, inputPath, specPath, outputPath, width: result.width, height: result.height, inputSha256: result.inputSha256, layers: result.layers.map(({ buffer: _buffer, ...layer }) => ({ ...layer, file: `${layer.id}.png` })) };
  await writeFile(path.join(outputPath, "vehicle-motion-layer-packet.receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
