import assert from "node:assert/strict";
import test from "node:test";

import {
  RASTER_EFFECT_PRESETS,
  getRasterEffectPreset,
} from "../dist/index.js";

test("exposes restrained production shadow and glow presets", () => {
  assert.deepEqual(Object.keys(RASTER_EFFECT_PRESETS).sort(), [
    "motion-cherry-glow",
    "product-lift-shadow",
    "product-soft-shadow",
    "signal-cherry-glow",
  ]);
  assert.equal(RASTER_EFFECT_PRESETS["product-soft-shadow"].kind, "drop-shadow");
  assert.equal(RASTER_EFFECT_PRESETS["signal-cherry-glow"].kind, "outer-glow");
  assert.equal(RASTER_EFFECT_PRESETS["signal-cherry-glow"].color, "#ff244e");
});

test("allows controlled preset tuning while preserving the semantic effect kind", () => {
  const tuned = getRasterEffectPreset("product-soft-shadow", {
    opacity: 0.4,
    blurSigma: 10,
  });
  assert.equal(tuned.kind, "drop-shadow");
  assert.equal(tuned.opacity, 0.4);
  assert.equal(tuned.blurSigma, 10);
  assert.equal(tuned.offsetX, 8);
  assert.equal(tuned.offsetY, 12);

  assert.throws(
    () =>
      getRasterEffectPreset("signal-cherry-glow", {
        kind: "drop-shadow",
      }),
    /fixed kind.*outer-glow/i,
  );
});
