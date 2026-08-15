import { createHash } from "node:crypto";

import sharp, { type Metadata } from "sharp";

const DEFAULT_MAXIMUM_INPUT_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAXIMUM_PIXELS = 8_294_400;
const UNREACHED = 255;

export interface ChromaKeyExtractionOptions {
  readonly matteColour: string;
  readonly connectionDistance?: number;
  readonly opaqueSeedDistance?: number;
  readonly edgeSearchRadius?: number;
  readonly bleedRadius?: number;
  readonly minimumBorderMatteFraction?: number;
  readonly maximumInputBytes?: number;
  readonly maximumPixels?: number;
}

export interface ChromaKeyExtractionEvidence {
  readonly schemaVersion: "1.0";
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
  readonly matte: Readonly<{ r: number; g: number; b: number; hex: string }>;
  readonly thresholds: Readonly<{
    connectionDistance: number;
    opaqueSeedDistance: number;
    edgeSearchRadius: number;
    bleedRadius: number;
    minimumBorderMatteFraction: number;
  }>;
  readonly border: Readonly<{
    pixels: number;
    matteLikePixels: number;
    matteLikeFraction: number;
  }>;
  readonly segmentation: Readonly<{
    connectedBackgroundPixels: number;
    connectedBackgroundFraction: number;
    confidentForegroundSeeds: number;
    edgeBandPixels: number;
    preservedInteriorMatteLikePixels: number;
  }>;
  readonly output: Readonly<{
    transparentPixels: number;
    partialPixels: number;
    opaquePixels: number;
    decontaminatedPixels: number;
    transparentBleedPixels: number;
  }>;
}

export interface ChromaKeyExtractionResult {
  readonly png: Buffer;
  readonly evidence: ChromaKeyExtractionEvidence;
}

export class ChromaKeyExtractionError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "ChromaKeyExtractionError";
    this.code = code;
  }
}

type Matte = Readonly<{ r: number; g: number; b: number; hex: string }>;
type NormalizedOptions = Readonly<{
  matte: Matte;
  connectionDistance: number;
  opaqueSeedDistance: number;
  edgeSearchRadius: number;
  bleedRadius: number;
  minimumBorderMatteFraction: number;
  maximumInputBytes: number;
  maximumPixels: number;
}>;

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function finite(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const result = value ?? fallback;
  if (!Number.isFinite(result) || result < minimum || result > maximum) {
    throw new ChromaKeyExtractionError(
      "CHROMA_KEY_OPTIONS_INVALID",
      `${name} must be between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

function integer(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < minimum || result > maximum) {
    throw new ChromaKeyExtractionError(
      "CHROMA_KEY_OPTIONS_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

function parseMatte(value: string): Matte {
  const normalized = value.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(normalized)) {
    throw new ChromaKeyExtractionError(
      "CHROMA_KEY_MATTE_INVALID",
      "matteColour must use #RRGGBB format.",
    );
  }
  const matte = {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
    hex: normalized,
  };
  const channels = [matte.r, matte.g, matte.b];
  if (
    Math.max(...channels) - Math.min(...channels) < 160 ||
    (Math.max(...channels) < 240 && Math.min(...channels) > 15)
  ) {
    throw new ChromaKeyExtractionError(
      "CHROMA_KEY_MATTE_UNSAFE",
      "matteColour must be a declared high-chroma key; black, white and grey are unsafe for automatic extraction.",
    );
  }
  return matte;
}

const CHECKERBOARD_TILE_SIZES = [
  2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 48, 64, 96, 128,
] as const;

function fakeCheckerboardAtBorder(
  data: Uint8Array,
  width: number,
  height: number,
): Readonly<{ detected: boolean; tileSize: number | null; confidence: number }> {
  const band = Math.max(12, Math.floor(Math.min(width, height) * 0.16));
  const borderPixels =
    width * height -
    Math.max(0, width - band * 2) * Math.max(0, height - band * 2);
  const stride = Math.max(1, Math.ceil(Math.sqrt(borderPixels / 40_000)));
  let bestConfidence = 0;
  let bestTile: number | null = null;

  for (const tileSize of CHECKERBOARD_TILE_SIZES) {
    if (width / tileSize < 4 || height / tileSize < 4) continue;
    const phases = [
      0,
      Math.floor(tileSize / 4),
      Math.floor(tileSize / 2),
      Math.floor((tileSize * 3) / 4),
    ];
    for (const phaseX of phases) {
      for (const phaseY of phases) {
        const sums = [
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ];
        for (let y = 0; y < height; y += stride) {
          for (let x = 0; x < width; x += stride) {
            if (x >= band && x < width - band && y >= band && y < height - band) {
              continue;
            }
            const parity =
              (Math.floor((x + phaseX) / tileSize) +
                Math.floor((y + phaseY) / tileSize)) &
              1;
            const offset = (y * width + x) * 4;
            sums[parity]![0] += data[offset]!;
            sums[parity]![1] += data[offset + 1]!;
            sums[parity]![2] += data[offset + 2]!;
            sums[parity]![3] += 1;
          }
        }
        if (sums[0]![3] < 32 || sums[1]![3] < 32) continue;
        const means = sums.map((sum) => [
          sum[0]! / sum[3]!,
          sum[1]! / sum[3]!,
          sum[2]! / sum[3]!,
        ]);
        const separation = Math.hypot(
          means[0]![0]! - means[1]![0]!,
          means[0]![1]! - means[1]![1]!,
          means[0]![2]! - means[1]![2]!,
        );
        if (separation < 24) continue;
        const fitDistance = Math.max(14, separation * 0.28);
        let considered = 0;
        let fitted = 0;
        let squaredError = 0;
        for (let y = 0; y < height; y += stride) {
          for (let x = 0; x < width; x += stride) {
            if (x >= band && x < width - band && y >= band && y < height - band) {
              continue;
            }
            const parity =
              (Math.floor((x + phaseX) / tileSize) +
                Math.floor((y + phaseY) / tileSize)) &
              1;
            const offset = (y * width + x) * 4;
            const distance = Math.hypot(
              data[offset]! - means[parity]![0]!,
              data[offset + 1]! - means[parity]![1]!,
              data[offset + 2]! - means[parity]![2]!,
            );
            considered += 1;
            squaredError += distance * distance;
            if (distance <= fitDistance) fitted += 1;
          }
        }
        const fit = fitted / considered;
        const rmse = Math.sqrt(squaredError / considered);
        const confidence = fit * Math.min(1, separation / 48) * Math.min(1, 18 / Math.max(1, rmse));
        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestTile = tileSize;
        }
      }
    }
  }
  return {
    detected: bestTile !== null && bestConfidence >= 0.88,
    tileSize: bestTile,
    confidence: Number(Math.min(1, bestConfidence).toFixed(6)),
  };
}

function normalize(options: ChromaKeyExtractionOptions): NormalizedOptions {
  const connectionDistance = finite(
    options.connectionDistance,
    140,
    1,
    441,
    "connectionDistance",
  );
  const opaqueSeedDistance = finite(
    options.opaqueSeedDistance,
    220,
    1,
    441,
    "opaqueSeedDistance",
  );
  if (opaqueSeedDistance <= connectionDistance) {
    throw new ChromaKeyExtractionError(
      "CHROMA_KEY_OPTIONS_INVALID",
      "opaqueSeedDistance must be greater than connectionDistance.",
    );
  }
  return {
    matte: parseMatte(options.matteColour),
    connectionDistance,
    opaqueSeedDistance,
    edgeSearchRadius: integer(
      options.edgeSearchRadius,
      12,
      1,
      64,
      "edgeSearchRadius",
    ),
    bleedRadius: integer(options.bleedRadius, 2, 0, 32, "bleedRadius"),
    minimumBorderMatteFraction: finite(
      options.minimumBorderMatteFraction,
      0.7,
      0.05,
      1,
      "minimumBorderMatteFraction",
    ),
    maximumInputBytes: integer(
      options.maximumInputBytes,
      DEFAULT_MAXIMUM_INPUT_BYTES,
      1_024,
      512 * 1024 * 1024,
      "maximumInputBytes",
    ),
    maximumPixels: integer(
      options.maximumPixels,
      DEFAULT_MAXIMUM_PIXELS,
      1,
      67_108_864,
      "maximumPixels",
    ),
  };
}

function squaredDistance(r: number, g: number, b: number, colour: Matte): number {
  const dr = r - colour.r;
  const dg = g - colour.g;
  const db = b - colour.b;
  return dr * dr + dg * dg + db * db;
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

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function projectionAlpha(
  r: number,
  g: number,
  b: number,
  foregroundR: number,
  foregroundG: number,
  foregroundB: number,
  matte: Matte,
): number {
  const fr = foregroundR - matte.r;
  const fg = foregroundG - matte.g;
  const fb = foregroundB - matte.b;
  const denominator = fr * fr + fg * fg + fb * fb;
  if (denominator <= 1) return 0;
  const numerator =
    (r - matte.r) * fr +
    (g - matte.g) * fg +
    (b - matte.b) * fb;
  return Math.max(0, Math.min(1, numerator / denominator));
}

function recoverColour(
  channel: number,
  matteChannel: number,
  alpha: number,
  fallback: number,
): number {
  if (alpha <= 0.025) return fallback;
  return clampByte(matteChannel + (channel - matteChannel) / alpha);
}

function decodeError(message: string): ChromaKeyExtractionError {
  return new ChromaKeyExtractionError("CHROMA_KEY_DECODE_FAILED", message);
}

export async function extractChromaKeyAlpha(
  input: Buffer | Uint8Array,
  options: ChromaKeyExtractionOptions,
): Promise<ChromaKeyExtractionResult> {
  const settings = normalize(options);
  const source = Buffer.from(input);
  if (!source.byteLength) {
    throw new ChromaKeyExtractionError(
      "CHROMA_KEY_INPUT_EMPTY",
      "Chroma-key candidate is empty.",
    );
  }
  if (source.byteLength > settings.maximumInputBytes) {
    throw new ChromaKeyExtractionError(
      "CHROMA_KEY_INPUT_TOO_LARGE",
      `Chroma-key candidate exceeds ${settings.maximumInputBytes} bytes.`,
    );
  }

  const decoderOptions = {
    failOn: "error" as const,
    limitInputPixels: settings.maximumPixels,
    sequentialRead: true,
  };
  let metadata: Metadata;
  try {
    metadata = await sharp(source, decoderOptions).metadata();
  } catch {
    throw decodeError("Chroma-key candidate could not be decoded.");
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const pages = metadata.pages ?? 1;
  if (width <= 0 || height <= 0 || width * height > settings.maximumPixels) {
    throw new ChromaKeyExtractionError(
      "CHROMA_KEY_DIMENSIONS_INVALID",
      "Chroma-key candidate has invalid or excessive dimensions.",
    );
  }
  if (pages !== 1) {
    throw new ChromaKeyExtractionError(
      "CHROMA_KEY_MULTIPAGE_UNSUPPORTED",
      "Chroma-key extraction accepts exactly one image page.",
    );
  }

  let decoded: Awaited<
    ReturnType<ReturnType<ReturnType<typeof sharp>["raw"]>["toBuffer"]>
  >;
  try {
    decoded = await sharp(source, decoderOptions)
      .ensureAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw decodeError("Chroma-key candidate could not be decoded to RGBA.");
  }
  if (decoded.info.channels !== 4) {
    throw new ChromaKeyExtractionError(
      "CHROMA_KEY_CHANNELS_INVALID",
      "Chroma-key candidate did not decode to RGBA.",
    );
  }

  const pixels = width * height;
  const sourceData = decoded.data;
  let nonOpaqueSourcePixels = 0;
  for (let offset = 3; offset < sourceData.byteLength; offset += 4) {
    if (sourceData[offset] !== 255) nonOpaqueSourcePixels += 1;
  }
  if (nonOpaqueSourcePixels > 0) {
    throw new ChromaKeyExtractionError(
      "CHROMA_KEY_SOURCE_ALPHA_INVALID",
      `Chroma-key extraction requires a fully opaque intermediate; ${nonOpaqueSourcePixels} pixels already contain alpha. Use native-alpha QA instead.`,
    );
  }
  const checkerboard = fakeCheckerboardAtBorder(sourceData, width, height);
  if (checkerboard.detected) {
    throw new ChromaKeyExtractionError(
      "CHROMA_KEY_FAKE_TRANSPARENCY_GRID",
      `A periodic painted checkerboard was detected at the canvas border (tile ${checkerboard.tileSize}, confidence ${checkerboard.confidence}).`,
    );
  }
  const output = Buffer.alloc(sourceData.byteLength);
  const matteDistance = new Uint32Array(pixels);
  const connectedBackground = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  const connectionSquared = settings.connectionDistance ** 2;
  const opaqueSquared = settings.opaqueSeedDistance ** 2;

  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4;
    matteDistance[pixel] = squaredDistance(
      sourceData[offset]!,
      sourceData[offset + 1]!,
      sourceData[offset + 2]!,
      settings.matte,
    );
  }

  const borders = borderIndices(width, height);
  const borderMatteLike = borders.filter(
    (pixel) => matteDistance[pixel]! <= connectionSquared,
  );
  const borderMatteFraction = borderMatteLike.length / borders.length;
  if (borderMatteFraction < settings.minimumBorderMatteFraction) {
    throw new ChromaKeyExtractionError(
      "CHROMA_KEY_BORDER_MATTE_INSUFFICIENT",
      `Only ${(borderMatteFraction * 100).toFixed(2)}% of border pixels match ${settings.matte.hex}; ${(settings.minimumBorderMatteFraction * 100).toFixed(2)}% is required.`,
    );
  }

  let head = 0;
  let tail = 0;
  for (const pixel of borderMatteLike) {
    if (connectedBackground[pixel]) continue;
    connectedBackground[pixel] = 1;
    queue[tail++] = pixel;
  }
  while (head < tail) {
    const pixel = queue[head++]!;
    neighbours(pixel, width, height, (neighbour) => {
      if (
        !connectedBackground[neighbour] &&
        matteDistance[neighbour]! <= connectionSquared
      ) {
        connectedBackground[neighbour] = 1;
        queue[tail++] = neighbour;
      }
    });
  }
  const connectedBackgroundPixels = tail;
  if (!connectedBackgroundPixels || connectedBackgroundPixels === pixels) {
    throw new ChromaKeyExtractionError(
      "CHROMA_KEY_SEGMENTATION_EMPTY",
      connectedBackgroundPixels === pixels
        ? "The candidate contains no distinguishable foreground outside the border-connected matte."
        : "The candidate contains no border-connected matte.",
    );
  }

  const backgroundDistance = new Uint8Array(pixels);
  backgroundDistance.fill(UNREACHED);
  head = 0;
  tail = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    if (!connectedBackground[pixel]) continue;
    backgroundDistance[pixel] = 0;
    let boundary = false;
    neighbours(pixel, width, height, (neighbour) => {
      if (!connectedBackground[neighbour]) boundary = true;
    });
    if (boundary) queue[tail++] = pixel;
  }
  while (head < tail) {
    const pixel = queue[head++]!;
    const distance = backgroundDistance[pixel]!;
    if (distance >= settings.edgeSearchRadius) continue;
    neighbours(pixel, width, height, (neighbour) => {
      if (backgroundDistance[neighbour] === UNREACHED) {
        backgroundDistance[neighbour] = distance + 1;
        queue[tail++] = neighbour;
      }
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
    if (
      !connectedBackground[pixel] &&
      sourceData[pixel * 4 + 3]! > 0 &&
      matteDistance[pixel]! >= opaqueSquared
    ) {
      nearestForeground[pixel] = pixel;
      foregroundDistance[pixel] = 0;
      queue[tail++] = pixel;
      confidentForegroundSeeds += 1;
    }
  }
  if (!confidentForegroundSeeds) {
    throw new ChromaKeyExtractionError(
      "CHROMA_KEY_FOREGROUND_REFERENCE_MISSING",
      "No confident foreground colour exists far enough from the extraction matte.",
    );
  }
  head = 0;
  while (head < tail) {
    const pixel = queue[head++]!;
    const distance = foregroundDistance[pixel]!;
    if (distance >= settings.edgeSearchRadius) continue;
    const sourcePixel = nearestForeground[pixel]!;
    neighbours(pixel, width, height, (neighbour) => {
      if (foregroundDistance[neighbour] === UNREACHED) {
        foregroundDistance[neighbour] = distance + 1;
        nearestForeground[neighbour] = sourcePixel;
        queue[tail++] = neighbour;
      }
    });
  }

  let edgeBandPixels = 0;
  let preservedInteriorMatteLikePixels = 0;
  let decontaminatedPixels = 0;
  let transparentPixels = 0;
  let partialPixels = 0;
  let opaquePixels = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4;
    const sourceR = sourceData[offset]!;
    const sourceG = sourceData[offset + 1]!;
    const sourceB = sourceData[offset + 2]!;
    const sourceAlpha = sourceData[offset + 3]!;
    const background = connectedBackground[pixel] === 1;
    const matteLike = matteDistance[pixel]! <= connectionSquared;
    const edgeCandidate =
      background ||
      (!matteLike && backgroundDistance[pixel]! <= settings.edgeSearchRadius);
    const nearForeground =
      foregroundDistance[pixel]! <= settings.edgeSearchRadius &&
      nearestForeground[pixel]! >= 0;

    if (!background && matteLike) preservedInteriorMatteLikePixels += 1;

    let alpha = background ? 0 : sourceAlpha / 255;
    let red = sourceR;
    let green = sourceG;
    let blue = sourceB;
    if (edgeCandidate && nearForeground) {
      edgeBandPixels += 1;
      const seed = nearestForeground[pixel]! * 4;
      const matteAlpha = projectionAlpha(
        sourceR,
        sourceG,
        sourceB,
        sourceData[seed]!,
        sourceData[seed + 1]!,
        sourceData[seed + 2]!,
        settings.matte,
      );
      alpha = matteAlpha * (sourceAlpha / 255);
      if (alpha > 0 && alpha < 0.997) {
        red = recoverColour(
          sourceR,
          settings.matte.r,
          matteAlpha,
          sourceData[seed]!,
        );
        green = recoverColour(
          sourceG,
          settings.matte.g,
          matteAlpha,
          sourceData[seed + 1]!,
        );
        blue = recoverColour(
          sourceB,
          settings.matte.b,
          matteAlpha,
          sourceData[seed + 2]!,
        );
        if (red !== sourceR || green !== sourceG || blue !== sourceB) {
          decontaminatedPixels += 1;
        }
      }
    }

    let finalAlpha = clampByte(alpha * 255);
    if (finalAlpha <= 1) finalAlpha = 0;
    else if (finalAlpha >= 254) finalAlpha = 255;
    if (finalAlpha === 0) {
      output[offset] = 0;
      output[offset + 1] = 0;
      output[offset + 2] = 0;
      output[offset + 3] = 0;
      transparentPixels += 1;
    } else {
      output[offset] = red;
      output[offset + 1] = green;
      output[offset + 2] = blue;
      output[offset + 3] = finalAlpha;
      if (finalAlpha === 255) opaquePixels += 1;
      else partialPixels += 1;
    }
  }

  if (!opaquePixels && !partialPixels) {
    throw new ChromaKeyExtractionError(
      "CHROMA_KEY_OUTPUT_EMPTY",
      "Extraction removed every visible pixel.",
    );
  }

  let transparentBleedPixels = 0;
  if (settings.bleedRadius > 0) {
    const bleedDistance = new Uint8Array(pixels);
    bleedDistance.fill(UNREACHED);
    const bleedSource = new Int32Array(pixels);
    bleedSource.fill(-1);
    head = 0;
    tail = 0;
    for (let pixel = 0; pixel < pixels; pixel += 1) {
      if (output[pixel * 4 + 3]! > 0) {
        bleedDistance[pixel] = 0;
        bleedSource[pixel] = pixel;
        queue[tail++] = pixel;
      }
    }
    while (head < tail) {
      const pixel = queue[head++]!;
      const distance = bleedDistance[pixel]!;
      if (distance >= settings.bleedRadius) continue;
      const sourcePixel = bleedSource[pixel]!;
      neighbours(pixel, width, height, (neighbour) => {
        if (bleedDistance[neighbour] === UNREACHED) {
          bleedDistance[neighbour] = distance + 1;
          bleedSource[neighbour] = sourcePixel;
          queue[tail++] = neighbour;
        }
      });
    }
    for (let pixel = 0; pixel < pixels; pixel += 1) {
      const offset = pixel * 4;
      if (
        output[offset + 3] === 0 &&
        bleedDistance[pixel]! > 0 &&
        bleedDistance[pixel]! <= settings.bleedRadius &&
        bleedSource[pixel]! >= 0
      ) {
        const sourceOffset = bleedSource[pixel]! * 4;
        output[offset] = output[sourceOffset]!;
        output[offset + 1] = output[sourceOffset + 1]!;
        output[offset + 2] = output[sourceOffset + 2]!;
        transparentBleedPixels += 1;
      }
    }
  }

  const png = await sharp(output, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();

  return {
    png,
    evidence: {
      schemaVersion: "1.0",
      inputSha256: sha256(source),
      outputSha256: sha256(png),
      source: {
        format: metadata.format ?? "unknown",
        width,
        height,
        pages,
        hasAlpha: metadata.hasAlpha ?? false,
        sizeBytes: source.byteLength,
      },
      matte: settings.matte,
      thresholds: {
        connectionDistance: settings.connectionDistance,
        opaqueSeedDistance: settings.opaqueSeedDistance,
        edgeSearchRadius: settings.edgeSearchRadius,
        bleedRadius: settings.bleedRadius,
        minimumBorderMatteFraction: settings.minimumBorderMatteFraction,
      },
      border: {
        pixels: borders.length,
        matteLikePixels: borderMatteLike.length,
        matteLikeFraction: borderMatteFraction,
      },
      segmentation: {
        connectedBackgroundPixels,
        connectedBackgroundFraction: connectedBackgroundPixels / pixels,
        confidentForegroundSeeds,
        edgeBandPixels,
        preservedInteriorMatteLikePixels,
      },
      output: {
        transparentPixels,
        partialPixels,
        opaquePixels,
        decontaminatedPixels,
        transparentBleedPixels,
      },
    },
  };
}
