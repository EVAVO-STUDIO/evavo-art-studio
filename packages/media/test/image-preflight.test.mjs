import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import {
  RasterPreflightError,
  preflightRasterOutput,
} from "../dist/index.js";

async function png(width = 32, height = 16) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 10, g: 220, b: 40, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
}

test("raster output preflight proves decoded format dimensions alpha and hash", async () => {
  const evidence = await preflightRasterOutput(await png(), {
    expectedMediaType: "image/png",
    expectedWidth: 32,
    expectedHeight: 16,
    alphaPolicy: "required",
    mode: "strict",
  });

  assert.equal(evidence.compatible, true);
  assert.equal(evidence.actual.mediaType, "image/png");
  assert.equal(evidence.actual.width, 32);
  assert.equal(evidence.actual.height, 16);
  assert.equal(evidence.actual.pages, 1);
  assert.equal(evidence.actual.hasAlpha, true);
  assert.equal(evidence.actual.sha256.length, 64);
  assert.deepEqual(evidence.issues, []);
});

test("evidence mode records contract mismatches without hiding decoded facts", async () => {
  const evidence = await preflightRasterOutput(await png(), {
    expectedMediaType: "image/webp",
    expectedWidth: 64,
    expectedHeight: 64,
    alphaPolicy: "forbidden",
    mode: "evidence",
  });

  assert.equal(evidence.compatible, false);
  assert.deepEqual(evidence.issues, [
    "RASTER_OUTPUT_MEDIA_TYPE_MISMATCH",
    "RASTER_OUTPUT_DIMENSIONS_MISMATCH",
    "RASTER_OUTPUT_ALPHA_FORBIDDEN",
  ]);
  assert.equal(evidence.actual.mediaType, "image/png");
  assert.equal(evidence.actual.width, 32);
  assert.equal(evidence.actual.height, 16);
});

test("strict mode rejects the first decoded output contract mismatch", async () => {
  const input = await png();
  await assert.rejects(
    () =>
      preflightRasterOutput(input, {
        expectedMediaType: "image/png",
        expectedWidth: 64,
        expectedHeight: 64,
        mode: "strict",
      }),
    (error) =>
      error instanceof RasterPreflightError &&
      error.code === "RASTER_OUTPUT_DIMENSIONS_MISMATCH",
  );
});

test("raster output preflight rejects undecodable bytes in every mode", async () => {
  for (const mode of ["evidence", "strict"]) {
    await assert.rejects(
      () =>
        preflightRasterOutput(Buffer.from("not an image"), {
          expectedMediaType: "image/png",
          mode,
        }),
      (error) =>
        error instanceof RasterPreflightError &&
        error.code === "RASTER_PREFLIGHT_DECODE_FAILED",
    );
  }
});
