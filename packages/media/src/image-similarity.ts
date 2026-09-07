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
  readonly differenceHashDistance: number;
  readonly differenceHashSimilarity: number;
  readonly averageHashDistance: number;
  readonly averageHashSimilarity: number;
  readonly perceptualDistance: number;
  readonly perceptualSimilarity: number;
  readonly nearDuplicate: boolean;
  readonly recommendation: "distinct" | "review-similarity" | "reject-duplicate";
}

function threshold(value: number | undefined): number {
  if (value === undefined) return 0.92;
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("nearDuplicateThreshold must be between 0 and 1.");
  return value;
}

async function dimensions(encoded: Buffer) {
  const meta = await sharp(encoded, { failOn: "error" }).metadata();
  if (!meta.width || !meta.height) throw new Error("Image similarity input has no dimensions.");
  return { width: meta.width, height: meta.height };
}

async function grayscale(encoded: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(encoded, { failOn: "error" })
    .flatten({ background: "#000000" })
    .greyscale()
    .resize(width, height, { fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer();
}

async function differenceHash(encoded: Buffer): Promise<bigint> {
  const data = await grayscale(encoded, 9, 8);
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

async function averageHash(encoded: Buffer): Promise<bigint> {
  const data = await grayscale(encoded, 8, 8);
  let sum = 0;
  for (const value of data) sum += value;
  const mean = sum / data.length;
  let bits = 0n;
  for (let index = 0; index < data.length; index += 1) {
    if (data[index]! >= mean) bits |= 1n << BigInt(index);
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
 * Detect exact and near-duplicate imagery. The perceptual score combines dHash
 * shape/edge ordering with aHash tone/layout occupancy so flat images and broad
 * gradients cannot collide merely because both have no descending edges.
 */
export async function compareImageSimilarity(
  source: Buffer,
  candidate: Buffer,
  spec: ImageSimilaritySpec = {},
): Promise<ImageSimilarityResult> {
  if (!source.length || !candidate.length) throw new Error("Image similarity inputs must not be empty.");
  const nearDuplicateThreshold = threshold(spec.nearDuplicateThreshold);
  const [a, b, dhA, dhB, ahA, ahB] = await Promise.all([
    dimensions(source),
    dimensions(candidate),
    differenceHash(source),
    differenceHash(candidate),
    averageHash(source),
    averageHash(candidate),
  ]);
  const exactBinaryMatch = createHash("sha256").update(source).digest("hex") === createHash("sha256").update(candidate).digest("hex");
  const differenceHashDistance = popcount64(dhA ^ dhB);
  const averageHashDistance = popcount64(ahA ^ ahB);
  const differenceHashSimilarity = 1 - differenceHashDistance / 64;
  const averageHashSimilarity = 1 - averageHashDistance / 64;
  const perceptualSimilarity = differenceHashSimilarity * 0.6 + averageHashSimilarity * 0.4;
  const perceptualDistance = Math.round((1 - perceptualSimilarity) * 64 * 1000) / 1000;
  const nearDuplicate = exactBinaryMatch || perceptualSimilarity >= nearDuplicateThreshold;
  const recommendation = exactBinaryMatch ? "reject-duplicate" : nearDuplicate ? "review-similarity" : "distinct";
  return Object.freeze({
    exactBinaryMatch,
    sameDecodedDimensions: a.width === b.width && a.height === b.height,
    sourceWidth: a.width,
    sourceHeight: a.height,
    candidateWidth: b.width,
    candidateHeight: b.height,
    differenceHashDistance,
    differenceHashSimilarity,
    averageHashDistance,
    averageHashSimilarity,
    perceptualDistance,
    perceptualSimilarity,
    nearDuplicate,
    recommendation,
  });
}
