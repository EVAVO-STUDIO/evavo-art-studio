import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { packGodotOrmTexture } from "../dist/index.js";

async function grayscale(width, height, values) {
  const raw = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const value = values[pixel];
    const offset = pixel * 4;
    raw[offset] = value;
    raw[offset + 1] = value;
    raw[offset + 2] = value;
    raw[offset + 3] = 255;
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function rgba(width, height, values) {
  return sharp(Buffer.from(values), { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("packs AO, roughness and metallic into exact Godot ORM channels", async () => {
  const ao = await grayscale(2, 2, [1, 2, 3, 4]);
  const roughness = await grayscale(2, 2, [10, 11, 12, 13]);
  const metallic = await grayscale(2, 2, [20, 21, 22, 23]);
  const result = await packGodotOrmTexture({
    ambientOcclusion: { encoded: ao },
    roughness: { encoded: roughness },
    metallic: { encoded: metallic },
  });

  const decoded = await sharp(result.png).ensureAlpha().raw().toBuffer();
  assert.deepEqual([...decoded], [
    1, 10, 20, 255,
    2, 11, 21, 255,
    3, 12, 22, 255,
    4, 13, 23, 255,
  ]);
  assert.equal(result.evidence.channelContract, "R=ambient-occlusion,G=roughness,B=metallic,A=255");
  assert.deepEqual(result.evidence.defaultedChannels, []);
  assert.equal(result.evidence.sourceMutationAllowed, false);
});

test("uses deterministic neutral defaults for missing ORM channels", async () => {
  const roughness = await grayscale(1, 1, [96]);
  const result = await packGodotOrmTexture({ roughness: { encoded: roughness } });
  const decoded = await sharp(result.png).ensureAlpha().raw().toBuffer();
  assert.deepEqual([...decoded], [255, 96, 0, 255]);
  assert.deepEqual(result.evidence.defaultedChannels, ["ambient-occlusion", "metallic"]);
});

test("rejects mismatched source dimensions", async () => {
  const ao = await grayscale(2, 2, [255, 255, 255, 255]);
  const roughness = await grayscale(1, 1, [128]);
  await assert.rejects(
    () => packGodotOrmTexture({ ambientOcclusion: { encoded: ao }, roughness: { encoded: roughness } }),
    /dimensions must match exactly/,
  );
});

test("strict mode rejects chromatic data passed as a scalar map", async () => {
  const contaminated = await rgba(1, 1, [255, 0, 0, 255]);
  await assert.rejects(
    () => packGodotOrmTexture({ roughness: { encoded: contaminated } }),
    /failed scalar validation/,
  );
});

test("can intentionally pack a selected source channel", async () => {
  const source = await rgba(1, 1, [10, 20, 30, 255]);
  const result = await packGodotOrmTexture({
    roughness: { encoded: source, channel: "g" },
    strictScalarValidation: false,
  });
  const decoded = await sharp(result.png).ensureAlpha().raw().toBuffer();
  assert.deepEqual([...decoded], [255, 20, 0, 255]);
  assert.equal(result.evidence.sourceChannels.roughness, "g");
});
