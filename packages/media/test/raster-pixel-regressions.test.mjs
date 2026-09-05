import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { finishRasterAsset } from "../dist/finishing-pass.js";
import { composeRasterLayers } from "../dist/compositing-pass.js";

const solid = (width, height, background) => sharp({ create: { width, height, channels: 4, background } }).png().toBuffer();
const decoded = (buffer) => sharp(buffer).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const at = (image, x, y) => [...image.data.subarray((y * image.info.width + x) * 4, (y * image.info.width + x) * 4 + 4)];
const RED = { r: 255, g: 36, b: 78, alpha: 1 };
const BLUE = { r: 0, g: 0, b: 255, alpha: 1 };

for (const withCanvas of [false, true]) {
  test(`all layers and fitted base survive composition (explicit canvas: ${withCanvas})`, async () => {
    const base = await solid(12, 8, { r: 20, g: 30, b: 40, alpha: 1 });
    const red = await solid(4, 4, RED);
    const blue = await solid(4, 4, BLUE);
    const result = await composeRasterLayers(base, {
      ...(withCanvas ? { canvas: { width: 12, height: 8 } } : {}),
      layers: [{ input: red, left: 0, top: 0 }, { input: blue, left: 8, top: 0 }],
      format: "png",
    });
    const image = await decoded(result.buffer);
    assert.deepEqual(at(image, 1, 1), [255, 36, 78, 255]);
    assert.deepEqual(at(image, 9, 1), [0, 0, 255, 255]);
    assert.deepEqual(at(image, 6, 6), [20, 30, 40, 255]);
  });
}

test("overlap respects the supplied layer order", async () => {
  const red = await solid(4, 4, RED);
  const blue = await solid(4, 4, BLUE);
  const result = await composeRasterLayers(null, {
    canvas: { width: 8, height: 8 },
    layers: [{ input: red, left: 0, top: 0 }, { input: blue, left: 2, top: 2 }],
  });
  const image = await decoded(result.buffer);
  assert.deepEqual(at(image, 0, 0), [255, 36, 78, 255]);
  assert.deepEqual(at(image, 3, 3), [0, 0, 255, 255]);
  assert.equal(at(image, 7, 7)[3], 0);
});

for (const operation of ["finish", "compose"]) {
  for (const maskKind of ["alpha", "grayscale"]) {
    test(`${operation} applies ${maskKind} coverage, not merely an alpha channel`, async () => {
      const source = await solid(8, 8, RED);
      const maskPixels = Buffer.alloc(8 * 8 * 4);
      for (let i = 0; i < 64; i += 1) {
        const coverage = i % 8 < 2 ? 0 : i % 8 < 6 ? 128 : 255;
        maskPixels.set(maskKind === "alpha" ? [255, 255, 255, coverage] : [coverage, coverage, coverage, 255], i * 4);
      }
      let maskImage = sharp(maskPixels, { raw: { width: 8, height: 8, channels: 4 } });
      if (maskKind === "grayscale") maskImage = maskImage.removeAlpha().greyscale();
      const mask = await maskImage.png().toBuffer();
      const result = operation === "finish"
        ? await finishRasterAsset(source, { mask })
        : await composeRasterLayers(null, { canvas: { width: 8, height: 8 }, layers: [{ input: source, mask }] });
      const image = await decoded(result.buffer);
      assert.equal(at(image, 0, 4)[3], 0);
      assert.ok(Math.abs(at(image, 3, 4)[3] - 128) <= 1);
      assert.deepEqual(at(image, 7, 4), [255, 36, 78, 255]);
    });
  }
}

test("a matte multiplies existing partial alpha without restoring transparent pixels", async () => {
  const source = await solid(8, 8, { ...RED, alpha: 0.5 });
  const mask = await solid(8, 8, { r: 255, g: 255, b: 255, alpha: 0.5 });
  const result = await finishRasterAsset(source, { mask });
  const image = await decoded(result.buffer);
  assert.equal(at(image, 4, 4)[3], 64);
  assert.deepEqual(at(image, 4, 4).slice(0, 3), [255, 36, 78]);
});

test("mask then trim then resize uses masked geometry and preserves transparent padding", async () => {
  const source = await solid(20, 16, RED);
  const mask = await sharp({ create: { width: 20, height: 16, channels: 4, background: "#00000000" } })
    .composite([{ input: await solid(8, 6, "white"), left: 6, top: 5 }]).png().toBuffer();
  const result = await finishRasterAsset(source, {
    mask, trim: { threshold: 1, padding: 2 },
    resize: { width: 16, height: 12, fit: "fill" },
    guard: { minRetainedAreaRatio: 0.1, maxAspectRatioDrift: 2 },
  });
  assert.equal(result.evidence.cleanupWidth, 8);
  assert.equal(result.evidence.cleanupHeight, 6);
  assert.equal(result.evidence.outputWidth, 20);
  assert.equal(result.evidence.outputHeight, 16);
  const image = await decoded(result.buffer);
  assert.equal(at(image, 0, 0)[3], 0);
  assert.deepEqual(at(image, 8, 8), [255, 36, 78, 255]);
});

test("destructive masked trims are rejected by the real cleanup geometry", async () => {
  const source = await solid(20, 20, RED);
  const mask = await sharp({ create: { width: 20, height: 20, channels: 4, background: "#00000000" } })
    .composite([{ input: await solid(4, 4, "white"), left: 8, top: 8 }]).png().toBuffer();
  await assert.rejects(() => finishRasterAsset(source, {
    mask, trim: { threshold: 1 }, guard: { minRetainedAreaRatio: 0.5 },
  }), /retained .* minimum/i);
});

test("a transformed layer matte and opacity both affect delivered pixels", async () => {
  const result = await composeRasterLayers(null, {
    canvas: { width: 10, height: 10 },
    layers: [{
      input: await solid(12, 12, RED), resize: { width: 6, height: 6 },
      mask: await solid(6, 6, { r: 255, g: 255, b: 255, alpha: 0.5 }),
      opacity: 0.5, left: 2, top: 2,
    }],
  });
  const image = await decoded(result.buffer);
  assert.ok(Math.abs(at(image, 4, 4)[3] - 64) <= 1);
  assert.equal(at(image, 0, 0)[3], 0);
});

test("a fully transparent matte removes the subject", async () => {
  const result = await finishRasterAsset(await solid(8, 8, RED), {
    mask: await solid(8, 8, { r: 255, g: 255, b: 255, alpha: 0 }),
  });
  const image = await decoded(result.buffer);
  for (let i = 3; i < image.data.length; i += 4) assert.equal(image.data[i], 0);
});

test("masked WebP export retains meaningful transparency", async () => {
  const result = await finishRasterAsset(await solid(8, 8, RED), {
    mask: await solid(8, 8, { r: 255, g: 255, b: 255, alpha: 0.5 }), format: "webp",
  });
  const image = await decoded(result.buffer);
  assert.equal(at(image, 4, 4)[3], 128);
});

test("JPEG is flattened after translucent layers have been composed", async () => {
  const result = await composeRasterLayers(null, {
    canvas: { width: 24, height: 24 },
    layers: [{ input: await solid(24, 24, { r: 200, g: 100, b: 50, alpha: 0.5 }) }],
    format: "jpeg", quality: 100,
  });
  const image = await decoded(result.buffer);
  const pixel = at(image, 12, 12);
  for (const [index, expected] of [100, 50, 25].entries()) assert.ok(Math.abs(pixel[index] - expected) <= 3);
  assert.equal(pixel[3], 255);
});

test("mask dimension mismatch still fails closed", async () => {
  const source = await solid(8, 8, RED);
  const mask = await solid(4, 4, "white");
  await assert.rejects(() => finishRasterAsset(source, { mask }), /mask dimensions must exactly match/);
  await assert.rejects(() => composeRasterLayers(null, {
    canvas: { width: 8, height: 8 }, layers: [{ input: source, mask }],
  }), /mask dimensions must exactly match/);
});
