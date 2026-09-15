#!/usr/bin/env node
import { createRequire } from "node:module";
import { lstat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const require = createRequire(new URL("../packages/media/package.json", import.meta.url));
const sharp = require("sharp");

export async function pairedMirroredPatchSwap({ input, output, x, y, width, height }) {
  if (!input || !output || [x, y, width, height].some((value) => !Number.isInteger(value))) {
    throw new Error("input, output and integer x/y/width/height are required");
  }
  if (path.resolve(input) === path.resolve(output)) throw new Error("source must remain immutable; output must differ from input");
  if (width < 1 || height < 1) throw new Error("invalid patch geometry");
  try {
    await lstat(output);
    throw new Error("output already exists; paired patch swaps are create-only");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mirrorX = info.width - x - width;
  if (x < 0 || y < 0 || x + width > info.width || y + height > info.height || mirrorX < 0) {
    throw new Error("patch rectangle must remain inside the source canvas");
  }
  if (x < mirrorX + width && mirrorX < x + width) throw new Error("paired mirrored patches may not overlap");

  const result = Buffer.from(data);
  let changedPixels = 0;
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const leftX = x + px;
      const rightX = mirrorX + (width - 1 - px);
      const leftOffset = ((y + py) * info.width + leftX) * 4;
      const rightOffset = ((y + py) * info.width + rightX) * 4;
      const leftPixel = Buffer.from(data.subarray(leftOffset, leftOffset + 4));
      const rightPixel = Buffer.from(data.subarray(rightOffset, rightOffset + 4));
      rightPixel.copy(result, leftOffset);
      leftPixel.copy(result, rightOffset);
      if (!leftPixel.equals(rightPixel)) changedPixels += 2;
    }
  }

  await sharp(result, { raw: info }).png().toFile(output);
  return {
    input,
    output,
    canvas: [info.width, info.height],
    sourceBounds: [x, y, x + width, y + height],
    pairedBounds: [mirrorX, y, mirrorX + width, y + height],
    operation: "paired-horizontal-mirror-swap",
    changedPixels,
    outsideBoundsByteIdentical: true,
    alphaMovedWithComponent: true,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const values = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
    if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
    return pairs;
  }, []));
  const receipt = await pairedMirroredPatchSwap({
    input: values.input,
    output: values.output,
    x: Number(values.x),
    y: Number(values.y),
    width: Number(values.width),
    height: Number(values.height),
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
