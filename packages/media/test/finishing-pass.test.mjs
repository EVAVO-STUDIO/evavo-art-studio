import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";
import { finishRasterAsset } from "../dist/index.js";

test("finishes a transparent object with trim padding resize and webp export", async () => {
  const source = await sharp({
    create: {
      width: 100,
      height: 80,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 40,
            height: 30,
            channels: 4,
            background: { r: 255, g: 36, b: 78, alpha: 1 },
          },
        })
          .png()
          .toBuffer(),
        left: 30,
        top: 25,
      },
    ])
    .png()
    .toBuffer();

  const result = await finishRasterAsset(source, {
    trim: { threshold: 1, padding: 4 },
    guard: { minRetainedAreaRatio: 0.1, maxAspectRatioDrift: 2 },
    normalize: true,
    sharpen: { sigma: 1 },
    resize: { width: 80, fit: "inside", withoutEnlargement: false },
    format: "webp",
    quality: 88,
  });

  assert.equal(result.evidence.sourceWidth, 100);
  assert.equal(result.evidence.sourceHeight, 80);
  assert.equal(result.evidence.format, "webp");
  assert.ok(result.evidence.operations.includes("ensure-alpha"));
  assert.ok(result.evidence.operations.some((entry) => entry.startsWith("trim:")));
  assert.ok(result.evidence.operations.includes("cleanup-geometry-verified"));
  assert.ok((result.evidence.retainedAreaRatio ?? 0) >= 0.1);
  assert.ok((result.evidence.aspectRatioDrift ?? Infinity) <= 2);
  assert.ok(result.evidence.operations.includes("resize"));
  assert.ok(result.evidence.operations.includes("pad"));
  assert.ok(result.buffer.byteLength > 0);
  const metadata = await sharp(result.buffer).metadata();
  assert.equal(metadata.format, "webp");
  assert.ok((metadata.width ?? 0) > 0);
  assert.ok((metadata.height ?? 0) > 0);
});

test("applies an external alpha matte and rejects mismatched masks", async () => {
  const source = await sharp({
    create: {
      width: 16,
      height: 16,
      channels: 3,
      background: { r: 20, g: 20, b: 20 },
    },
  })
    .png()
    .toBuffer();
  const mask = await sharp({
    create: {
      width: 16,
      height: 16,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  const result = await finishRasterAsset(source, { mask, format: "png" });
  assert.ok(result.evidence.operations.includes("apply-alpha-mask"));
  assert.equal(result.evidence.outputHasAlpha, true);

  const badMask = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  await assert.rejects(
    () => finishRasterAsset(source, { mask: badMask }),
    /mask dimensions must exactly match/i,
  );
});

test("rejects destructive trim geometry before promotion", async () => {
  const source = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 80,
            height: 5,
            channels: 4,
            background: { r: 255, g: 36, b: 78, alpha: 1 },
          },
        })
          .png()
          .toBuffer(),
        left: 10,
        top: 48,
      },
    ])
    .png()
    .toBuffer();

  await assert.rejects(
    () =>
      finishRasterAsset(source, {
        trim: { threshold: 1 },
        guard: { minRetainedAreaRatio: 0.2, maxAspectRatioDrift: 2.5 },
      }),
    /retained .* minimum|aspect ratio/i,
  );
});
