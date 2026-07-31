import type {
  ArtDirectionCompileRequestInput,
  ArtLayerRole,
  ArtLayerTreatment,
  CompiledArtDirectionContract,
} from "@evavo/art-direction";

export const SPRITE_PLANNER_PROTOCOL_VERSION = "2026-07-31.1" as const;

export const SPRITE_PLAN_ROLES = [
  "playable-character",
  "npc",
  "enemy",
  "boss",
  "companion",
  "vehicle",
  "animated-prop",
  "destructible-prop",
  "particle-effect",
  "ui-sprite",
  "portrait-character",
] as const;
export type SpritePlanRole = (typeof SPRITE_PLAN_ROLES)[number];

export const SPRITE_GAMEPLAY_PROFILES = [
  "platformer",
  "action-rpg",
  "tactical-rpg",
  "strategy",
  "adventure",
  "fighting",
  "shooter",
  "simulation",
  "visual-novel",
  "custom",
] as const;
export type SpriteGameplayProfile = (typeof SPRITE_GAMEPLAY_PROFILES)[number];

export const SPRITE_COVERAGE_LEVELS = ["core", "complete", "cinematic"] as const;
export type SpriteCoverageLevel = (typeof SPRITE_COVERAGE_LEVELS)[number];

export const SPRITE_FIDELITY_LEVELS = ["economical", "standard", "premium"] as const;
export type SpriteFidelityLevel = (typeof SPRITE_FIDELITY_LEVELS)[number];

export const SPRITE_FEATURES = [
  "walk", "run", "turn", "crouch", "jump", "climb", "swim", "fly",
  "melee", "heavy-melee", "ranged", "aim", "reload", "block", "parry", "dodge", "cast",
  "interact", "use-item", "pickup", "push-pull", "talk", "gesture", "work-loop",
  "alert", "hit-react", "stun", "knockdown", "death", "spawn", "despawn", "phase-transition", "special",
  "open-close", "activate", "damage-states", "hover-press", "portrait-emotes",
  "particle-loop", "particle-impact", "particle-trail",
] as const;
export type SpriteFeature = (typeof SPRITE_FEATURES)[number];

export type SpriteClipCategory = "foundation" | "locomotion" | "combat" | "interaction" | "state" | "cinematic" | "prop" | "particle" | "ui" | "portrait";
export type SpriteLoopMode = "none" | "linear" | "ping-pong";
export type SpriteDirectionMode = "all" | "horizontal" | "front-only" | "none";
export type SpriteSheetStrategy = "per-clip-layer-grid" | "per-clip-composite-grid" | "atlas-only" | "individual-frames-only";

export interface SpritePlanClipOverrideInput {
  readonly id: string;
  readonly include?: boolean;
  readonly framesPerDirection?: number;
  readonly framesPerSecond?: number;
  readonly loopMode?: SpriteLoopMode;
  readonly directionNames?: readonly string[];
  readonly keyPoseFrames?: readonly number[];
  readonly reason?: string;
}

export interface SpritePlanVariantInput {
  readonly costumeVariants?: number;
  readonly equipmentVariants?: number;
  readonly weaponVariants?: number;
  readonly teamColourVariants?: number;
  readonly damageVariants?: number;
}

export interface SpritePlanOutputInput {
  readonly sheetStrategy?: SpriteSheetStrategy;
  readonly maximumSheetSize?: number;
  readonly includeAsepriteExport?: boolean;
  readonly includePerClipSheets?: boolean;
  readonly includeFamilyAtlas?: boolean;
  readonly includeGodotResources?: boolean;
}

export interface SpritePlanCompileRequestInput {
  readonly schemaVersion: "1.0";
  readonly planId: string;
  readonly artDirectionRequest?: ArtDirectionCompileRequestInput | unknown;
  readonly artDirectionContract?: CompiledArtDirectionContract | unknown;
  readonly artDirectionContractArtifactId?: string;
  readonly role: SpritePlanRole;
  readonly gameplayProfile: SpriteGameplayProfile;
  readonly coverage?: SpriteCoverageLevel;
  readonly fidelity?: SpriteFidelityLevel;
  readonly includeFeatures?: readonly SpriteFeature[];
  readonly excludeFeatures?: readonly SpriteFeature[];
  readonly allowDerivedMirrors?: boolean;
  readonly variants?: SpritePlanVariantInput;
  readonly clipOverrides?: readonly SpritePlanClipOverrideInput[];
  readonly output?: SpritePlanOutputInput;
  readonly metadata?: unknown;
}

export interface NormalizedSpritePlanCompileRequest {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof SPRITE_PLANNER_PROTOCOL_VERSION;
  readonly planId: string;
  readonly artDirectionContract: CompiledArtDirectionContract;
  readonly artDirectionContractArtifactId?: string;
  readonly role: SpritePlanRole;
  readonly gameplayProfile: SpriteGameplayProfile;
  readonly coverage: SpriteCoverageLevel;
  readonly fidelity: SpriteFidelityLevel;
  readonly features: readonly SpriteFeature[];
  readonly allowDerivedMirrors: boolean;
  readonly variants: Readonly<{
    costumeVariants: number;
    equipmentVariants: number;
    weaponVariants: number;
    teamColourVariants: number;
    damageVariants: number;
  }>;
  readonly clipOverrides: readonly SpritePlanClipOverrideInput[];
  readonly output: Readonly<{
    sheetStrategy: SpriteSheetStrategy;
    maximumSheetSize: number;
    includeAsepriteExport: boolean;
    includePerClipSheets: boolean;
    includeFamilyAtlas: boolean;
    includeGodotResources: boolean;
  }>;
  readonly metadata?: unknown;
}

export interface SpritePlannedDirection {
  readonly name: string;
  readonly index: number;
  readonly authored: boolean;
  readonly masterId: string;
  readonly mirrorOf?: string;
  readonly reason: string;
}

export interface SpritePlannedClip {
  readonly id: string;
  readonly category: SpriteClipCategory;
  readonly required: boolean;
  readonly reason: string;
  readonly directionMode: SpriteDirectionMode;
  readonly directionNames: readonly string[];
  readonly authoredDirectionNames: readonly string[];
  readonly framesPerDirection: number;
  readonly framesPerSecond: number;
  readonly frameDurationsMs: readonly number[];
  readonly loopMode: SpriteLoopMode;
  readonly keyPoseFrames: readonly number[];
  readonly runtimeFrameCount: number;
  readonly authoredFrameCount: number;
  readonly asepriteTagNames: readonly string[];
}

export interface SpritePlannedFrame {
  readonly id: string;
  readonly clipId: string;
  readonly direction: string;
  readonly frameIndex: number;
  readonly globalFrameIndex: number;
  readonly durationMs: number;
  readonly keyPose: boolean;
  readonly authored: boolean;
  readonly sourceDirection: string;
  readonly compositePath: string;
}

export interface SpriteLayerWorkload {
  readonly role: ArtLayerRole;
  readonly treatment: ArtLayerTreatment;
  readonly required: boolean;
  readonly contributesToColour: boolean;
  readonly contributesToIdentity: boolean;
  readonly variantCount: number;
  readonly minimumUniqueSourceUnits: number;
  readonly maximumSourceUnits: number;
  readonly runtimeBindings: number;
  readonly pathPattern: string;
  readonly reason: string;
}

export interface SpriteVariantPlan {
  readonly runtimeCombinations: number;
  readonly flattenedFullFamilyCombinations: number;
  readonly authoredVariantUnits: number;
  readonly strategies: readonly Readonly<{
    readonly kind: "costume" | "equipment" | "weapon" | "team-colour" | "damage";
    readonly count: number;
    readonly strategy: "separate-layer" | "palette-map" | "separate-family" | "not-required";
    readonly reason: string;
  }>[];
}

export interface SpriteSheetPlan {
  readonly id: string;
  readonly clipId: string;
  readonly layerRole: ArtLayerRole | "composite";
  readonly purpose: "source-review" | "runtime-derivative";
  readonly rows: number;
  readonly columns: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly frameCount: number;
  readonly layout: "rows";
  readonly includeDerivedDirections: boolean;
  readonly trim: "forbidden" | "alpha-aware";
  readonly rotation: "forbidden";
  readonly paddingPixels: number;
  readonly extrusionPixels: number;
  readonly imagePath: string;
  readonly dataPath: string;
}

export interface SpriteAtlasPlan {
  readonly enabled: boolean;
  readonly maximumWidth: number;
  readonly maximumHeight: number;
  readonly packing: "deterministic-maxrects-no-rotation";
  readonly trim: "forbidden" | "alpha-aware";
  readonly paddingPixels: number;
  readonly extrusionPixels: number;
  readonly estimatedPages: number;
  readonly sourceFrameCount: number;
  readonly imagePathPattern: string;
  readonly dataPathPattern: string;
}

export interface SpriteAsepritePlan {
  readonly enabled: boolean;
  readonly sourcePath: string;
  readonly tags: readonly Readonly<{
    readonly name: string;
    readonly clipId: string;
    readonly direction: string;
    readonly fromFrame: number;
    readonly toFrame: number;
    readonly loopMode: SpriteLoopMode;
  }>[];
  readonly slices: readonly Readonly<{
    readonly name: string;
    readonly purpose: "pivot" | "ground-contact" | "tile-footprint" | "safe-bounds";
    readonly x: number;
    readonly y: number;
  }>[];
  readonly exportCommands: readonly string[];
  readonly prohibitedOptions: readonly string[];
}

export interface SpriteGodotAnimationPlan {
  readonly name: string;
  readonly clipId: string;
  readonly direction: string;
  readonly loop: boolean;
  readonly framesPerSecond: number;
  readonly durationMultipliers: readonly number[];
  readonly framePaths: readonly string[];
}

export interface SpriteGodotPlan {
  readonly enabled: boolean;
  readonly engineVersion: string;
  readonly primaryNode: "AnimatedSprite2D" | "Sprite2D";
  readonly resourcePath: string;
  readonly atlasResourcePath: string;
  readonly animationLibraryPath: string;
  readonly layerNodes: readonly Readonly<{
    readonly name: string;
    readonly role: ArtLayerRole;
    readonly node: "AnimatedSprite2D" | "Sprite2D" | "CollisionShape2D" | "LightOccluder2D";
    readonly synchroniseAnimationAndFrame: boolean;
  }>[];
  readonly animations: readonly SpriteGodotAnimationPlan[];
  readonly projectRequirements: readonly string[];
  readonly ySortOrigin: Readonly<{ x: number; y: number }>;
  readonly pivot: Readonly<{ x: number; y: number }>;
}

export interface SpritePlanGate {
  readonly id: string;
  readonly severity: "blocking" | "warning";
  readonly description: string;
  readonly evidence: readonly string[];
  readonly expected?: number | string | boolean;
}

export interface SpritePlanWorkItem {
  readonly id: string;
  readonly stage: "bind-art-direction" | "identity-master" | "direction-masters" | "key-poses" | "inbetweens" | "layers" | "mastering" | "family-verification" | "sheets" | "atlas" | "godot" | "release-evidence";
  readonly title: string;
  readonly dependsOn: readonly string[];
  readonly units: number;
  readonly requiredCapabilities: readonly string[];
  readonly produces: readonly string[];
}

export interface CompiledSpriteProductionPlan {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof SPRITE_PLANNER_PROTOCOL_VERSION;
  readonly planId: string;
  readonly requestSha256: string;
  readonly planSha256: string;
  readonly artDirectionBinding: Readonly<{
    readonly contractId: string;
    readonly contractSha256: string;
    readonly protocolVersion: string;
    readonly artifactId?: string;
  }>;
  readonly project: CompiledArtDirectionContract["project"];
  readonly asset: CompiledArtDirectionContract["asset"];
  readonly role: SpritePlanRole;
  readonly gameplayProfile: SpriteGameplayProfile;
  readonly coverage: SpriteCoverageLevel;
  readonly fidelity: SpriteFidelityLevel;
  readonly features: readonly SpriteFeature[];
  readonly directions: readonly SpritePlannedDirection[];
  readonly clips: readonly SpritePlannedClip[];
  readonly frames: readonly SpritePlannedFrame[];
  readonly layers: readonly SpriteLayerWorkload[];
  readonly variants: SpriteVariantPlan;
  readonly sheets: readonly SpriteSheetPlan[];
  readonly atlas: SpriteAtlasPlan;
  readonly aseprite: SpriteAsepritePlan;
  readonly godot: SpriteGodotPlan;
  readonly workItems: readonly SpritePlanWorkItem[];
  readonly qualityGates: readonly SpritePlanGate[];
  readonly totals: Readonly<{
    readonly clips: number;
    readonly runtimeFrames: number;
    readonly authoredFrames: number;
    readonly layerSourceUnits: number;
    readonly runtimeLayerBindings: number;
    readonly sheets: number;
    readonly estimatedAtlasPages: number;
  }>;
  readonly sourceOfTruth: readonly string[];
  readonly warnings: readonly string[];
  readonly metadata?: unknown;
}

export interface CompiledSpritePlanJob {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof SPRITE_PLANNER_PROTOCOL_VERSION;
  readonly request: NormalizedSpritePlanCompileRequest;
  readonly requestSha256: string;
  readonly executionMode: "deterministic-compile-only";
  readonly runtimeJob: Readonly<{
    readonly queue: "control";
    readonly kind: "art.sprite-plan.compile";
    readonly idempotencyKey: string;
    readonly payload: NormalizedSpritePlanCompileRequest;
    readonly inputArtifacts: readonly string[];
    readonly requiredCapabilities: readonly [
      "sprite.inventory.compile",
      "sprite.animation-matrix.compile",
      "sprite.sheet-plan.compile",
      "godot.spriteframes-plan",
      "evidence.bundle",
    ];
    readonly maximumAttempts: 1;
    readonly leaseDurationMs: 60_000;
    readonly timeoutMs: 300_000;
    readonly labels: Readonly<{
      readonly planId: string;
      readonly assetId: string;
      readonly artDirectionContractId: string;
    }>;
  }>;
}

export class SpritePlannerError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  public constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "SpritePlannerError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
