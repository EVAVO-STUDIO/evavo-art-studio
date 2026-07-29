import type {
  ArtifactId,
  ArtifactReference,
  ArtifactStore,
  JsonValue,
} from "@evavo/art-artifacts";

export const SELECTION_PROTOCOL_VERSION = "2026-07-30.1" as const;

export type CandidateSelectionProfile =
  | "sprite-identity"
  | "sprite-motion"
  | "environment"
  | "ui"
  | "custom";

export type DeterministicSelectionMetricId =
  | "silhouette-iou"
  | "silhouette-dice"
  | "edge-similarity"
  | "visible-area-similarity"
  | "centroid-similarity"
  | "bounds-aspect-similarity"
  | "palette-similarity"
  | "luminance-similarity"
  | "edge-orientation-similarity"
  | "overlap-colour-similarity";

export type ExternalSelectionEvidenceKind =
  | "identity-similarity"
  | "costume-similarity"
  | "equipment-similarity"
  | "pose-similarity"
  | "style-similarity"
  | "perceptual-similarity";

export type CandidateSelectionDecision =
  | "selected"
  | "review-required"
  | "rejected";

export interface SelectionMetricPolicyInput {
  readonly id: DeterministicSelectionMetricId;
  readonly weight?: number;
  readonly minimum?: number;
  readonly blocking?: boolean;
}

export interface SelectionExternalEvidencePolicyInput {
  readonly kind: ExternalSelectionEvidenceKind;
  readonly weight?: number;
  readonly minimum?: number;
  readonly blocking?: boolean;
  readonly required?: boolean;
  readonly requiredForAutomatic?: boolean;
}

export interface CandidateSelectionPolicyInput {
  readonly profile: CandidateSelectionProfile;
  readonly allowAutomaticSelection?: boolean;
  readonly requireReferenceLineage?: boolean;
  readonly requireQualityPassed?: boolean;
  readonly allowedCandidateRoles?: readonly string[];
  readonly alphaVisibleThreshold?: number;
  readonly maximumTranslationPixels?: number;
  readonly maximumEdgeDistancePixels?: number;
  readonly minimumOverallScore?: number;
  readonly minimumWinnerMargin?: number;
  readonly metrics?: readonly SelectionMetricPolicyInput[];
  readonly externalEvidence?: readonly SelectionExternalEvidencePolicyInput[];
}

export interface CandidateSelectionRequestInput {
  readonly schemaVersion: "1.0";
  readonly selectionId?: string;
  readonly candidateArtifactIds: readonly ArtifactId[];
  readonly referenceArtifactId: ArtifactId;
  readonly referenceRole?: string;
  readonly externalEvidenceArtifactIds?: readonly ArtifactId[];
  readonly policy: CandidateSelectionPolicyInput;
  readonly metadata?: JsonValue;
}

export interface NormalizedSelectionMetricPolicy {
  readonly id: DeterministicSelectionMetricId;
  readonly weight: number;
  readonly minimum: number;
  readonly blocking: boolean;
}

export interface NormalizedSelectionExternalEvidencePolicy {
  readonly kind: ExternalSelectionEvidenceKind;
  readonly weight: number;
  readonly minimum: number;
  readonly blocking: boolean;
  readonly required: boolean;
  readonly requiredForAutomatic: boolean;
}

export interface NormalizedCandidateSelectionPolicy {
  readonly profile: CandidateSelectionProfile;
  readonly allowAutomaticSelection: boolean;
  readonly requireReferenceLineage: boolean;
  readonly requireQualityPassed: boolean;
  readonly allowedCandidateRoles: readonly string[];
  readonly alphaVisibleThreshold: number;
  readonly maximumTranslationPixels: number;
  readonly maximumEdgeDistancePixels: number;
  readonly minimumOverallScore: number;
  readonly minimumWinnerMargin: number;
  readonly metrics: readonly NormalizedSelectionMetricPolicy[];
  readonly externalEvidence: readonly NormalizedSelectionExternalEvidencePolicy[];
}

export interface NormalizedCandidateSelectionRequest {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof SELECTION_PROTOCOL_VERSION;
  readonly selectionId: string;
  readonly candidateArtifactIds: readonly ArtifactId[];
  readonly referenceArtifactId: ArtifactId;
  readonly referenceRole: string;
  readonly externalEvidenceArtifactIds: readonly ArtifactId[];
  readonly policy: NormalizedCandidateSelectionPolicy;
  readonly metadata?: JsonValue;
}

export interface SelectionAlignmentEvidence {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly translatedPixels: number;
  readonly silhouetteIntersection: number;
  readonly silhouetteUnion: number;
}

export interface CandidateMetricReading {
  readonly id: DeterministicSelectionMetricId;
  readonly score: number;
  readonly weight: number;
  readonly weightedScore: number;
  readonly minimum: number;
  readonly blocking: boolean;
  readonly passed: boolean;
  readonly evidence: JsonValue;
}

export interface CandidateExternalEvidenceReading {
  readonly kind: ExternalSelectionEvidenceKind;
  readonly score: number | null;
  readonly weight: number;
  readonly weightedScore: number;
  readonly minimum: number;
  readonly blocking: boolean;
  readonly required: boolean;
  readonly requiredForAutomatic: boolean;
  readonly passed: boolean;
  readonly evidenceArtifactId?: ArtifactId;
  readonly model?: Readonly<{
    readonly name: string;
    readonly version: string;
    readonly sha256: string;
    readonly preprocessingSha256: string;
    readonly runtime?: string;
  }>;
}

export interface CandidateSelectionRankingEntry {
  readonly rank: number;
  readonly candidateArtifactId: ArtifactId;
  readonly descriptorSha256: string;
  readonly contentSha256: string;
  readonly artifactRole: string;
  readonly score: number;
  readonly hardGatesPassed: boolean;
  readonly automaticEvidenceComplete: boolean;
  readonly alignment: SelectionAlignmentEvidence;
  readonly metrics: readonly CandidateMetricReading[];
  readonly externalEvidence: readonly CandidateExternalEvidenceReading[];
  readonly violations: readonly string[];
}

export interface CandidateSelectionEvidence {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof SELECTION_PROTOCOL_VERSION;
  readonly selectionId: string;
  readonly requestSha256: string;
  readonly decision: CandidateSelectionDecision;
  readonly recommendedCandidateArtifactId?: ArtifactId;
  readonly selectedCandidateArtifactId?: ArtifactId;
  readonly promotionEligible: boolean;
  readonly winnerMargin: number;
  readonly completedAt: string;
  readonly reference: Readonly<{
    readonly artifactId: ArtifactId;
    readonly descriptorSha256: string;
    readonly contentSha256: string;
    readonly mediaType: string;
    readonly width: number;
    readonly height: number;
  }>;
  readonly policy: NormalizedCandidateSelectionPolicy;
  readonly ranking: readonly CandidateSelectionRankingEntry[];
  readonly externalEvidenceArtifactIds: readonly ArtifactId[];
  readonly metadata?: JsonValue;
}

export interface CandidateSelectionRunResult {
  readonly evidenceArtifactId: ArtifactId;
  readonly evidence: CandidateSelectionEvidence;
}

export interface ExternalSelectionEvidenceInput {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof SELECTION_PROTOCOL_VERSION;
  readonly evidenceKind: ExternalSelectionEvidenceKind;
  readonly candidateArtifactId: ArtifactId;
  readonly referenceArtifactId: ArtifactId;
  readonly score: number;
  readonly generatedAt: string;
  readonly model: Readonly<{
    readonly name: string;
    readonly version: string;
    readonly sha256: string;
    readonly preprocessingSha256: string;
    readonly runtime?: string;
  }>;
  readonly details?: JsonValue;
}

export interface CandidatePromotionRequestInput {
  readonly schemaVersion: "1.0";
  readonly promotionId?: string;
  readonly selectionEvidenceArtifactId: ArtifactId;
  readonly candidateArtifactId: ArtifactId;
  readonly target: Readonly<{
    readonly namespace: string;
    readonly name: string;
    readonly expectedGeneration: number;
    readonly expectedArtifactId?: ArtifactId;
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

export interface NormalizedCandidatePromotionRequest {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof SELECTION_PROTOCOL_VERSION;
  readonly promotionId: string;
  readonly selectionEvidenceArtifactId: ArtifactId;
  readonly candidateArtifactId: ArtifactId;
  readonly target: Readonly<{
    readonly namespace: string;
    readonly name: string;
    readonly expectedGeneration: number;
    readonly expectedArtifactId?: ArtifactId;
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

export interface CandidatePromotionResult {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof SELECTION_PROTOCOL_VERSION;
  readonly promotionId: string;
  readonly selectionEvidenceArtifactId: ArtifactId;
  readonly candidateArtifactId: ArtifactId;
  readonly masterArtifactId: ArtifactId;
  readonly authorizationEvidenceArtifactId: ArtifactId;
  readonly reference: ArtifactReference;
  readonly approvalMode: "automatic" | "human";
}

export interface CandidateSelectionOptions {
  readonly artifacts: ArtifactStore;
  readonly now?: () => Date;
  readonly maximumInputBytes?: number;
  readonly maximumPixels?: number;
  readonly maximumLineageDepth?: number;
  readonly decodeConcurrency?: number;
}

export interface CandidatePromotionOptions {
  readonly artifacts: ArtifactStore;
  readonly now?: () => Date;
}

export class CandidateSelectionError extends Error {
  public readonly code: string;
  public readonly details?: JsonValue;

  public constructor(code: string, message: string, details?: JsonValue) {
    super(message);
    this.name = "CandidateSelectionError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
