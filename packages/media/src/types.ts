export const SPRITE_ATLAS_SCHEMA_VERSION = "1.0" as const;
export const SPRITE_ATLAS_BUILDER_VERSION = "2026-07-29.1" as const;

export type PowerOfTwoPolicy = "required" | "preferred" | "not-required";
export type TextureFiltering = "nearest" | "linear";
export type AtlasLoopMode = "none" | "linear" | "ping-pong";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rect extends Size {
  readonly x: number;
  readonly y: number;
}

export interface SpriteAtlasSourceFrame {
  readonly id: string;
  readonly path: string;
  readonly pivot?: Point;
  readonly allowEmpty?: boolean;
  readonly tags?: readonly string[];
}

export interface SpriteAtlasAnimationFrame {
  readonly frameId: string;
  readonly durationMs: number;
}

export interface SpriteAtlasAnimation {
  readonly name: string;
  readonly loopMode: AtlasLoopMode;
  readonly frames: readonly SpriteAtlasAnimationFrame[];
}

export interface SpriteAtlasSettings {
  readonly maximumWidth?: number;
  readonly maximumHeight?: number;
  readonly padding?: number;
  readonly extrusion?: number;
  readonly trim?: boolean;
  readonly alphaThreshold?: number;
  readonly powerOfTwo?: PowerOfTwoPolicy;
  readonly textureFiltering?: TextureFiltering;
  readonly pngCompressionLevel?: number;
}

export interface SpriteAtlasOutputSpec {
  readonly imageFileName?: string;
  readonly dataFileName?: string;
  readonly evidenceFileName?: string;
}

export interface SpriteAtlasManifest {
  readonly schemaVersion: typeof SPRITE_ATLAS_SCHEMA_VERSION;
  readonly atlasId: string;
  readonly frames: readonly SpriteAtlasSourceFrame[];
  readonly animations: readonly SpriteAtlasAnimation[];
  readonly settings?: SpriteAtlasSettings;
  readonly output?: SpriteAtlasOutputSpec;
}

export interface NormalizedSpriteAtlasSettings {
  readonly maximumWidth: number;
  readonly maximumHeight: number;
  readonly padding: number;
  readonly extrusion: number;
  readonly trim: boolean;
  readonly alphaThreshold: number;
  readonly powerOfTwo: PowerOfTwoPolicy;
  readonly textureFiltering: TextureFiltering;
  readonly pngCompressionLevel: number;
}

export interface NormalizedSpriteAtlasOutputSpec {
  readonly imageFileName: string;
  readonly dataFileName: string;
  readonly evidenceFileName: string;
}

export interface NormalizedSpriteAtlasManifest {
  readonly schemaVersion: typeof SPRITE_ATLAS_SCHEMA_VERSION;
  readonly atlasId: string;
  readonly frames: readonly SpriteAtlasSourceFrame[];
  readonly animations: readonly SpriteAtlasAnimation[];
  readonly settings: NormalizedSpriteAtlasSettings;
  readonly output: NormalizedSpriteAtlasOutputSpec;
}

export interface DecodedAtlasSourceFrame {
  readonly id: string;
  readonly sourcePath: string;
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly sourceFormat: string;
  readonly sourceHasAlpha: boolean;
  readonly pivot: Point;
  readonly allowEmpty: boolean;
  readonly tags: readonly string[];
}

export interface PreparedAtlasFrame {
  readonly id: string;
  readonly sourcePath: string;
  readonly sourceFormat: string;
  readonly sourceHasAlpha: boolean;
  readonly sourceRgbaSha256: string;
  readonly data: Uint8Array;
  readonly sourceSize: Size;
  readonly trim: Rect;
  readonly empty: boolean;
  readonly pivot: Point;
  readonly trimmedPivot: Point;
  readonly tags: readonly string[];
}

export interface PackedAtlasFrame {
  readonly id: string;
  readonly sourcePath: string;
  readonly sourceFormat: string;
  readonly sourceHasAlpha: boolean;
  readonly sourceRgbaSha256: string;
  readonly sourceSize: Size;
  readonly trim: Rect;
  readonly empty: boolean;
  readonly region: Rect;
  readonly outer: Rect;
  readonly pivot: Point;
  readonly trimmedPivot: Point;
  readonly tags: readonly string[];
}

export interface PackedAtlasAnimationFrame {
  readonly frameId: string;
  readonly durationMs: number;
  readonly relativeDuration: number;
}

export interface PackedAtlasAnimation {
  readonly name: string;
  readonly loopMode: AtlasLoopMode;
  readonly framesPerSecond: number;
  readonly durationQuantumMs: number;
  readonly totalDurationMs: number;
  readonly frames: readonly PackedAtlasAnimationFrame[];
}

export interface SpriteAtlasPackageData {
  readonly schemaVersion: typeof SPRITE_ATLAS_SCHEMA_VERSION;
  readonly builderVersion: typeof SPRITE_ATLAS_BUILDER_VERSION;
  readonly atlasId: string;
  readonly width: number;
  readonly height: number;
  readonly sourceManifestSha256: string;
  readonly atlasImage: Readonly<{
    fileName: string;
    format: "png";
    sha256: string;
    byteLength: number;
    colourSpace: "srgb";
    alpha: true;
  }>;
  readonly settings: NormalizedSpriteAtlasSettings;
  readonly frames: readonly PackedAtlasFrame[];
  readonly animations: readonly PackedAtlasAnimation[];
}

export interface SpriteAtlasPackageEvidence {
  readonly schemaVersion: "1.0";
  readonly atlasId: string;
  readonly sourceManifestSha256: string;
  readonly atlasImageSha256: string;
  readonly atlasDataSha256: string;
  readonly frameSourceHashes: Readonly<Record<string, string>>;
  readonly deterministicTool: Readonly<{
    name: "@evavo/art-media";
    version: typeof SPRITE_ATLAS_BUILDER_VERSION;
  }>;
}

export interface SpriteAtlasPackageWriteResult {
  readonly packageData: SpriteAtlasPackageData;
  readonly imagePath: string;
  readonly dataPath: string;
  readonly evidencePath: string;
  readonly atlasDataSha256: string;
}

export interface BuildSpriteAtlasPackageOptions {
  readonly allowedRoots?: readonly string[];
  readonly maximumInputBytes?: number;
  readonly maximumPixels?: number;
}

export class SpriteAtlasInputError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "SpriteAtlasInputError";
    this.code = code;
  }
}
