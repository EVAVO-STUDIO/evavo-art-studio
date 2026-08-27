import { createHash } from "node:crypto";

import sharp, { type Metadata } from "sharp";

const DEFAULT_MAXIMUM_INPUT_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAXIMUM_PIXELS = 16_777_216;
const SUPPORTED_MASK_FORMATS = new Set(["png", "webp"]);
const SUPPORTED_OUTPUT_MEDIA_TYPES = new Set<RasterOutputMediaType>([
  "image/png",
  "image/webp",
  "image/jpeg",
]);

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

export type RasterOutputMediaType =
  | "image/png"
  | "image/webp"
  | "image/jpeg";
export type RasterOutputAlphaPolicy = "any" | "required" | "forbidden";
export type RasterOutputValidationMode = "evidence" | "strict";
export type RasterOutputIssueCode =
  | "RASTER_OUTPUT_MEDIA_TYPE_MISMATCH"
  | "RASTER_OUTPUT_DIMENSIONS_MISMATCH"
  | "RASTER_OUTPUT_ALPHA_REQUIRED"
  | "RASTER_OUTPUT_ALPHA_FORBIDDEN";

export interface RasterOutputPreflightOptions
  extends InpaintMaskPreflightOptions {
  readonly expectedMediaType: RasterOutputMediaType;
  readonly expectedWidth?: number;
  readonly expectedHeight?: number;
  readonly alphaPolicy?: RasterOutputAlphaPolicy;
  readonly mode?: RasterOutputValidationMode;
}

export interface RasterOutputPreflightEvidence {
  readonly schemaVersion: "1.0";
  readonly actual: RasterInputEvidence &
    Readonly<{ mediaType: RasterOutputMediaType }>;
  readonly expected: Readonly<{
    mediaType: RasterOutputMediaType;
    width?: number;
    height?: number;
    alphaPolicy: RasterOutputAlphaPolicy;
  }>;
  readonly checks: Readonly<{
    mediaTypeMatches: boolean;
    dimensionsMatch: boolean;
    alphaMatches: boolean;
  }>;
  readonly issues: readonly RasterOutputIssueCode[];
  readonly compatible: boolean;
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

function positiveInteger(value: number | undefined, name: string): number {
  if (!Number.isInteger(value) || value! < 1 || value! > 65_535) {
    throw new RasterPreflightError(
      "RASTER_PREFLIGHT_OPTIONS_INVALID",
      `${name} must be an integer between 1 and 65535.`,
    );
  }
  return value!;
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

function outputMediaType(format: string): RasterOutputMediaType {
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  if (format === "jpeg") return "image/jpeg";
  throw new RasterPreflightError(
    "RASTER_OUTPUT_FORMAT_UNSUPPORTED",
    `Raster output format ${format || "unknown"} is not PNG, WebP or JPEG.`,
  );
}

function outputValidationMode(
  value: RasterOutputValidationMode | undefined,
): RasterOutputValidationMode {
  const result = value ?? "strict";
  if (result !== "strict" && result !== "evidence") {
    throw new RasterPreflightError(
      "RASTER_PREFLIGHT_OPTIONS_INVALID",
      "mode must be strict or evidence.",
    );
  }
  return result;
}

function alphaPolicy(
  value: RasterOutputAlphaPolicy | undefined,
): RasterOutputAlphaPolicy {
  const result = value ?? "any";
  if (result !== "any" && result !== "required" && result !== "forbidden") {
    throw new RasterPreflightError(
      "RASTER_PREFLIGHT_OPTIONS_INVALID",
      "alphaPolicy must be any, required or forbidden.",
    );
  }
  return result;
}

function issueMessage(
  issue: RasterOutputIssueCode,
  evidence: RasterOutputPreflightEvidence,
): string {
  if (issue === "RASTER_OUTPUT_MEDIA_TYPE_MISMATCH") {
    return `Raster output decoded as ${evidence.actual.mediaType}, but ${evidence.expected.mediaType} was required.`;
  }
  if (issue === "RASTER_OUTPUT_DIMENSIONS_MISMATCH") {
    return `Raster output decoded as ${evidence.actual.width}x${evidence.actual.height}, but ${evidence.expected.width}x${evidence.expected.height} was required.`;
  }
  if (issue === "RASTER_OUTPUT_ALPHA_REQUIRED") {
    return "Raster output must contain a real alpha channel.";
  }
  return "Raster output must not contain an alpha channel.";
}

export async function preflightRasterOutput(
  input: Buffer | Uint8Array,
  options: RasterOutputPreflightOptions,
): Promise<RasterOutputPreflightEvidence> {
  if (!SUPPORTED_OUTPUT_MEDIA_TYPES.has(options.expectedMediaType)) {
    throw new RasterPreflightError(
      "RASTER_PREFLIGHT_OPTIONS_INVALID",
      "expectedMediaType must be image/png, image/webp or image/jpeg.",
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
  if (
    (options.expectedWidth === undefined) !==
    (options.expectedHeight === undefined)
  ) {
    throw new RasterPreflightError(
      "RASTER_PREFLIGHT_OPTIONS_INVALID",
      "expectedWidth and expectedHeight must be provided together.",
    );
  }
  const expectedDimensions =
    options.expectedWidth === undefined
      ? undefined
      : {
          width: positiveInteger(options.expectedWidth, "expectedWidth"),
          height: positiveInteger(options.expectedHeight, "expectedHeight"),
        };
  const requiredAlpha = alphaPolicy(options.alphaPolicy);
  const mode = outputValidationMode(options.mode);
  const outputBytes = bytes(input, maximumInputBytes, "Raster output");
  const inspected = await inspect(outputBytes, maximumPixels, "Raster output");
  const actualMediaType = outputMediaType(inspected.format);
  const mediaTypeMatches = actualMediaType === options.expectedMediaType;
  const dimensionsMatch =
    expectedDimensions === undefined ||
    (inspected.width === expectedDimensions.width &&
      inspected.height === expectedDimensions.height);
  const alphaMatches =
    requiredAlpha === "any" ||
    (requiredAlpha === "required" ? inspected.hasAlpha : !inspected.hasAlpha);
  const issues: RasterOutputIssueCode[] = [];
  if (!mediaTypeMatches) issues.push("RASTER_OUTPUT_MEDIA_TYPE_MISMATCH");
  if (!dimensionsMatch) issues.push("RASTER_OUTPUT_DIMENSIONS_MISMATCH");
  if (!alphaMatches) {
    issues.push(
      requiredAlpha === "required"
        ? "RASTER_OUTPUT_ALPHA_REQUIRED"
        : "RASTER_OUTPUT_ALPHA_FORBIDDEN",
    );
  }
  const evidence: RasterOutputPreflightEvidence = {
    schemaVersion: "1.0",
    actual: {
      ...inspected,
      mediaType: actualMediaType,
    },
    expected: {
      mediaType: options.expectedMediaType,
      ...(expectedDimensions ?? {}),
      alphaPolicy: requiredAlpha,
    },
    checks: {
      mediaTypeMatches,
      dimensionsMatch,
      alphaMatches,
    },
    issues,
    compatible: issues.length === 0,
  };
  const firstIssue = issues[0];
  if (mode === "strict" && firstIssue) {
    throw new RasterPreflightError(firstIssue, issueMessage(firstIssue, evidence));
  }
  return evidence;
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
