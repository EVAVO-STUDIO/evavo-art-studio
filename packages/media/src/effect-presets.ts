import type { RasterEffectSpec } from "./effect-layer.js";

export const RASTER_EFFECT_PRESETS = Object.freeze({
  "product-soft-shadow": Object.freeze({
    kind: "drop-shadow",
    color: "#000000",
    opacity: 0.34,
    blurSigma: 12,
    spread: 1,
    offsetX: 8,
    offsetY: 12,
  }),
  "product-lift-shadow": Object.freeze({
    kind: "drop-shadow",
    color: "#000000",
    opacity: 0.48,
    blurSigma: 18,
    spread: 2,
    offsetX: 12,
    offsetY: 18,
  }),
  "signal-cherry-glow": Object.freeze({
    kind: "outer-glow",
    color: "#ff244e",
    opacity: 0.58,
    blurSigma: 14,
    spread: 2,
    offsetX: 0,
    offsetY: 0,
  }),
  "motion-cherry-glow": Object.freeze({
    kind: "outer-glow",
    color: "#ff244e",
    opacity: 0.42,
    blurSigma: 20,
    spread: 1,
    offsetX: 0,
    offsetY: 0,
  }),
} satisfies Readonly<Record<string, Readonly<RasterEffectSpec>>>);

export type RasterEffectPresetName = keyof typeof RASTER_EFFECT_PRESETS;

export function getRasterEffectPreset(
  name: RasterEffectPresetName,
  overrides: Partial<RasterEffectSpec> = {},
): RasterEffectSpec {
  const preset = RASTER_EFFECT_PRESETS[name];
  if (!preset) throw new Error(`Unknown raster effect preset ${JSON.stringify(name)}.`);
  if (overrides.kind !== undefined && overrides.kind !== preset.kind) {
    throw new Error(
      `Raster effect preset ${JSON.stringify(name)} has fixed kind ${JSON.stringify(preset.kind)}.`,
    );
  }
  return Object.freeze({ ...preset, ...overrides, kind: preset.kind });
}
