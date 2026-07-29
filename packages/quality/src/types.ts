export const SPRITE_QUALITY_SCHEMA_VERSION = "1.0" as const;

export type SpriteTransparencyExpectation =
  | "opaque"
  | "alpha-required"
  | "alpha-preferred";

export type SpriteQualityGateStatus = "pass" | "fail" | "warning" | "skipped";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface RgbaColour {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a?: number;
}

export interface SpriteFrameQualityExpectations {
  readonly frameId?: string;
  readonly transparency: SpriteTransparencyExpectation;
  readonly expectedWidth?: number;
  readonly expectedHeight?: number;
  readonly expectedFormat?: string;
  readonly safePadding?: number;
  readonly alphaVisibleThreshold?: number;
  readonly knownMatteColours?: readonly (string | RgbaColour)[];
  readonly flatMatteBorderThreshold?: number;
  readonly checkerboardConfidenceThreshold?: number;
  readonly maximumHaloFraction?: number;
  readonly maximumUnexpectedTransparentRgbFraction?: number;
}

export interface NormalizedSpriteFrameQualityExpectations {
  readonly frameId: string;
  readonly transparency: SpriteTransparencyExpectation;
  readonly expectedWidth?: number;
  readonly expectedHeight?: number;
  readonly expectedFormat?: string;
  readonly safePadding: number;
  readonly alphaVisibleThreshold: number;
  readonly knownMatteColours: readonly RgbaColour[];
  readonly flatMatteBorderThreshold: number;
  readonly checkerboardConfidenceThreshold: number;
  readonly maximumHaloFraction: number;
  readonly maximumUnexpectedTransparentRgbFraction: number;
}

export interface DecodedSpriteFrame {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly channels: 4;
  readonly sourceFormat: string;
  readonly sourceHasAlpha: boolean;
  readonly sourcePages: number;
}

export interface SpriteQualityGateResult {
  readonly id: string;
  readonly status: SpriteQualityGateStatus;
  readonly blocking: boolean;
  readonly message: string;
  readonly value?: number | string | boolean;
  readonly threshold?: number | string | boolean;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface SpriteAlphaEvidence {
  readonly transparentPixels: number;
  readonly partialPixels: number;
  readonly opaquePixels: number;
  readonly transparentFraction: number;
  readonly partialFraction: number;
  readonly opaqueFraction: number;
  readonly minimumAlpha: number;
  readonly maximumAlpha: number;
}

export interface SpriteVisibleBoundsEvidence {
  readonly visiblePixels: number;
  readonly visibleFraction: number;
  readonly minX: number | null;
  readonly minY: number | null;
  readonly maxX: number | null;
  readonly maxY: number | null;
  readonly width: number;
  readonly height: number;
  readonly clearance: Readonly<{
    left: number;
    top: number;
    right: number;
    bottom: number;
  }>;
  readonly centroid: Point | null;
  readonly touchingSides: readonly ("left" | "top" | "right" | "bottom")[];
}

export interface SpriteFakeTransparencyEvidence {
  readonly flatMatteDetected: boolean;
  readonly flatMatteConfidence: number;
  readonly dominantBorderColour: RgbaColour | null;
  readonly dominantBorderFraction: number;
  readonly nearestKnownMatteDistance: number | null;
  readonly checkerboardDetected: boolean;
  readonly checkerboardConfidence: number;
  readonly checkerboardTileSize: number | null;
  readonly checkerboardColours: readonly RgbaColour[];
}

export interface SpriteHaloEvidence {
  readonly partialPixelsInspected: number;
  readonly haloPixels: number;
  readonly haloFraction: number;
}

export interface SpriteTransparentRgbEvidence {
  readonly transparentPixelsInspected: number;
  readonly nonZeroTransparentPixels: number;
  readonly intentionalBleedPixels: number;
  readonly unexpectedPixels: number;
  readonly unexpectedFraction: number;
}

export interface SpriteFrameQualityReport {
  readonly schemaVersion: typeof SPRITE_QUALITY_SCHEMA_VERSION;
  readonly frameId: string;
  readonly passed: boolean;
  readonly rawRgbaSha256: string;
  readonly source: Readonly<{
    format: string;
    hasAlpha: boolean;
    pages: number;
    width: number;
    height: number;
    channels: 4;
  }>;
  readonly alpha: SpriteAlphaEvidence;
  readonly visibleBounds: SpriteVisibleBoundsEvidence;
  readonly fakeTransparency: SpriteFakeTransparencyEvidence;
  readonly halo: SpriteHaloEvidence;
  readonly transparentRgb: SpriteTransparentRgbEvidence;
  readonly gates: readonly SpriteQualityGateResult[];
}

export interface SpriteSequenceFrameSpec {
  readonly id: string;
  readonly path: string;
  readonly direction?: string;
  readonly frameIndex: number;
  readonly globalFrameIndex: number;
  readonly durationMs: number;
  readonly pivot: Point;
  readonly baseline?: number;
  readonly groundContact?: boolean;
  readonly intentionalDuplicateOf?: string;
}

export interface SpriteSequenceManifest {
  readonly schemaVersion: "1.0";
  readonly sequenceId: string;
  readonly transparency: SpriteTransparencyExpectation;
  readonly expectedWidth: number;
  readonly expectedHeight: number;
  readonly safePadding?: number;
  readonly expectedPivot?: Point;
  readonly expectedBaseline?: number;
  readonly groundContactTolerance?: number;
  readonly frames: readonly SpriteSequenceFrameSpec[];
}

export interface SpriteDuplicateGroup {
  readonly hash: string;
  readonly frameIds: readonly string[];
  readonly declared: boolean;
}

export interface SpriteSequenceQualityReport {
  readonly schemaVersion: typeof SPRITE_QUALITY_SCHEMA_VERSION;
  readonly sequenceId: string;
  readonly passed: boolean;
  readonly frameReports: readonly SpriteFrameQualityReport[];
  readonly duplicateGroups: readonly SpriteDuplicateGroup[];
  readonly gates: readonly SpriteQualityGateResult[];
  readonly summary: Readonly<{
    frameCount: number;
    passedFrames: number;
    failedFrames: number;
    totalDurationMs: number;
    directions: readonly string[];
  }>;
}

export interface DecodeSpriteFrameOptions {
  readonly maximumPixels?: number;
  readonly maximumInputBytes?: number;
}

export interface AnalyseSpriteSequenceFileOptions extends DecodeSpriteFrameOptions {
  readonly allowedRoots?: readonly string[];
}

export class SpriteQualityInputError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "SpriteQualityInputError";
    this.code = code;
  }
}
