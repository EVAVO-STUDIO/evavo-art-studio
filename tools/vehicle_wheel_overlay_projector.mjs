#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import sharp from "../packages/media/node_modules/sharp/dist/index.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

async function decodedRgba(file, expectedWidth, expectedHeight, label) {
  const bytes = await readFile(file);
  const image = sharp(bytes, { failOn: "error" }).ensureAlpha();
  const metadata = await image.metadata();
  if (metadata.width !== expectedWidth || metadata.height !== expectedHeight) {
    throw new Error(`${label} must be ${expectedWidth}x${expectedHeight}; received ${metadata.width}x${metadata.height}.`);
  }
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error(`${label} did not decode to RGBA.`);
  return { bytes, data };
}

export async function projectVehicleWheelOverlays(config) {
  const width = positiveInteger(config?.canvas?.width, "canvas.width");
  const height = positiveInteger(config?.canvas?.height, "canvas.height");
  const productPath = path.resolve(String(config.product ?? ""));
  const productBytes = await readFile(productPath);
  const productMeta = await sharp(productBytes, { failOn: "error" }).metadata();
  if (!productMeta.hasAlpha) throw new Error("Product wheel must have native alpha.");
  if (!Array.isArray(config.targets) || config.targets.length === 0) throw new Error("targets must contain at least one reviewed wheel anchor.");

  const outputs = [];
  for (const target of config.targets) {
    const radiusX = positiveInteger(target.radiusX, `${target.id}.radiusX`);
    const radiusY = positiveInteger(target.radiusY, `${target.id}.radiusY`);
    const centerX = positiveInteger(target.x, `${target.id}.x`);
    const centerY = positiveInteger(target.y, `${target.id}.y`);
    const left = centerX - radiusX;
    const top = centerY - radiusY;
    if (left < 0 || top < 0 || left + radiusX * 2 > width || top + radiusY * 2 > height) {
      throw new Error(`${target.id} reviewed axle ellipse lies outside the retained canvas.`);
    }

    const maskPath = path.resolve(String(target.mask ?? ""));
    const mask = await decodedRgba(maskPath, width, height, `${target.id} wheel mask`);
    let visibleMaskPixels = 0;
    for (let index = 3; index < mask.data.length; index += 4) if (mask.data[index] > 0) visibleMaskPixels += 1;
    if (visibleMaskPixels === 0) throw new Error(`${target.id} wheel mask is empty.`);

    const projected = await sharp(productBytes, { failOn: "error" })
      .ensureAlpha()
      .resize(radiusX * 2, radiusY * 2, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .png()
      .toBuffer();
    const canvas = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: projected, left, top }])
      .raw()
      .toBuffer();
    for (let offset = 0; offset < canvas.length; offset += 4) {
      canvas[offset + 3] = Math.round((canvas[offset + 3] * mask.data[offset + 3]) / 255);
    }
    const png = await sharp(canvas, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const outputPath = path.resolve(String(target.output ?? ""));
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, png, { flag: "wx" });
    outputs.push({
      id: String(target.id), output: outputPath, outputSha256: sha256(png),
      mask: maskPath, maskSha256: sha256(mask.bytes), axle: { x: centerX, y: centerY, radiusX, radiusY },
      visibleMaskPixels,
    });
  }
  return {
    schema: "evavo.vehicle-wheel-overlay-projection.v1",
    approvalState: "unapproved-pending-native-runtime-review",
    canvas: { width, height },
    product: productPath,
    productSha256: sha256(productBytes),
    geometryPolicy: "reviewed axle ellipse plus same-canvas source-wheel alpha intersection",
    sourceMutation: false,
    outputs,
  };
}

function parseArgs(argv) {
  const index = argv.indexOf("--config");
  if (index < 0 || !argv[index + 1]) throw new Error("Usage: node tools/vehicle_wheel_overlay_projector.mjs --config <config.json>");
  return path.resolve(argv[index + 1]);
}

async function main() {
  const configPath = parseArgs(process.argv.slice(2));
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const receipt = await projectVehicleWheelOverlays(config);
  const receiptPath = path.resolve(String(config.receipt ?? `${configPath}.receipt.json`));
  await mkdir(path.dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({ receipt: receiptPath, outputs: receipt.outputs.length })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
