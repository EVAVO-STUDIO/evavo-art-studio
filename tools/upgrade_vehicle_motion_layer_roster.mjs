#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
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

function within(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args["game-root"] || !args.spec) {
    throw new Error("Usage: node tools/upgrade_vehicle_motion_layer_roster.mjs --game-root <Godot repo> --spec <reviewed roster anchors.json>");
  }
  const gameRoot = path.resolve(args["game-root"]);
  const specPath = path.resolve(args.spec);
  const spec = JSON.parse(await readFile(specPath, "utf8"));
  if (spec.schema !== "evavo.drop-drag-drift.reviewed-wheel-anchors.v1" || typeof spec.cars !== "object") {
    throw new Error("The roster spec must be a reviewed DROP DRAG DRIFT wheel-anchor manifest.");
  }
  const outputRoot = path.join(gameRoot, "assets", "vehicles", "motion_layers", "rear_three_quarter");
  if (!within(gameRoot, outputRoot)) throw new Error("Resolved output root escaped the game repository.");

  const receipts = [];
  for (const [id, car] of Object.entries(spec.cars)) {
    if (!/^[a-z0-9]+$/.test(id)) throw new Error(`Unsafe car id ${JSON.stringify(id)}.`);
    const inputPath = path.join(gameRoot, "assets", "vehicles", "rear_three_quarter", "final", `${id}_rear_3q.png`);
    const outputPath = path.join(outputRoot, id);
    if (!within(outputRoot, outputPath)) throw new Error(`Resolved car output escaped the governed root: ${id}.`);
    const result = await buildVehicleMotionLayerPacket(await readFile(inputPath), {
      view: spec.view,
      drivetrain: car.drivetrain,
      reviewedAnchors: true,
      reviewer: spec.reviewer,
      anchors: car.anchors,
    });
    for (const layer of result.layers) await writeFile(path.join(outputPath, `${layer.id}.png`), layer.buffer);
    const receipt = {
      ...result.evidence,
      source: `res://assets/vehicles/rear_three_quarter/final/${id}_rear_3q.png`,
      width: result.width,
      height: result.height,
      inputSha256: result.inputSha256,
      layers: result.layers.map(({ buffer: _buffer, ...layer }) => ({
        ...layer,
        file: `res://assets/vehicles/motion_layers/rear_three_quarter/${id}/${layer.id}.png`,
      })),
    };
    await writeFile(path.join(outputPath, "vehicle-motion-layer-packet.receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
    receipts.push({ id, layerCount: result.layers.length, inputSha256: result.inputSha256 });
  }
  process.stdout.write(`${JSON.stringify({ schema: "evavo.vehicle-motion-layer-roster-upgrade.v1", count: receipts.length, receipts }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
