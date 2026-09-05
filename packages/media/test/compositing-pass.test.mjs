import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";
import { composeRasterLayers } from "../dist/index.js";

async function solid(width, height, background) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background,
    },
  })
    .png()
    .toBuffer();
}

test("composites ordered layers with resize opacity blend and exact placement", async () => {
  const base = await solid(120, 90, { r: 10, g: 10, b: 10, alpha: 1 });
  const red = await solid(40, 30, { r: 255, g: 36, b: 78, alpha: 1 });
  const white = await solid(24, 24, { r: 255, g: 255, b: 255, alpha: 1 });

  const result = await composeRasterLayers(base, {
    layers: [
      {
        name: "accent",
        input: red,
        left: 12,
        top: 18,
        opacity: 0.5,
        blend: "screen",
      },
      {
        name: "badge",
        input: white,
        gravity: "southeast",
        resize: { width: 18, fit: "inside" },
      },
    ],
    format: "webp",
    quality: 88,
  });

  assert.equal(result.evidence.canvasWidth, 120);
  assert.equal(result.evidence.canvasHeight, 90);
  assert.equal(result.evidence.baseProvided, true);
  assert.equal(result.evidence.format, "webp");
  assert.equal(result.evidence.layers.length, 2);
  assert.equal(result.evidence.layers[0].name, "accent");
  assert.equal(result.evidence.layers[0].opacity, 0.5);
  assert.equal(result.evidence.layers[0].blend, "screen");
  assert.equal(result.evidence.layers[0].placement, "left:12,top:18");
  assert.ok(result.evidence.layers[0].operations.includes("opacity:0.5"));
  assert.equal(result.evidence.layers[1].placement, "gravity:southeast");
  assert.ok(result.evidence.layers[1].operations.includes("resize"));
  assert.ok(result.evidence.operations.includes("use-base-canvas"));
  assert.ok(result.evidence.operations.includes("composite-layer:0"));
  assert.ok(result.evidence.operations.includes("composite-layer:1"));

  const metadata = await sharp(result.buffer).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 120);
  assert.equal(metadata.height, 90);
});

test("creates a transparent canvas and applies a transformed alpha mask", async () => {
  const layer = await solid(20, 20, { r: 255, g: 36, b: 78, alpha: 1 });
  const mask = await solid(10, 10, { r: 255, g: 255, b: 255, alpha: 0.5 });

  const result = await composeRasterLayers(null, {
    canvas: { width: 64, height: 64 },
    layers: [
      {
        input: layer,
        name: "masked-mark",
        mask,
        resize: { width: 10, height: 10, fit: "fill" },
        gravity: "centre",
      },
    ],
    format: "png",
  });

  assert.equal(result.evidence.baseProvided, false);
  assert.equal(result.evidence.layers[0].masked, true);
  assert.ok(result.evidence.layers[0].operations.includes("apply-alpha-mask"));
  assert.ok(result.evidence.operations.includes("create-canvas"));

  const metadata = await sharp(result.buffer).metadata();
  assert.equal(metadata.width, 64);
  assert.equal(metadata.height, 64);
  assert.equal(metadata.hasAlpha, true);
});

test("rejects mismatched transformed masks and ambiguous positioning", async () => {
  const layer = await solid(20, 20, { r: 255, g: 36, b: 78, alpha: 1 });
  const badMask = await solid(8, 8, { r: 255, g: 255, b: 255, alpha: 1 });

  await assert.rejects(
    () =>
      composeRasterLayers(null, {
        canvas: { width: 64, height: 64 },
        layers: [
          {
            input: layer,
            resize: { width: 10, height: 10 },
            mask: badMask,
          },
        ],
      }),
    /mask dimensions must exactly match the transformed layer/i,
  );

  await assert.rejects(
    () =>
      composeRasterLayers(null, {
        canvas: { width: 64, height: 64 },
        layers: [{ input: layer, left: 4 }],
      }),
    /both left and top/i,
  );

  await assert.rejects(
    () =>
      composeRasterLayers(null, {
        canvas: { width: 64, height: 64 },
        layers: [{ input: layer, left: 4, top: 4, gravity: "centre" }],
      }),
    /cannot combine explicit coordinates with gravity/i,
  );
});
