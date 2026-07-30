import type {
  ArtifactId,
  ArtifactStore,
  JsonValue,
} from "@evavo/art-artifacts";
import type {
  CandidateSelectionDecision,
  CandidateSelectionEvidence,
  CandidateSelectionRankingEntry,
} from "@evavo/art-selection";

export const REPAIRED_FAMILY_RANKING_PROTOCOL_VERSION =
  "2026-07-30.1" as const;

export interface RepairedFamilyRankingRequestInput {
  readonly schemaVersion: "1.0";
  readonly rankingId: string;
  readonly bridgeEvidenceArtifactId: ArtifactId;
  readonly metadata?: JsonValue;
}

export interface NormalizedRepairedFamilyRankingRequest {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof REPAIRED_FAMILY_RANKING_PROTOCOL_VERSION;
  readonly rankingId: string;
  readonly bridgeEvidenceArtifactId: ArtifactId;
  readonly metadata?: JsonValue;
}

export interface RepairedFamilyRankingEvidence {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof REPAIRED_FAMILY_RANKING_PROTOCOL_VERSION;
  readonly rankingId: string;
  readonly requestSha256: string;
  readonly bridgeEvidenceArtifactId: ArtifactId;
  readonly bridgeId: string;
  readonly repairId: string;
  readonly familyId: string;
  readonly sourceManifestArtifactId: ArtifactId;
  readonly sourceManifestSha256: string;
  readonly referenceArtifactId: ArtifactId;
  readonly revisionEvidenceArtifactIds: readonly ArtifactId[];
  readonly candidateArtifactIds: readonly ArtifactId[];
  readonly selectionEvidenceArtifactId: ArtifactId;
  readonly selectionId: string;
  readonly selectionRequestSha256: string;
  readonly decision: CandidateSelectionDecision;
  readonly recommendedCandidateArtifactId?: ArtifactId;
  readonly selectedCandidateArtifactId?: ArtifactId;
  readonly promotionEligible: boolean;
  readonly winnerMargin: number;
  readonly ranking: readonly CandidateSelectionRankingEntry[];
  readonly selectionEvidence: CandidateSelectionEvidence;
  readonly passed: true;
  readonly completedAt: string;
  readonly metadata?: JsonValue;
}

export interface RepairedFamilyRankingResult {
  readonly evidenceArtifactId: ArtifactId;
  readonly selectionEvidenceArtifactId: ArtifactId;
  readonly evidence: RepairedFamilyRankingEvidence;
}

export interface RepairedFamilyRankingOptions {
  readonly artifacts: ArtifactStore;
  readonly now?: () => Date;
}

export class RepairedFamilyRankingError extends Error {
  public readonly code: string;
  public readonly details?: JsonValue;

  public constructor(code: string, message: string, details?: JsonValue) {
    super(message);
    this.name = "RepairedFamilyRankingError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
