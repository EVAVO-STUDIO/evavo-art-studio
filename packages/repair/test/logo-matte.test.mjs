import assert from "node:assert/strict";
import test from "node:test";

import {
  planLogoSurfaceVariants,
  removeFlatMatteFromRgba,
} from "../dist/logo-matte.js";

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

test("creates explicit light and dark transparent logo variants", () => {
  const plan = planLogoSurfaceVariants("nws-primary-lockup");
  assert.equal(plan.variants.length, 2);
  assert.equal(plan.variants[0].surface, "light");
  assert.equal(plan.variants[1].surface, "dark");
  assert.ok(plan.releaseChecks.some((check) => check.includes("corner pixels")));
});
