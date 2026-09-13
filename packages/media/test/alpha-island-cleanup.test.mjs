import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { cleanupAlphaIslands } from "../../../tools/alpha_island_cleanup.mjs";

test("alpha island cleanup removes detached artifacts and preserves the primary subject", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "evavo-alpha-islands-"));
  const input = path.join(dir, "input.png");
  const output = path.join(dir, "output.png");
  const pixels = Buffer.alloc(8 * 7 * 4);
  for (let y = 1; y < 5; y += 1) for (let x = 1; x < 5; x += 1) pixels[(y * 8 + x) * 4 + 3] = 255;
  for (let x = 1; x < 7; x += 1) pixels[(6 * 8 + x) * 4 + 3] = 255;
  await sharp(pixels, { raw: { width: 8, height: 7, channels: 4 } }).png().toFile(input);
  const receipt = await cleanupAlphaIslands({ input, output });
  const { data } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(receipt.componentCount, 2);
  assert.equal(receipt.removedComponents, 1);
  assert.equal(receipt.removedPixels, 6);
  assert.equal(data[(2 * 8 + 2) * 4 + 3], 255);
  assert.equal(data[(6 * 8 + 3) * 4 + 3], 0);
});

test("alpha island cleanup refuses source overwrite aliases and invalid thresholds", async () => {
  await assert.rejects(cleanupAlphaIslands({ input: "sprite.png", output: path.join(".", "sprite.png") }), /immutable/);
  await assert.rejects(cleanupAlphaIslands({ input: "in.png", output: "out.png", alphaThreshold: 255 }), /invalid/);
  await assert.rejects(cleanupAlphaIslands({ input: "in.png", output: "out.png", clearBottomRows: 17 }), /invalid/);
});

test("alpha island cleanup supports an explicit bounded bottom-edge strip", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "evavo-alpha-edge-"));
  const input = path.join(dir, "input.png");
  const output = path.join(dir, "output.png");
  const pixels = Buffer.alloc(5 * 5 * 4, 255);
  await sharp(pixels, { raw: { width: 5, height: 5, channels: 4 } }).png().toFile(input);
  const receipt = await cleanupAlphaIslands({ input, output, clearBottomRows: 1 });
  const { data } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(receipt.clearedEdgePixels, 5);
  assert.equal(data[(4 * 5 + 2) * 4 + 3], 0);
  assert.equal(data[(3 * 5 + 2) * 4 + 3], 255);
});
