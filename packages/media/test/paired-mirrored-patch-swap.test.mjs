import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pairedMirroredPatchSwap } from "../../../tools/paired_mirrored_patch_swap.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

test("swaps mirrored RGBA component patches and preserves every outside byte", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "paired-mirror-swap-"));
  try {
    const input = path.join(directory, "input.png");
    const output = path.join(directory, "output.png");
    const width = 12;
    const height = 6;
    const pixels = Buffer.alloc(width * height * 4);
    for (let index = 0; index < width * height; index += 1) pixels.set([20, 30, 40, 255], index * 4);
    pixels.set([250, 10, 20, 128], (3 * width + 1) * 4);
    pixels.set([10, 220, 30, 64], (3 * width + 10) * 4);
    await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toFile(input);

    const receipt = await pairedMirroredPatchSwap({ input, output, x: 1, y: 2, width: 2, height: 3 });
    const before = await sharp(input).ensureAlpha().raw().toBuffer();
    const after = await sharp(output).ensureAlpha().raw().toBuffer();
    assert.deepEqual(receipt.pairedBounds, [9, 2, 11, 5]);
    assert.deepEqual([...after.subarray((3 * width + 1) * 4, (3 * width + 1) * 4 + 4)], [10, 220, 30, 64]);
    assert.deepEqual([...after.subarray((3 * width + 10) * 4, (3 * width + 10) * 4 + 4)], [250, 10, 20, 128]);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const inPatch = y >= 2 && y < 5 && ((x >= 1 && x < 3) || (x >= 9 && x < 11));
        if (!inPatch) {
          const offset = (y * width + x) * 4;
          assert.deepEqual(after.subarray(offset, offset + 4), before.subarray(offset, offset + 4));
        }
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects source overwrite and overlapping mirror geometry", async () => {
  await assert.rejects(() => pairedMirroredPatchSwap({ input: "same.png", output: "same.png", x: 1, y: 1, width: 2, height: 2 }), /immutable/);
  const directory = await mkdtemp(path.join(os.tmpdir(), "paired-mirror-overlap-"));
  try {
    const input = path.join(directory, "input.png");
    await sharp({ create: { width: 12, height: 6, channels: 4, background: "#00000000" } }).png().toFile(input);
    await assert.rejects(() => pairedMirroredPatchSwap({ input, output: path.join(directory, "out.png"), x: 4, y: 1, width: 4, height: 2 }), /overlap/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("refuses to replace an existing output", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "paired-mirror-create-only-"));
  try {
    const input = path.join(directory, "input.png");
    const output = path.join(directory, "output.png");
    await sharp({ create: { width: 12, height: 6, channels: 4, background: "#00000000" } }).png().toFile(input);
    await sharp({ create: { width: 12, height: 6, channels: 4, background: "#ff00ffff" } }).png().toFile(output);
    const retained = await sharp(output).ensureAlpha().raw().toBuffer();
    await assert.rejects(() => pairedMirroredPatchSwap({ input, output, x: 1, y: 1, width: 2, height: 2 }), /create-only/);
    assert.deepEqual(await sharp(output).ensureAlpha().raw().toBuffer(), retained);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
