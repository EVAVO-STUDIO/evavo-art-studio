#!/usr/bin/env node
import { createRequire } from "node:module";
import { lstat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const require = createRequire(new URL("../packages/media/package.json", import.meta.url));
const sharp = require("sharp");

const inside = (x, y, left, top, width, height) => x >= left && y >= top && x < left + width && y < top + height;

function sourceOver(source, destination, coverage) {
  const sourceAlpha = (source[3] / 255) * (coverage / 255);
  const destinationAlpha = destination[3] / 255;
  const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
  if (outputAlpha === 0) return [0, 0, 0, 0];
  return [
    Math.round((source[0] * sourceAlpha + destination[0] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha),
    Math.round((source[1] * sourceAlpha + destination[1] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha),
    Math.round((source[2] * sourceAlpha + destination[2] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha),
    Math.round(outputAlpha * 255),
  ];
}

export async function maskedRgbaComponentRelocate({ input, mask, output, sourceX, sourceY, width, height, destinationX, destinationY, donorX, donorY, repairInput }) {
  const usingRegisteredRepair = Boolean(repairInput);
  const integers = [sourceX, sourceY, width, height, destinationX, destinationY, ...(usingRegisteredRepair ? [] : [donorX, donorY])];
  if (!input || !mask || !output || integers.some((value) => !Number.isInteger(value))) throw new Error("input, mask, output and integer geometry are required");
  if (path.resolve(input) === path.resolve(output)) throw new Error("source must remain immutable; output must differ from input");
  if (width < 1 || height < 1) throw new Error("invalid component geometry");
  try {
    await lstat(output);
    throw new Error("output already exists; component relocation is create-only");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const decoded = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const maskDecoded = await sharp(mask).greyscale().raw().toBuffer({ resolveWithObject: true });
  const repairDecoded = usingRegisteredRepair ? await sharp(repairInput).ensureAlpha().raw().toBuffer({ resolveWithObject: true }) : null;
  const { data, info } = decoded;
  if (maskDecoded.info.width !== info.width || maskDecoded.info.height !== info.height) throw new Error("mask dimensions must match the source canvas");
  if (repairDecoded && (repairDecoded.info.width !== info.width || repairDecoded.info.height !== info.height)) throw new Error("registered repair input dimensions must match the source canvas");
  const rectangles = [["source", sourceX, sourceY], ["destination", destinationX, destinationY]];
  if (!usingRegisteredRepair) rectangles.push(["donor", donorX, donorY]);
  for (const [label, left, top] of rectangles) {
    if (left < 0 || top < 0 || left + width > info.width || top + height > info.height) throw new Error(`${label} rectangle must remain inside the source canvas`);
  }
  if (sourceX < destinationX + width && destinationX < sourceX + width && sourceY < destinationY + height && destinationY < sourceY + height) throw new Error("source and destination rectangles may not overlap");

  const result = Buffer.from(data);
  let selectedPixels = 0;
  let outsideMaskChangedPixels = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const coverage = maskDecoded.data[y * info.width + x];
      if (!coverage) continue;
      if (!inside(x, y, sourceX, sourceY, width, height)) throw new Error("mask contains selected pixels outside the declared source rectangle");
      selectedPixels += 1;
      const localX = x - sourceX;
      const localY = y - sourceY;
      const sourceOffset = (y * info.width + x) * 4;
      const destinationOffset = ((destinationY + localY) * info.width + destinationX + localX) * 4;
      const moved = sourceOver(data.subarray(sourceOffset, sourceOffset + 4), data.subarray(destinationOffset, destinationOffset + 4), coverage);
      const replacementOffset = usingRegisteredRepair ? sourceOffset : ((donorY + localY) * info.width + donorX + localX) * 4;
      const replacementData = repairDecoded ? repairDecoded.data : data;
      for (let channel = 0; channel < 4; channel += 1) {
        result[sourceOffset + channel] = replacementData[replacementOffset + channel];
        result[destinationOffset + channel] = moved[channel];
      }
    }
  }
  if (!selectedPixels) throw new Error("mask selects no component pixels");

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const allowed = inside(x, y, sourceX, sourceY, width, height) || inside(x, y, destinationX, destinationY, width, height);
      const offset = (y * info.width + x) * 4;
      if (!allowed && !data.subarray(offset, offset + 4).equals(result.subarray(offset, offset + 4))) outsideMaskChangedPixels += 1;
    }
  }
  if (outsideMaskChangedPixels) throw new Error("pixels outside source/destination rectangles changed");
  await sharp(result, { raw: info }).png().toFile(output);
  return {
    input, mask, output, canvas: [info.width, info.height], selectedPixels,
    sourceBounds: [sourceX, sourceY, sourceX + width, sourceY + height],
    destinationBounds: [destinationX, destinationY, destinationX + width, destinationY + height],
    repairInput: repairInput ?? null,
    donorBounds: usingRegisteredRepair ? null : [donorX, donorY, donorX + width, donorY + height],
    operation: usingRegisteredRepair ? "masked-rgba-component-relocate-with-registered-repair-and-source-over" : "masked-rgba-component-relocate-with-donor-repair-and-source-over",
    outsideSourceAndDestinationByteIdentical: true,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const values = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
    if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
    return pairs;
  }, []));
  const receipt = await maskedRgbaComponentRelocate({
    input: values.input, mask: values.mask, output: values.output,
    sourceX: Number(values.sourceX), sourceY: Number(values.sourceY), width: Number(values.width), height: Number(values.height),
    destinationX: Number(values.destinationX), destinationY: Number(values.destinationY), donorX: Number(values.donorX), donorY: Number(values.donorY),
    repairInput: values.repairInput,
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
