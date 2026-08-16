import { createHash } from "node:crypto";

import sharp, { type Metadata } from "sharp";

import { applyTransparentBleed } from "./background-recovery.js";

const DEFAULT_MAXIMUM_INPUT_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAXIMUM_PIXELS = 16_777_216;

export interface AlphaGuidanceOptions {
  readonly protectMask?: Buffer | Uint8Array;
  readonly removeMask?: Buffer | Uint8Array;
  readonly bleedRadius?: number;
  readonly maximumInputBytes?: number;
  readonly maximumPixels?: number;
}

export interface AlphaGuidanceMaskEvidence {
  readonly sha256: string;
  readonly interpretation: "alpha" | "luminance";
  readonly affectedPixels: number;
  readonly hardPixels: number;
  readonly coverageFraction: number;
}

export interface AlphaGuidanceEvidence {
  readonly schemaVersion: "1.0";
  readonly recoveredInputSha256: string;
  readonly sourceInputSha256: string;
  readonly outputSha256: string;
  readonly width: number;
  readonly height: number;
  readonly protectMask: AlphaGuidanceMaskEvidence | null;
  readonly removeMask: AlphaGuidanceMaskEvidence | null;
  readonly changedAlphaPixels: number;
  readonly restoredAlphaPixels: number;
  readonly removedAlphaPixels: number;
  readonly transparentBleedPixels: number;
  readonly guarantees: Readonly<{
    dimensionsMatched: true;
    conflictingStrongMasksRejected: true;
    unmaskedAlphaPreserved: true;
    protectedRgbRestoredFromSource: true;
    fullyTransparentRgbCanonicalizedBeforeBleed: true;
    transparentRgbLimitedToBoundedBleed: true;
  }>;
}

export interface AlphaGuidanceResult {
  readonly png: Buffer;
  readonly evidence: AlphaGuidanceEvidence;
}

export class AlphaGuidanceError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "AlphaGuidanceError";
    this.code = code;
  }
}

type Decoded = Readonly<{
  encoded: Buffer;
  metadata: Metadata;
  data: Buffer;
  width: number;
  height: number;
}>;

type DecodedMask = Readonly<{
  coverage: Uint8Array;
  evidence: AlphaGuidanceMaskEvidence;
}>;

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < minimum || result > maximum) {
    throw new AlphaGuidanceError(
      "ALPHA_GUIDANCE_OPTIONS_INVALID",
      `${label} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

async function decode(
  value: Buffer | Uint8Array,
  label: string,
  maximumInputBytes: number,
  maximumPixels: number,
): Promise<Decoded> {
  const encoded = Buffer.from(value);
  if (!encoded.byteLength) {
    throw new AlphaGuidanceError("ALPHA_GUIDANCE_INPUT_EMPTY", `${label} is empty.`);
  }
  if (encoded.byteLength > maximumInputBytes) {
    throw new AlphaGuidanceError(
      "ALPHA_GUIDANCE_INPUT_TOO_LARGE",
      `${label} exceeds ${maximumInputBytes} bytes.`,
    );
  }
  const decoder = {
    failOn: "error" as const,
    limitInputPixels: maximumPixels,
    pages: 1,
    animated: false,
    sequentialRead: true,
  };
  let metadata: Metadata;
  try {
    metadata = await sharp(encoded, decoder).metadata();
  } catch {
    throw new AlphaGuidanceError(
      "ALPHA_GUIDANCE_DECODE_FAILED",
      `${label} could not be decoded.`,
    );
  }
  if ((metadata.pages ?? 1) !== 1) {
    throw new AlphaGuidanceError(
      "ALPHA_GUIDANCE_MULTIPAGE_UNSUPPORTED",
      `${label} must contain exactly one image page.`,
    );
  }
  const decoded = await sharp(encoded, decoder)
    .ensureAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (
    decoded.info.channels !== 4 ||
    decoded.info.width < 1 ||
    decoded.info.height < 1 ||
    decoded.info.width * decoded.info.height > maximumPixels
  ) {
    throw new AlphaGuidanceError(
      "ALPHA_GUIDANCE_DIMENSIONS_INVALID",
      `${label} has invalid or excessive decoded dimensions.`,
    );
  }
  return {
    encoded,
    metadata,
    data: decoded.data,
    width: decoded.info.width,
    height: decoded.info.height,
  };
}

async function decodeMask(
  value: Buffer | Uint8Array,
  label: string,
  width: number,
  height: number,
  maximumInputBytes: number,
  maximumPixels: number,
): Promise<DecodedMask> {
  const decoded = await decode(value, label, maximumInputBytes, maximumPixels);
  if (decoded.width !== width || decoded.height !== height) {
    throw new AlphaGuidanceError(
      "ALPHA_GUIDANCE_MASK_DIMENSIONS_MISMATCH",
      `${label} is ${decoded.width}x${decoded.height}; expected ${width}x${height}.`,
    );
  }
  let nonOpaqueAlpha = 0;
  for (let offset = 3; offset < decoded.data.byteLength; offset += 4) {
    if (decoded.data[offset] !== 255) nonOpaqueAlpha += 1;
  }
  const interpretation =
    decoded.metadata.hasAlpha && nonOpaqueAlpha > 0 ? "alpha" : "luminance";
  const coverage = new Uint8Array(width * height);
  let affectedPixels = 0;
  let hardPixels = 0;
  for (let pixel = 0; pixel < coverage.length; pixel += 1) {
    const offset = pixel * 4;
    const amount =
      interpretation === "alpha"
        ? decoded.data[offset + 3]!
        : Math.round(
            decoded.data[offset]! * 0.2126 +
              decoded.data[offset + 1]! * 0.7152 +
              decoded.data[offset + 2]! * 0.0722,
          );
    coverage[pixel] = amount;
    if (amount > 0) affectedPixels += 1;
    if (amount === 255) hardPixels += 1;
  }
  if (!affectedPixels) {
    throw new AlphaGuidanceError(
      "ALPHA_GUIDANCE_MASK_EMPTY",
      `${label} contains no painted coverage.`,
    );
  }
  return {
    coverage,
    evidence: {
      sha256: sha256(decoded.encoded),
      interpretation,
      affectedPixels,
      hardPixels,
      coverageFraction: affectedPixels / coverage.length,
    },
  };
}

export async function applyAlphaGuidance(
  recoveredInput: Buffer | Uint8Array,
  sourceInput: Buffer | Uint8Array,
  options: AlphaGuidanceOptions,
): Promise<AlphaGuidanceResult> {
  if (!options.protectMask && !options.removeMask) {
    throw new AlphaGuidanceError(
      "ALPHA_GUIDANCE_MASK_REQUIRED",
      "At least one protect or remove mask is required.",
    );
  }
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
  const bleedRadius = boundedInteger(options.bleedRadius, 2, 0, 32, "bleedRadius");
  const [recovered, source] = await Promise.all([
    decode(recoveredInput, "Recovered image", maximumInputBytes, maximumPixels),
    decode(sourceInput, "Source image", maximumInputBytes, maximumPixels),
  ]);
  if (recovered.width !== source.width || recovered.height !== source.height) {
    throw new AlphaGuidanceError(
      "ALPHA_GUIDANCE_SOURCE_DIMENSIONS_MISMATCH",
      `Recovered image is ${recovered.width}x${recovered.height}; source is ${source.width}x${source.height}.`,
    );
  }
  const [protect, remove] = await Promise.all([
    options.protectMask
      ? decodeMask(
          options.protectMask,
          "Protect mask",
          recovered.width,
          recovered.height,
          maximumInputBytes,
          maximumPixels,
        )
      : null,
    options.removeMask
      ? decodeMask(
          options.removeMask,
          "Remove mask",
          recovered.width,
          recovered.height,
          maximumInputBytes,
          maximumPixels,
        )
      : null,
  ]);
  if (protect && remove) {
    for (let pixel = 0; pixel < protect.coverage.length; pixel += 1) {
      if (protect.coverage[pixel]! >= 128 && remove.coverage[pixel]! >= 128) {
        throw new AlphaGuidanceError(
          "ALPHA_GUIDANCE_MASK_CONFLICT",
          "Protect and remove masks contain overlapping strong coverage. Make the artist masks disjoint.",
        );
      }
    }
  }

  const output = Buffer.from(recovered.data);
  let changedAlphaPixels = 0;
  let restoredAlphaPixels = 0;
  let removedAlphaPixels = 0;
  for (let pixel = 0; pixel < recovered.width * recovered.height; pixel += 1) {
    const offset = pixel * 4;
    const originalAlpha = output[offset + 3]!;
    const protectedAlpha = Math.max(originalAlpha, protect?.coverage[pixel] ?? 0);
    const nextAlpha = Math.round(
      (protectedAlpha * (255 - (remove?.coverage[pixel] ?? 0))) / 255,
    );
    if (protectedAlpha > originalAlpha) {
      const restoredCoverage = protectedAlpha - originalAlpha;
      output[offset] = Math.round(
        (output[offset]! * originalAlpha + source.data[offset]! * restoredCoverage) /
          protectedAlpha,
      );
      output[offset + 1] = Math.round(
        (output[offset + 1]! * originalAlpha + source.data[offset + 1]! * restoredCoverage) /
          protectedAlpha,
      );
      output[offset + 2] = Math.round(
        (output[offset + 2]! * originalAlpha + source.data[offset + 2]! * restoredCoverage) /
          protectedAlpha,
      );
    }
    if (nextAlpha !== originalAlpha) changedAlphaPixels += 1;
    if (nextAlpha > originalAlpha) restoredAlphaPixels += 1;
    if (nextAlpha < originalAlpha) removedAlphaPixels += 1;
    output[offset + 3] = nextAlpha;
    if (nextAlpha === 0) {
      output[offset] = 0;
      output[offset + 1] = 0;
      output[offset + 2] = 0;
    }
  }
  const transparentBleedPixels = applyTransparentBleed(
    output,
    recovered.width,
    recovered.height,
    bleedRadius,
  );
  const png = await sharp(output, {
    raw: { width: recovered.width, height: recovered.height, channels: 4 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
  return {
    png,
    evidence: {
      schemaVersion: "1.0",
      recoveredInputSha256: sha256(recovered.encoded),
      sourceInputSha256: sha256(source.encoded),
      outputSha256: sha256(png),
      width: recovered.width,
      height: recovered.height,
      protectMask: protect?.evidence ?? null,
      removeMask: remove?.evidence ?? null,
      changedAlphaPixels,
      restoredAlphaPixels,
      removedAlphaPixels,
      transparentBleedPixels,
      guarantees: {
        dimensionsMatched: true,
        conflictingStrongMasksRejected: true,
        unmaskedAlphaPreserved: true,
        protectedRgbRestoredFromSource: true,
        fullyTransparentRgbCanonicalizedBeforeBleed: true,
        transparentRgbLimitedToBoundedBleed: true,
      },
    },
  };
}
