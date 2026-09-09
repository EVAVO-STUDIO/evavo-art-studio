import { compareImageSimilarity } from "./image-similarity.js";
import sharp from "sharp";
import {
  createImageFinishingReviewBatch,
  type ImageFinishingPacketPriority,
  type ImageFinishingReviewBatchItemInput,
  type ImageFinishingReviewBatchSpec,
  type ImageFinishingReviewBatchResult,
} from "./image-finishing-review-packet.js";

export const IMAGE_SEQUENCE_FINISHING_REVIEW_CONTRACT = "evavo.image-sequence-finishing-review.v1" as const;

export interface ImageSequenceFinishingInput extends ImageFinishingReviewBatchItemInput {
  readonly durationMs?: number;
}

export interface ImageSequenceFinishingReviewSpec extends ImageFinishingReviewBatchSpec {
  readonly maximumLumaDelta?: number;
  readonly maximumContrastDelta?: number;
  readonly maximumSharpnessRatio?: number;
  readonly maximumVisibleMassDelta?: number;
  readonly maximumQualityScoreDelta?: number;
  readonly maximumBoundingBoxAspectDelta?: number;
  readonly maximumCentroidDelta?: number;
  readonly maximumBoundingBoxScaleDelta?: number;
  readonly duplicateNeighborPolicy?: "ignore" | "warn";
}

export interface ImageSequenceFrameContinuity {
  readonly id: string;
  readonly index: number;
  readonly flags: readonly string[];
  readonly continuityRisk: "low" | "review" | "high";
  readonly silhouetteGeometry: Readonly<{
    boundingBoxAspect: number;
    boundingBoxWidthRatio: number;
    boundingBoxHeightRatio: number;
    centroidX: number;
    centroidY: number;
  }>;
}

export interface ImageSequenceNeighborEvidence {
  readonly fromId: string;
  readonly toId: string;
  readonly perceptualDistance: number;
  readonly perceptualSimilarity: number;
  readonly nearDuplicate: boolean;
  readonly recommendation: "distinct" | "review-similarity" | "reject-duplicate";
  readonly durationMs: number | null;
  readonly flags: readonly string[];
}

export interface ImageSequenceFinishingReviewResult {
  readonly contract: typeof IMAGE_SEQUENCE_FINISHING_REVIEW_CONTRACT;
  readonly frameCount: number;
  readonly batch: ImageFinishingReviewBatchResult;
  readonly baseline: Readonly<{
    width: number;
    height: number;
    aspectRatio: number;
    qualityScore: number;
    lumaMean: number;
    lumaStdDev: number;
    sharpness: number;
    visiblePixelRatio: number;
    boundingBoxAspect: number;
    boundingBoxWidthRatio: number;
    boundingBoxHeightRatio: number;
    centroidX: number;
    centroidY: number;
  }>;
  readonly frames: readonly ImageSequenceFrameContinuity[];
  readonly neighbors: readonly ImageSequenceNeighborEvidence[];
  readonly setWarnings: readonly string[];
  readonly reviewPriority: readonly string[];
  readonly sequenceDecision: "pass-to-visual-review" | "review" | "reject";
  readonly visualReviewRequired: true;
  readonly automaticPromotionAllowed: false;
  readonly sourcesModified: false;
}

function finitePositive(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than 0.`);
  return value;
}

function finiteNonNegative(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be zero or greater.`);
  return value;
}

function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2;
}

function ratio(value: number, baseline: number): number {
  if (baseline === 0) return value === 0 ? 1 : Number.POSITIVE_INFINITY;
  return value / baseline;
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

async function measureSilhouetteGeometry(encoded: Buffer): Promise<{
  boundingBoxAspect: number;
  boundingBoxWidthRatio: number;
  boundingBoxHeightRatio: number;
  centroidX: number;
  centroidY: number;
}> {
  const decoded = await sharp(encoded, { failOn: "error" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = decoded.info;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (decoded.data[(y * width + x) * channels + 3]! <= 32) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      sumX += x;
      sumY += y;
      count += 1;
    }
  }
  if (!count) {
    return { boundingBoxAspect: 0, boundingBoxWidthRatio: 0, boundingBoxHeightRatio: 0, centroidX: 0, centroidY: 0 };
  }
  const boxWidth = maxX - minX + 1;
  const boxHeight = maxY - minY + 1;
  return {
    boundingBoxAspect: boxWidth / boxHeight,
    boundingBoxWidthRatio: boxWidth / width,
    boundingBoxHeightRatio: boxHeight / height,
    centroidX: sumX / count / width,
    centroidY: sumY / count / height,
  };
}

function priorityRank(priority: ImageFinishingPacketPriority): number {
  switch (priority) {
    case "critical": return 4;
    case "high": return 3;
    case "review": return 2;
    case "normal": return 1;
  }
}

/**
 * Review an ordered image sequence by combining per-frame finishing decisions
 * with technical continuity and neighbor similarity evidence. Temporal semantic
 * intent (pose arc, acting, identity, motion quality) still requires visual review.
 */
export async function createImageSequenceFinishingReview(
  frames: readonly ImageSequenceFinishingInput[],
  spec: ImageSequenceFinishingReviewSpec = {},
): Promise<ImageSequenceFinishingReviewResult> {
  if (!Array.isArray(frames) || frames.length < 2 || frames.length > 128) {
    throw new Error("Sequence finishing review requires 2 through 128 ordered frames.");
  }
  for (const [index, frame] of frames.entries()) {
    if (frame.durationMs !== undefined && (!Number.isFinite(frame.durationMs) || frame.durationMs <= 0 || frame.durationMs > 60_000)) {
      throw new Error(`frames[${index}].durationMs must be greater than 0 and no more than 60000.`);
    }
  }

  const maximumLumaDelta = finiteNonNegative(spec.maximumLumaDelta, 30, "maximumLumaDelta");
  const maximumContrastDelta = finiteNonNegative(spec.maximumContrastDelta, 20, "maximumContrastDelta");
  const maximumSharpnessRatio = finitePositive(spec.maximumSharpnessRatio, 2.2, "maximumSharpnessRatio");
  if (maximumSharpnessRatio < 1) throw new Error("maximumSharpnessRatio must be at least 1.");
  const maximumVisibleMassDelta = finiteNonNegative(spec.maximumVisibleMassDelta, 0.25, "maximumVisibleMassDelta");
  const maximumQualityScoreDelta = finiteNonNegative(spec.maximumQualityScoreDelta, 18, "maximumQualityScoreDelta");
  const maximumBoundingBoxAspectDelta = finiteNonNegative(spec.maximumBoundingBoxAspectDelta, 0.30, "maximumBoundingBoxAspectDelta");
  const maximumCentroidDelta = finiteNonNegative(spec.maximumCentroidDelta, 0.16, "maximumCentroidDelta");
  const maximumBoundingBoxScaleDelta = finiteNonNegative(spec.maximumBoundingBoxScaleDelta, 0.30, "maximumBoundingBoxScaleDelta");
  const duplicateNeighborPolicy = spec.duplicateNeighborPolicy ?? "warn";
  if (duplicateNeighborPolicy !== "ignore" && duplicateNeighborPolicy !== "warn") {
    throw new Error("duplicateNeighborPolicy must be ignore or warn.");
  }

  const batch = await createImageFinishingReviewBatch(frames, {
    ...(spec.defaultReviewContext ? { defaultReviewContext: spec.defaultReviewContext } : {}),
    ...(spec.approvedReferences?.length ? { approvedReferences: spec.approvedReferences } : {}),
  });
  const quality = batch.items.map((item) => item.packet.technicalReview.quality);
  const geometry = await Promise.all(frames.map((frame) => measureSilhouetteGeometry(frame.encoded)));
  const baseline = Object.freeze({
    width: median(quality.map((item) => item.width)),
    height: median(quality.map((item) => item.height)),
    aspectRatio: median(quality.map((item) => item.width / item.height)),
    qualityScore: median(quality.map((item) => item.score)),
    lumaMean: median(quality.map((item) => item.lumaMean)),
    lumaStdDev: median(quality.map((item) => item.lumaStdDev)),
    sharpness: median(quality.map((item) => item.sharpness)),
    visiblePixelRatio: median(quality.map((item) => item.visiblePixelRatio)),
    boundingBoxAspect: median(geometry.map((item) => item.boundingBoxAspect)),
    boundingBoxWidthRatio: median(geometry.map((item) => item.boundingBoxWidthRatio)),
    boundingBoxHeightRatio: median(geometry.map((item) => item.boundingBoxHeightRatio)),
    centroidX: median(geometry.map((item) => item.centroidX)),
    centroidY: median(geometry.map((item) => item.centroidY)),
  });
  const alphaStates = unique(quality.map((item) => String(item.hasAlpha)));

  const continuity = batch.items.map((item, index) => {
    const q = item.packet.technicalReview.quality;
    const g = geometry[index]!;
    const flags: string[] = [];
    const aspect = q.width / q.height;
    if (Math.abs(q.width - baseline.width) > 1 || Math.abs(q.height - baseline.height) > 1) flags.push("canvas-size-outlier");
    if (Math.abs(aspect - baseline.aspectRatio) > 0.01) flags.push("aspect-ratio-outlier");
    if (Math.abs(q.score - baseline.qualityScore) > maximumQualityScoreDelta) flags.push("quality-score-outlier");
    if (Math.abs(q.lumaMean - baseline.lumaMean) > maximumLumaDelta) flags.push("luminance-outlier");
    if (Math.abs(q.lumaStdDev - baseline.lumaStdDev) > maximumContrastDelta) flags.push("contrast-outlier");
    const sharpnessRatio = ratio(q.sharpness, baseline.sharpness);
    if (sharpnessRatio < 1 / maximumSharpnessRatio || sharpnessRatio > maximumSharpnessRatio) flags.push("sharpness-outlier");
    if (Math.abs(q.visiblePixelRatio - baseline.visiblePixelRatio) > maximumVisibleMassDelta) flags.push("visible-mass-outlier");
    if (Math.abs(g.boundingBoxAspect - baseline.boundingBoxAspect) > maximumBoundingBoxAspectDelta) flags.push("silhouette-proportion-outlier");
    if (
      Math.abs(g.boundingBoxWidthRatio - baseline.boundingBoxWidthRatio) > maximumBoundingBoxScaleDelta
      || Math.abs(g.boundingBoxHeightRatio - baseline.boundingBoxHeightRatio) > maximumBoundingBoxScaleDelta
    ) flags.push("silhouette-scale-outlier");
    if (Math.hypot(g.centroidX - baseline.centroidX, g.centroidY - baseline.centroidY) > maximumCentroidDelta) flags.push("registration-centroid-outlier");
    return Object.freeze({
      id: item.id,
      index,
      flags: Object.freeze(flags),
      continuityRisk: flags.length >= 2 ? "high" as const : flags.length ? "review" as const : "low" as const,
      silhouetteGeometry: Object.freeze(g),
    });
  });

  const neighbors: ImageSequenceNeighborEvidence[] = [];
  const duplicateFrameIds = new Set<string>();
  for (let index = 0; index < frames.length - 1; index += 1) {
    const from = frames[index]!;
    const to = frames[index + 1]!;
    const similarity = await compareImageSimilarity(from.encoded, to.encoded);
    const flags: string[] = [];
    const fromGeometry = geometry[index]!;
    const toGeometry = geometry[index + 1]!;
    if (duplicateNeighborPolicy === "warn" && similarity.recommendation === "reject-duplicate") {
      flags.push("exact-or-effectively-duplicate-neighbor");
      duplicateFrameIds.add(from.id);
      duplicateFrameIds.add(to.id);
    } else if (duplicateNeighborPolicy === "warn" && similarity.nearDuplicate) {
      flags.push("near-duplicate-neighbor");
    }
    if (Math.abs(toGeometry.boundingBoxAspect - fromGeometry.boundingBoxAspect) > maximumBoundingBoxAspectDelta) {
      flags.push("adjacent-silhouette-proportion-jump");
    }
    if (Math.hypot(toGeometry.centroidX - fromGeometry.centroidX, toGeometry.centroidY - fromGeometry.centroidY) > maximumCentroidDelta) {
      flags.push("adjacent-registration-centroid-jump");
    }
    neighbors.push(Object.freeze({
      fromId: from.id,
      toId: to.id,
      perceptualDistance: similarity.perceptualDistance,
      perceptualSimilarity: similarity.perceptualSimilarity,
      nearDuplicate: similarity.nearDuplicate,
      recommendation: similarity.recommendation,
      durationMs: from.durationMs ?? null,
      flags: Object.freeze(flags),
    }));
  }

  const setWarnings: string[] = [];
  if (alphaStates.length > 1) setWarnings.push("mixed-alpha-channel-state");
  if (continuity.some((item) => item.continuityRisk === "high")) setWarnings.push("technical-frame-continuity-outliers-present");
  if (neighbors.some((item) => item.flags.some((flag) => flag.startsWith("adjacent-")))) {
    setWarnings.push("adjacent-silhouette-or-registration-jumps-present");
  }
  if (neighbors.some((item) => item.flags.includes("exact-or-effectively-duplicate-neighbor"))) {
    setWarnings.push("duplicate-neighbor-frames-present; verify whether these are intentional animation holds");
  } else if (neighbors.some((item) => item.flags.includes("near-duplicate-neighbor"))) {
    setWarnings.push("near-duplicate-neighbor-frames-present; verify motion pacing visually");
  }

  const continuityById = new Map(continuity.map((item) => [item.id, item] as const));
  const reviewPriority = [...batch.items]
    .sort((a, b) => {
      const priorityDifference = priorityRank(b.packet.priority) - priorityRank(a.packet.priority);
      if (priorityDifference !== 0) return priorityDifference;
      const semanticDifference = Number(b.packet.disposition === "semantic-repair") - Number(a.packet.disposition === "semantic-repair");
      if (semanticDifference !== 0) return semanticDifference;
      const continuityDifference = (continuityById.get(b.id)?.flags.length ?? 0) - (continuityById.get(a.id)?.flags.length ?? 0);
      if (continuityDifference !== 0) return continuityDifference;
      const duplicateDifference = Number(duplicateFrameIds.has(b.id)) - Number(duplicateFrameIds.has(a.id));
      if (duplicateDifference !== 0) return duplicateDifference;
      return (b.packet.referenceConsistency?.distance.composite ?? 0) - (a.packet.referenceConsistency?.distance.composite ?? 0);
    })
    .map((item) => item.id);

  const sequenceDecision = batch.summary.priorities.critical > 0 || batch.summary.technicalRejectCount > 0
    ? "reject" as const
    : batch.summary.priorities.high > 0
      || batch.summary.priorities.review > 0
      || continuity.some((item) => item.flags.length > 0)
      || setWarnings.length > 0
      ? "review" as const
      : "pass-to-visual-review" as const;

  return Object.freeze({
    contract: IMAGE_SEQUENCE_FINISHING_REVIEW_CONTRACT,
    frameCount: frames.length,
    batch,
    baseline,
    frames: Object.freeze(continuity),
    neighbors: Object.freeze(neighbors),
    setWarnings: Object.freeze(setWarnings),
    reviewPriority: Object.freeze(reviewPriority),
    sequenceDecision,
    visualReviewRequired: true,
    automaticPromotionAllowed: false,
    sourcesModified: false,
  });
}
