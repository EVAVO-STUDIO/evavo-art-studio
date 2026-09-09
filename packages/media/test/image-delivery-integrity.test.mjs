import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { reviewImageDeliveryIntegrity } from "../dist/image-delivery-integrity.js";

async function png(width, height, alpha = 1) {
  return sharp({ create: { width, height, channels: 4, background: { r: 120, g: 80, b: 40, alpha } } }).png().toBuffer();
}

test("detects alpha/format incompatibility before JPEG delivery", async () => {
  const image = await png(256, 256, 0.5);
  const result = await reviewImageDeliveryIntegrity(image, {
    target: "web",
    intendedFormat: "jpeg",
  });
  assert.equal(result.contract, "evavo.image-delivery-integrity.v1_1");
  assert.equal(result.grade, "fail");
  assert.equal(result.hasAlpha, true);
  assert.ok(result.blockers.includes("jpeg-delivery-cannot-preserve-alpha"));
  assert.ok(result.blockers.some((blocker) => blocker.includes("encoded-format-does-not-match-intent")));
  assert.equal(result.sourceMutationAllowed, false);
});

test("explicit alpha prohibition is an admission blocker rather than a warning", async () => {
  const image = await png(256, 256, 0.5);
  const result = await reviewImageDeliveryIntegrity(image, { target: "game-art", forbidAlpha: true });
  assert.equal(result.grade, "fail");
  assert.ok(result.blockers.includes("forbidden-alpha-channel-present"));
});

test("ordinary sRGB web PNG does not require an embedded ICC profile to pass", async () => {
  const image = await png(256, 256);
  const result = await reviewImageDeliveryIntegrity(image, { target: "web" });
  assert.equal(result.colourSpace, "srgb");
  assert.ok(!result.warnings.some((warning) => warning.includes("icc")));
  assert.ok(!result.warnings.some((warning) => warning.startsWith("web-colour-space-is-not-explicitly-srgb")));
});

test("computes effective print DPI from physical dimensions", async () => {
  const image = await png(1000, 1000);
  const result = await reviewImageDeliveryIntegrity(image, {
    target: "print",
    outputWidthMm: 254,
    outputHeightMm: 254,
    minimumPrintDpi: 300,
  });
  assert.equal(result.grade, "fail");
  assert.ok(result.print.effectiveDpiX > 99.9 && result.print.effectiveDpiX < 100.1);
  assert.ok(result.blockers.some((blocker) => blocker.startsWith("print-effective-dpi-below-minimum:")));
});

test("print review warns rather than inventing DPI when physical size is unknown", async () => {
  const image = await png(2000, 2000);
  const result = await reviewImageDeliveryIntegrity(image, { target: "print" });
  assert.equal(result.print.effectiveDpiX, null);
  assert.equal(result.print.effectiveDpiY, null);
  assert.ok(result.warnings.includes("print-physical-size-not-supplied; effective-dpi-cannot-be-proven"));
});

test("game data-map review preserves the distinction between data and ordinary colour artwork", async () => {
  const image = await png(256, 256);
  const result = await reviewImageDeliveryIntegrity(image, { target: "game-data-map" });
  assert.ok(result.recommendations.some((item) => /linear\/non-colour data/.test(item)));
  assert.equal(result.sourceMutationAllowed, false);
});

test("megapixel and encoded-byte budgets can fail delivery before downstream use", async () => {
  const image = await png(1000, 1000);
  const megapixelResult = await reviewImageDeliveryIntegrity(image, {
    target: "web",
    maximumMegapixels: 0.5,
  });
  assert.equal(megapixelResult.grade, "fail");
  assert.ok(megapixelResult.blockers.some((blocker) => blocker.startsWith("megapixel-budget-exceeded:")));

  const byteResult = await reviewImageDeliveryIntegrity(image, {
    target: "web",
    maximumBytes: Math.max(1, image.length - 1),
  });
  assert.equal(byteResult.encodedBytes, image.length);
  assert.ok(byteResult.blockers.some((blocker) => blocker.startsWith("encoded-byte-budget-exceeded:")));
});

test("rejects contradictory alpha requirements and incomplete physical-size input", async () => {
  const image = await png(64, 64);
  await assert.rejects(
    reviewImageDeliveryIntegrity(image, { target: "web", requireAlpha: true, forbidAlpha: true }),
    /cannot both be true/,
  );
  await assert.rejects(
    reviewImageDeliveryIntegrity(image, { target: "print", outputWidthMm: 100 }),
    /must be supplied together/,
  );
  await assert.rejects(
    reviewImageDeliveryIntegrity(image, { target: "web", maximumBytes: 1.5 }),
    /positive safe integer/,
  );
});
