import type { ArtifactId, JsonValue } from "@evavo/art-artifacts";
import type {
  ArtDirectionCompileRequestInput,
  CompiledArtDirectionContract,
} from "@evavo/art-direction";
import type { CompiledSpriteProductionPlan } from "@evavo/art-sprite-planner";

import type {
  CompiledSpriteSupervisorWorkflow,
  SpriteSupervisorCompileRequestInput,
} from "./types.js";

export const AUTOMATIC_SPRITE_WORKFLOW_PROTOCOL_VERSION =
  "2026-08-01.1" as const;

export type AutomaticSpriteWorkflowDisposition =
  | "ready"
  | "review-required"
  | "blocked";

export interface AutomaticSpriteWorkflowReferenceInput {
  readonly canonicalIdentityArtifactId: ArtifactId;
  readonly paletteReferenceArtifactId?: ArtifactId;
  readonly lineReferenceArtifactId?: ArtifactId;
  readonly materialReferenceArtifactId?: ArtifactId;
  readonly layerReferenceArtifactIds?: Readonly<Record<string, ArtifactId>>;
}

export interface AutomaticSpriteWorkflowProviderInput {
  readonly candidatesPerUnit?: number;
  readonly preferredAdapterId?: string;
  readonly preferredModel?: string;
  readonly allowedAdapterIds?: readonly string[];
  readonly allowFallback?: boolean;
  readonly matteColour?: string;
  readonly quality?: "draft" | "standard" | "high";
  readonly resampling?: "nearest" | "lanczos3";
}

export interface AutomaticSpriteWorkflowPromotionInput {
  readonly namespace: string;
  readonly referencePrefix?: string;
  readonly expectedGeneration?: number;
  readonly actor: string;
  readonly automatic?: boolean;
}

export interface AutomaticSpriteWorkflowPolicyInput {
  readonly maximumTasks?: number;
  readonly maximumProductionUnits?: number;
  readonly includeDirectionMasters?: boolean;
  readonly includeKeyPoses?: boolean;
  readonly includeInBetweens?: boolean;
  readonly includeSeparateVisibleLayers?: boolean;
  readonly includeFamilyVerification?: boolean;
  readonly requireFinalHumanApproval?: boolean;
  readonly failOnDerivedDirections?: boolean;
  readonly failOnMissingLayerReferences?: boolean;
}

export interface AutomaticSpriteWorkflowCompileRequestInput {
  readonly schemaVersion: "1.0";
  readonly runId: string;
  readonly spritePlan?: CompiledSpriteProductionPlan | unknown;
  readonly spritePlanRequest?: unknown;
  readonly artDirectionContract?: CompiledArtDirectionContract | unknown;
  readonly artDirectionRequest?: ArtDirectionCompileRequestInput | unknown;
  readonly references: AutomaticSpriteWorkflowReferenceInput;
  readonly provider?: AutomaticSpriteWorkflowProviderInput;
  readonly promotion: AutomaticSpriteWorkflowPromotionInput;
  readonly policy?: AutomaticSpriteWorkflowPolicyInput;
  readonly metadata?: JsonValue;
}

export interface NormalizedAutomaticSpriteWorkflowCompileRequest {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof AUTOMATIC_SPRITE_WORKFLOW_PROTOCOL_VERSION;
  readonly runId: string;
  readonly spritePlan: CompiledSpriteProductionPlan;
  readonly artDirectionContract: CompiledArtDirectionContract;
  readonly references: Readonly<{
    readonly canonicalIdentityArtifactId: ArtifactId;
    readonly paletteReferenceArtifactId?: ArtifactId;
    readonly lineReferenceArtifactId?: ArtifactId;
    readonly materialReferenceArtifactId?: ArtifactId;
    readonly layerReferenceArtifactIds: Readonly<Record<string, ArtifactId>>;
  }>;
  readonly provider: Readonly<{
    readonly candidatesPerUnit: number;
    readonly preferredAdapterId?: string;
    readonly preferredModel?: string;
    readonly allowedAdapterIds: readonly string[];
    readonly allowFallback: boolean;
    readonly matteColour: string;
    readonly quality: "draft" | "standard" | "high";
    readonly resampling: "nearest" | "lanczos3";
  }>;
  readonly promotion: Readonly<{
    readonly namespace: string;
    readonly referencePrefix: string;
    readonly expectedGeneration: number;
    readonly actor: string;
    readonly automatic: boolean;
  }>;
  readonly policy: Readonly<{
    readonly maximumTasks: number;
    readonly maximumProductionUnits: number;
    readonly includeDirectionMasters: boolean;
    readonly includeKeyPoses: boolean;
    readonly includeInBetweens: boolean;
    readonly includeSeparateVisibleLayers: boolean;
    readonly includeFamilyVerification: boolean;
    readonly requireFinalHumanApproval: boolean;
    readonly failOnDerivedDirections: boolean;
    readonly failOnMissingLayerReferences: boolean;
  }>;
  readonly metadata?: JsonValue;
}

export interface AutomaticSpriteWorkflowBlocker {
  readonly code: string;
  readonly message: string;
  readonly details?: JsonValue;
}

export interface AutomaticSpriteWorkflowWarning {
  readonly code: string;
  readonly message: string;
  readonly details?: JsonValue;
}

export interface AutomaticSpriteProductionUnit {
  readonly id: string;
  readonly kind: "direction-master" | "frame" | "layer";
  readonly phase: "direction-master" | "key-pose" | "in-between";
  readonly frameId?: string;
  readonly clipId?: string;
  readonly direction: string;
  readonly frameIndex?: number;
  readonly layerRole: string;
  readonly referenceRole: string;
  readonly masterArtifactRole: string;
  readonly dependencyMasterRoles: readonly string[];
  readonly dependencyTaskIds: readonly string[];
}

export interface AutomaticSpriteWorkflowAnalysis {
  readonly disposition: AutomaticSpriteWorkflowDisposition;
  readonly blockers: readonly AutomaticSpriteWorkflowBlocker[];
  readonly warnings: readonly AutomaticSpriteWorkflowWarning[];
  readonly productionUnits: readonly AutomaticSpriteProductionUnit[];
  readonly separateLayerRoles: readonly string[];
  readonly deferredLayerRoles: readonly string[];
  readonly totals: Readonly<{
    readonly authoredDirections: number;
    readonly authoredFrames: number;
    readonly productionUnits: number;
    readonly candidateJobs: number;
    readonly masteringJobs: number;
    readonly selectionJobs: number;
    readonly promotionJobs: number;
    readonly familyVerificationJobs: number;
    readonly tasks: number;
  }>;
}

export interface CompiledAutomaticSpriteWorkflow {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof AUTOMATIC_SPRITE_WORKFLOW_PROTOCOL_VERSION;
  readonly request: NormalizedAutomaticSpriteWorkflowCompileRequest;
  readonly requestSha256: string;
  readonly analysis: AutomaticSpriteWorkflowAnalysis;
  readonly supervisorRequest: SpriteSupervisorCompileRequestInput;
  readonly supervisorWorkflow: CompiledSpriteSupervisorWorkflow;
}
