import { createHash } from "node:crypto";

import sharp, { type Metadata } from "sharp";

const DEFAULT_MAXIMUM_INPUT_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAXIMUM_PIXELS = 16_777_216;
const SUPPORTED_MASK_FORMATS = new Set(["png", "webp"]);

export interface InpaintMaskPreflightOptions {
  readonly maximumInputBytes?: number;
  readonly maximumPixels?: number;
}

export interface RasterInputEvidence {
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly pages: number;
  readonly hasAlpha: boolean;
}

export interface InpaintMaskPreflightEvidence {
  readonly schemaVersion: "1.0";
  readonly base: RasterInputEvidence;
  readonly mask: RasterInputEvidence &
    Readonly<{
      editablePixels: number;
      fullyTransparentPixels: number;
      partiallyTransparentPixels: number;
      preservedPixels: number;
      editableFraction: number;
      fullImageEdit: boolean;
    }>;
  readonly compatible: true;
}

export class RasterPreflightError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "RasterPreflightError";
    this.code = code;
  }
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
    throw new RasterPreflightError(
      "RASTER_PREFLIGHT_OPTIONS_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

function bytes(input: Buffer | Uint8Array, maximum: number, name: string): Buffer {
  const value = Buffer.from(input);
  if (!value.byteLength) {
    throw new RasterPreflightError(
      "RASTER_PREFLIGHT_EMPTY",
      `${name} is empty.`,
    );
  }
  if (value.byteLength > maximum) {
    throw new RasterPreflightError(
      "RASTER_PREFLIGHT_TOO_LARGE",
      `${name} exceeds ${maximum} bytes.`,
    );
  }
  return value;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function inspect(
  input: Buffer,
  maximumPixels: number,
  name: string,
): Promise<RasterInputEvidence> {
  let metadata: Metadata;
  try {
    metadata = await sharp(input, {
      failOn: "error",
      limitInputPixels: maximumPixels,
      sequentialRead: true,
    }).metadata();
  } catch {
    throw new RasterPreflightError(
      "RASTER_PREFLIGHT_DECODE_FAILED",
      `${name} could not be decoded as a supported raster image.`,
    );
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const pages = metadata.pages ?? 1;
  if (width <= 0 || height <= 0 || width * height > maximumPixels) {
    throw new RasterPreflightError(
      "RASTER_PREFLIGHT_DIMENSIONS_INVALID",
      `${name} has invalid or excessive dimensions.`,
    );
  }
  if (pages !== 1) {
    throw new RasterPreflightError(
      "RASTER_PREFLIGHT_MULTIPAGE_UNSUPPORTED",
      `${name} must contain exactly one image page.`,
    );
  }
  return {
    sha256: sha256(input),
    sizeBytes: input.byteLength,
    format: metadata.format ?? "unknown",
    width,
    height,
    pages,
    hasAlpha: metadata.hasAlpha ?? false,
  };
}

export async function preflightInpaintMask(
  baseInput: Buffer | Uint8Array,
  maskInput: Buffer | Uint8Array,
  options: InpaintMaskPreflightOptions = {},
): Promise<InpaintMaskPreflightEvidence> {
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
  const baseBytes = bytes(baseInput, maximumInputBytes, "Base image");
  const maskBytes = bytes(maskInput, maximumInputBytes, "Mask image");
  const [base, mask] = await Promise.all([
    inspect(baseBytes, maximumPixels, "Base image"),
    inspect(maskBytes, maximumPixels, "Mask image"),
  ]);

  if (base.format !== mask.format) {
    throw new RasterPreflightError(
      "INPAINT_MASK_FORMAT_MISMATCH",
      `Base image format ${base.format} does not match mask format ${mask.format}.`,
    );
  }
  if (!SUPPORTED_MASK_FORMATS.has(mask.format)) {
    throw new RasterPreflightError(
      "INPAINT_MASK_FORMAT_UNSUPPORTED",
      "Inpaint masks must use a lossless PNG or WebP format with alpha.",
    );
  }
  if (base.width !== mask.width || base.height !== mask.height) {
    throw new RasterPreflightError(
      "INPAINT_MASK_DIMENSIONS_MISMATCH",
      `Base image is ${base.width}x${base.height}, but mask is ${mask.width}x${mask.height}.`,
    );
  }
  if (!mask.hasAlpha) {
    throw new RasterPreflightError(
      "INPAINT_MASK_ALPHA_REQUIRED",
      "Inpaint mask must contain a real alpha channel.",
    );
  }

  const decoded = await sharp(maskBytes, {
    failOn: "error",
    limitInputPixels: maximumPixels,
    sequentialRead: true,
  })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let fullyTransparentPixels = 0;
  let partiallyTransparentPixels = 0;
  let preservedPixels = 0;
  for (let index = 3; index < decoded.data.length; index += 4) {
    const alpha = decoded.data[index]!;
    if (alpha === 0) fullyTransparentPixels += 1;
    else if (alpha < 255) partiallyTransparentPixels += 1;
    else preservedPixels += 1;
  }
  const editablePixels = fullyTransparentPixels + partiallyTransparentPixels;
  if (!editablePixels) {
    throw new RasterPreflightError(
      "INPAINT_MASK_HAS_NO_EDITABLE_PIXELS",
      "Inpaint mask is fully opaque and does not declare any editable pixels.",
    );
  }
  const totalPixels = mask.width * mask.height;
  return {
    schemaVersion: "1.0",
    base,
    mask: {
      ...mask,
      editablePixels,
      fullyTransparentPixels,
      partiallyTransparentPixels,
      preservedPixels,
      editableFraction: editablePixels / totalPixels,
      fullImageEdit: preservedPixels === 0,
    },
    compatible: true,
  };
}
