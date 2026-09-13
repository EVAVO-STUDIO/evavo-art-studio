import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { boundedScanlineRepair } from "../../../tools/bounded_scanline_repair.mjs";

test("bounded scanline repair preserves canvas, alpha and every pixel outside its rectangle", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "evavo-scanline-"));
  const input = path.join(dir, "input.png");
  const output = path.join(dir, "output.png");
  const pixels = Buffer.alloc(8 * 4 * 4, 255);
  for (let x = 2; x < 5; x += 1) for (let y = 1; y < 3; y += 1) pixels[(y * 8 + x) * 4] = 0;
  await sharp(pixels, { raw: { width: 8, height: 4, channels: 4 } }).png().toFile(input);
  const receipt = await boundedScanlineRepair({ input, output, x: 2, y: 1, width: 3, height: 2, feather: 0 });
  const before = await sharp(await readFile(input)).ensureAlpha().raw().toBuffer();
  const after = await sharp(await readFile(output)).ensureAlpha().raw().toBuffer();
  assert.deepEqual(receipt.canvas, [8, 4]);
  assert.equal(receipt.changedPixels, 6);
  for (let y = 0; y < 4; y += 1) for (let x = 0; x < 8; x += 1) {
    if (x >= 2 && x < 5 && y >= 1 && y < 3) continue;
    const offset = (y * 8 + x) * 4;
    assert.deepEqual(after.subarray(offset, offset + 4), before.subarray(offset, offset + 4));
  }
});

test("bounded scanline repair supports vertical reconstruction", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "evavo-scanline-v-"));
  const input = path.join(dir, "input.png");
  const output = path.join(dir, "output.png");
  const pixels = Buffer.alloc(5 * 6 * 4, 255);
  for (let y = 2; y < 5; y += 1) pixels[(y * 5 + 2) * 4] = 0;
  await sharp(pixels, { raw: { width: 5, height: 6, channels: 4 } }).png().toFile(input);
  const receipt = await boundedScanlineRepair({ input, output, x: 2, y: 2, width: 1, height: 3, feather: 0, direction: "vertical" });
  assert.equal(receipt.direction, "vertical");
  assert.equal(receipt.changedPixels, 3);
});

test("bounded scanline repair refuses path aliases that would overwrite the source", async () => {
  await assert.rejects(
    boundedScanlineRepair({ input: "sprite.png", output: path.join(".", "sprite.png"), x: 1, y: 1, width: 3, height: 1 }),
    /source must remain immutable/,
  );
});

test("bounded scanline repair rejects non-finite feather values", async () => {
  await assert.rejects(
    boundedScanlineRepair({ input: "input.png", output: "output.png", x: 1, y: 1, width: 3, height: 1, feather: Number.NaN }),
    /invalid repair geometry/,
  );
});
