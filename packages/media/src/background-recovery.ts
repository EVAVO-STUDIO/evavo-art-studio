import { createHash } from "node:crypto";

import sharp, { type Metadata } from "sharp";

import {
  ChromaKeyExtractionError,
  extractChromaKeyAlpha,
  type ChromaKeyExtractionEvidence,
  type ChromaKeyExtractionOptions,
} from "./chroma-key.js";

const DEFAULT_MAXIMUM_INPUT_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAXIMUM_PIXELS = 8_294_400;
const UNREACHED = 255;
const CHECKER_TILE_SIZES = Object.freeze([
  2, 3, 4, 6, 8, 10, 12, 16, 20, 22, 23, 24, 26, 28, 32, 48, 64, 96, 128,
]);

type Colour = Readonly<{ r: number; g: number; b: number }>;

export type BackgroundAlphaRecoveryStrategy =
  | "native-alpha-preserved"
  | "declared-chroma-key"
  | "inferred-high-chroma-key"
  | "checkerboard-recovery";

export type BackgroundAlphaRecoveryOptions = Readonly<
  Omit<ChromaKeyExtractionOptions, "matteColour"> & {
    readonly matteColour?: string;
    readonly allowCheckerboardRecovery?: boolean;
    readonly allowHighChromaInference?: boolean;
    readonly minimumNativeTransparentFraction?: number;
    readonly minimumNativeTransparentBorderFraction?: number;
    readonly checkerConnectionDistance?: number;
    readonly checkerForegroundSeedDistance?: number;
    readonly checkerMinimumBorderFraction?: number;
    readonly checkerMaximumCompositeChannelError?: number;
    readonly maximumCompositeChannelError?: number;
  }
>;

export interface BackgroundAlphaRecoveryEvidence {
  readonly schemaVersion: "2.0";
  readonly strategy: BackgroundAlphaRecoveryStrategy;
  readonly inputSha256: string;
  readonly outputSha256: string;
  readonly source: Readonly<{
    format: string;
    width: number;
    height: number;
    pages: number;
    hasAlpha: boolean;
    sizeBytes: number;
  }>;
  readonly classification: Readonly<{
    sourceTransparentPixels: number;
    sourcePartialPixels: number;
    sourceOpaquePixels: number;
    transparentBorderFraction: number;
    nativeAlphaMeaningful: boolean;
    checkerboard: CheckerboardDetectionEvidence;
    inferredMatte: Readonly<{
      colour: Colour;
      hex: string;
      matchingBorderFraction: number;
      matchingVisibleBorderFraction: number;
      visibleBorderFraction: number;
      borderRmse: number;
    }> | null;
  }>;
  readonly matte?: ChromaKeyExtractionEvidence["matte"];
  readonly thresholds?: ChromaKeyExtractionEvidence["thresholds"];
  readonly border?: ChromaKeyExtractionEvidence["border"];
  readonly segmentation?: ChromaKeyExtractionEvidence["segmentation"];
  readonly output: Readonly<{
    transparentPixels: number;
    partialPixels: number;
    opaquePixels: number;
    decontaminatedPixels: number;
    readonly providerHaloRepairPixels?: number;
    readonly providerDistanceHaloRepairPixels?: number;
    readonly providerComplementHaloRepairPixels?: number;
    readonly providerConnectedMatteHaloRepairPixels?: number;
    readonly providerForegroundHaloRepairPixels?: number;
    transparentBleedPixels: number;
  }>;
  readonly checkerboardRecovery?: Readonly<{
    connectedBackgroundPixels: number;
    confidentForegroundSeeds: number;
    edgeBandPixels: number;
    compositeMismatchPixels: number;
    maximumCompositeChannelError: number;
  }>;
  readonly matteAlphaBypassRecovery?: Readonly<{
    sourceNonOpaquePixels: number;
    sampledBorderBandPixels: number;
    visibleBorderBandPixels: number;
    matchingBorderFraction: number;
    matchingVisibleBorderFraction: number;
    borderRmse: number;
  }>;
  readonly recomposition?: Readonly<{
    checkedPixels: number;
    readonly excludedProviderHaloRepairPixels?: number;
    mismatchPixels: number;
    maximumObservedChannelError: number;
    maximumAllowedChannelError: number;
  }>;
  readonly providerHaloRepair?: ChromaKeyExtractionEvidence["providerHaloRepair"];
  readonly guarantees: Readonly<{
    realAlpha: true;
    fakeCheckerboardAcceptedAsTransparency: false;
    transparentCanvasEdge: true;
    edgeConnectedBackgroundOnly: boolean;
    partialEdgeDecontamination: boolean;
    recompositionVerified: boolean;
  }>;
}

export interface BackgroundAlphaRecoveryResult {
  readonly png: Buffer;
  readonly evidence: BackgroundAlphaRecoveryEvidence;
}

export interface CheckerboardDetectionEvidence {
  readonly detected: boolean;
  readonly confidence: number;
  readonly sampledBorderPixels: number;
  readonly visibleBorderFraction: number;
  readonly opaqueBorderFraction: number;
  readonly lowChromaBorderFraction: number;
  readonly tileSize: number | null;
  readonly phaseX: number | null;
  readonly phaseY: number | null;
  readonly colours: readonly Colour[];
  readonly colourSeparation: number | null;
  readonly fitFraction: number | null;
  readonly coverageFraction: number | null;
  readonly rmse: number | null;
}

export class BackgroundAlphaRecoveryError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "BackgroundAlphaRecoveryError";
    this.code = code;
  }
}

interface DecodedSource {
  readonly encoded: Buffer;
  readonly metadata: Metadata;
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
  readonly pages: number;
}

interface CheckerSample extends Colour {
  readonly x: number;
  readonly y: number;
}

interface CheckerFit {
  readonly tileSize: number;
  readonly phaseX: number;
  readonly phaseY: number;
  readonly colours: readonly [Colour, Colour];
  readonly separation: number;
  readonly fitFraction: number;
  readonly coverageFraction: number;
  readonly rmse: number;
  readonly score: number;
}

interface AlphaStatistics {
  readonly transparentPixels: number;
  readonly partialPixels: number;
  readonly opaquePixels: number;
  readonly transparentBorderFraction: number;
}

interface MatteBandFit {
  readonly detected: boolean;
  readonly sampledPixels: number;
  readonly visiblePixels: number;
  readonly matchingPixels: number;
  readonly matchingBorderFraction: number;
  readonly matchingVisibleBorderFraction: number;
  readonly visibleBorderFraction: number;
  readonly rmse: number;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function boundedNumber(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const result = value ?? fallback;
  if (!Number.isFinite(result) || result < minimum || result > maximum) {
    throw new BackgroundAlphaRecoveryError(
      "BACKGROUND_RECOVERY_OPTIONS_INVALID",
      `${name} must be between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < minimum || result > maximum) {
    throw new BackgroundAlphaRecoveryError(
      "BACKGROUND_RECOVERY_OPTIONS_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function distance(
  red: number,
  green: number,
  blue: number,
  colour: Colour,
): number {
  return Math.hypot(red - colour.r, green - colour.g, blue - colour.b);
}

function colourHex(colour: Colour): string {
  return `#${[colour.r, colour.g, colour.b]
    .map((value) => clampByte(value).toString(16).padStart(2, "0"))
    .join("")}`;
}

function parseColour(value: string): Colour {
  const normalized = value.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(normalized)) {
    throw new BackgroundAlphaRecoveryError(
      "BACKGROUND_RECOVERY_MATTE_INVALID",
      "matteColour must use #RRGGBB format.",
    );
  }
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function borderIndices(width: number, height: number): number[] {
  const values: number[] = [];
  for (let x = 0; x < width; x += 1) values.push(x);
  if (height > 1) {
    const bottom = (height - 1) * width;
    for (let x = 0; x < width; x += 1) values.push(bottom + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    values.push(y * width);
    if (width > 1) values.push(y * width + width - 1);
  }
  return values;
}

function neighbours(
  index: number,
  width: number,
  height: number,
  visit: (value: number) => void,
): void {
  const x = index % width;
  const y = Math.floor(index / width);
  if (x > 0) visit(index - 1);
  if (x + 1 < width) visit(index + 1);
  if (y > 0) visit(index - width);
  if (y + 1 < height) visit(index + width);
}

async function decodeSource(
  input: Buffer | Uint8Array,
  options: BackgroundAlphaRecoveryOptions,
): Promise<DecodedSource> {
  const encoded = Buffer.from(input);
  const maximumInputBytes = boundedInteger(
    options.maximumInputBytes,
    DEFAULT_MAXIMUM_INPUT_BYTES,
    1_024,
    512 * 1024 * 1024,
    "maximumInputBytes",
  );
  const maximumPixels = boundedInteger(
    options.maximumPixels,
    DEFAULT_MAXIMUM_PIXELS,
    1,
    67_108_864,
    "maximumPixels",
  );
  if (!encoded.byteLength) {
    throw new BackgroundAlphaRecoveryError(
      "BACKGROUND_RECOVERY_INPUT_EMPTY",
      "Background-recovery candidate is empty.",
    );
  }
  if (encoded.byteLength > maximumInputBytes) {
    throw new BackgroundAlphaRecoveryError(
      "BACKGROUND_RECOVERY_INPUT_TOO_LARGE",
      `Background-recovery candidate exceeds ${maximumInputBytes} bytes.`,
    );
  }
  const decoderOptions = {
    failOn: "error" as const,
    limitInputPixels: maximumPixels,
    sequentialRead: true,
  };
  let metadata: Metadata;
  try {
    metadata = await sharp(encoded, decoderOptions).metadata();
  } catch {
    throw new BackgroundAlphaRecoveryError(
      "BACKGROUND_RECOVERY_DECODE_FAILED",
      "Background-recovery candidate could not be decoded.",
    );
  }
  const pages = metadata.pages ?? 1;
  if (pages !== 1) {
    throw new BackgroundAlphaRecoveryError(
      "BACKGROUND_RECOVERY_MULTIPAGE_UNSUPPORTED",
      "Background recovery accepts exactly one image page.",
    );
  }
  let decoded: Awaited<
    ReturnType<ReturnType<ReturnType<typeof sharp>["raw"]>["toBuffer"]>
  >;
  try {
    decoded = await sharp(encoded, decoderOptions)
      .ensureAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new BackgroundAlphaRecoveryError(
      "BACKGROUND_RECOVERY_DECODE_FAILED",
      "Background-recovery candidate could not be decoded to RGBA.",
    );
  }
  const { width, height, channels } = decoded.info;
  if (
    channels !== 4 ||
    width <= 1 ||
    height <= 1 ||
    width * height > maximumPixels
  ) {
    throw new BackgroundAlphaRecoveryError(
      "BACKGROUND_RECOVERY_DIMENSIONS_INVALID",
      "Background-recovery candidate has invalid dimensions or channels.",
    );
  }
  return { encoded, metadata, data: decoded.data, width, height, pages };
}

function alphaStatistics(source: DecodedSource): AlphaStatistics {
  let transparentPixels = 0;
  let partialPixels = 0;
  let opaquePixels = 0;
  for (let offset = 3; offset < source.data.byteLength; offset += 4) {
    const alpha = source.data[offset]!;
    if (alpha <= 1) transparentPixels += 1;
    else if (alpha >= 254) opaquePixels += 1;
    else partialPixels += 1;
  }
  const borders = borderIndices(source.width, source.height);
  const transparentBorder = borders.filter(
    (pixel) => source.data[pixel * 4 + 3]! <= 1,
  ).length;
  return {
    transparentPixels,
    partialPixels,
    opaquePixels,
    transparentBorderFraction: transparentBorder / borders.length,
  };
}

function checkerSamples(source: Readonly<{
  data: Buffer;
  width: number;
  height: number;
}>): Readonly<{
  samples: readonly CheckerSample[];
  sampledPixels: number;
  visibleFraction: number;
  opaqueFraction: number;
  lowChromaFraction: number;
}> {
  const band = Math.max(8, Math.floor(Math.min(source.width, source.height) * 0.16));
  const bandPixels =
    source.width * source.height -
    Math.max(0, source.width - band * 2) *
      Math.max(0, source.height - band * 2);
  const stride = Math.max(1, Math.ceil(Math.sqrt(bandPixels / 40_000)));
  const samples: CheckerSample[] = [];
  let sampledPixels = 0;
  let visible = 0;
  let opaque = 0;
  let lowChroma = 0;
  for (let y = 0; y < source.height; y += stride) {
    for (let x = 0; x < source.width; x += stride) {
      if (
        x >= band &&
        x < source.width - band &&
        y >= band &&
        y < source.height - band
      ) {
        continue;
      }
      const offset = (y * source.width + x) * 4;
      const red = source.data[offset]!;
      const green = source.data[offset + 1]!;
      const blue = source.data[offset + 2]!;
      sampledPixels += 1;
      // Fit only pixels whose grid would actually be visible. Hidden RGB
      // beneath genuine alpha must never turn a valid transparent PNG into a
      // checkerboard-recovery candidate.
      const alpha = source.data[offset + 3]!;
      if (alpha >= 32) {
        visible += 1;
        if (alpha >= 254) opaque += 1;
        if (Math.max(red, green, blue) - Math.min(red, green, blue) <= 32) {
          lowChroma += 1;
        }
        samples.push({ x, y, r: red, g: green, b: blue });
      }
    }
  }
  return {
    samples,
    sampledPixels,
    visibleFraction: sampledPixels ? visible / sampledPixels : 0,
    opaqueFraction: sampledPixels ? opaque / sampledPixels : 0,
    lowChromaFraction: visible ? lowChroma / visible : 0,
  };
}

function fitCheckerboard(
  samples: readonly CheckerSample[],
  tileSize: number,
  phaseX: number,
  phaseY: number,
): CheckerFit | null {
  const bins = [new Map<number, number[]>(), new Map<number, number[]>()];
  for (const sample of samples) {
    const parity =
      (Math.floor((sample.x + phaseX) / tileSize) +
        Math.floor((sample.y + phaseY) / tileSize)) &
      1;
    // Provider checkerboards are often lightly textured or compressed. Use a
    // robust dominant colour per parity instead of averaging the foreground
    // character into the grid model. Eight-level bins retain subtle neutral
    // grid separation while absorbing one- or two-level provider noise.
    const key =
      (Math.floor(sample.r / 8) << 10) |
      (Math.floor(sample.g / 8) << 5) |
      Math.floor(sample.b / 8);
    const bin = bins[parity]!.get(key) ?? [0, 0, 0, 0];
    bin[0]! += sample.r;
    bin[1]! += sample.g;
    bin[2]! += sample.b;
    bin[3]! += 1;
    bins[parity]!.set(key, bin);
  }
  const dominant = bins.map((values) => {
    let best: number[] | null = null;
    for (const value of values.values()) {
      if (!best || value[3]! > best[3]!) best = value;
    }
    return best;
  });
  if (!dominant[0] || !dominant[1] || dominant[0][3]! < 16 || dominant[1][3]! < 16) {
    return null;
  }
  const colours = dominant.map((sum) => ({
    r: sum![0]! / sum![3]!,
    g: sum![1]! / sum![3]!,
    b: sum![2]! / sum![3]!,
  })) as [Colour, Colour];
  const separation = distance(
    colours[0].r,
    colours[0].g,
    colours[0].b,
    colours[1],
  );
  const fitDistance = Math.max(14, separation * 0.28);
  let fitted = 0;
  let eligible = 0;
  let fittedSquaredError = 0;
  for (const sample of samples) {
    const parity =
      (Math.floor((sample.x + phaseX) / tileSize) +
        Math.floor((sample.y + phaseY) / tileSize)) &
      1;
    const expectedError = distance(
      sample.r,
      sample.g,
      sample.b,
      colours[parity]!,
    );
    const alternateError = distance(
      sample.r,
      sample.g,
      sample.b,
      colours[parity ^ 1]!,
    );
    if (Math.min(expectedError, alternateError) <= fitDistance) eligible += 1;
    if (expectedError <= fitDistance && expectedError <= alternateError) {
      fitted += 1;
      fittedSquaredError += expectedError * expectedError;
    }
  }
  // Foreground artwork can legitimately interrupt a painted transparency
  // grid near the edge. Measure regularity only across samples assigned to
  // either fitted grid colour so subject pixels cannot hide the grid signal.
  const rmse = Math.sqrt(fittedSquaredError / Math.max(1, fitted));
  const fitFraction = fitted / Math.max(1, eligible);
  const coverageFraction = eligible / samples.length;
  return {
    tileSize,
    phaseX,
    phaseY,
    colours,
    separation,
    fitFraction,
    coverageFraction,
    rmse,
    score:
      (fitFraction * separation * Math.sqrt(coverageFraction)) /
      Math.max(1, rmse),
  };
}

export function detectPaintedTransparencyCheckerboard(
  data: Buffer | Uint8Array,
  width: number,
  height: number,
): CheckerboardDetectionEvidence {
  const source = { data: Buffer.from(data), width, height };
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 1 ||
    height <= 1 ||
    source.data.byteLength !== width * height * 4
  ) {
    throw new BackgroundAlphaRecoveryError(
      "BACKGROUND_RECOVERY_PIXEL_INPUT_INVALID",
      "Checkerboard detection requires exact RGBA dimensions.",
    );
  }
  const sampleSet = checkerSamples(source);
  let best: CheckerFit | null = null;
  for (const tileSize of CHECKER_TILE_SIZES) {
    if (width / tileSize < 4 || height / tileSize < 4) continue;
    const phases = [
      0,
      Math.floor(tileSize / 4),
      Math.floor(tileSize / 2),
      Math.floor((tileSize * 3) / 4),
    ];
    for (const phaseX of [...new Set(phases)]) {
      for (const phaseY of [...new Set(phases)]) {
        const fit = fitCheckerboard(sampleSet.samples, tileSize, phaseX, phaseY);
        if (fit && (!best || fit.score > best.score)) best = fit;
      }
    }
  }
  const neutralGrid = Boolean(
    best &&
      sampleSet.lowChromaFraction >= 0.78 &&
      ((best.separation >= 18 &&
        best.rmse <= 18 &&
        best.fitFraction >= 0.88 &&
        best.coverageFraction >= 0.3) ||
        // Image providers also paint low-contrast white/light-grey grids. A
        // weak colour delta is still decisive when it repeats across many
        // tiles, fits both parity classes tightly and owns most of the border.
        (best.separation >= 10 &&
          best.rmse <= 4 &&
          best.fitFraction >= 0.82 &&
          best.coverageFraction >= 0.5 &&
          width / best.tileSize >= 8 &&
          height / best.tileSize >= 8)),
  );
  const chromaticGrid = Boolean(
    best &&
      best.separation >= 32 &&
      best.rmse <= 12 &&
      best.fitFraction >= 0.92 &&
      best.coverageFraction >= 0.3,
  );
  const detected = Boolean(
    best &&
      // A thin real-alpha rim or a few token-transparent pixels must not let
      // an otherwise visible painted grid bypass classification.
      (sampleSet.opaqueFraction >= 0.25 ||
        sampleSet.visibleFraction >= 0.7) &&
      (neutralGrid || chromaticGrid),
  );
  const confidence = detected && best
    ? Math.min(
        1,
        best.fitFraction *
          Math.min(1, best.separation / 32) *
          Math.min(1, 18 / Math.max(1, best.rmse)),
      )
    : 0;
  return {
    detected,
    confidence: Number(confidence.toFixed(6)),
    sampledBorderPixels: sampleSet.sampledPixels,
    visibleBorderFraction: Number(sampleSet.visibleFraction.toFixed(6)),
    opaqueBorderFraction: Number(sampleSet.opaqueFraction.toFixed(6)),
    lowChromaBorderFraction: Number(sampleSet.lowChromaFraction.toFixed(6)),
    tileSize: best ? best.tileSize : null,
    phaseX: best ? best.phaseX : null,
    phaseY: best ? best.phaseY : null,
    colours:
      best
        ? best.colours.map((colour) => ({
            r: clampByte(colour.r),
            g: clampByte(colour.g),
            b: clampByte(colour.b),
          }))
        : [],
    colourSeparation: best ? Number(best.separation.toFixed(4)) : null,
    fitFraction: best ? Number(best.fitFraction.toFixed(6)) : null,
    coverageFraction:
      best ? Number(best.coverageFraction.toFixed(6)) : null,
    rmse: best ? Number(best.rmse.toFixed(4)) : null,
  };
}

function checkerMatte(
  detection: CheckerboardDetectionEvidence,
  x: number,
  y: number,
): Colour {
  const parity =
    (Math.floor((x + detection.phaseX!) / detection.tileSize!) +
      Math.floor((y + detection.phaseY!) / detection.tileSize!)) &
    1;
  return detection.colours[parity]!;
}

function projectionAlpha(
  red: number,
  green: number,
  blue: number,
  foreground: Colour,
  matte: Colour,
): number {
  const fr = foreground.r - matte.r;
  const fg = foreground.g - matte.g;
  const fb = foreground.b - matte.b;
  const denominator = fr * fr + fg * fg + fb * fb;
  if (denominator <= 1) return 0;
  const numerator =
    (red - matte.r) * fr +
    (green - matte.g) * fg +
    (blue - matte.b) * fb;
  return Math.max(0, Math.min(1, numerator / denominator));
}

function recoverChannel(
  source: number,
  matte: number,
  alpha: number,
  fallback: number,
): number {
  if (alpha <= 0.025) return fallback;
  return clampByte(matte + (source - matte) / alpha);
}

export function applyTransparentBleed(
  output: Buffer,
  width: number,
  height: number,
  radius: number,
): number {
  if (radius <= 0) return 0;
  const pixels = width * height;
  const queue = new Int32Array(pixels);
  const bleedDistance = new Uint8Array(pixels);
  bleedDistance.fill(UNREACHED);
  const bleedSource = new Int32Array(pixels);
  bleedSource.fill(-1);
  let head = 0;
  let tail = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    if (output[pixel * 4 + 3]! > 0) {
      bleedDistance[pixel] = 0;
      bleedSource[pixel] = pixel;
      queue[tail++] = pixel;
    }
  }
  while (head < tail) {
    const pixel = queue[head++]!;
    const currentDistance = bleedDistance[pixel]!;
    if (currentDistance >= radius) continue;
    const sourcePixel = bleedSource[pixel]!;
    neighbours(pixel, width, height, (next) => {
      if (bleedDistance[next] !== UNREACHED) return;
      bleedDistance[next] = currentDistance + 1;
      bleedSource[next] = sourcePixel;
      queue[tail++] = next;
    });
  }
  let count = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4;
    if (
      output[offset + 3] !== 0 ||
      bleedDistance[pixel]! <= 0 ||
      bleedDistance[pixel]! > radius ||
      bleedSource[pixel]! < 0
    ) {
      continue;
    }
    const sourceOffset = bleedSource[pixel]! * 4;
    output[offset] = output[sourceOffset]!;
    output[offset + 1] = output[sourceOffset + 1]!;
    output[offset + 2] = output[sourceOffset + 2]!;
    count += 1;
  }
  return count;
}

function outputStatistics(data: Buffer): Readonly<{
  transparentPixels: number;
  partialPixels: number;
  opaquePixels: number;
}> {
  let transparentPixels = 0;
  let partialPixels = 0;
  let opaquePixels = 0;
  for (let offset = 3; offset < data.byteLength; offset += 4) {
    if (data[offset] === 0) transparentPixels += 1;
    else if (data[offset] === 255) opaquePixels += 1;
    else partialPixels += 1;
  }
  return { transparentPixels, partialPixels, opaquePixels };
}

function edgeIsTransparent(data: Buffer, width: number, height: number): boolean {
  return borderIndices(width, height).every((pixel) => data[pixel * 4 + 3] === 0);
}

async function encodePng(data: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
}

function sourceEvidence(source: DecodedSource): BackgroundAlphaRecoveryEvidence["source"] {
  return {
    format: source.metadata.format ?? "unknown",
    width: source.width,
    height: source.height,
    pages: source.pages,
    hasAlpha: source.metadata.hasAlpha ?? false,
    sizeBytes: source.encoded.byteLength,
  };
}

function median(values: number[]): number {
  values.sort((left, right) => left - right);
  const middle = Math.floor(values.length / 2);
  return values.length % 2
    ? values[middle]!
    : (values[middle - 1]! + values[middle]!) / 2;
}

function fitVisibleMatteBand(
  source: DecodedSource,
  colour: Colour,
): MatteBandFit {
  const sampleSet = checkerSamples(source);
  let matchingPixels = 0;
  let fittedSquaredError = 0;
  for (const sample of sampleSet.samples) {
    const error = distance(sample.r, sample.g, sample.b, colour);
    if (error > 36) continue;
    matchingPixels += 1;
    fittedSquaredError += error * error;
  }
  const visiblePixels = sampleSet.samples.length;
  const matchingBorderFraction = sampleSet.sampledPixels
    ? matchingPixels / sampleSet.sampledPixels
    : 0;
  const matchingVisibleBorderFraction = visiblePixels
    ? matchingPixels / visiblePixels
    : 0;
  const rmse = Math.sqrt(fittedSquaredError / Math.max(1, matchingPixels));
  return {
    detected:
      matchingBorderFraction >= 0.7 &&
      matchingVisibleBorderFraction >= 0.86 &&
      rmse <= 28,
    sampledPixels: sampleSet.sampledPixels,
    visiblePixels,
    matchingPixels,
    matchingBorderFraction,
    matchingVisibleBorderFraction,
    visibleBorderFraction: sampleSet.opaqueFraction,
    rmse,
  };
}

function inferHighChromaMatte(source: DecodedSource): Readonly<{
  colour: Colour;
  hex: string;
  matchingBorderFraction: number;
  matchingVisibleBorderFraction: number;
  visibleBorderFraction: number;
  borderRmse: number;
}> | null {
  const borders = borderIndices(source.width, source.height);
  if (borders.every((pixel) => source.data[pixel * 4 + 3]! >= 254)) {
    let red = 0;
    let green = 0;
    let blue = 0;
    for (const pixel of borders) {
      const offset = pixel * 4;
      red += source.data[offset]!;
      green += source.data[offset + 1]!;
      blue += source.data[offset + 2]!;
    }
    const edgeColour = {
      r: clampByte(red / borders.length),
      g: clampByte(green / borders.length),
      b: clampByte(blue / borders.length),
    };
    const channels = [edgeColour.r, edgeColour.g, edgeColour.b];
    if (
      Math.max(...channels) - Math.min(...channels) >= 140 &&
      Math.max(...channels) >= 210 &&
      Math.min(...channels) <= 45
    ) {
      let matching = 0;
      let squaredError = 0;
      for (const pixel of borders) {
        const offset = pixel * 4;
        const error = distance(
          source.data[offset]!,
          source.data[offset + 1]!,
          source.data[offset + 2]!,
          edgeColour,
        );
        squaredError += error * error;
        if (error <= 36) matching += 1;
      }
      const matchingFraction = matching / borders.length;
      const edgeRmse = Math.sqrt(squaredError / borders.length);
      if (matchingFraction >= 0.86 && edgeRmse <= 28) {
        return {
          colour: edgeColour,
          hex: colourHex(edgeColour),
          matchingBorderFraction: matchingFraction,
          matchingVisibleBorderFraction: matchingFraction,
          visibleBorderFraction: 1,
          borderRmse: edgeRmse,
        };
      }
    }
  }
  const samples = checkerSamples(source).samples;
  if (samples.length < 32) return null;
  // A provider can add a token transparent rim around a still-painted matte.
  // The component-wise median of only visible border-band pixels resists both
  // that hidden RGB and bounded foreground interruptions.
  const colour = {
    r: clampByte(median(samples.map((sample) => sample.r))),
    g: clampByte(median(samples.map((sample) => sample.g))),
    b: clampByte(median(samples.map((sample) => sample.b))),
  };
  const channels = [colour.r, colour.g, colour.b];
  if (
    Math.max(...channels) - Math.min(...channels) < 140 ||
    Math.max(...channels) < 210 ||
    Math.min(...channels) > 45
  ) {
    return null;
  }
  const fit = fitVisibleMatteBand(source, colour);
  if (!fit.detected) return null;
  return {
    colour,
    hex: colourHex(colour),
    matchingBorderFraction: fit.matchingBorderFraction,
    matchingVisibleBorderFraction: fit.matchingVisibleBorderFraction,
    visibleBorderFraction: fit.visibleBorderFraction,
    borderRmse: fit.rmse,
  };
}

function classification(
  alpha: AlphaStatistics,
  nativeAlphaMeaningful: boolean,
  checkerboard: CheckerboardDetectionEvidence,
  inferredMatte: ReturnType<typeof inferHighChromaMatte>,
): BackgroundAlphaRecoveryEvidence["classification"] {
  return {
    sourceTransparentPixels: alpha.transparentPixels,
    sourcePartialPixels: alpha.partialPixels,
    sourceOpaquePixels: alpha.opaquePixels,
    transparentBorderFraction: alpha.transparentBorderFraction,
    nativeAlphaMeaningful,
    checkerboard,
    inferredMatte,
  };
}

async function preserveNativeAlpha(
  source: DecodedSource,
  alpha: AlphaStatistics,
  checkerboard: CheckerboardDetectionEvidence,
  inferredMatte: ReturnType<typeof inferHighChromaMatte>,
  options: BackgroundAlphaRecoveryOptions,
): Promise<BackgroundAlphaRecoveryResult> {
  if (!edgeIsTransparent(source.data, source.width, source.height)) {
    throw new BackgroundAlphaRecoveryError(
      "BACKGROUND_RECOVERY_NATIVE_EDGE_NOT_TRANSPARENT",
      "Native alpha must leave every canvas-edge pixel fully transparent.",
    );
  }
  const bleedRadius = boundedInteger(
    options.bleedRadius,
    2,
    0,
    32,
    "bleedRadius",
  );
  const output = Buffer.from(source.data);
  // Transparent RGB is not visible, but provider/editor preview colours can
  // leak into texture filtering. Canonicalize it before adding only bounded
  // subject-colour bleed back around the real silhouette.
  for (let offset = 0; offset < output.byteLength; offset += 4) {
    if (output[offset + 3] !== 0) continue;
    output[offset] = 0;
    output[offset + 1] = 0;
    output[offset + 2] = 0;
  }
  const transparentBleedPixels = applyTransparentBleed(
    output,
    source.width,
    source.height,
    bleedRadius,
  );
  const png = await encodePng(output, source.width, source.height);
  return {
    png,
    evidence: {
      schemaVersion: "2.0",
      strategy: "native-alpha-preserved",
      inputSha256: sha256(source.encoded),
      outputSha256: sha256(png),
      source: sourceEvidence(source),
      classification: classification(alpha, true, checkerboard, inferredMatte),
      output: {
        transparentPixels: alpha.transparentPixels,
        partialPixels: alpha.partialPixels,
        opaquePixels: alpha.opaquePixels,
        decontaminatedPixels: 0,
        transparentBleedPixels,
      },
      guarantees: {
        realAlpha: true,
        fakeCheckerboardAcceptedAsTransparency: false,
        transparentCanvasEdge: true,
        edgeConnectedBackgroundOnly: false,
        partialEdgeDecontamination: false,
        recompositionVerified: false,
      },
    },
  };
}

async function recoverCheckerboard(
  source: DecodedSource,
  alpha: AlphaStatistics,
  detection: CheckerboardDetectionEvidence,
  inferredMatte: ReturnType<typeof inferHighChromaMatte>,
  options: BackgroundAlphaRecoveryOptions,
): Promise<BackgroundAlphaRecoveryResult> {
  const connectionDistance = boundedNumber(
    options.checkerConnectionDistance,
    36,
    8,
    96,
    "checkerConnectionDistance",
  );
  const foregroundSeedDistance = boundedNumber(
    options.checkerForegroundSeedDistance,
    88,
    32,
    320,
    "checkerForegroundSeedDistance",
  );
  if (foregroundSeedDistance <= connectionDistance) {
    throw new BackgroundAlphaRecoveryError(
      "BACKGROUND_RECOVERY_OPTIONS_INVALID",
      "checkerForegroundSeedDistance must exceed checkerConnectionDistance.",
    );
  }
  const edgeSearchRadius = boundedInteger(
    options.edgeSearchRadius,
    12,
    1,
    64,
    "edgeSearchRadius",
  );
  const bleedRadius = boundedInteger(
    options.bleedRadius,
    2,
    0,
    32,
    "bleedRadius",
  );
  const minimumBorderFraction = boundedNumber(
    options.checkerMinimumBorderFraction,
    0.86,
    0.7,
    1,
    "checkerMinimumBorderFraction",
  );
  const maximumCompositeChannelError = boundedInteger(
    options.checkerMaximumCompositeChannelError,
    detection.colourSeparation !== null &&
      detection.colourSeparation < 18 &&
      detection.rmse !== null &&
      detection.rmse <= 4 &&
      detection.coverageFraction !== null &&
      detection.coverageFraction >= 0.5
      ? 24
      : 12,
    0,
    32,
    "checkerMaximumCompositeChannelError",
  );
  const pixels = source.width * source.height;
  const connectionSquared = connectionDistance ** 2;
  const foregroundSquared = foregroundSeedDistance ** 2;
  const matteDistance = new Uint32Array(pixels);
  const matteChoice = new Uint8Array(pixels);
  const eligible = new Uint8Array(pixels);
  const borders = borderIndices(source.width, source.height);
  let matchingBorderPixels = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const x = pixel % source.width;
    const y = Math.floor(pixel / source.width);
    const offset = pixel * 4;
    const red = source.data[offset]!;
    const green = source.data[offset + 1]!;
    const blue = source.data[offset + 2]!;
    const modelledMatte = checkerMatte(detection, x, y);
    const modelledChoice = detection.colours.indexOf(modelledMatte);
    const firstDistance = distance(red, green, blue, detection.colours[0]!);
    const secondDistance = distance(red, green, blue, detection.colours[1]!);
    // Generated preview grids are commonly resampled to a provider-specific
    // canvas, producing 23/24 px tile runs instead of one perfect integer
    // lattice. Detection still proves the alternating grid; recovery chooses
    // the locally matching one of its two proven colours so scaled phase drift
    // cannot leave stripes, halos or false opaque islands behind.
    const localChoice = firstDistance <= secondDistance ? 0 : 1;
    const chosen =
      Math.min(firstDistance, secondDistance) <= connectionDistance
        ? localChoice
        : modelledChoice;
    matteChoice[pixel] = chosen < 0 ? localChoice : chosen;
    const value = Math.min(firstDistance, secondDistance);
    const squared = Math.round(value * value);
    matteDistance[pixel] = squared;
    if (source.data[offset + 3]! < 254 || squared <= connectionSquared) {
      eligible[pixel] = 1;
    }
  }
  for (const pixel of borders) {
    if (eligible[pixel]) matchingBorderPixels += 1;
  }
  const borderFraction = matchingBorderPixels / borders.length;
  if (borderFraction < minimumBorderFraction) {
    throw new BackgroundAlphaRecoveryError(
      "BACKGROUND_RECOVERY_CHECKERBOARD_BORDER_INSUFFICIENT",
      `Only ${(borderFraction * 100).toFixed(2)}% of the canvas edge matches the detected grid.`,
    );
  }

  const connected = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  let head = 0;
  let tail = 0;
  for (const pixel of borders) {
    if (!eligible[pixel] || connected[pixel]) continue;
    connected[pixel] = 1;
    queue[tail++] = pixel;
  }
  while (head < tail) {
    const pixel = queue[head++]!;
    neighbours(pixel, source.width, source.height, (next) => {
      if (!eligible[next] || connected[next]) return;
      connected[next] = 1;
      queue[tail++] = next;
    });
  }
  const connectedBackgroundPixels = tail;
  if (!connectedBackgroundPixels || connectedBackgroundPixels === pixels) {
    throw new BackgroundAlphaRecoveryError(
      "BACKGROUND_RECOVERY_CHECKERBOARD_SEGMENTATION_INVALID",
      "The detected grid did not separate a visible foreground.",
    );
  }

  const backgroundDistance = new Uint8Array(pixels);
  backgroundDistance.fill(UNREACHED);
  const nearestBackground = new Int32Array(pixels);
  nearestBackground.fill(-1);
  head = 0;
  tail = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    if (!connected[pixel]) continue;
    backgroundDistance[pixel] = 0;
    let boundary = false;
    neighbours(pixel, source.width, source.height, (next) => {
      if (!connected[next]) boundary = true;
    });
    if (boundary) {
      nearestBackground[pixel] = pixel;
      queue[tail++] = pixel;
    }
  }
  while (head < tail) {
    const pixel = queue[head++]!;
    const currentDistance = backgroundDistance[pixel]!;
    if (currentDistance >= edgeSearchRadius) continue;
    neighbours(pixel, source.width, source.height, (next) => {
      if (backgroundDistance[next] !== UNREACHED) return;
      backgroundDistance[next] = currentDistance + 1;
      nearestBackground[next] = nearestBackground[pixel]!;
      queue[tail++] = next;
    });
  }

  const nearestForeground = new Int32Array(pixels);
  nearestForeground.fill(-1);
  const foregroundDistance = new Uint8Array(pixels);
  foregroundDistance.fill(UNREACHED);
  head = 0;
  tail = 0;
  let confidentForegroundSeeds = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    let touchesConnectedBackground = false;
    neighbours(pixel, source.width, source.height, (next) => {
      if (connected[next]) touchesConnectedBackground = true;
    });
    if (
      !connected[pixel] &&
      !touchesConnectedBackground &&
      matteDistance[pixel]! >= foregroundSquared
    ) {
      nearestForeground[pixel] = pixel;
      foregroundDistance[pixel] = 0;
      queue[tail++] = pixel;
      confidentForegroundSeeds += 1;
    }
  }
  if (!confidentForegroundSeeds) {
    throw new BackgroundAlphaRecoveryError(
      "BACKGROUND_RECOVERY_CHECKERBOARD_FOREGROUND_MISSING",
      "No confident foreground colour could be separated from the detected grid.",
    );
  }
  head = 0;
  while (head < tail) {
    const pixel = queue[head++]!;
    const currentDistance = foregroundDistance[pixel]!;
    if (currentDistance >= edgeSearchRadius) continue;
    const seed = nearestForeground[pixel]!;
    neighbours(pixel, source.width, source.height, (next) => {
      if (foregroundDistance[next] !== UNREACHED) return;
      foregroundDistance[next] = currentDistance + 1;
      nearestForeground[next] = seed;
      queue[tail++] = next;
    });
  }

  const output = Buffer.from(source.data);
  let edgeBandPixels = 0;
  let decontaminatedPixels = 0;
  let compositeMismatchPixels = 0;
  let checkedCompositePixels = 0;
  let maximumObservedCompositeChannelError = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const x = pixel % source.width;
    const y = Math.floor(pixel / source.width);
    const offset = pixel * 4;
    const background = connected[pixel] === 1;
    const localBackgroundPixel = nearestBackground[pixel]!;
    const localBackgroundOffset = localBackgroundPixel * 4;
    const matte = background
      ? {
          r: source.data[offset]!,
          g: source.data[offset + 1]!,
          b: source.data[offset + 2]!,
        }
      : localBackgroundPixel >= 0
        ? {
            r: source.data[localBackgroundOffset]!,
            g: source.data[localBackgroundOffset + 1]!,
            b: source.data[localBackgroundOffset + 2]!,
          }
        : detection.colours[matteChoice[pixel]!]!;
    const matteLike = matteDistance[pixel]! <= connectionSquared;
    const edgeCandidate =
      background ||
      (!matteLike && backgroundDistance[pixel]! <= edgeSearchRadius);
    const nearForeground =
      foregroundDistance[pixel]! <= edgeSearchRadius &&
      nearestForeground[pixel]! >= 0;
    let alphaValue = background ? 0 : 1;
    let red = source.data[offset]!;
    let green = source.data[offset + 1]!;
    let blue = source.data[offset + 2]!;
    if (edgeCandidate && nearForeground) {
      edgeBandPixels += 1;
      const seedOffset = nearestForeground[pixel]! * 4;
      const foreground = {
        r: source.data[seedOffset]!,
        g: source.data[seedOffset + 1]!,
        b: source.data[seedOffset + 2]!,
      };
      alphaValue = projectionAlpha(red, green, blue, foreground, matte);
      if (alphaValue > 0.005 && alphaValue < 0.995) {
        const nextRed = recoverChannel(red, matte.r, alphaValue, foreground.r);
        const nextGreen = recoverChannel(
          green,
          matte.g,
          alphaValue,
          foreground.g,
        );
        const nextBlue = recoverChannel(blue, matte.b, alphaValue, foreground.b);
        if (nextRed !== red || nextGreen !== green || nextBlue !== blue) {
          decontaminatedPixels += 1;
        }
        red = nextRed;
        green = nextGreen;
        blue = nextBlue;
      }
    }
    const finalAlpha =
      alphaValue <= 0.005
        ? 0
        : alphaValue >= 0.995
          ? 255
          : clampByte(alphaValue * 255);
    output[offset] = finalAlpha === 0 ? 0 : red;
    output[offset + 1] = finalAlpha === 0 ? 0 : green;
    output[offset + 2] = finalAlpha === 0 ? 0 : blue;
    output[offset + 3] = finalAlpha;
    // Existing alpha is not evidence about the RGB matte that would have
    // produced that pixel. Verify every originally visible pixel, while
    // allowing a genuine transparent rim to become part of the recovered
    // background rather than a fake-grid bypass.
    if (source.data[offset + 3]! < 254) continue;
    checkedCompositePixels += 1;
    let pixelMismatch = false;
    const matteChannels = [matte.r, matte.g, matte.b];
    for (let channel = 0; channel < 3; channel += 1) {
      const recomposited = Math.round(
        output[offset + channel]! * (finalAlpha / 255) +
          matteChannels[channel]! * (1 - finalAlpha / 255),
      );
      const error = Math.abs(recomposited - source.data[offset + channel]!);
      maximumObservedCompositeChannelError = Math.max(
        maximumObservedCompositeChannelError,
        error,
      );
      if (error > maximumCompositeChannelError) pixelMismatch = true;
    }
    if (pixelMismatch) compositeMismatchPixels += 1;
  }
  if (compositeMismatchPixels) {
    throw new BackgroundAlphaRecoveryError(
      "BACKGROUND_RECOVERY_CHECKERBOARD_COMPOSITE_DRIFT",
      `${compositeMismatchPixels} recovered pixels exceeded the recomposition tolerance; maximum observed channel error was ${maximumObservedCompositeChannelError}.`,
    );
  }
  const transparentBleedPixels = applyTransparentBleed(
    output,
    source.width,
    source.height,
    bleedRadius,
  );
  const outputAlpha = outputStatistics(output);
  if (
    !outputAlpha.transparentPixels ||
    outputAlpha.opaquePixels + outputAlpha.partialPixels === 0 ||
    !edgeIsTransparent(output, source.width, source.height)
  ) {
    throw new BackgroundAlphaRecoveryError(
      "BACKGROUND_RECOVERY_CHECKERBOARD_OUTPUT_INVALID",
      "Checkerboard recovery did not produce visible content on a transparent canvas edge.",
    );
  }
  const png = await encodePng(output, source.width, source.height);
  return {
    png,
    evidence: {
      schemaVersion: "2.0",
      strategy: "checkerboard-recovery",
      inputSha256: sha256(source.encoded),
      outputSha256: sha256(png),
      source: sourceEvidence(source),
      classification: classification(alpha, false, detection, inferredMatte),
      border: {
        pixels: borders.length,
        matteLikePixels: matchingBorderPixels,
        matteLikeFraction: borderFraction,
      },
      output: {
        ...outputAlpha,
        decontaminatedPixels,
        transparentBleedPixels,
      },
      checkerboardRecovery: {
        connectedBackgroundPixels,
        confidentForegroundSeeds,
        edgeBandPixels,
        compositeMismatchPixels,
        maximumCompositeChannelError: maximumObservedCompositeChannelError,
      },
      recomposition: {
        checkedPixels: checkedCompositePixels,
        mismatchPixels: compositeMismatchPixels,
        maximumObservedChannelError: maximumObservedCompositeChannelError,
        maximumAllowedChannelError: maximumCompositeChannelError,
      },
      guarantees: {
        realAlpha: true,
        fakeCheckerboardAcceptedAsTransparency: false,
        transparentCanvasEdge: true,
        edgeConnectedBackgroundOnly: true,
        partialEdgeDecontamination: true,
        recompositionVerified: true,
      },
    },
  };
}

function chromaOptions(
  options: BackgroundAlphaRecoveryOptions,
  matteColour: string,
  inferred: boolean,
): ChromaKeyExtractionOptions {
  return {
    matteColour,
    ...(options.connectionDistance === undefined
      ? inferred
        ? { connectionDistance: 96 }
        : {}
      : { connectionDistance: options.connectionDistance }),
    ...(options.opaqueSeedDistance === undefined
      ? inferred
        ? { opaqueSeedDistance: 180 }
        : {}
      : { opaqueSeedDistance: options.opaqueSeedDistance }),
    ...(options.edgeSearchRadius === undefined
      ? {}
      : { edgeSearchRadius: options.edgeSearchRadius }),
    ...(options.bleedRadius === undefined
      ? {}
      : { bleedRadius: options.bleedRadius }),
    ...(options.minimumBorderMatteFraction === undefined
      ? inferred
        ? { minimumBorderMatteFraction: 0.75 }
        : {}
      : { minimumBorderMatteFraction: options.minimumBorderMatteFraction }),
    ...(options.maximumCompositeChannelError === undefined
      ? {}
      : {
          maximumCompositeChannelError:
            options.maximumCompositeChannelError,
        }),
    ...(options.maximumInputBytes === undefined
      ? {}
      : { maximumInputBytes: options.maximumInputBytes }),
    ...(options.maximumPixels === undefined
      ? {}
      : { maximumPixels: options.maximumPixels }),
  };
}

function compositeExistingAlphaOverMatte(
  source: DecodedSource,
  matte: Colour,
): Buffer {
  const output = Buffer.allocUnsafe(source.data.byteLength);
  for (let offset = 0; offset < source.data.byteLength; offset += 4) {
    const alpha = source.data[offset + 3]! / 255;
    output[offset] = clampByte(
      source.data[offset]! * alpha + matte.r * (1 - alpha),
    );
    output[offset + 1] = clampByte(
      source.data[offset + 1]! * alpha + matte.g * (1 - alpha),
    );
    output[offset + 2] = clampByte(
      source.data[offset + 2]! * alpha + matte.b * (1 - alpha),
    );
    output[offset + 3] = 255;
  }
  return output;
}

async function recoverChroma(
  source: DecodedSource,
  alpha: AlphaStatistics,
  checkerboard: CheckerboardDetectionEvidence,
  inferredMatte: NonNullable<ReturnType<typeof inferHighChromaMatte>> | null,
  options: BackgroundAlphaRecoveryOptions,
  matteColour: string,
  strategy: "declared-chroma-key" | "inferred-high-chroma-key",
  matteBandFit: MatteBandFit | null = null,
): Promise<BackgroundAlphaRecoveryResult> {
  const matte = parseColour(matteColour);
  const sourceNonOpaquePixels = alpha.transparentPixels + alpha.partialPixels;
  if (sourceNonOpaquePixels && !matteBandFit?.detected) {
    throw new BackgroundAlphaRecoveryError(
      "BACKGROUND_RECOVERY_MATTE_ALPHA_BYPASS_UNPROVEN",
      "Existing alpha may be flattened only after a dominant visible high-chroma matte is proven inside the transparent rim.",
    );
  }
  const compositeSource = sourceNonOpaquePixels
    ? compositeExistingAlphaOverMatte(source, matte)
    : source.data;
  const extractionInput = sourceNonOpaquePixels
    ? await encodePng(compositeSource, source.width, source.height)
    : source.encoded;
  const extraction = await extractChromaKeyAlpha(
    extractionInput,
    chromaOptions(options, matteColour, strategy === "inferred-high-chroma-key"),
  );
  const evidence = extraction.evidence;
  const decoded = await sharp(extraction.png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (!edgeIsTransparent(decoded.data, decoded.info.width, decoded.info.height)) {
    throw new BackgroundAlphaRecoveryError(
      "BACKGROUND_RECOVERY_CHROMA_EDGE_NOT_TRANSPARENT",
      "Chroma extraction did not produce a fully transparent canvas edge.",
    );
  }
  const recomposition = evidence.recomposition;
  if (recomposition.mismatchPixels) {
    throw new BackgroundAlphaRecoveryError(
      "BACKGROUND_RECOVERY_CHROMA_COMPOSITE_DRIFT",
      `${recomposition.mismatchPixels} extracted pixels exceeded the recomposition tolerance; maximum observed channel error was ${recomposition.maximumObservedChannelError}.`,
    );
  }
  return {
    png: extraction.png,
    evidence: {
      ...evidence,
      schemaVersion: "2.0",
      strategy,
      inputSha256: sha256(source.encoded),
      source: sourceEvidence(source),
      classification: classification(
        alpha,
        false,
        checkerboard,
        inferredMatte,
      ),
      ...(sourceNonOpaquePixels && matteBandFit
        ? {
            matteAlphaBypassRecovery: {
              sourceNonOpaquePixels,
              sampledBorderBandPixels: matteBandFit.sampledPixels,
              visibleBorderBandPixels: matteBandFit.visiblePixels,
              matchingBorderFraction: matteBandFit.matchingBorderFraction,
              matchingVisibleBorderFraction:
                matteBandFit.matchingVisibleBorderFraction,
              borderRmse: matteBandFit.rmse,
            },
          }
        : {}),
      recomposition,
      guarantees: {
        realAlpha: true,
        fakeCheckerboardAcceptedAsTransparency: false,
        transparentCanvasEdge: true,
        edgeConnectedBackgroundOnly: true,
        partialEdgeDecontamination: true,
        recompositionVerified: true,
      },
    },
  };
}

export async function recoverBackgroundAlpha(
  input: Buffer | Uint8Array,
  options: BackgroundAlphaRecoveryOptions = {},
): Promise<BackgroundAlphaRecoveryResult> {
  const source = await decodeSource(input, options);
  const alpha = alphaStatistics(source);
  const checkerboard = detectPaintedTransparencyCheckerboard(
    source.data,
    source.width,
    source.height,
  );
  const inferredMatte =
    options.allowHighChromaInference === false
      ? null
      : inferHighChromaMatte(source);
  const declaredColour = options.matteColour
    ? parseColour(options.matteColour)
    : null;
  const declaredMatteBand = declaredColour
    ? fitVisibleMatteBand(source, declaredColour)
    : null;
  const inferredMatteBand = inferredMatte
    ? fitVisibleMatteBand(source, inferredMatte.colour)
    : null;
  const inferredPreferredToDeclared = Boolean(
    declaredColour &&
      inferredMatte &&
      inferredMatteBand?.detected &&
      distance(
        declaredColour.r,
        declaredColour.g,
        declaredColour.b,
        inferredMatte.colour,
      ) >= 6,
  );
  const sourceNonOpaquePixels = alpha.transparentPixels + alpha.partialPixels;
  const pixelCount = source.width * source.height;
  const minimumNativeTransparentFraction = boundedNumber(
    options.minimumNativeTransparentFraction,
    0.005,
    0,
    0.5,
    "minimumNativeTransparentFraction",
  );
  const minimumNativeTransparentBorderFraction = boundedNumber(
    options.minimumNativeTransparentBorderFraction,
    1,
    0.5,
    1,
    "minimumNativeTransparentBorderFraction",
  );
  const nativeAlphaMeaningful =
    !checkerboard.detected &&
    (source.metadata.hasAlpha ?? false) &&
    (alpha.transparentPixels + alpha.partialPixels) / pixelCount >=
      minimumNativeTransparentFraction &&
    alpha.transparentBorderFraction >= minimumNativeTransparentBorderFraction;
  if (checkerboard.detected) {
    if (options.allowCheckerboardRecovery === false) {
      throw new BackgroundAlphaRecoveryError(
        "BACKGROUND_RECOVERY_CHECKERBOARD_FORBIDDEN",
        "A visible painted transparency checkerboard was detected and checkerboard recovery is disabled.",
      );
    }
    return recoverCheckerboard(
      source,
      alpha,
      checkerboard,
      inferredMatte,
      options,
    );
  }

  // Do not let a token transparent rim cause a still-painted solid matte to
  // bypass extraction. The visible border band must prove dominant ownership
  // before existing alpha is composited over that matte and reconstructed.
  if (
    sourceNonOpaquePixels &&
    inferredPreferredToDeclared &&
    inferredMatte &&
    inferredMatteBand?.detected
  ) {
    return recoverChroma(
      source,
      alpha,
      checkerboard,
      inferredMatte,
      options,
      inferredMatte.hex,
      "inferred-high-chroma-key",
      inferredMatteBand,
    );
  }
  if (sourceNonOpaquePixels && options.matteColour && declaredMatteBand?.detected) {
    return recoverChroma(
      source,
      alpha,
      checkerboard,
      inferredMatte,
      options,
      options.matteColour,
      "declared-chroma-key",
      declaredMatteBand,
    );
  }
  if (sourceNonOpaquePixels && inferredMatte && inferredMatteBand?.detected) {
    return recoverChroma(
      source,
      alpha,
      checkerboard,
      inferredMatte,
      options,
      inferredMatte.hex,
      "inferred-high-chroma-key",
      inferredMatteBand,
    );
  }
  if (nativeAlphaMeaningful) {
    return preserveNativeAlpha(
      source,
      alpha,
      checkerboard,
      inferredMatte,
      options,
    );
  }

  let declaredFailure: ChromaKeyExtractionError | null = null;
  if (inferredPreferredToDeclared && inferredMatte) {
    return recoverChroma(
      source,
      alpha,
      checkerboard,
      inferredMatte,
      options,
      inferredMatte.hex,
      "inferred-high-chroma-key",
    );
  }
  if (options.matteColour) {
    try {
      return await recoverChroma(
        source,
        alpha,
        checkerboard,
        inferredMatte,
        options,
        options.matteColour,
        "declared-chroma-key",
      );
    } catch (error: unknown) {
      if (
        error instanceof ChromaKeyExtractionError &&
        error.code === "CHROMA_KEY_BORDER_MATTE_INSUFFICIENT"
      ) {
        declaredFailure = error;
      } else {
        throw error;
      }
    }
  }
  if (inferredMatte) {
    return recoverChroma(
      source,
      alpha,
      checkerboard,
      inferredMatte,
      options,
      inferredMatte.hex,
      "inferred-high-chroma-key",
    );
  }
  throw new BackgroundAlphaRecoveryError(
    "BACKGROUND_RECOVERY_UNRECOGNIZED",
    declaredFailure
      ? `${declaredFailure.message} No safe alternative alpha source was detected.`
      : "No meaningful native alpha, painted checkerboard, declared matte or confidently inferred high-chroma matte was found.",
  );
}
