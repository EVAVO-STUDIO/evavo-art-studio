import type {
  ArtifactId,
  ArtifactStore,
  JsonValue,
} from "@evavo/art-artifacts";
import type {
  SpriteFrameQualityExpectations,
  SpriteFrameQualityReport,
} from "@evavo/art-quality";
import type {
  ManifestBoundSpriteFamilyRunResult,
  NormalizedSpriteFamilyManifest,
  SpriteLayerRole,
  SpriteLayerSourcePolicy,
} from "@evavo/art-sprite-family";

export const REPAIRED_FAMILY_REVISION_PROTOCOL_VERSION =
  "2026-07-30.1" as const;

export interface RepairedFamilyRevisionRequestInput {
  readonly schemaVersion: "1.0";
  readonly revisionId: string;
  readonly repairPacketArtifactId: ArtifactId;
  readonly repairExecutionEvidenceArtifactId: ArtifactId;
  readonly restoredCandidateArtifactId: ArtifactId;
  readonly quality?: Omit<
    SpriteFrameQualityExpectations,
    "frameId" | "expectedWidth" | "expectedHeight" | "expectedFormat"
  >;
  readonly metadata?: JsonValue;
}

export interface NormalizedRepairedFamilyRevisionRequest {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof REPAIRED_FAMILY_REVISION_PROTOCOL_VERSION;
  readonly revisionId: string;
  readonly repairPacketArtifactId: ArtifactId;
  readonly repairExecutionEvidenceArtifactId: ArtifactId;
  readonly restoredCandidateArtifactId: ArtifactId;
  readonly quality: Readonly<{
    transparency: "alpha-required" | "alpha-preferred";
    safePadding: number;
    alphaVisibleThreshold: number;
    knownMatteColours: readonly string[];
    flatMatteBorderThreshold: number;
    checkerboardConfidenceThreshold: number;
    maximumHaloFraction: number;
    maximumUnexpectedTransparentRgbFraction: number;
  }>;
  readonly metadata?: JsonValue;
}

export interface RepairedFamilyRevisionReplacement {
  readonly frameId: string;
  readonly layerId: string;
  readonly layerRole: SpriteLayerRole;
  readonly sourcePolicy: SpriteLayerSourcePolicy;
  readonly originalArtifactId: ArtifactId;
  readonly replacementArtifactId: ArtifactId;
  readonly originalDeclaredCompositeArtifactId?: ArtifactId;
  readonly revisedDeclaredCompositeArtifactId: ArtifactId;
}

export interface RepairedFamilyRevisionEvidence {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof REPAIRED_FAMILY_REVISION_PROTOCOL_VERSION;
  readonly revisionId: string;
  readonly repairId: string;
  readonly familyId: string;
  readonly requestSha256: string;
  readonly sourceManifestArtifactId: ArtifactId;
  readonly sourceManifestSha256: string;
  readonly repairPacketArtifactId: ArtifactId;
  readonly repairExecutionEvidenceArtifactId: ArtifactId;
  readonly restoredCandidateArtifactId: ArtifactId;
  readonly qualityEvidenceArtifactId: ArtifactId;
  readonly qualityCandidateArtifactId: ArtifactId;
  readonly quality: SpriteFrameQualityReport;
  readonly impactedFrameIds: readonly string[];
  readonly replacements: readonly RepairedFamilyRevisionReplacement[];
  readonly revisedManifestArtifactId: ArtifactId;
  readonly revisedManifestSha256: string;
  readonly familyEvidenceArtifactId: ArtifactId;
  readonly kernelFamilyEvidenceArtifactId: ArtifactId;
  readonly generatedCompositeArtifactIds: readonly ArtifactId[];
  readonly passed: boolean;
  readonly completedAt: string;
  readonly metadata?: JsonValue;
}

export interface RepairedFamilyRevisionResult {
  readonly revisionEvidenceArtifactId: ArtifactId;
  readonly qualityEvidenceArtifactId: ArtifactId;
  readonly qualityCandidateArtifactId: ArtifactId;
  readonly revisedDeclaredCompositeArtifactIds: readonly ArtifactId[];
  readonly family: ManifestBoundSpriteFamilyRunResult;
  readonly evidence: RepairedFamilyRevisionEvidence;
  readonly revisedManifest: NormalizedSpriteFamilyManifest;
}

export interface RepairedFamilyRevisionOptions {
  readonly artifacts: ArtifactStore;
  readonly now?: () => Date;
}

export class RepairedFamilyRevisionError extends Error {
  public readonly code: string;
  public readonly details?: JsonValue;

  public constructor(code: string, message: string, details?: JsonValue) {
    super(message);
    this.name = "RepairedFamilyRevisionError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
