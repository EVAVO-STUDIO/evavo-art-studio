import type {
  ArtifactId,
  ArtifactStore,
  JsonValue,
} from "@evavo/art-artifacts";

export const SPRITE_FAMILY_PROTOCOL_VERSION = "2026-07-30.1" as const;

export type SpriteLayerRole =
  | "identity-core"
  | "costume"
  | "hair"
  | "shadow"
  | "equipment"
  | "weapon"
  | "effect"
  | "emission"
  | "normal"
  | "collision"
  | "occlusion"
  | "guide";

export type SpriteLayerSourcePolicy =
  | "per-frame"
  | "linked-cel"
  | "static-family"
  | "engine-sidecar"
  | "guide-only";

export type SpriteLayerBlendMode =
  | "normal"
  | "add"
  | "multiply"
  | "screen";

export interface SpriteFamilyLayerDefinitionInput {
  readonly id: string;
  readonly role: SpriteLayerRole;
  readonly sourcePolicy: SpriteLayerSourcePolicy;
  readonly required?: boolean;
  readonly contributesToComposite?: boolean;
  readonly contributesToIdentity?: boolean;
  readonly mustRemainSeparate?: boolean;
  readonly zIndex: number;
  readonly blendMode?: SpriteLayerBlendMode;
  readonly minimumVisibleFraction?: number;
  readonly registrationTolerancePixels?: number;
  readonly allowedOccludedBy?: readonly string[];
  readonly occludes?: readonly string[];
}

export interface SpriteFamilyFrameLayerInput {
  readonly layerId: string;
  readonly artifactId: ArtifactId;
  readonly offset?: Readonly<{ x: number; y: number }>;
  readonly opacity?: number;
  readonly linkedFromFrameId?: string;
  readonly variantId?: string;
}

export interface SpriteFamilyFrameInput {
  readonly id: string;
  readonly animation: string;
  readonly direction: string;
  readonly frameIndex: number;
  readonly globalFrameIndex: number;
  readonly durationMs: number;
  readonly pivot: Readonly<{ x: number; y: number }>;
  readonly baseline?: number;
  readonly groundContact?: boolean;
  readonly layers: readonly SpriteFamilyFrameLayerInput[];
  readonly declaredCompositeArtifactId?: ArtifactId;
  readonly intentionalDuplicateOf?: string;
}

export interface SpriteFamilyPolicyInput {
  readonly identityReferenceFrameId: string;
  readonly requireDeclaredComposite?: boolean;
  readonly requireReferenceLineage?: boolean;
  readonly requireQualityPassed?: boolean;
  readonly alphaVisibleThreshold?: number;
  readonly maximumInputBytes?: number;
  readonly maximumPixels?: number;
  readonly maximumFrames?: number;
  readonly decodeConcurrency?: number;
  readonly maximumTranslationPixels?: number;
  readonly maximumEdgeDistancePixels?: number;
  readonly pivotTolerancePixels?: number;
  readonly baselineTolerancePixels?: number;
  readonly groundContactTolerancePixels?: number;
  readonly minimumCanonicalVisibleAreaSimilarity?: number;
  readonly minimumCanonicalPaletteSimilarity?: number;
  readonly minimumCanonicalCentroidSimilarity?: number;
  readonly minimumAdjacentVisibleAreaSimilarity?: number;
  readonly minimumAdjacentPaletteSimilarity?: number;
  readonly minimumAdjacentCentroidSimilarity?: number;
  readonly minimumLoopClosureSimilarity?: number;
  readonly compositeChannelTolerance?: number;
  readonly maximumCompositeMeanError?: number;
  readonly maximumCompositeMismatchFraction?: number;
}

export interface SpriteFamilyManifestInput {
  readonly schemaVersion: "1.0";
  readonly familyId: string;
  readonly canvas: Readonly<{ width: number; height: number }>;
  readonly layerDefinitions: readonly SpriteFamilyLayerDefinitionInput[];
  readonly frames: readonly SpriteFamilyFrameInput[];
  readonly policy: SpriteFamilyPolicyInput;
  readonly metadata?: JsonValue;
}

export interface NormalizedSpriteFamilyLayerDefinition {
  readonly id: string;
  readonly role: SpriteLayerRole;
  readonly sourcePolicy: SpriteLayerSourcePolicy;
  readonly required: boolean;
  readonly contributesToComposite: boolean;
  readonly contributesToIdentity: boolean;
  readonly mustRemainSeparate: boolean;
  readonly zIndex: number;
  readonly blendMode: SpriteLayerBlendMode;
  readonly minimumVisibleFraction: number;
  readonly registrationTolerancePixels: number;
  readonly allowedOccludedBy: readonly string[];
  readonly occludes: readonly string[];
}

export interface NormalizedSpriteFamilyFrameLayer {
  readonly layerId: string;
  readonly artifactId: ArtifactId;
  readonly offset: Readonly<{ x: number; y: number }>;
  readonly opacity: number;
  readonly linkedFromFrameId?: string;
  readonly variantId?: string;
}

export interface NormalizedSpriteFamilyFrame {
  readonly id: string;
  readonly animation: string;
  readonly direction: string;
  readonly frameIndex: number;
  readonly globalFrameIndex: number;
  readonly durationMs: number;
  readonly pivot: Readonly<{ x: number; y: number }>;
  readonly baseline?: number;
  readonly groundContact: boolean;
  readonly layers: readonly NormalizedSpriteFamilyFrameLayer[];
  readonly declaredCompositeArtifactId?: ArtifactId;
  readonly intentionalDuplicateOf?: string;
}

export interface NormalizedSpriteFamilyPolicy {
  readonly identityReferenceFrameId: string;
  readonly requireDeclaredComposite: boolean;
  readonly requireReferenceLineage: boolean;
  readonly requireQualityPassed: boolean;
  readonly alphaVisibleThreshold: number;
  readonly maximumInputBytes: number;
  readonly maximumPixels: number;
  readonly maximumFrames: number;
  readonly decodeConcurrency: number;
  readonly maximumTranslationPixels: number;
  readonly maximumEdgeDistancePixels: number;
  readonly pivotTolerancePixels: number;
  readonly baselineTolerancePixels: number;
  readonly groundContactTolerancePixels: number;
  readonly minimumCanonicalVisibleAreaSimilarity: number;
  readonly minimumCanonicalPaletteSimilarity: number;
  readonly minimumCanonicalCentroidSimilarity: number;
  readonly minimumAdjacentVisibleAreaSimilarity: number;
  readonly minimumAdjacentPaletteSimilarity: number;
  readonly minimumAdjacentCentroidSimilarity: number;
  readonly minimumLoopClosureSimilarity: number;
  readonly compositeChannelTolerance: number;
  readonly maximumCompositeMeanError: number;
  readonly maximumCompositeMismatchFraction: number;
}

export interface NormalizedSpriteFamilyManifest {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof SPRITE_FAMILY_PROTOCOL_VERSION;
  readonly familyId: string;
  readonly canvas: Readonly<{ width: number; height: number }>;
  readonly layerDefinitions: readonly NormalizedSpriteFamilyLayerDefinition[];
  readonly frames: readonly NormalizedSpriteFamilyFrame[];
  readonly policy: NormalizedSpriteFamilyPolicy;
  readonly metadata?: JsonValue;
}

export type SpriteFamilyGateStatus = "pass" | "fail" | "warning";

export interface SpriteFamilyGateResult {
  readonly id: string;
  readonly status: SpriteFamilyGateStatus;
  readonly blocking: boolean;
  readonly message: string;
  readonly evidence: JsonValue;
}

export interface SpriteLayerEvidence {
  readonly layerId: string;
  readonly role: SpriteLayerRole;
  readonly artifactId: ArtifactId;
  readonly descriptorSha256: string;
  readonly contentSha256: string;
  readonly width: number;
  readonly height: number;
  readonly offset: Readonly<{ x: number; y: number }>;
  readonly opacity: number;
  readonly visiblePixels: number;
  readonly visibleFraction: number;
  readonly compositeContributionPixels: number;
  readonly compositeContributionFraction: number;
  readonly occludedPixels: number;
  readonly occludedFraction: number;
  readonly centroid: Readonly<{ x: number; y: number }>;
  readonly centroidRelativeToPivot: Readonly<{ x: number; y: number }>;
  readonly gates: readonly SpriteFamilyGateResult[];
}

export interface SpriteCompositeParityEvidence {
  readonly declaredCompositeArtifactId?: ArtifactId;
  readonly generatedSha256: string;
  readonly declaredSha256?: string;
  readonly exact: boolean;
  readonly comparedChannels: number;
  readonly mismatchedChannels: number;
  readonly mismatchFraction: number;
  readonly meanAbsoluteError: number;
  readonly maximumAbsoluteError: number;
}

export interface SpriteFamilyComparisonEvidence {
  readonly targetFrameId: string;
  readonly relation: "canonical" | "adjacent" | "loop-closure";
  readonly referenceFrameId: string;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly visibleAreaSimilarity: number;
  readonly paletteSimilarity: number;
  readonly centroidSimilarity: number;
  readonly silhouetteIou: number;
  readonly edgeSimilarity: number;
  readonly gates: readonly SpriteFamilyGateResult[];
}

export interface SpriteFamilyFrameEvidence {
  readonly frameId: string;
  readonly animation: string;
  readonly direction: string;
  readonly frameIndex: number;
  readonly globalFrameIndex: number;
  readonly pivot: Readonly<{ x: number; y: number }>;
  readonly baseline?: number;
  readonly groundContact: boolean;
  readonly generatedCompositeArtifactId: ArtifactId;
  readonly generatedCompositeSha256: string;
  readonly identityCompositeSha256: string;
  readonly layers: readonly SpriteLayerEvidence[];
  readonly parity: SpriteCompositeParityEvidence;
  readonly comparisons: readonly SpriteFamilyComparisonEvidence[];
  readonly gates: readonly SpriteFamilyGateResult[];
  readonly passed: boolean;
}

export interface SpriteFamilyConsistencyEvidence {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof SPRITE_FAMILY_PROTOCOL_VERSION;
  readonly familyId: string;
  readonly manifestSha256: string;
  readonly manifestArtifactId?: ArtifactId;
  readonly kernelEvidenceArtifactId?: ArtifactId;
  readonly passed: boolean;
  readonly completedAt: string;
  readonly canvas: Readonly<{ width: number; height: number }>;
  readonly layerDefinitions: readonly NormalizedSpriteFamilyLayerDefinition[];
  readonly frameEvidence: readonly SpriteFamilyFrameEvidence[];
  readonly familyGates: readonly SpriteFamilyGateResult[];
  readonly generatedCompositeArtifactIds: readonly ArtifactId[];
  readonly sourceArtifactIds: readonly ArtifactId[];
  readonly metadata?: JsonValue;
}

export interface SpriteFamilyRunResult {
  readonly manifestArtifactId?: ArtifactId;
  readonly kernelEvidenceArtifactId?: ArtifactId;
  readonly evidenceArtifactId: ArtifactId;
  readonly generatedCompositeArtifactIds: readonly ArtifactId[];
  readonly evidence: SpriteFamilyConsistencyEvidence;
}

export interface ManifestBoundSpriteFamilyRunResult
  extends SpriteFamilyRunResult {
  readonly manifestArtifactId: ArtifactId;
  readonly kernelEvidenceArtifactId: ArtifactId;
  readonly evidence: SpriteFamilyConsistencyEvidence &
    Readonly<{
      manifestArtifactId: ArtifactId;
      kernelEvidenceArtifactId: ArtifactId;
    }>;
}

export interface SpriteFamilyExecutionOptions {
  readonly artifacts: ArtifactStore;
  readonly now?: () => Date;
}

export class SpriteFamilyError extends Error {
  public readonly code: string;
  public readonly details?: JsonValue;

  public constructor(code: string, message: string, details?: JsonValue) {
    super(message);
    this.name = "SpriteFamilyError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
