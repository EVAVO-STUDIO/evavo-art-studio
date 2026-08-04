export const DELIVERY_OPTIMIZER_SCHEMA = "evavo.art-delivery-optimization.v1" as const;
export const DELIVERY_OPTIMIZER_RECEIPT_SCHEMA =
  "evavo.art-delivery-optimization-receipt.v1" as const;
export const DELIVERY_OPTIMIZER_VERSION = "0.3.0" as const;
export const PROFILE_CATALOG_VERSION = "2026-08-04.2" as const;

export type DeliveryImageFormat = "png" | "webp";
export type DeliveryColourPolicy = "preserve" | "grayscale";
export type DeliveryTransparencyPolicy = "preserve" | "required" | "opaque";
export type DeliveryResizePolicy = "none" | "fit-inside";
export type DeliveryKernel = "nearest" | "lanczos3";

export interface DeliveryPngStorageContract {
  readonly bitDepth: 8;
  readonly colourType: 0 | 2 | 4 | 6;
  readonly interlace: 0;
}

export interface DeliveryPngStorageEvidence {
  readonly bitDepth: number;
  readonly colourType: number;
  readonly interlace: number;
}

export type DeliveryProfileId =
  | "retro-dialogue-portrait-384"
  | "retro-standing-character-576"
  | "retro-ui-icon-256"
  | "retro-scene-720p"
  | "retro-overlay-720p"
  | "godot-sprite-lossless"
  | "godot-cutout-webp-1080p"
  | "godot-background-1080p"
  | "web-raster-1080p"
  | "source-master-lossless";

export interface PngEncodingCandidate {
  readonly format: "png";
  readonly paletteColours?: number;
  readonly dither: number;
}

export interface WebpEncodingCandidate {
  readonly format: "webp";
  readonly quality: number;
  readonly nearLossless: boolean;
  readonly lossless?: boolean;
}

export type DeliveryEncodingCandidate =
  | PngEncodingCandidate
  | WebpEncodingCandidate;

export interface DeliveryQualityThresholds {
  readonly minimumPsnr: number;
  readonly maximumMeanAbsoluteError: number;
  readonly maximumAlphaMeanAbsoluteError: number;
  readonly maximumAlphaDifference: number;
}

export interface DeliveryImageProfile {
  readonly id: DeliveryProfileId;
  readonly title: string;
  readonly description: string;
  readonly target: "godot-4.6.2" | "web" | "source";
  readonly maxWidth: number | null;
  readonly maxHeight: number | null;
  readonly resizePolicy: DeliveryResizePolicy;
  readonly kernel: DeliveryKernel;
  readonly colourPolicy: DeliveryColourPolicy;
  readonly transparencyPolicy: DeliveryTransparencyPolicy;
  readonly requireMeaningfulTransparency: boolean;
  readonly flattenColour: string;
  readonly outputFormat: DeliveryImageFormat;
  readonly pngStorage: DeliveryPngStorageContract | null;
  readonly candidates: readonly DeliveryEncodingCandidate[];
  readonly quality: DeliveryQualityThresholds;
  readonly maximumOutputBytes: number;
  readonly intendedRuntimeScale: string;
}

export interface PreserveBackgroundPolicy {
  readonly mode: "preserve";
}

export interface RemoveBorderMattePolicy {
  readonly mode: "remove-border-matte";
  readonly matteColour: string;
  readonly connectionDistance?: number;
  readonly opaqueSeedDistance?: number;
  readonly edgeSearchRadius?: number;
  readonly bleedRadius?: number;
  readonly minimumBorderMatteFraction?: number;
}

export interface LuminanceAlphaBackgroundPolicy {
  readonly mode: "luminance-alpha";
  readonly blackPoint?: number;
  readonly whitePoint?: number;
  readonly gamma?: number;
  readonly outputColour?: string;
  readonly invert?: boolean;
}

export type DeliveryBackgroundPolicy =
  | PreserveBackgroundPolicy
  | RemoveBorderMattePolicy
  | LuminanceAlphaBackgroundPolicy;

export interface DeliveryImageRequest {
  readonly profileId: DeliveryProfileId;
  readonly background: DeliveryBackgroundPolicy;
}

export interface DeliveryImageSourceEvidence {
  readonly sha256: string;
  readonly bytes: number;
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly pages: number;
  readonly hasAlpha: boolean;
}

export interface DeliveryPixelMetrics {
  readonly meanAbsoluteError: number;
  readonly rootMeanSquareError: number;
  readonly psnr: number;
  readonly alphaMeanAbsoluteError: number;
  readonly alphaMaximumDifference: number;
  readonly comparedColourSamples: number;
  readonly pixels: number;
}

export interface DeliveryCandidateEvidence {
  readonly id: string;
  readonly format: DeliveryImageFormat;
  readonly bytes: number;
  readonly sha256: string;
  readonly paletteColours?: number;
  readonly quality?: number;
  readonly nearLossless?: boolean;
  readonly lossless?: boolean;
  readonly dither?: number;
  readonly pngStorage: DeliveryPngStorageEvidence | null;
  readonly metrics: DeliveryPixelMetrics;
  readonly alpha: Readonly<{
    transparentPixels: number;
    partialPixels: number;
    opaquePixels: number;
  }>;
  readonly passed: boolean;
  readonly failures: readonly string[];
}

export interface DeliveryImageEvidence {
  readonly schema: typeof DELIVERY_OPTIMIZER_RECEIPT_SCHEMA;
  readonly optimizerVersion: typeof DELIVERY_OPTIMIZER_VERSION;
  readonly profileCatalogVersion: typeof PROFILE_CATALOG_VERSION;
  readonly profileId: DeliveryProfileId;
  readonly profileSha256: string;
  readonly source: DeliveryImageSourceEvidence;
  readonly prepared: Readonly<{
    sha256: string;
    bytes: number;
    format: DeliveryImageFormat;
    width: number;
    height: number;
    hasAlpha: boolean;
    pngStorage: DeliveryPngStorageEvidence | null;
  }>;
  readonly transformations: readonly string[];
  readonly background: Readonly<{
    mode: DeliveryBackgroundPolicy["mode"];
    evidence: unknown | null;
  }>;
  readonly candidates: readonly DeliveryCandidateEvidence[];
  readonly selectedCandidateId: string;
  readonly savings: Readonly<{
    bytes: number;
    fraction: number;
  }>;
}

export interface DeliveryImageResult {
  readonly bytes: Buffer;
  readonly evidence: DeliveryImageEvidence;
}

export interface DeliveryBatchManifestItem {
  readonly id: string;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly sourceSha256: string;
  readonly sourceBytes: number;
  readonly profileId: DeliveryProfileId;
  readonly background: DeliveryBackgroundPolicy;
}

export interface DeliveryBatchManifest {
  readonly schema: typeof DELIVERY_OPTIMIZER_SCHEMA;
  readonly batchId: string;
  readonly project: Readonly<{
    id: string;
    title: string;
    engine?: string;
    engineVersion?: string;
    viewport?: Readonly<{ width: number; height: number }>;
    rendering?: string;
  }>;
  readonly items: readonly DeliveryBatchManifestItem[];
}

export interface DeliveryBatchReceiptItem {
  readonly id: string;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly sourceSha256: string;
  readonly sourceBytes: number;
  readonly outputSha256: string;
  readonly outputBytes: number;
  readonly profileId: DeliveryProfileId;
  readonly transformations: readonly string[];
  readonly selectedCandidateId: string;
  readonly evidence: DeliveryImageEvidence;
}

export interface DeliveryBatchReceipt {
  readonly schema: typeof DELIVERY_OPTIMIZER_RECEIPT_SCHEMA;
  readonly optimizerVersion: typeof DELIVERY_OPTIMIZER_VERSION;
  readonly profileCatalogVersion: typeof PROFILE_CATALOG_VERSION;
  readonly batchId: string;
  readonly batchSha256: string;
  readonly project: DeliveryBatchManifest["project"];
  readonly items: readonly DeliveryBatchReceiptItem[];
  readonly totals: Readonly<{
    files: number;
    sourceBytes: number;
    outputBytes: number;
    savedBytes: number;
    savedFraction: number;
  }>;
  readonly exactOutputPaths: readonly string[];
  readonly mutationPerformed: boolean;
}

export class DeliveryOptimizerError extends Error {
  public readonly code: string;
  public readonly details: Readonly<Record<string, unknown>> | null;

  public constructor(
    code: string,
    message: string,
    details: Readonly<Record<string, unknown>> | null = null,
  ) {
    super(message);
    this.name = "DeliveryOptimizerError";
    this.code = code;
    this.details = details;
  }
}
