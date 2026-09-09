import sharp from "sharp";

export const IMAGE_REFERENCE_CONSISTENCY_CONTRACT = "evavo.image-reference-consistency.v1" as const;

export type ImageReferenceConsistencyGrade = "pass" | "warn" | "fail";
export type ImageReferenceConsistencyDecision =
  | "consistent"
  | "review-drift"
  | "reject-technical-drift"
  | "reference-set-unstable";

export interface ImageReferenceConsistencySpec {
  readonly sampleSize?: number;
  readonly warnDistance?: number;
  readonly failDistance?: number;
  readonly referenceUnstableDistance?: number;
  readonly alphaVisibleThreshold?: number;
}

export interface ImageReferenceInput {
  readonly id: string;
  readonly encoded: Buffer;
}

export interface ImageReferenceCandidateInput {
  readonly id: string;
  readonly encoded: Buffer;
}

export interface ImageVisualConsistencyDescriptor {
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: number;
  readonly hasTransparency: boolean;
  readonly visiblePixelRatio: number;
  readonly visibleCentroidX: number;
  readonly visibleCentroidY: number;
  readonly visibleBoundsWidth: number;
  readonly visibleBoundsHeight: number;
  readonly lumaMean: number;
  readonly lumaStdDev: number;
  readonly saturationMean: number;
  readonly edgeDensity: number;
  readonly edgeOrientation: readonly number[];
  readonly rgbHistogram: readonly number[];
}

export interface ImageReferenceDistanceComponents {
  readonly palette: number;
  readonly tone: number;
  readonly saturation: number;
  readonly edgeDensity: number;
  readonly edgeOrientation: number;
  readonly silhouette: number;
  readonly aspect: number;
  readonly composite: number;
}

export interface ImageReferenceComparison {
  readonly id: string;
  readonly distance: number;
  readonly components: ImageReferenceDistanceComponents;
}

export interface ImageReferenceConsistencyResult {
  readonly contract: typeof IMAGE_REFERENCE_CONSISTENCY_CONTRACT;
  readonly grade: ImageReferenceConsistencyGrade;
  readonly decision: ImageReferenceConsistencyDecision;
  readonly candidate: ImageVisualConsistencyDescriptor;
  readonly referenceCount: number;
  readonly referenceCoherence: Readonly<{
    state: "coherent" | "mixed" | "unstable";
    medianDistance: number;
    maximumDistance: number;
    unstableThreshold: number;
  }>;
  readonly baseline: ImageVisualConsistencyDescriptor;
  readonly distance: ImageReferenceDistanceComponents;
  readonly nearestReferences: readonly ImageReferenceComparison[];
  readonly flags: readonly string[];
  readonly interpretation: string;
  readonly semanticReviewRequired: true;
  readonly aiOriginDetection: "not-claimed";
}

export interface ImageReferenceBatchResult {
  readonly contract: "evavo.image-reference-consistency-batch.v1";
  readonly referenceCount: number;
  readonly referenceCoherence: ImageReferenceConsistencyResult["referenceCoherence"];
  readonly results: readonly Readonly<{ id: string; review: ImageReferenceConsistencyResult }>[];
  readonly reviewPriority: readonly string[];
  readonly semanticReviewRequired: true;
  readonly aiOriginDetection: "not-claimed";
}

type ResolvedSpec = Readonly<{
  sampleSize: number;
  warnDistance: number;
  failDistance: number;
  referenceUnstableDistance: number;
  alphaVisibleThreshold: number;
}>;

function bounded(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return value;
}

function integer(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer from ${min} through ${max}.`);
  return value;
}

function resolveSpec(spec: ImageReferenceConsistencySpec): ResolvedSpec {
  const warnDistance = bounded(spec.warnDistance, 0.15, 0.01, 0.9, "warnDistance");
  const failDistance = bounded(spec.failDistance, 0.32, 0.02, 1, "failDistance");
  if (failDistance <= warnDistance) throw new Error("failDistance must be greater than warnDistance.");
  return Object.freeze({
    sampleSize: integer(spec.sampleSize, 64, 32, 192, "sampleSize"),
    warnDistance,
    failDistance,
    referenceUnstableDistance: bounded(spec.referenceUnstableDistance, 0.28, 0.02, 1, "referenceUnstableDistance"),
    alphaVisibleThreshold: integer(spec.alphaVisibleThreshold, 24, 0, 254, "alphaVisibleThreshold"),
  });
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const round6 = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
const luma = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2;
}

function normalize(values: readonly number[]): readonly number[] {
  const sum = values.reduce((total, value) => total + value, 0);
  if (sum <= 0) return Object.freeze(values.map(() => 0));
  return Object.freeze(values.map((value) => value / sum));
}

function medianVector(vectors: readonly (readonly number[])[]): readonly number[] {
  if (!vectors.length) return Object.freeze([]);
  const width = vectors[0]!.length;
  return Object.freeze(Array.from({ length: width }, (_, index) => median(vectors.map((vector) => vector[index] ?? 0))));
}

async function descriptor(encoded: Buffer, spec: ResolvedSpec): Promise<ImageVisualConsistencyDescriptor> {
  if (!Buffer.isBuffer(encoded) || encoded.length === 0) throw new Error("Reference-consistency image input is empty.");
  const metadata = await sharp(encoded, { failOn: "error" }).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Reference-consistency image has no dimensions.");
  const sampled = await sharp(encoded, { failOn: "error" })
    .ensureAlpha()
    .resize(spec.sampleSize, spec.sampleSize, { fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer();
  const size = spec.sampleSize;
  const count = size * size;
  const lumas = new Float64Array(count);
  const visible = new Uint8Array(count);
  const histogramCounts = new Float64Array(24);
  let visibleCount = 0;
  let lumaSum = 0;
  let lumaSq = 0;
  let saturationSum = 0;
  let alphaMin = 255;
  let centroidX = 0;
  let centroidY = 0;
  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const pixel = y * size + x;
      const offset = pixel * 4;
      const r = sampled[offset]!;
      const g = sampled[offset + 1]!;
      const b = sampled[offset + 2]!;
      const a = sampled[offset + 3]!;
      alphaMin = Math.min(alphaMin, a);
      const lum = luma(r, g, b);
      lumas[pixel] = lum;
      if (a <= spec.alphaVisibleThreshold) continue;
      visible[pixel] = 1;
      visibleCount += 1;
      lumaSum += lum;
      lumaSq += lum * lum;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      saturationSum += max === 0 ? 0 : (max - min) / max;
      const rBin = Math.min(7, Math.floor(r / 32));
      const gBin = 8 + Math.min(7, Math.floor(g / 32));
      const bBin = 16 + Math.min(7, Math.floor(b / 32));
      histogramCounts[rBin] = histogramCounts[rBin]! + 1;
      histogramCounts[gBin] = histogramCounts[gBin]! + 1;
      histogramCounts[bBin] = histogramCounts[bBin]! + 1;
      centroidX += x + 0.5;
      centroidY += y + 0.5;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const safeVisible = Math.max(1, visibleCount);
  const lumaMean = lumaSum / safeVisible;
  const lumaStdDev = Math.sqrt(Math.max(0, lumaSq / safeVisible - lumaMean * lumaMean));
  const orientationCounts = [0, 0, 0, 0];
  let edgeCandidates = 0;
  let edgePixels = 0;
  const edgeThreshold = 0.09;
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const pixel = y * size + x;
      if (!visible[pixel]) continue;
      const left = pixel - 1;
      const right = pixel + 1;
      const top = pixel - size;
      const bottom = pixel + size;
      if (!visible[left] || !visible[right] || !visible[top] || !visible[bottom]) continue;
      edgeCandidates += 1;
      const gx = lumas[right]! - lumas[left]!;
      const gy = lumas[bottom]! - lumas[top]!;
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      if (magnitude < edgeThreshold) continue;
      edgePixels += 1;
      let angle = Math.atan2(gy, gx) * 180 / Math.PI;
      if (angle < 0) angle += 180;
      if (angle >= 180) angle -= 180;
      const bin = Math.min(3, Math.floor((angle + 22.5) / 45) % 4);
      orientationCounts[bin] = orientationCounts[bin]! + magnitude;
    }
  }

  const rgbHistogram: number[] = [];
  for (let channel = 0; channel < 3; channel += 1) {
    const start = channel * 8;
    rgbHistogram.push(...normalize(Array.from(histogramCounts.slice(start, start + 8))));
  }
  const hasVisible = visibleCount > 0;
  return Object.freeze({
    width: metadata.width,
    height: metadata.height,
    aspectRatio: metadata.width / metadata.height,
    hasTransparency: alphaMin < 250,
    visiblePixelRatio: visibleCount / count,
    visibleCentroidX: hasVisible ? centroidX / visibleCount / size : 0.5,
    visibleCentroidY: hasVisible ? centroidY / visibleCount / size : 0.5,
    visibleBoundsWidth: hasVisible ? (maxX - minX + 1) / size : 0,
    visibleBoundsHeight: hasVisible ? (maxY - minY + 1) / size : 0,
    lumaMean,
    lumaStdDev,
    saturationMean: saturationSum / safeVisible,
    edgeDensity: edgeCandidates ? edgePixels / edgeCandidates : 0,
    edgeOrientation: normalize(orientationCounts),
    rgbHistogram: Object.freeze(rgbHistogram),
  });
}

function l1Normalized(a: readonly number[], b: readonly number[], divisor: number): number {
  const length = Math.max(a.length, b.length);
  let total = 0;
  for (let index = 0; index < length; index += 1) total += Math.abs((a[index] ?? 0) - (b[index] ?? 0));
  return clamp01(total / divisor);
}

function distance(a: ImageVisualConsistencyDescriptor, b: ImageVisualConsistencyDescriptor): ImageReferenceDistanceComponents {
  const palette = l1Normalized(a.rgbHistogram, b.rgbHistogram, 6);
  const tone = clamp01((Math.abs(a.lumaMean - b.lumaMean) + Math.abs(a.lumaStdDev - b.lumaStdDev)) / 2);
  const saturation = clamp01(Math.abs(a.saturationMean - b.saturationMean));
  const edgeDensity = clamp01(Math.abs(a.edgeDensity - b.edgeDensity));
  const edgeOrientation = l1Normalized(a.edgeOrientation, b.edgeOrientation, 2);
  const centroid = Math.hypot(a.visibleCentroidX - b.visibleCentroidX, a.visibleCentroidY - b.visibleCentroidY) / Math.SQRT2;
  const bounds = Math.max(
    Math.abs(a.visibleBoundsWidth - b.visibleBoundsWidth),
    Math.abs(a.visibleBoundsHeight - b.visibleBoundsHeight),
  );
  const silhouette = clamp01(Math.max(Math.abs(a.visiblePixelRatio - b.visiblePixelRatio), centroid, bounds));
  const aspect = clamp01(Math.abs(Math.log2(a.aspectRatio / b.aspectRatio)));
  const composite = clamp01(
    palette * 0.24
    + tone * 0.16
    + saturation * 0.08
    + edgeDensity * 0.14
    + edgeOrientation * 0.12
    + silhouette * 0.16
    + aspect * 0.10,
  );
  return Object.freeze({
    palette: round6(palette),
    tone: round6(tone),
    saturation: round6(saturation),
    edgeDensity: round6(edgeDensity),
    edgeOrientation: round6(edgeOrientation),
    silhouette: round6(silhouette),
    aspect: round6(aspect),
    composite: round6(composite),
  });
}

function baseline(descriptors: readonly ImageVisualConsistencyDescriptor[]): ImageVisualConsistencyDescriptor {
  if (!descriptors.length) throw new Error("Reference descriptor set is empty.");
  const rgbHistogram = medianVector(descriptors.map((item) => item.rgbHistogram));
  const edgeOrientation = normalize(medianVector(descriptors.map((item) => item.edgeOrientation)));
  return Object.freeze({
    width: Math.round(median(descriptors.map((item) => item.width))),
    height: Math.round(median(descriptors.map((item) => item.height))),
    aspectRatio: median(descriptors.map((item) => item.aspectRatio)),
    hasTransparency: descriptors.filter((item) => item.hasTransparency).length >= Math.ceil(descriptors.length / 2),
    visiblePixelRatio: median(descriptors.map((item) => item.visiblePixelRatio)),
    visibleCentroidX: median(descriptors.map((item) => item.visibleCentroidX)),
    visibleCentroidY: median(descriptors.map((item) => item.visibleCentroidY)),
    visibleBoundsWidth: median(descriptors.map((item) => item.visibleBoundsWidth)),
    visibleBoundsHeight: median(descriptors.map((item) => item.visibleBoundsHeight)),
    lumaMean: median(descriptors.map((item) => item.lumaMean)),
    lumaStdDev: median(descriptors.map((item) => item.lumaStdDev)),
    saturationMean: median(descriptors.map((item) => item.saturationMean)),
    edgeDensity: median(descriptors.map((item) => item.edgeDensity)),
    edgeOrientation,
    rgbHistogram,
  });
}

function flagsFor(components: ImageReferenceDistanceComponents, candidate: ImageVisualConsistencyDescriptor, base: ImageVisualConsistencyDescriptor): readonly string[] {
  const flags: string[] = [];
  if (components.palette >= 0.22) flags.push(`palette-distribution-drift:${components.palette.toFixed(3)}`);
  if (components.tone >= 0.16) flags.push(`tone-distribution-drift:${components.tone.toFixed(3)}`);
  if (components.saturation >= 0.18) flags.push(`saturation-drift:${components.saturation.toFixed(3)}`);
  if (components.edgeDensity >= 0.12) flags.push(`detail-density-drift:${components.edgeDensity.toFixed(3)}`);
  if (components.edgeOrientation >= 0.28) flags.push(`edge-orientation-drift:${components.edgeOrientation.toFixed(3)}`);
  if (components.silhouette >= 0.18) flags.push(`silhouette-or-occupancy-drift:${components.silhouette.toFixed(3)}`);
  if (components.aspect >= 0.08) flags.push(`aspect-ratio-drift:${components.aspect.toFixed(3)}`);
  if (candidate.hasTransparency !== base.hasTransparency) flags.push("alpha-presence-mismatch");
  if (candidate.width !== base.width || candidate.height !== base.height) flags.push(`canvas-size-differs-from-reference-median:${candidate.width}x${candidate.height}:${base.width}x${base.height}`);
  return Object.freeze(flags);
}

async function referenceModel(references: readonly ImageReferenceInput[], spec: ResolvedSpec) {
  if (!Array.isArray(references) || references.length < 1 || references.length > 32) {
    throw new Error("Reference consistency requires 1 through 32 reference images.");
  }
  const ids = new Set<string>();
  for (const reference of references) {
    if (!reference || typeof reference.id !== "string" || !reference.id.trim()) throw new Error("Every reference requires a non-empty id.");
    if (ids.has(reference.id)) throw new Error(`Duplicate reference id ${JSON.stringify(reference.id)}.`);
    ids.add(reference.id);
  }
  const descriptors = await Promise.all(references.map((reference) => descriptor(reference.encoded, spec)));
  const base = baseline(descriptors);
  const pairwiseDistances: number[] = [];
  for (let left = 0; left < descriptors.length; left += 1) {
    for (let right = left + 1; right < descriptors.length; right += 1) {
      pairwiseDistances.push(distance(descriptors[left]!, descriptors[right]!).composite);
    }
  }
  const maximumDistance = pairwiseDistances.length ? Math.max(...pairwiseDistances) : 0;
  const medianDistance = pairwiseDistances.length ? median(pairwiseDistances) : 0;
  const state = maximumDistance > spec.referenceUnstableDistance
    ? "unstable" as const
    : maximumDistance > spec.warnDistance
      ? "mixed" as const
      : "coherent" as const;
  return Object.freeze({
    base,
    descriptors,
    coherence: Object.freeze({
      state,
      medianDistance: round6(medianDistance),
      maximumDistance: round6(maximumDistance),
      unstableThreshold: spec.referenceUnstableDistance,
    }),
  });
}

async function reviewCandidate(
  candidate: Buffer,
  references: readonly ImageReferenceInput[],
  model: Awaited<ReturnType<typeof referenceModel>>,
  spec: ResolvedSpec,
): Promise<ImageReferenceConsistencyResult> {
  const candidateDescriptor = await descriptor(candidate, spec);
  const baselineDistance = distance(candidateDescriptor, model.base);
  const comparisons = references.map((reference, index) => {
    const components = distance(candidateDescriptor, model.descriptors[index]!);
    return Object.freeze({ id: reference.id, distance: components.composite, components });
  }).sort((a, b) => a.distance - b.distance);
  const flags = flagsFor(baselineDistance, candidateDescriptor, model.base);

  let grade: ImageReferenceConsistencyGrade;
  let decision: ImageReferenceConsistencyDecision;
  if (model.coherence.state === "unstable") {
    grade = "warn";
    decision = "reference-set-unstable";
  } else if (baselineDistance.composite >= spec.failDistance) {
    grade = "fail";
    decision = "reject-technical-drift";
  } else if (baselineDistance.composite >= spec.warnDistance || flags.length > 0 || model.coherence.state === "mixed") {
    grade = "warn";
    decision = "review-drift";
  } else {
    grade = "pass";
    decision = "consistent";
  }

  return Object.freeze({
    contract: IMAGE_REFERENCE_CONSISTENCY_CONTRACT,
    grade,
    decision,
    candidate: candidateDescriptor,
    referenceCount: references.length,
    referenceCoherence: model.coherence,
    baseline: model.base,
    distance: baselineDistance,
    nearestReferences: Object.freeze(comparisons.slice(0, Math.min(5, comparisons.length))),
    flags,
    interpretation: "Deterministic visual-style surrogate only. It measures palette/tone, edge/detail character, silhouette/occupancy and framing drift against approved references; it does not prove semantic identity, artistic correctness or image origin.",
    semanticReviewRequired: true,
    aiOriginDetection: "not-claimed",
  });
}

export async function reviewImageReferenceConsistency(
  candidate: Buffer,
  references: readonly ImageReferenceInput[],
  spec: ImageReferenceConsistencySpec = {},
): Promise<ImageReferenceConsistencyResult> {
  const resolved = resolveSpec(spec);
  const model = await referenceModel(references, resolved);
  return reviewCandidate(candidate, references, model, resolved);
}

export async function reviewImageReferenceConsistencyBatch(
  candidates: readonly ImageReferenceCandidateInput[],
  references: readonly ImageReferenceInput[],
  spec: ImageReferenceConsistencySpec = {},
): Promise<ImageReferenceBatchResult> {
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 128) {
    throw new Error("Reference consistency batch requires 1 through 128 candidates.");
  }
  const ids = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || typeof candidate.id !== "string" || !candidate.id.trim()) throw new Error("Every candidate requires a non-empty id.");
    if (ids.has(candidate.id)) throw new Error(`Duplicate candidate id ${JSON.stringify(candidate.id)}.`);
    ids.add(candidate.id);
  }
  const resolved = resolveSpec(spec);
  const model = await referenceModel(references, resolved);
  const results = await Promise.all(candidates.map(async (candidate) => Object.freeze({
    id: candidate.id,
    review: await reviewCandidate(candidate.encoded, references, model, resolved),
  })));
  const severity = (grade: ImageReferenceConsistencyGrade) => grade === "fail" ? 3 : grade === "warn" ? 2 : 1;
  const reviewPriority = [...results]
    .sort((a, b) => severity(b.review.grade) - severity(a.review.grade) || b.review.distance.composite - a.review.distance.composite)
    .map((item) => item.id);
  return Object.freeze({
    contract: "evavo.image-reference-consistency-batch.v1",
    referenceCount: references.length,
    referenceCoherence: model.coherence,
    results: Object.freeze(results),
    reviewPriority: Object.freeze(reviewPriority),
    semanticReviewRequired: true,
    aiOriginDetection: "not-claimed",
  });
}
