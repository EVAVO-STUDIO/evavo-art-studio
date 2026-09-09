import sharp from "sharp";

export const IMAGE_DELIVERY_INTEGRITY_CONTRACT = "evavo.image-delivery-integrity.v1_1" as const;

export type ImageDeliveryTarget = "web" | "game-art" | "game-data-map" | "print" | "archive";
export type ImageDeliveryGrade = "pass" | "warn" | "fail";

export interface ImageDeliveryIntegritySpec {
  readonly target: ImageDeliveryTarget;
  readonly intendedFormat?: "png" | "jpeg" | "webp" | "avif" | "tiff";
  readonly requireAlpha?: boolean;
  readonly forbidAlpha?: boolean;
  readonly outputWidthMm?: number;
  readonly outputHeightMm?: number;
  readonly minimumPrintDpi?: number;
  readonly allowEmbeddedMetadata?: boolean;
  readonly allowOrientationMetadata?: boolean;
  readonly maximumMegapixels?: number;
  readonly maximumBytes?: number;
}

export interface ImageDeliveryIntegrityEvidence {
  readonly contract: typeof IMAGE_DELIVERY_INTEGRITY_CONTRACT;
  readonly target: ImageDeliveryTarget;
  readonly grade: ImageDeliveryGrade;
  readonly width: number;
  readonly height: number;
  readonly megapixels: number;
  readonly encodedBytes: number;
  readonly format: string | null;
  readonly colourSpace: string | null;
  readonly channels: number | null;
  readonly hasAlpha: boolean;
  readonly orientation: number | null;
  readonly densityDpi: number | null;
  readonly embeddedMetadata: Readonly<{
    icc: boolean;
    iccBytes: number;
    exif: boolean;
    exifBytes: number;
    xmp: boolean;
    xmpBytes: number;
  }>;
  readonly print: Readonly<{
    requestedWidthMm: number | null;
    requestedHeightMm: number | null;
    effectiveDpiX: number | null;
    effectiveDpiY: number | null;
    minimumRequiredDpi: number | null;
  }>;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly recommendations: readonly string[];
  readonly sourceMutationAllowed: false;
}

function positive(value: number | undefined, fallback: number | null, label: string): number | null {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than 0.`);
  return value;
}

function positiveInteger(value: number | undefined, fallback: number | null, label: string): number | null {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer.`);
  return value;
}

function formatName(value: string | undefined): string | null {
  return value ?? null;
}

function bufferLength(value: Buffer | undefined): number {
  return Buffer.isBuffer(value) ? value.length : 0;
}

function mmToInches(mm: number): number {
  return mm / 25.4;
}

/**
 * Read-only preflight of a finished image's delivery container/metadata contract.
 * This is intentionally separate from aesthetic review and does not transform pixels.
 */
export async function reviewImageDeliveryIntegrity(
  encoded: Buffer,
  spec: ImageDeliveryIntegritySpec,
): Promise<ImageDeliveryIntegrityEvidence> {
  if (!Buffer.isBuffer(encoded) || encoded.length === 0) throw new Error("Image delivery integrity input is empty.");
  if (!spec?.target) throw new Error("Image delivery target is required.");
  if (spec.requireAlpha === true && spec.forbidAlpha === true) throw new Error("requireAlpha and forbidAlpha cannot both be true.");
  const outputWidthMm = positive(spec.outputWidthMm, null, "outputWidthMm");
  const outputHeightMm = positive(spec.outputHeightMm, null, "outputHeightMm");
  if ((outputWidthMm === null) !== (outputHeightMm === null)) {
    throw new Error("outputWidthMm and outputHeightMm must be supplied together.");
  }
  const minimumPrintDpi = positive(spec.minimumPrintDpi, spec.target === "print" ? 300 : null, "minimumPrintDpi");
  const maximumMegapixels = positive(spec.maximumMegapixels, null, "maximumMegapixels");
  const maximumBytes = positiveInteger(spec.maximumBytes, null, "maximumBytes");

  const metadata = await sharp(encoded, { failOn: "error" }).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Image delivery integrity input has no dimensions.");
  const width = metadata.width;
  const height = metadata.height;
  const megapixels = (width * height) / 1_000_000;
  const encodedBytes = encoded.length;
  const hasAlpha = metadata.hasAlpha ?? false;
  const format = formatName(metadata.format);
  const colourSpace = metadata.space ?? null;
  const orientation = metadata.orientation ?? null;
  const densityDpi = metadata.density ?? null;
  const iccBytes = bufferLength(metadata.icc);
  const exifBytes = bufferLength(metadata.exif);
  const xmpBytes = bufferLength(metadata.xmp);

  const effectiveDpiX = outputWidthMm === null ? null : width / mmToInches(outputWidthMm);
  const effectiveDpiY = outputHeightMm === null ? null : height / mmToInches(outputHeightMm);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (maximumMegapixels !== null && megapixels > maximumMegapixels) {
    blockers.push(`megapixel-budget-exceeded:${megapixels.toFixed(3)}>${maximumMegapixels.toFixed(3)}`);
  }
  if (maximumBytes !== null && encodedBytes > maximumBytes) {
    blockers.push(`encoded-byte-budget-exceeded:${encodedBytes}>${maximumBytes}`);
  }
  if (spec.requireAlpha === true && !hasAlpha) blockers.push("required-alpha-channel-missing");
  if (spec.forbidAlpha === true && hasAlpha) blockers.push("forbidden-alpha-channel-present");
  if (spec.intendedFormat && format !== spec.intendedFormat) blockers.push(`encoded-format-does-not-match-intent:${format ?? "unknown"}->${spec.intendedFormat}`);
  if (spec.intendedFormat === "jpeg" && hasAlpha) blockers.push("jpeg-delivery-cannot-preserve-alpha");

  if (orientation !== null && orientation !== 1 && spec.allowOrientationMetadata !== true) {
    warnings.push(`non-normalized-orientation-metadata:${orientation}`);
    recommendations.push("Normalize orientation into pixels before runtime/export delivery so consumers that ignore EXIF orientation render consistently.");
  }

  const hasPrivateMetadata = exifBytes > 0 || xmpBytes > 0;
  if (hasPrivateMetadata && spec.allowEmbeddedMetadata !== true && (spec.target === "web" || spec.target === "game-art" || spec.target === "game-data-map")) {
    warnings.push("embedded-exif-or-xmp-present");
    recommendations.push("Strip unnecessary EXIF/XMP from public/runtime derivatives; retain metadata only in governed masters when needed.");
  }

  if ((spec.target === "web" || spec.target === "game-art") && colourSpace === "cmyk") {
    blockers.push("cmyk-colour-space-not-suitable-for-standard-web-or-game-art-delivery");
    recommendations.push("Convert an approved derivative to the intended display RGB space while preserving the original master.");
  }
  if (spec.target === "game-data-map") {
    if (colourSpace === "cmyk") blockers.push("cmyk-colour-space-invalid-for-game-data-map");
    if (hasAlpha && spec.requireAlpha !== true) warnings.push("game-data-map-has-alpha; verify whether alpha intentionally stores data");
    recommendations.push("Treat data maps as linear/non-colour data in the engine import path; do not apply photographic colour enhancement or hidden tone remapping.");
    if (iccBytes > 0) warnings.push("embedded-icc-profile-on-game-data-map; verify the import pipeline will not colour-transform numeric data");
  }

  if (spec.target === "web") {
    if (!iccBytes && colourSpace !== "srgb") {
      warnings.push(`web-colour-space-is-not-explicitly-srgb:${colourSpace ?? "unknown"}`);
      recommendations.push("Confirm the delivery derivative is intentionally authored/interpreted as sRGB or embed the required display profile when a different colour space is intended.");
    }
    recommendations.push("Inspect the encoded derivative in a real browser at intended CSS size; container metadata preflight does not prove visual colour matching.");
  }

  if (spec.target === "print") {
    if (effectiveDpiX === null || effectiveDpiY === null) {
      warnings.push("print-physical-size-not-supplied; effective-dpi-cannot-be-proven");
      recommendations.push("Supply final physical width/height in millimetres to validate effective print resolution.");
    } else if (minimumPrintDpi !== null && Math.min(effectiveDpiX, effectiveDpiY) < minimumPrintDpi) {
      blockers.push(`print-effective-dpi-below-minimum:${Math.min(effectiveDpiX, effectiveDpiY).toFixed(1)}<${minimumPrintDpi.toFixed(1)}`);
    }
    if (!iccBytes) warnings.push("print-image-has-no-embedded-icc-profile; confirm colour-management requirements with the print workflow");
    recommendations.push("Final print colour correctness depends on the printer/profile/proofing workflow; this preflight only verifies the delivered raster contract.");
  }

  if (spec.target === "archive") {
    recommendations.push("Keep source lineage, approvals and high-quality/lossless masters separately from optimized delivery derivatives.");
  }

  if ((format === "jpeg" || format === "webp" || format === "avif") && spec.target === "archive") {
    warnings.push("archive-master-uses-potentially-lossy-container; verify this is intentional");
  }

  const grade: ImageDeliveryGrade = blockers.length ? "fail" : warnings.length ? "warn" : "pass";
  return Object.freeze({
    contract: IMAGE_DELIVERY_INTEGRITY_CONTRACT,
    target: spec.target,
    grade,
    width,
    height,
    megapixels,
    encodedBytes,
    format,
    colourSpace,
    channels: metadata.channels ?? null,
    hasAlpha,
    orientation,
    densityDpi,
    embeddedMetadata: Object.freeze({
      icc: iccBytes > 0,
      iccBytes,
      exif: exifBytes > 0,
      exifBytes,
      xmp: xmpBytes > 0,
      xmpBytes,
    }),
    print: Object.freeze({
      requestedWidthMm: outputWidthMm,
      requestedHeightMm: outputHeightMm,
      effectiveDpiX,
      effectiveDpiY,
      minimumRequiredDpi: minimumPrintDpi,
    }),
    blockers: Object.freeze(blockers),
    warnings: Object.freeze(warnings),
    recommendations: Object.freeze([...new Set(recommendations)]),
    sourceMutationAllowed: false,
  });
}
