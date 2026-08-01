import { createHash } from "node:crypto";

import sharp, { type Metadata } from "sharp";

import {
  DeliveryOptimizerError,
  type DeliveryColourPolicy,
  type DeliveryImageSourceEvidence,
  type DeliveryPixelMetrics,
  type DeliveryPngStorageEvidence,
} from "./types.js";

export const MAXIMUM_INPUT_BYTES = 64 * 1024 * 1024;
export const MAXIMUM_PIXELS = 67_108_864;

export function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function inspectPngStorage(bytes: Buffer): DeliveryPngStorageEvidence | null {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.byteLength < 29 || !bytes.subarray(0, 8).equals(signature)) return null;
  if (bytes.readUInt32BE(8) !== 13 || bytes.toString("ascii", 12, 16) !== "IHDR") {
    throw new DeliveryOptimizerError(
      "DELIVERY_PNG_IHDR_INVALID",
      "PNG candidate does not begin with a canonical IHDR chunk.",
    );
  }
  return {
    bitDepth: bytes[24]!,
    colourType: bytes[25]!,
    interlace: bytes[28]!,
  };
}

export function exactImageBytes(value: Buffer | Uint8Array): Buffer {
  const bytes = Buffer.from(value);
  if (bytes.byteLength === 0) {
    throw new DeliveryOptimizerError(
      "DELIVERY_IMAGE_EMPTY",
      "Delivery image input is empty.",
    );
  }
  if (bytes.byteLength > MAXIMUM_INPUT_BYTES) {
    throw new DeliveryOptimizerError(
      "DELIVERY_IMAGE_TOO_LARGE",
      `Delivery image exceeds ${MAXIMUM_INPUT_BYTES} bytes.`,
    );
  }
  return bytes;
}

function finiteDimension(value: number | undefined, label: string): number {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) {
    throw new DeliveryOptimizerError(
      "DELIVERY_IMAGE_DIMENSIONS_INVALID",
      `${label} is missing or invalid.`,
    );
  }
  return value!;
}

export async function inspectSource(input: Buffer): Promise<{
  readonly metadata: Metadata;
  readonly evidence: DeliveryImageSourceEvidence;
}> {
  let metadata: Metadata;
  try {
    metadata = await sharp(input, {
      failOn: "error",
      limitInputPixels: MAXIMUM_PIXELS,
      sequentialRead: true,
    }).metadata();
  } catch {
    throw new DeliveryOptimizerError(
      "DELIVERY_IMAGE_DECODE_FAILED",
      "Delivery image could not be decoded as a supported raster file.",
    );
  }
  const width = finiteDimension(metadata.width, "Image width");
  const height = finiteDimension(metadata.height, "Image height");
  const pages = metadata.pages ?? 1;
  if (pages !== 1) {
    throw new DeliveryOptimizerError(
      "DELIVERY_IMAGE_MULTIPAGE_UNSUPPORTED",
      "Delivery optimization accepts exactly one raster page per file.",
    );
  }
  if (width * height > MAXIMUM_PIXELS) {
    throw new DeliveryOptimizerError(
      "DELIVERY_IMAGE_PIXEL_LIMIT_EXCEEDED",
      `Delivery image exceeds ${MAXIMUM_PIXELS} pixels.`,
    );
  }
  return {
    metadata,
    evidence: {
      sha256: sha256(input),
      bytes: input.byteLength,
      format: metadata.format ?? "unknown",
      width,
      height,
      pages,
      hasAlpha: metadata.hasAlpha ?? false,
    },
  };
}

export function normalizeRawRgba(
  data: Uint8Array,
  width: number,
  height: number,
  channels: number,
): Buffer {
  const pixels = width * height;
  if (![1, 2, 3, 4].includes(channels) || data.byteLength !== pixels * channels) {
    throw new DeliveryOptimizerError(
      "DELIVERY_RAW_CHANNELS_INVALID",
      `Decoded image has ${channels} channels and ${data.byteLength} bytes for ${width}x${height}.`,
    );
  }
  if (channels === 4) return Buffer.from(data);
  const output = Buffer.alloc(pixels * 4);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const source = pixel * channels;
    const target = pixel * 4;
    const first = data[source]!;
    if (channels === 1) {
      output[target] = first;
      output[target + 1] = first;
      output[target + 2] = first;
      output[target + 3] = 255;
    } else if (channels === 2) {
      output[target] = first;
      output[target + 1] = first;
      output[target + 2] = first;
      output[target + 3] = data[source + 1]!;
    } else {
      output[target] = first;
      output[target + 1] = data[source + 1]!;
      output[target + 2] = data[source + 2]!;
      output[target + 3] = 255;
    }
  }
  return output;
}

export function applyColourPolicy(
  data: Buffer,
  policy: DeliveryColourPolicy,
  transformations: string[],
): Buffer {
  if (policy !== "grayscale") return data;
  const output = Buffer.from(data);
  for (let offset = 0; offset < output.byteLength; offset += 4) {
    const luminance = Math.max(
      0,
      Math.min(
        255,
        Math.round(
          output[offset]! * 0.2126 +
            output[offset + 1]! * 0.7152 +
            output[offset + 2]! * 0.0722,
        ),
      ),
    );
    output[offset] = luminance;
    output[offset + 1] = luminance;
    output[offset + 2] = luminance;
  }
  transformations.push("convert-to-grayscale-preserve-alpha");
  return output;
}

export function alphaCounts(data: Uint8Array): Readonly<{
  transparentPixels: number;
  partialPixels: number;
  opaquePixels: number;
}> {
  let transparentPixels = 0;
  let partialPixels = 0;
  let opaquePixels = 0;
  for (let index = 3; index < data.length; index += 4) {
    const alpha = data[index]!;
    if (alpha === 0) transparentPixels += 1;
    else if (alpha === 255) opaquePixels += 1;
    else partialPixels += 1;
  }
  return { transparentPixels, partialPixels, opaquePixels };
}

export function comparePixels(
  reference: Uint8Array,
  candidate: Uint8Array,
): DeliveryPixelMetrics {
  if (
    reference.byteLength !== candidate.byteLength ||
    reference.byteLength % 4 !== 0
  ) {
    throw new DeliveryOptimizerError(
      "DELIVERY_CANDIDATE_PIXEL_SHAPE_MISMATCH",
      "Encoded delivery candidate did not decode to the reference pixel shape.",
    );
  }
  let colourAbsolute = 0;
  let colourSquared = 0;
  let colourSamples = 0;
  let alphaAbsolute = 0;
  let alphaMaximumDifference = 0;
  const pixels = reference.byteLength / 4;

  for (let offset = 0; offset < reference.byteLength; offset += 4) {
    const referenceAlpha = reference[offset + 3]!;
    const candidateAlpha = candidate[offset + 3]!;
    const alphaDifference = Math.abs(referenceAlpha - candidateAlpha);
    alphaAbsolute += alphaDifference;
    alphaMaximumDifference = Math.max(alphaMaximumDifference, alphaDifference);
    const weight = Math.max(referenceAlpha, candidateAlpha) / 255;
    if (weight <= 0) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      const difference = Math.abs(
        reference[offset + channel]! - candidate[offset + channel]!,
      );
      colourAbsolute += difference * weight;
      colourSquared += difference * difference * weight;
      colourSamples += weight;
    }
  }

  const meanAbsoluteError =
    colourSamples === 0 ? 0 : colourAbsolute / colourSamples;
  const rootMeanSquareError =
    colourSamples === 0 ? 0 : Math.sqrt(colourSquared / colourSamples);
  return {
    meanAbsoluteError,
    rootMeanSquareError,
    psnr:
      rootMeanSquareError === 0
        ? 999
        : 20 * Math.log10(255 / rootMeanSquareError),
    alphaMeanAbsoluteError: pixels === 0 ? 0 : alphaAbsolute / pixels,
    alphaMaximumDifference,
    comparedColourSamples: colourSamples,
    pixels,
  };
}

export async function inspectEncodedRaster(bytes: Buffer): Promise<{
  readonly metadata: Metadata;
  readonly raw: Buffer;
  readonly width: number;
  readonly height: number;
  readonly pngStorage: DeliveryPngStorageEvidence | null;
}> {
  const options = {
    failOn: "error" as const,
    limitInputPixels: MAXIMUM_PIXELS,
    sequentialRead: true,
  };
  const metadata = await sharp(bytes, options).metadata();
  const decoded = await sharp(bytes, options)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    metadata,
    raw: normalizeRawRgba(
      decoded.data,
      decoded.info.width,
      decoded.info.height,
      decoded.info.channels,
    ),
    width: decoded.info.width,
    height: decoded.info.height,
    pngStorage: inspectPngStorage(bytes),
  };
}
