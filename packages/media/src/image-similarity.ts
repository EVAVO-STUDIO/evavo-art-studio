import { createHash } from "node:crypto";
import sharp from "sharp";

export interface ImageSimilaritySpec {
  readonly nearDuplicateThreshold?: number;
}

export interface ImageSimilarityResult {
  readonly exactBinaryMatch: boolean;
  readonly sameDecodedDimensions: boolean;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly candidateWidth: number;
  readonly candidateHeight: number;
  readonly perceptualDistance: number;
  readonly perceptualSimilarity: number;
  readonly nearDuplicate: boolean;
  readonly recommendation: "distinct" | "review-similarity" | "reject-duplicate";
}

function threshold(value: number | undefined): number {
  if (value === undefined) return 0.92;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("nearDuplicateThreshold must be between 0 and 1.");
  }
  return value;
}

async function dimensions(encoded: Buffer) {
  const meta = await sharp(encoded, { failOn: "error" }).metadata();
  if (!meta.width || !meta.height) throw new Error("Image similarity input has no dimensions.");
  return { width: meta.width, height: meta.height };
}

async function differenceHash(encoded: Buffer): Promise<bigint> {
  const data = await sharp(encoded, { failOn: "error" })
    .flatten({ background: "#000000" })
    .greyscale()
    .resize(9, 8, { fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer();
  let bits = 0n;
  let bit = 0n;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = data[y * 9 + x]!;
      const right = data[y * 9 + x + 1]!;
      if (left > right) bits |= 1n << bit;
      bit += 1n;
    }
  }
  return bits;
}

function popcount64(value: bigint): number {
  let v = value;
  let count = 0;
  while (v) {
    count += Number(v & 1n);
    v >>= 1n;
  }
  return count;
}

/**
 * Detects exact and near-duplicate imagery so a page does not accidentally use
 * the same visual, a resized derivative, or an almost-identical crop for both
 * its hero and supporting media. The perceptual score is intentionally a QA
 * signal rather than an art-direction decision.
 */
export async function compareImageSimilarity(
  source: Buffer,
  candidate: Buffer,
  spec: ImageSimilaritySpec = {},
): Promise<ImageSimilarityResult> {
  if (!source.length || !candidate.length) throw new Error("Image similarity inputs must not be empty.");
  const nearDuplicateThreshold = threshold(spec.nearDuplicateThreshold);
  const [a, b, ah, bh] = await Promise.all([
    dimensions(source),
    dimensions(candidate),
    differenceHash(source),
    differenceHash(candidate),
  ]);
  const exactBinaryMatch = createHash("sha256").update(source).digest("hex") === createHash("sha256").update(candidate).digest("hex");
  const perceptualDistance = popcount64(ah ^ bh);
  const perceptualSimilarity = 1 - perceptualDistance / 64;
  const nearDuplicate = exactBinaryMatch || perceptualSimilarity >= nearDuplicateThreshold;
  const recommendation = exactBinaryMatch
    ? "reject-duplicate"
    : nearDuplicate
      ? "review-similarity"
      : "distinct";
  return Object.freeze({
    exactBinaryMatch,
    sameDecodedDimensions: a.width === b.width && a.height === b.height,
    sourceWidth: a.width,
    sourceHeight: a.height,
    candidateWidth: b.width,
    candidateHeight: b.height,
    perceptualDistance,
    perceptualSimilarity,
    nearDuplicate,
    recommendation,
  });
}
