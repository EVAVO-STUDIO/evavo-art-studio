export const PROVIDER_CANVAS_PROTOCOL_VERSION = "2026-07-30.2" as const;

export type ProviderCanvasRestorationSampling =
  | "nearest-center"
  | "block-average";

export type ProviderCanvasPaletteMode = "source" | "none";
export type ProviderCanvasAlphaMode = "source" | "candidate";

export interface PixelArtProviderCanvasOptions {
  readonly matteColour: string;
  readonly providerWidth?: number;
  readonly providerHeight?: number;
  readonly contentMarginPixels?: number;
  readonly requireBinaryMask?: boolean;
  readonly restorationSampling?: ProviderCanvasRestorationSampling;
  readonly paletteMode?: ProviderCanvasPaletteMode;
  readonly alphaMode?: ProviderCanvasAlphaMode;
  readonly maximumPaletteColours?: number;
  readonly maximumInputBytes?: number;
  readonly maximumSourcePixels?: number;
  readonly maximumProviderPixels?: number;
}

export interface NormalizedPixelArtProviderCanvasOptions {
  readonly matteColour: Readonly<{
    r: number;
    g: number;
    b: number;
    hex: string;
  }>;
  readonly providerWidth?: number;
  readonly providerHeight?: number;
  readonly contentMarginPixels: number;
  readonly requireBinaryMask: boolean;
  readonly restorationSampling: ProviderCanvasRestorationSampling;
  readonly paletteMode: ProviderCanvasPaletteMode;
  readonly alphaMode: ProviderCanvasAlphaMode;
  readonly maximumPaletteColours: number;
  readonly maximumInputBytes: number;
  readonly maximumSourcePixels: number;
  readonly maximumProviderPixels: number;
}

export interface PixelArtProviderCanvasManifest {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof PROVIDER_CANVAS_PROTOCOL_VERSION;
  readonly source: Readonly<{
    width: number;
    height: number;
    format: string;
    baseSha256: string;
    maskSha256: string;
    sourceHasAlpha: boolean;
  }>;
  readonly provider: Readonly<{
    width: number;
    height: number;
    size: string;
    scale: number;
    offsetX: number;
    offsetY: number;
    contentWidth: number;
    contentHeight: number;
    matteColour: string;
    baseSha256: string;
    maskSha256: string;
  }>;
  readonly mask: Readonly<{
    editablePixels: number;
    protectedPixels: number;
    partiallyEditablePixels: number;
    editableFraction: number;
    binary: boolean;
  }>;
  readonly restoration: Readonly<{
    sampling: ProviderCanvasRestorationSampling;
    paletteMode: ProviderCanvasPaletteMode;
    alphaMode: ProviderCanvasAlphaMode;
    palette: readonly Readonly<{
      r: number;
      g: number;
      b: number;
      a: number;
    }>[];
    protectedSourceRgbaSha256: string;
  }>;
}

export interface PreparedPixelArtProviderCanvas {
  readonly basePng: Buffer;
  readonly maskPng: Buffer;
  readonly manifest: PixelArtProviderCanvasManifest;
}

export interface RestorePixelArtProviderCanvasOptions {
  readonly maximumInputBytes?: number;
  readonly maximumProviderPixels?: number;
}

export interface PixelArtProviderCanvasRestorationEvidence {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof PROVIDER_CANVAS_PROTOCOL_VERSION;
  readonly sourceBaseSha256: string;
  readonly sourceMaskSha256: string;
  readonly providerCandidateSha256: string;
  readonly restoredPngSha256: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly providerWidth: number;
  readonly providerHeight: number;
  readonly scale: number;
  readonly sampling: ProviderCanvasRestorationSampling;
  readonly paletteMode: ProviderCanvasPaletteMode;
  readonly alphaMode: ProviderCanvasAlphaMode;
  readonly paletteColours: number;
  readonly protectedPixels: number;
  readonly editablePixels: number;
  readonly protectedChannelComparisons: number;
  readonly protectedChannelMismatches: number;
  readonly protectedExact: boolean;
  readonly editablePixelsPaletteMapped: number;
  readonly editableAlphaChangesFromSource: number;
  readonly averageEditableBlockDeviation: number;
  readonly maximumEditableBlockDeviation: number;
}

export interface RestoredPixelArtProviderCanvas {
  readonly png: Buffer;
  readonly evidence: PixelArtProviderCanvasRestorationEvidence;
}

export class ProviderCanvasError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "ProviderCanvasError";
    this.code = code;
  }
}
