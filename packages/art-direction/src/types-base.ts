export const ART_DIRECTION_PROTOCOL_VERSION = "2026-07-31.1" as const;

export const ART_DIRECTION_PRESET_IDS = [
  "dos-rpg-1992",
  "dos-strategy-1994",
  "point-and-click-1993",
  "console-platformer-16bit",
  "isometric-rpg-1997",
  "prerendered-2.5d-1996",
  "dark-fantasy-pc-1998",
  "engraved-monochrome-1871",
] as const;

export type ArtDirectionPresetId = (typeof ART_DIRECTION_PRESET_IDS)[number];

export const ART_DIRECTION_OUTPUT_PROFILE_IDS = [
  "godot-4.6.2-character-sprite",
  "godot-4.6.2-isometric-character",
  "godot-4.6.2-tile-atlas",
  "godot-4.6.2-particle-flipbook",
  "godot-4.6.2-ui-pixel",
  "godot-4.6.2-2.5d-billboard",
  "web-game-raster",
  "cinematic-frame-sequence",
  "print-illustration-master",
] as const;

export type ArtDirectionOutputProfileId =
  (typeof ART_DIRECTION_OUTPUT_PROFILE_IDS)[number];

export type ArtRenderingMode =
  | "pixel-art"
  | "indexed-raster"
  | "painted-raster"
  | "isometric-pixel"
  | "pre-rendered-2.5d"
  | "engraved-monochrome"
  | "vector-flat"
  | "painterly-illustration";

export type ArtProjection =
  | "front"
  | "side"
  | "top-down"
  | "three-quarter"
  | "isometric-2:1"
  | "dimetric"
  | "orthographic-billboard"
  | "perspective-2.5d"
  | "screen-space-ui";

export type ArtAssetFamily =
  | "character"
  | "creature"
  | "prop"
  | "tile"
  | "terrain"
  | "environment"
  | "ui"
  | "icon"
  | "portrait"
  | "particle"
  | "cinematic"
  | "background"
  | "decal"
  | "font";

export type ArtProductionMethod =
  | "authored-cel"
  | "layered-rig"
  | "hybrid"
  | "single-static"
  | "tile-set"
  | "particle-flipbook"
  | "cinematic-sequence";

export type ArtLayerRole =
  | "identity-core"
  | "costume"
  | "hair"
  | "face"
  | "shadow"
  | "equipment"
  | "weapon"
  | "effect"
  | "emission"
  | "normal"
  | "collision"
  | "occlusion"
  | "guide"
  | "background"
  | "foreground"
  | "tile-mask"
  | "depth";

export type ArtLayerTreatment =
  | "baked"
  | "separate-per-frame"
  | "linked-cel"
  | "static-family"
  | "engine-sidecar"
  | "guide-only"
  | "runtime-rig";

export type ArtDirectionGateSeverity = "blocking" | "warning";

export interface ArtDirectionReferenceInput {
  readonly id: string;
  readonly role:
    | "style"
    | "palette"
    | "camera"
    | "lighting"
    | "material"
    | "identity"
    | "motion"
    | "historical"
    | "composition";
  readonly uri: string;
  readonly weight?: number;
  readonly note?: string;
  readonly rights?: string;
}

export interface ArtDirectionPaletteInput {
  readonly mode?: "indexed" | "rgb" | "monochrome";
  readonly colours?: readonly string[];
  readonly maxColours?: number;
  readonly transparentIndex?: number;
  readonly preserveIndices?: boolean;
  readonly rampCount?: number;
  readonly hueShift?: "none" | "subtle" | "pronounced";
}

export interface ArtDirectionPixelGridInput {
  readonly enabled?: boolean;
  readonly nativePixelScale?: number;
  readonly integerUpscaleOnly?: boolean;
  readonly antialias?: "none" | "selective" | "full";
  readonly subpixelMotion?: "forbidden" | "limited" | "allowed";
  readonly clusterPolicy?:
    | "deliberate-clusters"
    | "clean-raster"
    | "painted-edge"
    | "not-applicable";
  readonly dithering?: "none" | "ordered" | "patterned" | "manual" | "adaptive";
  readonly outline?:
    | "none"
    | "single-colour"
    | "selective"
    | "coloured"
    | "inked";
}

export interface ArtDirectionCameraInput {
  readonly projection?: ArtProjection;
  readonly fixed?: boolean;
  readonly yawDegrees?: number;
  readonly pitchDegrees?: number;
  readonly rollDegrees?: number;
  readonly orthographicScale?: number;
  readonly horizon?: "none" | "low" | "mid" | "high";
  readonly mirroring?: "forbidden" | "symmetric-only" | "allowed";
}

export interface ArtDirectionLightingInput {
  readonly fixed?: boolean;
  readonly keyDirectionDegrees?: number;
  readonly keyElevationDegrees?: number;
  readonly ambientLevel?: number;
  readonly shadowDirectionDegrees?: number;
  readonly shadowTreatment?: "none" | "baked" | "separate" | "engine";
  readonly frameVariation?: "forbidden" | "authored" | "allowed";
  readonly notes?: readonly string[];
}

export interface ArtDirectionMotionInput {
  readonly timingFeel?:
    | "snappy"
    | "weighty"
    | "floaty"
    | "mechanical"
    | "naturalistic"
    | "cinematic";
  readonly keyPoseFirst?: boolean;
  readonly exactFrameDurations?: boolean;
  readonly maximumAnchorDriftPixels?: number;
  readonly smearFrames?: "forbidden" | "limited" | "allowed";
  readonly squashAndStretch?: "forbidden" | "limited" | "allowed";
  readonly loopClosureRequired?: boolean;
}

export interface ArtDirectionAntiGenericInput {
  readonly requiredDistinctiveMotifs?: readonly string[];
  readonly prohibitedGenericMotifs?: readonly string[];
  readonly prohibitUnrequestedProps?: boolean;
  readonly prohibitReadableText?: boolean;
  readonly prohibitWatermarks?: boolean;
  readonly prohibitModernGloss?: boolean;
  readonly prohibitRandomMicrodetail?: boolean;
  readonly prohibitStyleDrift?: boolean;
  readonly requireHistoricalPlausibility?: boolean;
}

export interface ArtDirectionStyleInput {
  readonly title?: string;
  readonly intent?: string;
  readonly renderingMode?: ArtRenderingMode;
  readonly projection?: ArtProjection;
  readonly era?: string;
  readonly mustHave?: readonly string[];
  readonly mustAvoid?: readonly string[];
  readonly palette?: ArtDirectionPaletteInput;
  readonly pixelGrid?: ArtDirectionPixelGridInput;
  readonly camera?: ArtDirectionCameraInput;
  readonly lighting?: ArtDirectionLightingInput;
  readonly motion?: ArtDirectionMotionInput;
  readonly materialLanguage?: readonly string[];
  readonly lineTreatment?: readonly string[];
  readonly compositionRules?: readonly string[];
  readonly antiGeneric?: ArtDirectionAntiGenericInput;
  readonly references?: readonly ArtDirectionReferenceInput[];
}

export interface ArtDirectionProjectInput {
  readonly projectId: string;
  readonly title: string;
  readonly engine?: string;
  readonly engineVersion?: string;
  readonly gameGenre?: string;
  readonly targetPlatform?: string;
  readonly viewport?: Readonly<{ width: number; height: number }>;
  readonly worldScale?: Readonly<{
    readonly pixelsPerTile?: number;
    readonly characterHeightPixels?: number;
    readonly tileWidthPixels?: number;
    readonly tileHeightPixels?: number;
  }>;
}

export interface ArtDirectionAssetInput {
  readonly assetId: string;
  readonly family: ArtAssetFamily;
  readonly purpose: string;
  readonly dimensions: Readonly<{ width: number; height: number }>;
  readonly transparency?: "required" | "preferred" | "opaque";
  readonly animated?: boolean;
  readonly frameCount?: number;
  readonly framesPerSecond?: number;
  readonly loop?: boolean;
  readonly directionCount?: number;
  readonly directionNames?: readonly string[];
  readonly asymmetric?: boolean;
  readonly hasHeldItems?: boolean;
  readonly runtimeEquipmentSwaps?: boolean;
  readonly runtimeCostumeVariants?: boolean;
  readonly independentEffects?: boolean;
  readonly independentShadow?: boolean;
  readonly needsCollision?: boolean;
  readonly needsNormalMap?: boolean;
  readonly needsEmissionMap?: boolean;
  readonly largeDeformations?: boolean;
  readonly secondaryMotion?: readonly ("hair" | "cloak" | "tail" | "equipment")[];
  readonly tileFootprint?: Readonly<{ width: number; height: number }>;
  readonly notes?: readonly string[];
}

export interface ArtDirectionLayerOverrideInput {
  readonly role: ArtLayerRole;
  readonly treatment: ArtLayerTreatment;
  readonly reason: string;
}

export interface ArtDirectionCompileRequestInput {
  readonly schemaVersion: "1.0";
  readonly contractId: string;
  readonly presetId?: ArtDirectionPresetId;
  readonly project: ArtDirectionProjectInput;
  readonly style?: ArtDirectionStyleInput;
  readonly asset: ArtDirectionAssetInput;
  readonly outputProfileIds: readonly ArtDirectionOutputProfileId[];
  readonly layerOverrides?: readonly ArtDirectionLayerOverrideInput[];
  readonly metadata?: unknown;
}

export interface NormalizedArtDirectionReference {
  readonly id: string;
  readonly role: ArtDirectionReferenceInput["role"];
  readonly uri: string;
  readonly weight: number;
  readonly note?: string;
  readonly rights?: string;
}

export interface NormalizedArtDirectionStyle {
  readonly title: string;
  readonly intent: string;
  readonly renderingMode: ArtRenderingMode;
  readonly projection: ArtProjection;
  readonly era: string;
  readonly mustHave: readonly string[];
  readonly mustAvoid: readonly string[];
  readonly palette: Readonly<{
    readonly mode: "indexed" | "rgb" | "monochrome";
    readonly colours: readonly string[];
    readonly maxColours: number;
    readonly transparentIndex?: number;
    readonly preserveIndices: boolean;
    readonly rampCount: number;
    readonly hueShift: "none" | "subtle" | "pronounced";
  }>;
  readonly pixelGrid: Readonly<{
    readonly enabled: boolean;
    readonly nativePixelScale: number;
    readonly integerUpscaleOnly: boolean;
    readonly antialias: "none" | "selective" | "full";
    readonly subpixelMotion: "forbidden" | "limited" | "allowed";
    readonly clusterPolicy:
      | "deliberate-clusters"
      | "clean-raster"
      | "painted-edge"
      | "not-applicable";
    readonly dithering: "none" | "ordered" | "patterned" | "manual" | "adaptive";
    readonly outline:
      | "none"
      | "single-colour"
      | "selective"
      | "coloured"
      | "inked";
  }>;
  readonly camera: Readonly<{
    readonly projection: ArtProjection;
    readonly fixed: boolean;
    readonly yawDegrees: number;
    readonly pitchDegrees: number;
    readonly rollDegrees: number;
    readonly orthographicScale: number;
    readonly horizon: "none" | "low" | "mid" | "high";
    readonly mirroring: "forbidden" | "symmetric-only" | "allowed";
  }>;
  readonly lighting: Readonly<{
    readonly fixed: boolean;
    readonly keyDirectionDegrees: number;
    readonly keyElevationDegrees: number;
    readonly ambientLevel: number;
    readonly shadowDirectionDegrees: number;
    readonly shadowTreatment: "none" | "baked" | "separate" | "engine";
    readonly frameVariation: "forbidden" | "authored" | "allowed";
    readonly notes: readonly string[];
  }>;
  readonly motion: Readonly<{
    readonly timingFeel:
      | "snappy"
      | "weighty"
      | "floaty"
      | "mechanical"
      | "naturalistic"
      | "cinematic";
    readonly keyPoseFirst: boolean;
    readonly exactFrameDurations: boolean;
    readonly maximumAnchorDriftPixels: number;
    readonly smearFrames: "forbidden" | "limited" | "allowed";
    readonly squashAndStretch: "forbidden" | "limited" | "allowed";
    readonly loopClosureRequired: boolean;
  }>;
  readonly materialLanguage: readonly string[];
  readonly lineTreatment: readonly string[];
  readonly compositionRules: readonly string[];
  readonly antiGeneric: Readonly<{
    readonly requiredDistinctiveMotifs: readonly string[];
    readonly prohibitedGenericMotifs: readonly string[];
    readonly prohibitUnrequestedProps: boolean;
    readonly prohibitReadableText: boolean;
    readonly prohibitWatermarks: boolean;
    readonly prohibitModernGloss: boolean;
    readonly prohibitRandomMicrodetail: boolean;
    readonly prohibitStyleDrift: boolean;
    readonly requireHistoricalPlausibility: boolean;
  }>;
  readonly references: readonly NormalizedArtDirectionReference[];
}

export interface NormalizedArtDirectionCompileRequest {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof ART_DIRECTION_PROTOCOL_VERSION;
  readonly contractId: string;
  readonly presetId?: ArtDirectionPresetId;
  readonly project: Readonly<{
    readonly projectId: string;
    readonly title: string;
    readonly engine: string;
    readonly engineVersion: string;
    readonly gameGenre: string;
    readonly targetPlatform: string;
    readonly viewport?: Readonly<{ width: number; height: number }>;
    readonly worldScale?: Readonly<{
      readonly pixelsPerTile?: number;
      readonly characterHeightPixels?: number;
      readonly tileWidthPixels?: number;
      readonly tileHeightPixels?: number;
    }>;
  }>;
  readonly style: NormalizedArtDirectionStyle;
  readonly asset: Readonly<{
    readonly assetId: string;
    readonly family: ArtAssetFamily;
    readonly purpose: string;
    readonly dimensions: Readonly<{ width: number; height: number }>;
    readonly transparency: "required" | "preferred" | "opaque";
    readonly animated: boolean;
    readonly frameCount: number;
    readonly framesPerSecond: number;
    readonly loop: boolean;
    readonly directionCount: number;
    readonly directionNames: readonly string[];
    readonly asymmetric: boolean;
    readonly hasHeldItems: boolean;
    readonly runtimeEquipmentSwaps: boolean;
    readonly runtimeCostumeVariants: boolean;
    readonly independentEffects: boolean;
    readonly independentShadow: boolean;
    readonly needsCollision: boolean;
    readonly needsNormalMap: boolean;
    readonly needsEmissionMap: boolean;
    readonly largeDeformations: boolean;
    readonly secondaryMotion: readonly ("hair" | "cloak" | "tail" | "equipment")[];
    readonly tileFootprint?: Readonly<{ width: number; height: number }>;
    readonly notes: readonly string[];
  }>;
  readonly outputProfileIds: readonly ArtDirectionOutputProfileId[];
  readonly layerOverrides: readonly ArtDirectionLayerOverrideInput[];
  readonly metadata?: unknown;
}

export interface ArtDirectionPresetDefinition {
  readonly id: ArtDirectionPresetId;
  readonly title: string;
  readonly description: string;
  readonly lockedFields: readonly string[];
  readonly compatibleFamilies: readonly ArtAssetFamily[];
  readonly style: ArtDirectionStyleInput;
  readonly defaultDirections: readonly string[];
  readonly defaultOutputProfileIds: readonly ArtDirectionOutputProfileId[];
}

export interface ArtDirectionOutputProfileDefinition {
  readonly id: ArtDirectionOutputProfileId;
  readonly title: string;
  readonly target: "godot-4.6.2" | "web" | "print" | "generic";
  readonly compatibleFamilies: readonly ArtAssetFamily[];
  readonly requiresTransparency: boolean;
  readonly masterFormats: readonly string[];
  readonly derivativeFormats: readonly string[];
  readonly textureFiltering: "nearest" | "linear" | "mixed" | "not-applicable";
  readonly atlas: Readonly<{
    readonly allowed: boolean;
    readonly rotation: "forbidden" | "allowed";
    readonly paddingPixels: number;
    readonly extrusionPixels: number;
    readonly trim: "forbidden" | "alpha-aware" | "allowed";
  }>;
  readonly sourceRetention: readonly string[];
  readonly engineMetadata: readonly string[];
  readonly importRecommendations: readonly string[];
}

export interface CompiledArtLayerDecision {
  readonly id: string;
  readonly role: ArtLayerRole;
  readonly treatment: ArtLayerTreatment;
  readonly required: boolean;
  readonly contributesToColour: boolean;
  readonly contributesToIdentity: boolean;
  readonly interchangeable: boolean;
  readonly timingIndependent: boolean;
  readonly zOrder: number;
  readonly reason: string;
  readonly exportPolicy: "source-and-runtime" | "source-only" | "runtime-only" | "guide-only";
}

export interface CompiledArtDirectionGate {
  readonly id: string;
  readonly severity: ArtDirectionGateSeverity;
  readonly description: string;
  readonly evidence: readonly string[];
  readonly threshold?: number | string | boolean;
}

export interface CompiledArtDirectionContract {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof ART_DIRECTION_PROTOCOL_VERSION;
  readonly contractId: string;
  readonly requestSha256: string;
  readonly contractSha256: string;
  readonly preset: Readonly<{
    readonly id?: ArtDirectionPresetId;
    readonly title: string;
    readonly lockedFields: readonly string[];
  }>;
  readonly project: NormalizedArtDirectionCompileRequest["project"];
  readonly style: NormalizedArtDirectionStyle;
  readonly asset: NormalizedArtDirectionCompileRequest["asset"];
  readonly production: Readonly<{
    readonly method: ArtProductionMethod;
    readonly methodReasons: readonly string[];
    readonly directionNames: readonly string[];
    readonly frameUnit: "single-frame" | "single-layer" | "single-static" | "tile" | "cinematic-frame";
    readonly pivot: Readonly<{ x: number; y: number }>;
    readonly baseline: number;
    readonly ySortOrigin: Readonly<{ x: number; y: number }>;
    readonly tileFootprint?: Readonly<{ width: number; height: number }>;
    readonly layers: readonly CompiledArtLayerDecision[];
    readonly shot: Readonly<{
      readonly include: readonly string[];
      readonly exclude: readonly string[];
      readonly framing: readonly string[];
      readonly safePaddingPixels: number;
      readonly cropPolicy: "full-motion-bounds" | "tile-bounds" | "full-canvas";
      readonly backgroundPolicy: "transparent" | "opaque" | "separate-background";
    }>;
  }>;
  readonly provider: Readonly<{
    readonly unitOfWork: "one-frame" | "one-layer" | "one-static-asset" | "one-tile" | "one-cinematic-frame";
    readonly orderedInstructions: readonly string[];
    readonly immutableLocks: readonly string[];
    readonly permittedChanges: readonly string[];
    readonly prohibitedChanges: readonly string[];
  }>;
  readonly outputs: readonly ArtDirectionOutputProfileDefinition[];
  readonly qualityGates: readonly CompiledArtDirectionGate[];
  readonly delivery: Readonly<{
    readonly sourceOfTruth: readonly string[];
    readonly namingPattern: string;
    readonly folderStructure: readonly string[];
    readonly metadataSidecars: readonly string[];
    readonly godot?: Readonly<{
      readonly engineVersion: "4.6.2";
      readonly nodeRecommendations: readonly string[];
      readonly projectSettings: readonly string[];
      readonly resourceOutputs: readonly string[];
    }>;
  }>;
  readonly warnings: readonly string[];
  readonly metadata?: unknown;
}

export interface CompiledArtDirectionJob {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof ART_DIRECTION_PROTOCOL_VERSION;
  readonly request: NormalizedArtDirectionCompileRequest;
  readonly requestSha256: string;
  readonly executionMode: "deterministic-compile-only";
  readonly runtimeJob: Readonly<{
    readonly queue: "control";
    readonly kind: "art.direction.compile";
    readonly idempotencyKey: string;
    readonly payload: NormalizedArtDirectionCompileRequest;
    readonly inputArtifacts: readonly [];
    readonly requiredCapabilities: readonly [
      "art-direction.compile",
      "style.preset.resolve",
      "output-profile.compile",
      "evidence.bundle",
    ];
    readonly maximumAttempts: 1;
    readonly leaseDurationMs: 60_000;
    readonly timeoutMs: 300_000;
    readonly labels: Readonly<{
      readonly contractId: string;
      readonly assetId: string;
      readonly projectId: string;
    }>;
  }>;
}

export class ArtDirectionError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  public constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ArtDirectionError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
