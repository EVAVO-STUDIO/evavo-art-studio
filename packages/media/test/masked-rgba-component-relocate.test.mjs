import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { maskedRgbaComponentRelocate } from "../../../tools/masked_rgba_component_relocate.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

test("moves only reviewed mask pixels, donor-repairs the source, and preserves all other bytes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "masked-component-relocate-"));
  try {
    const input = path.join(directory, "input.png");
    const mask = path.join(directory, "mask.png");
    const output = path.join(directory, "output.png");
    const width = 16;
    const height = 8;
    const pixels = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i += 1) pixels.set([20, 30, 40, 255], i * 4);
    pixels.set([240, 80, 20, 128], (3 * width + 3) * 4);
    pixels.set([60, 200, 90, 255], (3 * width + 9) * 4);
    const maskPixels = Buffer.alloc(width * height);
    maskPixels[3 * width + 3] = 255;
    await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toFile(input);
    await sharp(maskPixels, { raw: { width, height, channels: 1 } }).png().toFile(mask);

    const receipt = await maskedRgbaComponentRelocate({ input, mask, output, sourceX: 2, sourceY: 2, width: 3, height: 3, destinationX: 6, destinationY: 2, donorX: 8, donorY: 2 });
    const before = await sharp(input).ensureAlpha().raw().toBuffer();
    const after = await sharp(output).ensureAlpha().raw().toBuffer();
    assert.equal(receipt.selectedPixels, 1);
    assert.deepEqual([...after.subarray((3 * width + 3) * 4, (3 * width + 3) * 4 + 4)], [60, 200, 90, 255]);
    assert.deepEqual([...after.subarray((3 * width + 7) * 4, (3 * width + 7) * 4 + 4)], [130, 55, 30, 255]);
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      if ((x === 3 && y === 3) || (x === 7 && y === 3)) continue;
      const offset = (y * width + x) * 4;
      assert.deepEqual(after.subarray(offset, offset + 4), before.subarray(offset, offset + 4));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("transparent selected pixels do not punch holes in an opaque destination", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "masked-component-alpha-over-"));
  try {
    const input = path.join(directory, "input.png");
    const mask = path.join(directory, "mask.png");
    const output = path.join(directory, "output.png");
    const width = 12;
    const height = 6;
    const pixels = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i += 1) pixels.set([30, 40, 50, 255], i * 4);
    pixels.set([0, 0, 0, 0], (2 * width + 2) * 4);
    const selected = Buffer.alloc(width * height); selected[2 * width + 2] = 255;
    await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toFile(input);
    await sharp(selected, { raw: { width, height, channels: 1 } }).png().toFile(mask);
    await maskedRgbaComponentRelocate({ input, mask, output, sourceX: 1, sourceY: 1, width: 3, height: 3, destinationX: 5, destinationY: 1, donorX: 9, donorY: 1 });
    const after = await sharp(output).ensureAlpha().raw().toBuffer();
    assert.deepEqual([...after.subarray((2 * width + 6) * 4, (2 * width + 6) * 4 + 4)], [30, 40, 50, 255]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("fails closed on overwrite, overlap, mask spill, and empty masks", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "masked-component-fail-closed-"));
  try {
    const input = path.join(directory, "input.png");
    const mask = path.join(directory, "mask.png");
    const emptyMask = path.join(directory, "empty.png");
    const pixels = { create: { width: 16, height: 8, channels: 4, background: "#00000000" } };
    await sharp(pixels).png().toFile(input);
    const selected = Buffer.alloc(16 * 8); selected[0] = 255;
    await sharp(selected, { raw: { width: 16, height: 8, channels: 1 } }).png().toFile(mask);
    await sharp(Buffer.alloc(16 * 8), { raw: { width: 16, height: 8, channels: 1 } }).png().toFile(emptyMask);
    await assert.rejects(() => maskedRgbaComponentRelocate({ input, mask, output: input, sourceX: 0, sourceY: 0, width: 2, height: 2, destinationX: 4, destinationY: 0, donorX: 8, donorY: 0 }), /immutable/);
    await assert.rejects(() => maskedRgbaComponentRelocate({ input, mask, output: path.join(directory, "overlap.png"), sourceX: 0, sourceY: 0, width: 4, height: 2, destinationX: 3, destinationY: 0, donorX: 8, donorY: 0 }), /overlap/);
    await assert.rejects(() => maskedRgbaComponentRelocate({ input, mask, output: path.join(directory, "spill.png"), sourceX: 2, sourceY: 2, width: 2, height: 2, destinationX: 6, destinationY: 2, donorX: 10, donorY: 2 }), /outside/);
    await assert.rejects(() => maskedRgbaComponentRelocate({ input, mask: emptyMask, output: path.join(directory, "empty-out.png"), sourceX: 0, sourceY: 0, width: 2, height: 2, destinationX: 4, destinationY: 0, donorX: 8, donorY: 0 }), /no component/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
