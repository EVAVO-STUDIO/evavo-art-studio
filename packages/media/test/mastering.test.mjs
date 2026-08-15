import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import {
  ChromaKeyExtractionError,
  RasterPreflightError,
  extractChromaKeyAlpha,
  preflightInpaintMask,
} from "../dist/index.js";

async function raster(width, height, channels, pixel) {
  const data = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const values = pixel(x, y);
      const offset = (y * width + x) * channels;
      for (let channel = 0; channel < channels; channel += 1) {
        data[offset + channel] = values[channel] ?? 0;
      }
    }
  }
  return sharp(data, { raw: { width, height, channels } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function rgba(buffer) {
  return sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

function pixel(decoded, x, y) {
  const offset = (y * decoded.info.width + x) * 4;
  return [...decoded.data.subarray(offset, offset + 4)];
}

test("inpaint mask preflight proves format, dimensions and editable alpha", async () => {
  const base = await raster(8, 8, 4, () => [180, 120, 80, 255]);
  const mask = await raster(8, 8, 4, (x, y) => [0, 0, 0, x < 2 && y < 2 ? 0 : 255]);
  const evidence = await preflightInpaintMask(base, mask);
  assert.equal(evidence.compatible, true);
  assert.equal(evidence.base.format, "png");
  assert.equal(evidence.mask.hasAlpha, true);
  assert.equal(evidence.mask.editablePixels, 4);
  assert.equal(evidence.mask.fullyTransparentPixels, 4);
  assert.equal(evidence.mask.preservedPixels, 60);
  assert.equal(evidence.mask.fullImageEdit, false);
  assert.equal(evidence.base.sha256.length, 64);
  assert.equal(evidence.mask.sha256.length, 64);
});

test("inpaint mask preflight rejects absent alpha, mismatched dimensions and empty edit regions", async () => {
  const base = await raster(8, 8, 4, () => [180, 120, 80, 255]);
  const noAlpha = await raster(8, 8, 3, () => [0, 0, 0]);
  await assert.rejects(
    () => preflightInpaintMask(base, noAlpha),
    (error) =>
      error instanceof RasterPreflightError &&
      error.code === "INPAINT_MASK_ALPHA_REQUIRED",
  );

  const wrongSize = await raster(9, 8, 4, () => [0, 0, 0, 0]);
  await assert.rejects(
    () => preflightInpaintMask(base, wrongSize),
    (error) =>
      error instanceof RasterPreflightError &&
      error.code === "INPAINT_MASK_DIMENSIONS_MISMATCH",
  );

  const opaque = await raster(8, 8, 4, () => [0, 0, 0, 255]);
  await assert.rejects(
    () => preflightInpaintMask(base, opaque),
    (error) =>
      error instanceof RasterPreflightError &&
      error.code === "INPAINT_MASK_HAS_NO_EDITABLE_PIXELS",
  );
});

test("chroma extraction creates deterministic true alpha and decontaminated edge colour", async () => {
  const candidate = await raster(14, 14, 4, (x, y) => {
    if (x >= 5 && x <= 8 && y >= 5 && y <= 8) {
      if (x === 6 && y === 6) return [0, 255, 0, 255];
      return [255, 0, 0, 255];
    }
    if (x >= 4 && x <= 9 && y >= 4 && y <= 9) {
      return [192, 63, 0, 255];
    }
    if (x >= 3 && x <= 10 && y >= 3 && y <= 10) {
      return [64, 191, 0, 255];
    }
    return [0, 255, 0, 255];
  });

  const options = {
    matteColour: "#00ff00",
    connectionDistance: 140,
    opaqueSeedDistance: 300,
    edgeSearchRadius: 8,
    bleedRadius: 2,
  };
  const first = await extractChromaKeyAlpha(candidate, options);
  const second = await extractChromaKeyAlpha(candidate, options);
  assert.equal(first.evidence.outputSha256, second.evidence.outputSha256);
  assert.deepEqual(first.png, second.png);

  const decoded = await rgba(first.png);
  assert.deepEqual(pixel(decoded, 0, 0), [0, 0, 0, 0]);

  const outerEdge = pixel(decoded, 3, 6);
  assert.ok(outerEdge[3] > 0 && outerEdge[3] < 255);
  assert.ok(outerEdge[0] >= 245 && outerEdge[1] <= 10);

  const innerEdge = pixel(decoded, 4, 6);
  assert.ok(innerEdge[3] > outerEdge[3] && innerEdge[3] < 255);
  assert.ok(innerEdge[0] >= 245 && innerEdge[1] <= 10);

  assert.deepEqual(pixel(decoded, 7, 7), [255, 0, 0, 255]);
  assert.deepEqual(
    pixel(decoded, 6, 6),
    [0, 255, 0, 255],
    "matte-coloured artwork enclosed by the subject remains opaque",
  );

  const bleed = pixel(decoded, 2, 6);
  assert.equal(bleed[3], 0);
  assert.ok(bleed[0] > 0, "transparent edge bleed retains subject RGB");

  assert.ok(first.evidence.segmentation.connectedBackgroundPixels > 0);
  assert.ok(first.evidence.segmentation.preservedInteriorMatteLikePixels >= 1);
  assert.ok(first.evidence.output.partialPixels > 0);
  assert.ok(first.evidence.output.decontaminatedPixels > 0);
  assert.ok(first.evidence.output.transparentBleedPixels > 0);
});

test("chroma extraction fails closed when the declared matte is absent", async () => {
  const candidate = await raster(8, 8, 4, () => [255, 0, 0, 255]);
  await assert.rejects(
    () => extractChromaKeyAlpha(candidate, { matteColour: "#00ff00" }),
    (error) =>
      error instanceof ChromaKeyExtractionError &&
      error.code === "CHROMA_KEY_BORDER_MATTE_INSUFFICIENT",
  );
});

test("chroma extraction rejects painted checkerboards before any background removal", async () => {
  const candidate = await raster(128, 128, 4, (x, y) => {
    if (x >= 40 && x <= 87 && y >= 24 && y <= 111) {
      return [210, 90, 55, 255];
    }
    const value = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 ? 176 : 224;
    return [value, value, value, 255];
  });
  await assert.rejects(
    () => extractChromaKeyAlpha(candidate, { matteColour: "#00ff00" }),
    (error) =>
      error instanceof ChromaKeyExtractionError &&
      error.code === "CHROMA_KEY_FAKE_TRANSPARENCY_GRID",
  );
});

test("chroma extraction accepts only opaque sources and declared high-chroma keys", async () => {
  const opaque = await raster(16, 16, 4, (x, y) =>
    x >= 5 && x <= 10 && y >= 4 && y <= 11
      ? [190, 80, 40, 255]
      : [0, 255, 0, 255],
  );
  await assert.rejects(
    () => extractChromaKeyAlpha(opaque, { matteColour: "#808080" }),
    (error) =>
      error instanceof ChromaKeyExtractionError &&
      error.code === "CHROMA_KEY_MATTE_UNSAFE",
  );

  const mixedAlpha = await raster(16, 16, 4, (x, y) =>
    x === 8 && y === 8 ? [190, 80, 40, 128] : [0, 255, 0, 255],
  );
  await assert.rejects(
    () => extractChromaKeyAlpha(mixedAlpha, { matteColour: "#00ff00" }),
    (error) =>
      error instanceof ChromaKeyExtractionError &&
      error.code === "CHROMA_KEY_SOURCE_ALPHA_INVALID",
  );
});

test("low-chroma extraction requires an explicit legacy-cleanup override", async () => {
  const legacy = await raster(32, 32, 4, (x, y) =>
    x >= 10 && x <= 21 && y >= 5 && y <= 27
      ? [200, 200, 200, 255]
      : [0, 0, 0, 255],
  );
  const result = await extractChromaKeyAlpha(legacy, {
    matteColour: "#000000",
    allowLowChromaMatte: true,
    connectionDistance: 24,
    opaqueSeedDistance: 64,
    bleedRadius: 0,
  });
  assert.ok(result.evidence.output.transparentPixels > 0);
  assert.ok(result.evidence.output.opaquePixels > 0);
});
