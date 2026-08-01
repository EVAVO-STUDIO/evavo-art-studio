import type { ArtifactId, JsonValue } from "@evavo/art-artifacts";

import type {
  AutomaticSpriteWorkflowAnalysis,
  AutomaticSpriteWorkflowCompileRequestInput,
  CompiledAutomaticSpriteWorkflow,
} from "./automatic-types.js";
import type {
  CompiledSpriteSupervisorWorkflow,
  SpriteSupervisorCompileRequestInput,
} from "./types.js";

export const AUTOMATIC_SPRITE_FINALIZATION_PROTOCOL_VERSION =
  "2026-08-01.1" as const;

export type AutomaticSpriteBackgroundMode =
  | "auto"
  | "native-alpha"
  | "green-matte"
  | "magenta-matte"
  | "black-additive"
  | "opaque-preserve";

export interface AutomaticSpriteBackgroundPolicyInput {
  readonly mode?: AutomaticSpriteBackgroundMode;
  readonly nativeAlphaAdapterIds?: readonly string[];
  readonly greenMatteColour?: string;
  readonly magentaMatteColour?: string;
  readonly blackColour?: string;
  readonly requireFakeTransparencyRejection?: boolean;
  readonly requireMeaningfulAlpha?: boolean;
  readonly proofBackgrounds?: readonly string[];
}

export interface AutomaticSpriteThreeDReferenceInput {
  readonly repository?: string;
  readonly revision: string;
  readonly renderRigArtifactId?: ArtifactId;
  readonly cameraManifestArtifactId?: ArtifactId;
  readonly materialReferenceArtifactId?: ArtifactId;
  readonly turntableArtifactIds?: readonly ArtifactId[];
  readonly directionReferenceArtifactIds?: Readonly<Record<string, ArtifactId>>;
  readonly depthReferenceArtifactIds?: Readonly<Record<string, ArtifactId>>;
  readonly normalReferenceArtifactIds?: Readonly<Record<string, ArtifactId>>;
  readonly notes?: readonly string[];
}

export interface AutomaticSpriteFinalizationPolicyInput {
  readonly deliveryProfileId?:
    | "retro-standing-character-576"
    | "retro-ui-icon-256"
    | "retro-overlay-720p"
    | "godot-sprite-lossless";
  readonly requireFamilyVerification?: boolean;
  readonly requireHostileMatteProof?: boolean;
  readonly requireNoRejectedArtifacts?: boolean;
  readonly requireExactDimensions?: boolean;
}

export interface AutomaticSpriteFinalizationCompileRequestInput {
  readonly schemaVersion: "1.0";
  readonly workflow: AutomaticSpriteWorkflowCompileRequestInput | unknown;
  readonly background?: AutomaticSpriteBackgroundPolicyInput;
  readonly threeDReference?: AutomaticSpriteThreeDReferenceInput;
  readonly finalization?: AutomaticSpriteFinalizationPolicyInput;
  readonly metadata?: JsonValue;
}

export interface ResolvedAutomaticSpriteBackgroundPolicy {
  readonly requestedMode: AutomaticSpriteBackgroundMode;
  readonly resolvedMode:
    | "native-alpha"
    | "chroma-key"
    | "black-additive"
    | "opaque-preserve";
  readonly providerStrategy:
    | "native-alpha"
    | "chroma-key"
    | "opaque-source";
  readonly matteColour?: string;
  readonly transparencyExpectation: "alpha-required" | "opaque";
  readonly deliveryBackground:
    | Readonly<{ mode: "preserve" }>
    | Readonly<{
        mode: "remove-border-matte";
        matteColour: string;
      }>;
  readonly proofBackgrounds: readonly string[];
  readonly requireFakeTransparencyRejection: boolean;
  readonly requireMeaningfulAlpha: boolean;
  readonly reason: string;
  readonly collisionScores: Readonly<{
    green: number;
    magenta: number;
    black: number;
  }>;
}

export interface NormalizedAutomaticSpriteThreeDReference {
  readonly repository: string;
  readonly revision: string;
  readonly renderRigArtifactId?: ArtifactId;
  readonly cameraManifestArtifactId?: ArtifactId;
  readonly materialReferenceArtifactId?: ArtifactId;
  readonly turntableArtifactIds: readonly ArtifactId[];
  readonly directionReferenceArtifactIds: Readonly<Record<string, ArtifactId>>;
  readonly depthReferenceArtifactIds: Readonly<Record<string, ArtifactId>>;
  readonly normalReferenceArtifactIds: Readonly<Record<string, ArtifactId>>;
  readonly notes: readonly string[];
}

export interface NormalizedAutomaticSpriteFinalizationRequest {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof AUTOMATIC_SPRITE_FINALIZATION_PROTOCOL_VERSION;
  readonly workflow: AutomaticSpriteWorkflowCompileRequestInput | unknown;
  readonly background: Readonly<{
    readonly mode: AutomaticSpriteBackgroundMode;
    readonly nativeAlphaAdapterIds: readonly string[];
    readonly greenMatteColour: string;
    readonly magentaMatteColour: string;
    readonly blackColour: string;
    readonly requireFakeTransparencyRejection: boolean;
    readonly requireMeaningfulAlpha: boolean;
    readonly proofBackgrounds: readonly string[];
  }>;
  readonly threeDReference?: NormalizedAutomaticSpriteThreeDReference;
  readonly finalization: Readonly<{
    readonly deliveryProfileId:
      | "retro-standing-character-576"
      | "retro-ui-icon-256"
      | "retro-overlay-720p"
      | "godot-sprite-lossless";
    readonly requireFamilyVerification: boolean;
    readonly requireHostileMatteProof: boolean;
    readonly requireNoRejectedArtifacts: boolean;
    readonly requireExactDimensions: boolean;
  }>;
  readonly metadata?: JsonValue;
}

export interface AutomaticSpriteFinalizationAnalysis {
  readonly base: AutomaticSpriteWorkflowAnalysis;
  readonly background: ResolvedAutomaticSpriteBackgroundPolicy;
  readonly threeD: Readonly<{
    readonly enabled: boolean;
    readonly repository?: string;
    readonly revision?: string;
    readonly directionCoverage: readonly string[];
    readonly missingDirectionReferences: readonly string[];
    readonly artifactCount: number;
  }>;
  readonly finalization: Readonly<{
    readonly deliveryProfileId: string;
    readonly candidateFinalizationTasks: number;
    readonly familyFinalizationEvidenceRequired: boolean;
    readonly fakeTransparencyIsBlocking: boolean;
    readonly hostileMatteProofRequired: boolean;
  }>;
  readonly blockers: readonly Readonly<{
    code: string;
    message: string;
    details?: JsonValue;
  }>[];
  readonly warnings: readonly Readonly<{
    code: string;
    message: string;
    details?: JsonValue;
  }>[];
}

export interface CompiledAutomaticSpriteFinalizationWorkflow {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof AUTOMATIC_SPRITE_FINALIZATION_PROTOCOL_VERSION;
  readonly request: NormalizedAutomaticSpriteFinalizationRequest;
  readonly requestSha256: string;
  readonly baseWorkflow: CompiledAutomaticSpriteWorkflow;
  readonly analysis: AutomaticSpriteFinalizationAnalysis;
  readonly supervisorRequest: SpriteSupervisorCompileRequestInput;
  readonly supervisorWorkflow: CompiledSpriteSupervisorWorkflow;
}
