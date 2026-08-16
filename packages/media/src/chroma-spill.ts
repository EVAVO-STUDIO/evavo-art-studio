import { createHash } from "node:crypto";

import sharp from "sharp";

export interface ChromaSpillSuppressionOptions {
  readonly matteColour: string;
  readonly allowInferredMatte?: boolean;
  readonly tolerance?: number;
  readonly minimumAlpha?: number;
}

export interface ChromaSpillSuppressionEvidence {
  readonly schemaVersion: "1.0";
  readonly inputSha256: string;
  readonly outputSha256: string;
  readonly matte: Readonly<{
    r: number;
    g: number;
    b: number;
    hex: string;
    dominantChannel: "red" | "green" | "blue";
  }>;
  readonly thresholds: Readonly<{
    tolerance: number;
    minimumAlpha: number;
    inferredMatteAccepted: boolean;
  }>;
  readonly output: Readonly<{
    inspectedPixels: number;
    suppressedPixels: number;
    hiddenRgbSuppressedPixels: number;
    maximumHiddenRgbSpill: number;
    alphaReducedPixels: number;
    newlyTransparentPixels: number;
    maximumSpill: number;
  }>;
}

export interface ChromaSpillSuppressionResult {
  readonly png: Buffer;
  readonly evidence: ChromaSpillSuppressionEvidence;
}

export class ChromaSpillSuppressionError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "ChromaSpillSuppressionError";
    this.code = code;
  }
}

type Channel = 0 | 1 | 2;

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function bounded(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < minimum || resolved > maximum) {
    throw new ChromaSpillSuppressionError(
      "CHROMA_SPILL_OPTIONS_INVALID",
      `${label} must be between ${minimum} and ${maximum}.`,
    );
  }
  return resolved;
}

function parseMatte(value: string, allowInferredMatte: boolean): Readonly<{
  channels: readonly [number, number, number];
  dominant: Channel;
  hex: string;
  inferredMatteAccepted: boolean;
}> {
  const normalized = value.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(normalized)) {
    throw new ChromaSpillSuppressionError(
      "CHROMA_SPILL_MATTE_INVALID",
      "matteColour must use #RRGGBB format.",
    );
  }
  const channels = [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ] as const;
  const maximum = Math.max(...channels);
  const minimum = Math.min(...channels);
  const declaredHighChroma = maximum >= 240 && maximum - minimum >= 160;
  const confidentlyInferredHighChroma =
    maximum >= 210 && minimum <= 45 && maximum - minimum >= 140;
  if (
    !declaredHighChroma &&
    !(allowInferredMatte && confidentlyInferredHighChroma)
  ) {
    throw new ChromaSpillSuppressionError(
      "CHROMA_SPILL_MATTE_UNSAFE",
      "matteColour must be a declared high-chroma key.",
    );
  }
  return Object.freeze({
    channels,
    dominant: channels.indexOf(maximum) as Channel,
    hex: normalized,
    inferredMatteAccepted: !declaredHighChroma,
  });
}

export async function suppressChromaSpill(
  input: Uint8Array,
  options: ChromaSpillSuppressionOptions,
): Promise<ChromaSpillSuppressionResult> {
  const encoded = Buffer.from(input);
  if (
    options.allowInferredMatte !== undefined &&
    typeof options.allowInferredMatte !== "boolean"
  ) {
    throw new ChromaSpillSuppressionError(
      "CHROMA_SPILL_OPTIONS_INVALID",
      "allowInferredMatte must be boolean when supplied.",
    );
  }
  const matte = parseMatte(
    options.matteColour,
    options.allowInferredMatte === true,
  );
  const tolerance = bounded(options.tolerance, 12, 0, 64, "tolerance");
  const minimumAlpha = bounded(
    options.minimumAlpha,
    0.018,
    0,
    0.25,
    "minimumAlpha",
  );
  const decoded = await sharp(encoded)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const data = Buffer.from(decoded.data);
  const others = ([0, 1, 2] as const).filter(
    (channel) => channel !== matte.dominant,
  );
  const matteRange = Math.max(
    1,
    matte.channels[matte.dominant] -
      Math.max(...others.map((channel) => matte.channels[channel])),
  );
  let inspectedPixels = 0;
  let suppressedPixels = 0;
  let hiddenRgbSuppressedPixels = 0;
  let maximumHiddenRgbSpill = 0;
  let alphaReducedPixels = 0;
  let newlyTransparentPixels = 0;
  let maximumSpill = 0;

  for (let offset = 0; offset < data.length; offset += 4) {
    const existingAlpha = data[offset + 3]! / 255;
    const channels = [data[offset]!, data[offset + 1]!, data[offset + 2]!] as [
      number,
      number,
      number,
    ];
    if (existingAlpha > 0) inspectedPixels += 1;
    const rawSpill = Math.max(
      0,
      channels[matte.dominant] -
        Math.max(...others.map((channel) => channels[channel])),
    );
    if (existingAlpha <= 0) {
      if (rawSpill <= 0) continue;
      maximumHiddenRgbSpill = Math.max(maximumHiddenRgbSpill, rawSpill);
      channels[matte.dominant] = Math.max(
        ...others.map((channel) => channels[channel]),
      );
      data[offset] = channels[0];
      data[offset + 1] = channels[1];
      data[offset + 2] = channels[2];
      hiddenRgbSuppressedPixels += 1;
      continue;
    }
    const spill = Math.max(0, rawSpill - tolerance);
    if (spill <= 0) continue;
    suppressedPixels += 1;
    maximumSpill = Math.max(maximumSpill, spill);
    const keyAlpha = Math.max(0, Math.min(1, 1 - spill / matteRange));
    const alpha = Math.min(existingAlpha, keyAlpha);
    if (alpha < existingAlpha) alphaReducedPixels += 1;
    if (alpha < minimumAlpha) {
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = 0;
      newlyTransparentPixels += 1;
      continue;
    }
    for (const channel of [0, 1, 2] as const) {
      channels[channel] = clampByte(
        (channels[channel] - matte.channels[channel] * (1 - alpha)) / alpha,
      );
    }
    channels[matte.dominant] = Math.min(
      channels[matte.dominant],
      Math.max(...others.map((channel) => channels[channel])),
    );
    data[offset] = channels[0];
    data[offset + 1] = channels[1];
    data[offset + 2] = channels[2];
    data[offset + 3] = clampByte(alpha * 255);
  }

  const png = await sharp(data, { raw: decoded.info })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
  const dominantChannel = (["red", "green", "blue"] as const)[matte.dominant];
  return Object.freeze({
    png,
    evidence: Object.freeze({
      schemaVersion: "1.0",
      inputSha256: sha256(encoded),
      outputSha256: sha256(png),
      matte: Object.freeze({
        r: matte.channels[0],
        g: matte.channels[1],
        b: matte.channels[2],
        hex: matte.hex,
        dominantChannel,
      }),
      thresholds: Object.freeze({
        tolerance,
        minimumAlpha,
        inferredMatteAccepted: matte.inferredMatteAccepted,
      }),
      output: Object.freeze({
        inspectedPixels,
        suppressedPixels,
        hiddenRgbSuppressedPixels,
        maximumHiddenRgbSpill,
        alphaReducedPixels,
        newlyTransparentPixels,
        maximumSpill,
      }),
    }),
  });
}
