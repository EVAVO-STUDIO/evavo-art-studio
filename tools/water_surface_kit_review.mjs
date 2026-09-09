#!/usr/bin/env node

import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "../packages/media/node_modules/sharp/dist/index.mjs";

const fail = (message) => { throw new Error(`water-surface-kit-review: ${message}`); };
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function argumentsOf(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    if (!name?.startsWith("--") || argv[index + 1] === undefined) fail("arguments must be --name value pairs");
    result[name.slice(2)] = argv[index + 1];
  }
  return result;
}

async function decodeExact(filePath, width, height) {
  const encoded = await readFile(filePath);
  const image = sharp(encoded, { failOn: "error" }).ensureAlpha();
  const metadata = await image.metadata();
  if (metadata.width !== width || metadata.height !== height) fail(`${filePath} must be exactly ${width}x${height}`);
  return { encoded, pixels: await image.raw().toBuffer() };
}

function compareBuffers(left, right, label) {
  if (left.length !== right.length || !left.equals(right)) fail(`${label} differs`);
}

function exactOuterSeam(pixels, width, height, label) {
  for (let y = 0; y < height; y += 1) {
    const left = y * width * 4;
    const right = (y * width + width - 1) * 4;
    for (let channel = 0; channel < 4; channel += 1) if (pixels[left + channel] !== pixels[right + channel]) fail(`${label} x seam differs at row ${y}`);
  }
  for (let x = 0; x < width; x += 1) {
    const top = x * 4;
    const bottom = ((height - 1) * width + x) * 4;
    for (let channel = 0; channel < 4; channel += 1) if (pixels[top + channel] !== pixels[bottom + channel]) fail(`${label} y seam differs at column ${x}`);
  }
}

function reconstructQuadrants(quadrants) {
  const output = Buffer.alloc(128 * 128 * 4);
  for (let variant = 0; variant < 4; variant += 1) {
    const ox = (variant % 2) * 64;
    const oy = Math.floor(variant / 2) * 64;
    for (let y = 0; y < 64; y += 1) {
      quadrants[variant].copy(output, ((oy + y) * 128 + ox) * 4, y * 64 * 4, (y + 1) * 64 * 4);
    }
  }
  return output;
}

function rolled(source, width, height, shiftX) {
  const output = Buffer.alloc(source.length);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const targetX = (x + shiftX) % width;
    source.copy(output, (y * width + targetX) * 4, (y * width + x) * 4, (y * width + x + 1) * 4);
  }
  return output;
}

export async function reviewWaterSurfaceKit({ baseReceiptPath, currentReceiptPath, root = process.cwd() }) {
  const base = JSON.parse(await readFile(baseReceiptPath, "utf8"));
  const current = JSON.parse(await readFile(currentReceiptPath, "utf8"));
  if (base.schema !== "strikewater_seamless_water_kit_receipt_v1" || base.variants !== 4 || base.frames_per_variant !== 8) fail("base receipt must declare four variants and eight frames");
  if (current.schema !== "strikewater_directional_current_overlay_receipt_v1" || current.frame_count !== 8 || current.step_pixels !== 16) fail("current receipt must declare eight 16px-step frames");
  if (base.runtime_admission !== false || current.runtime_admission !== false) fail("candidate receipts may not self-authorize runtime admission");

  const baseByFrame = Array.from({ length: 8 }, () => Array(4));
  for (const entry of base.frames) {
    const filePath = path.resolve(root, entry.path);
    const decoded = await decodeExact(filePath, 64, 64);
    if (sha256(decoded.encoded) !== entry.sha256) fail(`base hash drift: ${entry.path}`);
    baseByFrame[entry.frame][entry.variant] = decoded.pixels;
  }
  for (let frame = 0; frame < 8; frame += 1) {
    if (baseByFrame[frame].some((value) => !value)) fail(`base frame ${frame} lacks four variants`);
    exactOuterSeam(reconstructQuadrants(baseByFrame[frame]), 128, 128, `base metatile frame ${frame}`);
  }

  const currentFrames = [];
  for (const entry of current.frames) {
    const filePath = path.resolve(root, entry.path);
    const decoded = await decodeExact(filePath, 128, 64);
    if (sha256(decoded.encoded) !== entry.sha256) fail(`current hash drift: ${entry.path}`);
    currentFrames[entry.frame] = decoded.pixels;
  }
  if (currentFrames.length !== 8 || currentFrames.some((value) => !value)) fail("current loop lacks exactly eight frames");
  for (let frame = 0; frame < 8; frame += 1) compareBuffers(currentFrames[frame], rolled(currentFrames[0], 128, 64, frame * 16), `current frame ${frame} integer motion`);
  compareBuffers(currentFrames[0], rolled(currentFrames[7], 128, 64, 16), "current final-to-first closure");

  return Object.freeze({
    schema: "evavo.water-surface-kit-review.v1",
    approvalState: "technical-review-only",
    passed: true,
    base: { variants: 4, framesPerVariant: 8, reconstructedMetatile: [128, 128], exactOuterSeam: true },
    current: { frames: 8, dimensions: [128, 64], stepPixels: 16, exactIntegerMotion: true, exactLoopClosure: true },
    creativeApproval: false,
    runtimeAdmission: false,
    requiredNextReview: ["full composite at native game resolution", "repetition and breakup", "flow-field placement", "lure and fish readability"],
  });
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(?:([A-Za-z]):)/u, "$1:"))) {
  const args = argumentsOf(process.argv.slice(2));
  if (!args["base-receipt"] || !args["current-receipt"]) fail("--base-receipt and --current-receipt are required");
  const result = await reviewWaterSurfaceKit({ baseReceiptPath: path.resolve(args["base-receipt"]), currentReceiptPath: path.resolve(args["current-receipt"]), root: path.resolve(args.root ?? process.cwd()) });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
