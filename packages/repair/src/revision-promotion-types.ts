import type {
  ArtifactId,
  ArtifactReference,
  ArtifactStore,
  JsonValue,
} from "@evavo/art-artifacts";

export const REPAIRED_FAMILY_PROMOTION_PROTOCOL_VERSION =
  "2026-07-30.1" as const;

export interface RepairedFamilyPromotionRequestInput {
  readonly schemaVersion: "1.0";
  readonly promotionId: string;
  readonly rankingEvidenceArtifactId: ArtifactId;
  readonly target: Readonly<{
    readonly namespace: string;
    readonly name: string;
    readonly expectedGeneration: number;
    readonly expectedArtifactId: ArtifactId;
  }>;
  readonly approval:
    | Readonly<{ mode: "automatic" }>
    | Readonly<{
        mode: "human";
        approver: string;
        reason: string;
      }>;
  readonly actor: string;
  readonly metadata?: JsonValue;
}

export interface NormalizedRepairedFamilyPromotionRequest
  extends RepairedFamilyPromotionRequestInput {
  readonly protocolVersion: typeof REPAIRED_FAMILY_PROMOTION_PROTOCOL_VERSION;
}

export interface RepairedFamilyPromotionEvidence {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof REPAIRED_FAMILY_PROMOTION_PROTOCOL_VERSION;
  readonly promotionId: string;
  readonly requestSha256: string;
  readonly rankingEvidenceArtifactId: ArtifactId;
  readonly rankingId: string;
  readonly bridgeEvidenceArtifactId: ArtifactId;
  readonly bridgeId: string;
  readonly repairId: string;
  readonly familyId: string;
  readonly sourceManifestArtifactId: ArtifactId;
  readonly sourceManifestSha256: string;
  readonly referenceArtifactId: ArtifactId;
  readonly originalSelectionEvidenceArtifactId: ArtifactId;
  readonly boundSelectionEvidenceArtifactId: ArtifactId;
  readonly candidateArtifactId: ArtifactId;
  readonly masterArtifactId: ArtifactId;
  readonly authorizationEvidenceArtifactId: ArtifactId;
  readonly approvalMode: "automatic" | "human";
  readonly reference: ArtifactReference;
  readonly promotedAt: string;
  readonly metadata?: JsonValue;
}

export interface RepairedFamilyPromotionResult {
  readonly evidenceArtifactId: ArtifactId;
  readonly boundSelectionEvidenceArtifactId: ArtifactId;
  readonly masterArtifactId: ArtifactId;
  readonly authorizationEvidenceArtifactId: ArtifactId;
  readonly reference: ArtifactReference;
  readonly evidence: RepairedFamilyPromotionEvidence;
}

export interface RepairedFamilyPromotionOptions {
  readonly artifacts: ArtifactStore;
  readonly now?: () => Date;
}

export class RepairedFamilyPromotionError extends Error {
  public readonly code: string;
  public readonly details?: JsonValue;

  public constructor(code: string, message: string, details?: JsonValue) {
    super(message);
    this.name = "RepairedFamilyPromotionError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
