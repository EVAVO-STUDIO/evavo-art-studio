#!/usr/bin/env node
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

const require = createRequire(new URL("../packages/media/package.json", import.meta.url));
const sharp = require("sharp");

export async function boundedScanlineRepair({ input, output, x, y, width, height, feather = 4, direction = "horizontal" }) {
  if (!input || !output || [x, y, width, height].some((value) => !Number.isInteger(value))) {
    throw new Error("input, output and integer x/y/width/height are required");
  }
  if (path.resolve(input) === path.resolve(output)) throw new Error("source must remain immutable; output must differ from input");
  if (!Number.isFinite(feather) || feather < 0 || width < 1 || height < 1 ||
      (direction === "horizontal" && width < 3) || (direction === "vertical" && height < 3)) {
    throw new Error("invalid repair geometry");
  }
  if (!["horizontal", "vertical", "surface"].includes(direction)) throw new Error("direction must be horizontal, vertical or surface");

  const source = sharp(input).ensureAlpha();
  const { data, info } = await source.raw().toBuffer({ resolveWithObject: true });
  if (x < 0 || y < 0 || x + width > info.width || y + height > info.height ||
      (direction === "horizontal" && (x < 1 || x + width >= info.width)) ||
      (direction === "vertical" && (y < 1 || y + height >= info.height)) ||
      (direction === "surface" && (x < 1 || y < 1 || x + width >= info.width || y + height >= info.height))) {
    throw new Error(`repair rectangle must have retained boundary pixels on both ${direction} sides`);
  }
  const result = Buffer.from(data);
  let changedPixels = 0;
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const horizontal = direction === "horizontal";
      const start = horizontal ? (py * info.width + x - 1) * 4 : ((y - 1) * info.width + px) * 4;
      const end = horizontal ? (py * info.width + x + width) * 4 : ((y + height) * info.width + px) * 4;
      const axisPosition = horizontal ? px - x + 1 : py - y + 1;
      const axisLength = horizontal ? width : height;
      const t = axisPosition / (axisLength + 1);
      const edgeDistance = Math.min(axisPosition, axisLength + 1 - axisPosition);
      const blend = feather === 0 ? 1 : Math.min(1, edgeDistance / feather);
      const offset = (py * info.width + px) * 4;
      // Repair colour only. Alpha is geometry/coverage authority and must remain
      // byte-identical to the immutable source, including inside the rectangle.
      for (let channel = 0; channel < 3; channel += 1) {
        let reconstructed = Math.round(data[start + channel] * (1 - t) + data[end + channel] * t);
        if (direction === "surface") {
          const u = (px - x + 1) / (width + 1);
          const v = (py - y + 1) / (height + 1);
          const left = (py * info.width + x - 1) * 4;
          const right = (py * info.width + x + width) * 4;
          const topLeft = ((y - 1) * info.width + x - 1) * 4;
          const topRight = ((y - 1) * info.width + x + width) * 4;
          const bottomLeft = ((y + height) * info.width + x - 1) * 4;
          const bottomRight = ((y + height) * info.width + x + width) * 4;
          const verticalBlend = data[start + channel] * (1 - v) + data[end + channel] * v;
          const horizontalBlend = data[left + channel] * (1 - u) + data[right + channel] * u;
          const cornerBlend = data[topLeft + channel] * (1 - u) * (1 - v) + data[topRight + channel] * u * (1 - v) + data[bottomLeft + channel] * (1 - u) * v + data[bottomRight + channel] * u * v;
          reconstructed = Math.round(Math.max(0, Math.min(255, verticalBlend + horizontalBlend - cornerBlend)));
        }
        const value = Math.round(data[offset + channel] * (1 - blend) + reconstructed * blend);
        if (value !== data[offset + channel]) result[offset + channel] = value;
      }
      if (!result.subarray(offset, offset + 4).equals(data.subarray(offset, offset + 4))) changedPixels += 1;
    }
  }
  await sharp(result, { raw: info }).png().toFile(output);
  return {
    input,
    output,
    canvas: [info.width, info.height],
    editedBounds: [x, y, x + width, y + height],
    direction,
    changedPixels,
    alphaPreservedExactly: true,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const values = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
    if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
    return pairs;
  }, []));
  const receipt = await boundedScanlineRepair({
    input: values.input,
    output: values.output,
    x: Number(values.x), y: Number(values.y), width: Number(values.width), height: Number(values.height),
    feather: values.feather === undefined ? 4 : Number(values.feather), direction: values.direction ?? "horizontal",
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
