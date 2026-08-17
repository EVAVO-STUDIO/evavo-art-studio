import assert from "node:assert/strict";
import test from "node:test";

import {
  planLogoSurfaceVariants,
  removeFlatMatteFromRgba,
} from "../dist/logo-matte.js";
import { inspectLogoSurfaceReadiness } from "../dist/logo-surface-readiness.js";

function transparentCanvas(width, height) {
  return new Uint8ClampedArray(width * height * 4);
}

function setPixel(pixels, width, x, y, red, green, blue, alpha) {
  const offset = (y * width + x) * 4;
  pixels[offset] = red;
  pixels[offset + 1] = green;
  pixels[offset + 2] = blue;
  pixels[offset + 3] = alpha;
}

test("removes a flat black matte while retaining visible artwork", () => {
  const pixels = new Uint8ClampedArray([
    0, 0, 0, 255,     0, 0, 0, 255,     0, 0, 0, 255,
    0, 0, 0, 255,     20, 220, 90, 255,  255, 255, 255, 255,
    0, 0, 0, 255,     0, 0, 0, 255,     0, 0, 0, 255,
  ]);

  const result = removeFlatMatteFromRgba(pixels, 3, 3);
  assert.equal(result.rgba[3], 0);
  assert.equal(result.rgba[4 * 4 + 3], 255);
  assert.equal(result.rgba[4 * 5 + 3], 255);
  assert.deepEqual(result.report.visibleBounds, {
    left: 1,
    top: 1,
    right: 2,
    bottom: 1,
  });
});

test("passes a genuinely transparent padded logo", () => {
  const pixels = transparentCanvas(7, 7);
  for (let y = 2; y <= 4; y += 1) {
    for (let x = 2; x <= 4; x += 1) setPixel(pixels, 7, x, y, 20, 220, 90, 255);
  }
  const report = inspectLogoSurfaceReadiness(pixels, 7, 7, { minimumTransparentPadding: 2 });
  assert.equal(report.readyForSurfaceUse, true);
  assert.equal(report.blocking, false);
  assert.deepEqual(report.findings, []);
  assert.equal(report.metrics.minimumObservedPadding, 2);
});

test("blocks an opaque backed or clipped logo", () => {
  const opaque = new Uint8ClampedArray(5 * 5 * 4);
  for (let index = 0; index < opaque.length; index += 4) {
    opaque[index + 3] = 255;
  }
  const report = inspectLogoSurfaceReadiness(opaque, 5, 5);
  assert.equal(report.blocking, true);
  assert.ok(report.findings.some((finding) => finding.code === "NO_TRANSPARENCY"));
  assert.ok(report.findings.some((finding) => finding.code === "OPAQUE_CORNER"));
  assert.ok(report.findings.some((finding) => finding.code === "VISIBLE_BOUNDS_CLIPPED"));
});

test("detects residual black matte in semi-transparent edge pixels", () => {
  const pixels = transparentCanvas(7, 7);
  setPixel(pixels, 7, 3, 3, 20, 220, 90, 255);
  setPixel(pixels, 7, 2, 3, 1, 1, 1, 128);
  setPixel(pixels, 7, 4, 3, 2, 2, 2, 128);
  const report = inspectLogoSurfaceReadiness(pixels, 7, 7, {
    minimumTransparentPadding: 1,
    maximumResidualMatteRatio: 0.1,
  });
  assert.ok(report.findings.some((finding) => finding.code === "RESIDUAL_MATTE_FRINGE"));
  assert.ok(report.findings.every((finding) => finding.id.length > finding.code.length));
});

test("creates explicit light and dark transparent logo variants", () => {
  const plan = planLogoSurfaceVariants("nws-primary-lockup");
  assert.equal(plan.variants.length, 2);
  assert.equal(plan.variants[0].surface, "light");
  assert.equal(plan.variants[1].surface, "dark");
  assert.ok(plan.releaseChecks.some((check) => check.includes("corner pixels")));
});
