import type { DecodedSpriteFrame, SpriteQualityGateResult } from "./types.js";
import { SpriteQualityInputError } from "./types.js";

export const TEMPORAL_APPEARANCE_QUALITY_VERSION = "2026-08-26.1" as const;

export interface TemporalAppearanceFrameInput {
  readonly frameId: string;
  readonly frame: DecodedSpriteFrame;
}

export interface TemporalAppearanceQualityPolicy {
  readonly alphaVisibleThreshold?: number;
  readonly edgeThreshold?: number;
  readonly maximumAdjacentLumaDelta?: number;
  readonly maximumAdjacentChromaDelta?: number;
  readonly maximumAdjacentHistogramDistance?: number;
  readonly maximumAdjacentEdgeDensityDelta?: number;
  readonly blocking?: boolean;
}

export interface TemporalAppearanceFrameEvidence {
  readonly frameId: string;
  readonly visiblePixels: number;
  readonly meanLuma: number;
  readonly meanChroma: Readonly<{ r: number; g: number; b: number }>;
  readonly histogram: readonly number[];
  readonly edgeDensity: number;
}

export interface TemporalAppearancePairEvidence {
  readonly fromFrameId: string;
  readonly toFrameId: string;
  readonly lumaDelta: number;
  readonly chromaDelta: number;
  readonly histogramDistance: number;
  readonly edgeDensityDelta: number;
}

export interface TemporalAppearanceQualityReport {
  readonly version: typeof TEMPORAL_APPEARANCE_QUALITY_VERSION;
  readonly passed: boolean;
  readonly frames: readonly TemporalAppearanceFrameEvidence[];
  readonly adjacentPairs: readonly TemporalAppearancePairEvidence[];
  readonly gates: readonly SpriteQualityGateResult[];
  readonly authority: Readonly<{
    creativeApproval: false;
    artifactPromotion: false;
    repositoryMutation: false;
    publication: false;
  }>;
}

function fail(code: string, message: string): never {
  throw new SpriteQualityInputError(code, message);
}

function bounded(value: unknown, field: string, fallback: number, minimum: number, maximum: number): number {
  const resolved = value === undefined ? fallback : value;
  if (typeof resolved !== "number" || !Number.isFinite(resolved) || resolved < minimum || resolved > maximum) {
    fail("TEMPORAL_APPEARANCE_INVALID_POLICY", `${field} must be a finite number from ${minimum} to ${maximum}.`);
  }
  return resolved;
}

function gate(
  id: string,
  status: SpriteQualityGateResult["status"],
  blocking: boolean,
  message: string,
  evidence: Readonly<Record<string, unknown>>,
  threshold?: number,
): SpriteQualityGateResult {
  return {
    id,
    status,
    blocking,
    message,
    ...(threshold !== undefined ? { threshold } : {}),
    evidence,
  };
}

function luma(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function histogramIndex(r: number, g: number, b: number): number {
  const rb = Math.min(3, Math.floor(r / 64));
  const gb = Math.min(3, Math.floor(g / 64));
  const bb = Math.min(3, Math.floor(b / 64));
  return rb * 16 + gb * 4 + bb;
}

function frameEvidence(
  input: TemporalAppearanceFrameInput,
  alphaThreshold: number,
  edgeThreshold: number,
): TemporalAppearanceFrameEvidence {
  if (!input || typeof input !== "object" || typeof input.frameId !== "string" || !input.frameId.trim()) {
    fail("TEMPORAL_APPEARANCE_INVALID_FRAME", "Every temporal appearance frame requires a non-empty frameId.");
  }
  const frame = input.frame;
  if (!frame || frame.channels !== 4 || frame.data.length !== frame.width * frame.height * 4) {
    fail("TEMPORAL_APPEARANCE_INVALID_FRAME", `Frame ${input.frameId} is not a valid decoded RGBA frame.`);
  }

  const histogram = Array.from({ length: 64 }, () => 0);
  let visiblePixels = 0;
  let sumLuma = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let edgePixels = 0;
  let edgeCandidates = 0;

  const pixelVisible = (x: number, y: number): boolean => {
    const offset = (y * frame.width + x) * 4;
    return frame.data[offset + 3]! >= alphaThreshold;
  };

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const offset = (y * frame.width + x) * 4;
      const alpha = frame.data[offset + 3]!;
      if (alpha < alphaThreshold) continue;
      const r = frame.data[offset]!;
      const g = frame.data[offset + 1]!;
      const b = frame.data[offset + 2]!;
      visiblePixels += 1;
      sumR += r;
      sumG += g;
      sumB += b;
      sumLuma += luma(r, g, b);
      histogram[histogramIndex(r, g, b)]! += 1;

      if (x + 1 < frame.width && pixelVisible(x + 1, y)) {
        const other = offset + 4;
        const delta = Math.abs(luma(r, g, b) - luma(frame.data[other]!, frame.data[other + 1]!, frame.data[other + 2]!));
        edgeCandidates += 1;
        if (delta >= edgeThreshold) edgePixels += 1;
      }
      if (y + 1 < frame.height && pixelVisible(x, y + 1)) {
        const other = offset + frame.width * 4;
        const delta = Math.abs(luma(r, g, b) - luma(frame.data[other]!, frame.data[other + 1]!, frame.data[other + 2]!));
        edgeCandidates += 1;
        if (delta >= edgeThreshold) edgePixels += 1;
      }
    }
  }

  if (visiblePixels === 0) {
    fail("TEMPORAL_APPEARANCE_EMPTY_FRAME", `Frame ${input.frameId} contains no visible pixels at the declared alpha threshold.`);
  }

  const normalizedHistogram = histogram.map((count) => count / visiblePixels);
  return {
    frameId: input.frameId,
    visiblePixels,
    meanLuma: sumLuma / visiblePixels,
    meanChroma: {
      r: sumR / visiblePixels / 255,
      g: sumG / visiblePixels / 255,
      b: sumB / visiblePixels / 255,
    },
    histogram: normalizedHistogram,
    edgeDensity: edgeCandidates === 0 ? 0 : edgePixels / edgeCandidates,
  };
}

function chromaDistance(
  a: TemporalAppearanceFrameEvidence["meanChroma"],
  b: TemporalAppearanceFrameEvidence["meanChroma"],
): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2) / Math.sqrt(3);
}

function histogramDistance(a: readonly number[], b: readonly number[]): number {
  let total = 0;
  for (let index = 0; index < a.length; index += 1) {
    total += Math.abs(a[index]! - b[index]!);
  }
  return total / 2;
}

export function analyseTemporalAppearance(
  inputs: readonly TemporalAppearanceFrameInput[],
  policy: TemporalAppearanceQualityPolicy = {},
): TemporalAppearanceQualityReport {
  if (!Array.isArray(inputs) || inputs.length < 2) {
    fail("TEMPORAL_APPEARANCE_FRAME_COUNT", "At least two ordered frames are required for temporal appearance analysis.");
  }
  const ids = inputs.map((entry) => entry?.frameId);
  if (new Set(ids).size !== ids.length) {
    fail("TEMPORAL_APPEARANCE_DUPLICATE_FRAME", "Temporal appearance frameIds must be unique and ordered.");
  }

  const alphaVisibleThreshold = bounded(policy.alphaVisibleThreshold, "alphaVisibleThreshold", 16, 1, 255);
  const edgeThreshold = bounded(policy.edgeThreshold, "edgeThreshold", 0.12, 0, 1);
  const maximumAdjacentLumaDelta = bounded(policy.maximumAdjacentLumaDelta, "maximumAdjacentLumaDelta", 0.12, 0, 1);
  const maximumAdjacentChromaDelta = bounded(policy.maximumAdjacentChromaDelta, "maximumAdjacentChromaDelta", 0.12, 0, 1);
  const maximumAdjacentHistogramDistance = bounded(policy.maximumAdjacentHistogramDistance, "maximumAdjacentHistogramDistance", 0.35, 0, 1);
  const maximumAdjacentEdgeDensityDelta = bounded(policy.maximumAdjacentEdgeDensityDelta, "maximumAdjacentEdgeDensityDelta", 0.18, 0, 1);
  const blocking = policy.blocking ?? false;
  if (typeof blocking !== "boolean") {
    fail("TEMPORAL_APPEARANCE_INVALID_POLICY", "blocking must be boolean when supplied.");
  }

  const frames = inputs.map((input) => frameEvidence(input, alphaVisibleThreshold, edgeThreshold));
  const adjacentPairs: TemporalAppearancePairEvidence[] = [];
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1]!;
    const current = frames[index]!;
    adjacentPairs.push({
      fromFrameId: previous.frameId,
      toFrameId: current.frameId,
      lumaDelta: Math.abs(previous.meanLuma - current.meanLuma),
      chromaDelta: chromaDistance(previous.meanChroma, current.meanChroma),
      histogramDistance: histogramDistance(previous.histogram, current.histogram),
      edgeDensityDelta: Math.abs(previous.edgeDensity - current.edgeDensity),
    });
  }

  const gates: SpriteQualityGateResult[] = [];
  const addMetricGate = (
    id: string,
    field: keyof Pick<TemporalAppearancePairEvidence, "lumaDelta" | "chromaDelta" | "histogramDistance" | "edgeDensityDelta">,
    threshold: number,
    label: string,
  ): void => {
    const failures = adjacentPairs.filter((pair) => pair[field] > threshold);
    gates.push(
      gate(
        id,
        failures.length === 0 ? "pass" : blocking ? "fail" : "warning",
        blocking,
        failures.length === 0
          ? `${label} remains within the declared adjacent-frame tolerance.`
          : `${label} changes abruptly across one or more adjacent frames and may indicate temporal flicker or rendering drift.`,
        { failures, pairs: adjacentPairs.map((pair) => ({ fromFrameId: pair.fromFrameId, toFrameId: pair.toFrameId, value: pair[field] })) },
        threshold,
      ),
    );
  };

  addMetricGate("temporal-luma", "lumaDelta", maximumAdjacentLumaDelta, "Visible luminance");
  addMetricGate("temporal-chroma", "chromaDelta", maximumAdjacentChromaDelta, "Visible colour centroid");
  addMetricGate("temporal-palette", "histogramDistance", maximumAdjacentHistogramDistance, "Coarse visible-colour distribution");
  addMetricGate("temporal-edge-density", "edgeDensityDelta", maximumAdjacentEdgeDensityDelta, "Visible edge density");

  const passed = !gates.some((entry) => entry.blocking && entry.status === "fail");
  return {
    version: TEMPORAL_APPEARANCE_QUALITY_VERSION,
    passed,
    frames,
    adjacentPairs,
    gates,
    authority: {
      creativeApproval: false,
      artifactPromotion: false,
      repositoryMutation: false,
      publication: false,
    },
  };
}
