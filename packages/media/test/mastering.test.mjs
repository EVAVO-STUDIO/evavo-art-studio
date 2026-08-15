import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import {
  ChromaKeyExtractionError,
  BackgroundAlphaRecoveryError,
  RasterPreflightError,
  detectPaintedTransparencyCheckerboard,
  extractChromaKeyAlpha,
  preflightInpaintMask,
  recoverBackgroundAlpha,
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

test("background recovery converts a painted checkerboard to real alpha with clean edges", async () => {
  const width = 128;
  const height = 128;
  const tile = 16;
  const foreground = [218, 62, 38];
  const matteAt = (x, y) =>
    (Math.floor(x / tile) + Math.floor(y / tile)) % 2 ? 176 : 224;
  const candidate = await raster(width, height, 4, (x, y) => {
    const matte = matteAt(x, y);
    if (x >= 43 && x <= 84 && y >= 36 && y <= 91) {
      return [...foreground, 255];
    }
    if (
      ((x === 42 || x === 85) && y >= 36 && y <= 91) ||
      ((y === 35 || y === 92) && x >= 43 && x <= 84)
    ) {
      return [
        ...foreground.map((channel) => Math.round(channel * 0.5 + matte * 0.5)),
        255,
      ];
    }
    return [matte, matte, matte, 255];
  });
  const source = await rgba(candidate);
  const detection = detectPaintedTransparencyCheckerboard(
    source.data,
    width,
    height,
  );
  assert.equal(detection.detected, true);
  assert.equal(detection.tileSize, tile);

  const result = await recoverBackgroundAlpha(candidate);
  assert.equal(result.evidence.strategy, "checkerboard-recovery");
  assert.equal(
    result.evidence.guarantees.fakeCheckerboardAcceptedAsTransparency,
    false,
  );
  assert.equal(result.evidence.guarantees.recompositionVerified, true);
  assert.equal(result.evidence.checkerboardRecovery.compositeMismatchPixels, 0);
  assert.ok(result.evidence.output.partialPixels > 0);
  assert.ok(result.evidence.output.decontaminatedPixels > 0);

  const decoded = await rgba(result.png);
  assert.deepEqual(pixel(decoded, 0, 0), [0, 0, 0, 0]);
  assert.deepEqual(pixel(decoded, 60, 60), [...foreground, 255]);
  const edge = pixel(decoded, 60, 35);
  assert.ok(edge[3] >= 124 && edge[3] <= 131);
  for (let channel = 0; channel < 3; channel += 1) {
    assert.ok(Math.abs(edge[channel] - foreground[channel]) <= 3);
  }
});

test("background recovery removes a high-chroma painted checkerboard", async () => {
  const candidate = await raster(96, 96, 4, (x, y) => {
    if (x >= 31 && x <= 64 && y >= 24 && y <= 78) {
      return [230, 150, 40, 255];
    }
    return (Math.floor(x / 12) + Math.floor(y / 12)) % 2
      ? [0, 255, 0, 255]
      : [255, 0, 255, 255];
  });
  const result = await recoverBackgroundAlpha(candidate);
  assert.equal(result.evidence.strategy, "checkerboard-recovery");
  assert.equal(result.evidence.classification.checkerboard.detected, true);
  assert.equal(result.evidence.guarantees.recompositionVerified, true);
  assert.deepEqual(pixel(await rgba(result.png), 0, 0), [0, 0, 0, 0]);
});

test("background recovery defeats a transparent-rim bypass around a visible painted grid", async () => {
  const candidate = await raster(128, 128, 4, (x, y) => {
    if (x === 0 || y === 0 || x === 127 || y === 127) {
      return [0, 0, 0, 0];
    }
    if (x >= 40 && x <= 87 && y >= 22 && y <= 112) {
      return [205, 75, 42, 255];
    }
    const value = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 ? 176 : 224;
    return [value, value, value, 255];
  });
  const result = await recoverBackgroundAlpha(candidate);
  assert.equal(result.evidence.strategy, "checkerboard-recovery");
  assert.equal(result.evidence.classification.checkerboard.detected, true);
  assert.ok(
    result.evidence.recomposition.checkedPixels < 128 * 128,
    "pre-existing transparent pixels are not mistaken for matte-composition evidence",
  );
  assert.deepEqual(pixel(await rgba(result.png), 0, 64), [0, 0, 0, 0]);
});

test("background recovery preserves real alpha when checker colours exist only in hidden RGB", async () => {
  const candidate = await raster(64, 64, 4, (x, y) => {
    if (x >= 20 && x <= 43 && y >= 16 && y <= 47) {
      return [35, 125, 225, x === 20 || x === 43 ? 128 : 255];
    }
    const value = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 176 : 224;
    return [value, value, value, 0];
  });
  const result = await recoverBackgroundAlpha(candidate);
  assert.equal(result.evidence.strategy, "native-alpha-preserved");
  assert.equal(result.evidence.classification.checkerboard.detected, false);
  assert.equal(result.evidence.guarantees.transparentCanvasEdge, true);
  const decoded = await rgba(result.png);
  assert.deepEqual(pixel(decoded, 0, 0), [0, 0, 0, 0]);
  assert.deepEqual(
    pixel(decoded, 19, 30),
    [35, 125, 225, 0],
    "only bounded subject-colour bleed remains beside the silhouette",
  );
});

test("background recovery preserves meaningful native alpha before matte extraction", async () => {
  const candidate = await raster(32, 32, 4, (x, y) => {
    if (x >= 9 && x <= 22 && y >= 8 && y <= 23) {
      return [50, 120, 230, x === 9 || x === 22 ? 128 : 255];
    }
    return [0, 0, 0, 0];
  });
  const result = await recoverBackgroundAlpha(candidate, {
    matteColour: "#00ff00",
  });
  assert.equal(result.evidence.strategy, "native-alpha-preserved");
  assert.equal(result.evidence.classification.nativeAlphaMeaningful, true);
  assert.equal(result.evidence.guarantees.transparentCanvasEdge, true);
  assert.deepEqual(pixel(await rgba(result.png), 0, 0), [0, 0, 0, 0]);
});

test("background recovery infers only a confident high-chroma edge matte", async () => {
  const candidate = await raster(48, 48, 4, (x, y) =>
    x >= 15 && x <= 32 && y >= 12 && y <= 35
      ? [230, 150, 40, 255]
      : [255, 0, 255, 255],
  );
  const result = await recoverBackgroundAlpha(candidate);
  assert.equal(result.evidence.strategy, "inferred-high-chroma-key");
  assert.equal(result.evidence.classification.inferredMatte.hex, "#ff00ff");
  assert.equal(result.evidence.guarantees.recompositionVerified, true);
  assert.equal(result.evidence.recomposition.mismatchPixels, 0);
  assert.ok(result.evidence.output.transparentPixels > 0);

  const substituted = await recoverBackgroundAlpha(candidate, {
    matteColour: "#00ff00",
  });
  assert.equal(substituted.evidence.strategy, "inferred-high-chroma-key");
  assert.equal(substituted.evidence.classification.inferredMatte.hex, "#ff00ff");

  const neutral = await raster(32, 32, 4, () => [230, 230, 230, 255]);
  await assert.rejects(
    () => recoverBackgroundAlpha(neutral),
    (error) =>
      error instanceof BackgroundAlphaRecoveryError &&
      error.code === "BACKGROUND_RECOVERY_UNRECOGNIZED",
  );
});
