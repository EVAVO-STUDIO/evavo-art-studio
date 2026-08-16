import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import {
  ChromaSpillSuppressionError,
  suppressChromaSpill,
} from "../dist/index.js";

async function raster(width, height, pixel) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const values = pixel(x, y);
      const offset = (y * width + x) * 4;
      data.set(values, offset);
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

async function pixels(buffer) {
  return sharp(buffer).ensureAlpha().raw().toBuffer();
}

test("chroma spill suppression removes a green provider fringe without changing skin", async () => {
  const candidate = await raster(4, 1, (x) => {
    if (x === 0) return [0, 0, 0, 0];
    if (x === 1) return [12, 220, 8, 255];
    if (x === 2) return [25, 48, 24, 255];
    return [232, 158, 108, 255];
  });
  const first = await suppressChromaSpill(candidate, {
    matteColour: "#00ff00",
  });
  const second = await suppressChromaSpill(candidate, {
    matteColour: "#00ff00",
  });
  assert.deepEqual(first.png, second.png);
  assert.equal(first.evidence.outputSha256, second.evidence.outputSha256);
  assert.equal(first.evidence.matte.dominantChannel, "green");
  assert.equal(first.evidence.output.suppressedPixels, 2);
  assert.equal(first.evidence.output.alphaReducedPixels, 2);
  const output = await pixels(first.png);
  assert.equal(output[3], 0);
  assert.ok(output[7] < 80, "strong spill becomes a soft transparent edge");
  assert.ok(output[5] <= Math.max(output[4], output[6]));
  assert.ok(output[9] <= Math.max(output[8], output[10]));
  assert.deepEqual([...output.subarray(12, 16)], [232, 158, 108, 255]);
});

test("chroma spill suppression rejects grey and malformed mattes", async () => {
  const candidate = await raster(1, 1, () => [20, 30, 20, 255]);
  await assert.rejects(
    () => suppressChromaSpill(candidate, { matteColour: "#808080" }),
    (error) =>
      error instanceof ChromaSpillSuppressionError &&
      error.code === "CHROMA_SPILL_MATTE_UNSAFE",
  );
  await assert.rejects(
    () => suppressChromaSpill(candidate, { matteColour: "green" }),
    (error) =>
      error instanceof ChromaSpillSuppressionError &&
      error.code === "CHROMA_SPILL_MATTE_INVALID",
  );
  await assert.rejects(
    () =>
      suppressChromaSpill(candidate, {
        matteColour: "#808080",
        allowInferredMatte: true,
      }),
    (error) =>
      error instanceof ChromaSpillSuppressionError &&
      error.code === "CHROMA_SPILL_MATTE_UNSAFE",
  );
});

test("chroma spill suppression requires an explicit inferred high-chroma handoff", async () => {
  const candidate = await raster(3, 1, (x) => {
    if (x === 0) return [0, 0, 0, 0];
    if (x === 1) return [25, 80, 20, 128];
    return [232, 158, 108, 255];
  });
  await assert.rejects(
    () => suppressChromaSpill(candidate, { matteColour: "#21e81c" }),
    (error) =>
      error instanceof ChromaSpillSuppressionError &&
      error.code === "CHROMA_SPILL_MATTE_UNSAFE",
  );
  const result = await suppressChromaSpill(candidate, {
    matteColour: "#21e81c",
    allowInferredMatte: true,
  });
  assert.equal(result.evidence.matte.hex, "#21e81c");
  assert.equal(result.evidence.matte.dominantChannel, "green");
  assert.equal(result.evidence.thresholds.inferredMatteAccepted, true);
});

test("chroma spill suppression neutralizes key-coloured hidden RGB before texture filtering", async () => {
  const candidate = await raster(2, 1, (x) =>
    x === 0 ? [4, 220, 3, 0] : [30, 20, 25, 0],
  );
  const result = await suppressChromaSpill(candidate, {
    matteColour: "#00ff00",
  });
  const output = await pixels(result.png);
  assert.deepEqual([...output.subarray(0, 4)], [4, 4, 3, 0]);
  assert.deepEqual([...output.subarray(4, 8)], [30, 20, 25, 0]);
  assert.equal(result.evidence.output.hiddenRgbSuppressedPixels, 1);
  assert.equal(result.evidence.output.maximumHiddenRgbSpill, 216);
});
