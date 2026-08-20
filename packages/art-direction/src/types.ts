import type {
  ArtDirectionCompileRequestInput as BaseArtDirectionCompileRequestInput,
  ArtDirectionOutputProfileDefinition as BaseArtDirectionOutputProfileDefinition,
  CompiledArtDirectionContract as BaseCompiledArtDirectionContract,
  CompiledArtDirectionJob as BaseCompiledArtDirectionJob,
  NormalizedArtDirectionCompileRequest as BaseNormalizedArtDirectionCompileRequest,
} from "./types-base.js";

export * from "./types-base.js";

/**
 * Versioned output profiles are additive. The 4.6.2 profiles remain available
 * for retained projects while current Godot character work can bind 4.7.1
 * without weakening filtering, atlas, frame-timing or provenance rules.
 */
export const ART_DIRECTION_OUTPUT_PROFILE_IDS = [
  "godot-4.6.2-character-sprite",
  "godot-4.7.1-character-sprite",
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

export type ArtDirectionGodotTarget = "godot-4.6.2" | "godot-4.7.1";
export type ArtDirectionGodotEngineVersion = "4.6.2" | "4.7.1";

export interface ArtDirectionOutputProfileDefinition
  extends Omit<BaseArtDirectionOutputProfileDefinition, "id" | "target"> {
  readonly id: ArtDirectionOutputProfileId;
  readonly target:
    | ArtDirectionGodotTarget
    | "web"
    | "print"
    | "generic";
}

export interface ArtDirectionCompileRequestInput
  extends Omit<BaseArtDirectionCompileRequestInput, "outputProfileIds"> {
  readonly outputProfileIds: readonly ArtDirectionOutputProfileId[];
}

export interface NormalizedArtDirectionCompileRequest
  extends Omit<BaseNormalizedArtDirectionCompileRequest, "outputProfileIds"> {
  readonly outputProfileIds: readonly ArtDirectionOutputProfileId[];
}

export interface CompiledArtDirectionContract
  extends Omit<BaseCompiledArtDirectionContract, "outputs" | "delivery"> {
  readonly outputs: readonly ArtDirectionOutputProfileDefinition[];
  readonly delivery: Omit<BaseCompiledArtDirectionContract["delivery"], "godot"> &
    Readonly<{
      readonly godot?: Readonly<{
        readonly engineVersion: ArtDirectionGodotEngineVersion;
        readonly nodeRecommendations: readonly string[];
        readonly projectSettings: readonly string[];
        readonly resourceOutputs: readonly string[];
      }>;
    }>;
}

export interface CompiledArtDirectionJob
  extends Omit<BaseCompiledArtDirectionJob, "request" | "runtimeJob"> {
  readonly request: NormalizedArtDirectionCompileRequest;
  readonly runtimeJob: Omit<BaseCompiledArtDirectionJob["runtimeJob"], "payload"> &
    Readonly<{
      readonly payload: NormalizedArtDirectionCompileRequest;
    }>;
}
