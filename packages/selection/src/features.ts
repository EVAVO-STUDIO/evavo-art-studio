import { createHash } from "node:crypto";

import sharp from "sharp";

import { CandidateSelectionError } from "./types.js";

const DEFAULT_MAXIMUM_INPUT_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAXIMUM_PIXELS = 16_777_216;
const PALETTE_BINS_PER_CHANNEL = 8;
const PALETTE_BIN_COUNT =
  PALETTE_BINS_PER_CHANNEL *
  PALETTE_BINS_PER_CHANNEL *
  PALETTE_BINS_PER_CHANNEL;
const LUMINANCE_BIN_COUNT = 32;
const ORIENTATION_BIN_COUNT = 8;

export interface SelectionImageDecodeOptions {
  readonly alphaVisibleThreshold: number;
  readonly maximumInputBytes?: number;
  readonly maximumPixels?: number;
}

export interface SelectionImageBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

export interface SelectionImageFeatures {
  readonly encodedSha256: string;
  readonly rawRgbaSha256: string;
  readonly sourceFormat: string;
  readonly sourceHasAlpha: boolean;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
  readonly visibleMask: Uint8Array;
  readonly edgeMask: Uint8Array;
  readonly visiblePixels: number;
  readonly alphaWeight: number;
  readonly centroid: Readonly<{ x: number; y: number }>;
  readonly bounds: SelectionImageBounds;
  readonly paletteHistogram: Float64Array;
  readonly luminanceHistogram: Float64Array;
  readonly edgeOrientationHistogram: Float64Array;
}

function integer(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new CandidateSelectionError(
      "CANDIDATE_SELECTION_DECODE_OPTIONS_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return resolved;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeHistogram(values: Float64Array): Float64Array {
  let total = 0;
  for (const value of values) total += value;
  if (total <= 0) return values;
  for (let index = 0; index < values.length; index += 1) {
    values[index] = values[index]! / total;
  }
  return values;
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function paletteIndex(r: number, g: number, b: number): number {
  const red = Math.min(
    PALETTE_BINS_PER_CHANNEL - 1,
    Math.floor((r / 256) * PALETTE_BINS_PER_CHANNEL),
  );
  const green = Math.min(
    PALETTE_BINS_PER_CHANNEL - 1,
    Math.floor((g / 256) * PALETTE_BINS_PER_CHANNEL),
  );
  const blue = Math.min(
    PALETTE_BINS_PER_CHANNEL - 1,
    Math.floor((b / 256) * PALETTE_BINS_PER_CHANNEL),
  );
  return (
    red * PALETTE_BINS_PER_CHANNEL * PALETTE_BINS_PER_CHANNEL +
    green * PALETTE_BINS_PER_CHANNEL +
    blue
  );
}

function isEdge(
  mask: Uint8Array,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  if (!mask[y * width + x]) return false;
  if (x === 0 || y === 0 || x + 1 === width || y + 1 === height) return true;
  return (
    !mask[y * width + x - 1] ||
    !mask[y * width + x + 1] ||
    !mask[(y - 1) * width + x] ||
    !mask[(y + 1) * width + x]
  );
}

function sobel(
  luma: Float32Array,
  x: number,
  y: number,
  width: number,
): Readonly<{ gx: number; gy: number }> {
  const top = (y - 1) * width;
  const middle = y * width;
  const bottom = (y + 1) * width;
  const gx =
    -luma[top + x - 1]! +
    luma[top + x + 1]! -
    2 * luma[middle + x - 1]! +
    2 * luma[middle + x + 1]! -
    luma[bottom + x - 1]! +
    luma[bottom + x + 1]!;
  const gy =
    -luma[top + x - 1]! -
    2 * luma[top + x]! -
    luma[top + x + 1]! +
    luma[bottom + x - 1]! +
    2 * luma[bottom + x]! +
    luma[bottom + x + 1]!;
  return { gx, gy };
}

export async function decodeSelectionImage(
  input: Buffer | Uint8Array,
  options: SelectionImageDecodeOptions,
): Promise<SelectionImageFeatures> {
  const maximumInputBytes = integer(
    options.maximumInputBytes,
    DEFAULT_MAXIMUM_INPUT_BYTES,
    1,
    512 * 1024 * 1024,
    "maximumInputBytes",
  );
  const maximumPixels = integer(
    options.maximumPixels,
    DEFAULT_MAXIMUM_PIXELS,
    1,
    67_108_864,
    "maximumPixels",
  );
  const alphaVisibleThreshold = integer(
    options.alphaVisibleThreshold,
    8,
    1,
    255,
    "alphaVisibleThreshold",
  );
  const encoded = Buffer.from(input);
  if (!encoded.byteLength) {
    throw new CandidateSelectionError(
      "CANDIDATE_SELECTION_IMAGE_EMPTY",
      "Candidate or reference image is empty.",
    );
  }
  if (encoded.byteLength > maximumInputBytes) {
    throw new CandidateSelectionError(
      "CANDIDATE_SELECTION_IMAGE_TOO_LARGE",
      `Candidate or reference image exceeds ${maximumInputBytes} bytes.`,
    );
  }

  const decoderOptions = {
    failOn: "error" as const,
    limitInputPixels: maximumPixels,
    sequentialRead: true,
  };
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(encoded, decoderOptions).metadata();
  } catch {
    throw new CandidateSelectionError(
      "CANDIDATE_SELECTION_IMAGE_DECODE_FAILED",
      "Candidate or reference image could not be decoded.",
    );
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const pages = metadata.pages ?? 1;
  if (width <= 0 || height <= 0 || width * height > maximumPixels) {
    throw new CandidateSelectionError(
      "CANDIDATE_SELECTION_IMAGE_DIMENSIONS_INVALID",
      "Candidate or reference image has invalid or excessive dimensions.",
    );
  }
  if (pages !== 1) {
    throw new CandidateSelectionError(
      "CANDIDATE_SELECTION_IMAGE_MULTIPAGE_UNSUPPORTED",
      "Candidate selection accepts exactly one decoded image page per artifact.",
    );
  }

  const decoded = await sharp(encoded, decoderOptions)
    .ensureAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (decoded.info.channels !== 4) {
    throw new CandidateSelectionError(
      "CANDIDATE_SELECTION_IMAGE_CHANNELS_INVALID",
      "Candidate or reference image did not decode to RGBA.",
    );
  }

  const rgba = decoded.data;
  const pixels = width * height;
  const visibleMask = new Uint8Array(pixels);
  const edgeMask = new Uint8Array(pixels);
  const luma = new Float32Array(pixels);
  const paletteHistogram = new Float64Array(PALETTE_BIN_COUNT);
  const luminanceHistogram = new Float64Array(LUMINANCE_BIN_COUNT);
  const edgeOrientationHistogram = new Float64Array(ORIENTATION_BIN_COUNT);
  let visiblePixels = 0;
  let alphaWeight = 0;
  let centroidX = 0;
  let centroidY = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4;
    const r = rgba[offset]!;
    const g = rgba[offset + 1]!;
    const b = rgba[offset + 2]!;
    const alpha = rgba[offset + 3]!;
    const yValue = luminance(r, g, b);
    luma[pixel] = yValue;
    if (alpha < alphaVisibleThreshold) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const weight = alpha / 255;
    visibleMask[pixel] = 1;
    visiblePixels += 1;
    alphaWeight += weight;
    centroidX += x * weight;
    centroidY += y * weight;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    paletteHistogram[paletteIndex(r, g, b)]! += weight;
    const lumaBin = Math.min(
      LUMINANCE_BIN_COUNT - 1,
      Math.floor((yValue / 256) * LUMINANCE_BIN_COUNT),
    );
    luminanceHistogram[lumaBin]! += weight;
  }

  if (!visiblePixels || alphaWeight <= 0 || maxX < minX || maxY < minY) {
    throw new CandidateSelectionError(
      "CANDIDATE_SELECTION_IMAGE_EMPTY_SUBJECT",
      "Candidate or reference image contains no visible subject pixels.",
    );
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isEdge(visibleMask, x, y, width, height)) {
        edgeMask[y * width + x] = 1;
      }
    }
  }

  for (let y = 1; y + 1 < height; y += 1) {
    for (let x = 1; x + 1 < width; x += 1) {
      const pixel = y * width + x;
      if (!visibleMask[pixel]) continue;
      const gradient = sobel(luma, x, y, width);
      const magnitude = Math.hypot(gradient.gx, gradient.gy);
      if (magnitude < 8) continue;
      let angle = Math.atan2(gradient.gy, gradient.gx);
      if (angle < 0) angle += Math.PI * 2;
      const bin = Math.min(
        ORIENTATION_BIN_COUNT - 1,
        Math.floor((angle / (Math.PI * 2)) * ORIENTATION_BIN_COUNT),
      );
      edgeOrientationHistogram[bin]! += magnitude;
    }
  }

  return {
    encodedSha256: sha256(encoded),
    rawRgbaSha256: createHash("sha256")
      .update(`${width}x${height}x4\0`)
      .update(rgba)
      .digest("hex"),
    sourceFormat: metadata.format ?? "unknown",
    sourceHasAlpha: metadata.hasAlpha ?? false,
    width,
    height,
    rgba,
    visibleMask,
    edgeMask,
    visiblePixels,
    alphaWeight,
    centroid: {
      x: centroidX / alphaWeight,
      y: centroidY / alphaWeight,
    },
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    },
    paletteHistogram: normalizeHistogram(paletteHistogram),
    luminanceHistogram: normalizeHistogram(luminanceHistogram),
    edgeOrientationHistogram: normalizeHistogram(edgeOrientationHistogram),
  };
}
