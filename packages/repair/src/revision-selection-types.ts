import type {
  ArtifactId,
  ArtifactStore,
  JsonValue,
} from "@evavo/art-artifacts";
import type {
  CandidateSelectionPolicyInput,
  NormalizedCandidateSelectionRequest,
} from "@evavo/art-selection";

export const REPAIRED_FAMILY_SELECTION_PROTOCOL_VERSION =
  "2026-07-30.1" as const;

export interface RepairedFamilySelectionRequestInput {
  readonly schemaVersion: "1.0";
  readonly bridgeId: string;
  readonly revisionEvidenceArtifactIds: readonly ArtifactId[];
  readonly externalEvidenceArtifactIds?: readonly ArtifactId[];
  readonly policy?: Omit<
    CandidateSelectionPolicyInput,
    "requireReferenceLineage" | "requireQualityPassed" | "allowedCandidateRoles"
  >;
  readonly metadata?: JsonValue;
}

export interface NormalizedRepairedFamilySelectionRequest {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof REPAIRED_FAMILY_SELECTION_PROTOCOL_VERSION;
  readonly bridgeId: string;
  readonly revisionEvidenceArtifactIds: readonly ArtifactId[];
  readonly externalEvidenceArtifactIds: readonly ArtifactId[];
  readonly policy: Omit<
    CandidateSelectionPolicyInput,
    "requireReferenceLineage" | "requireQualityPassed" | "allowedCandidateRoles"
  >;
  readonly metadata?: JsonValue;
}

export interface RepairedFamilySelectionEvidence {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof REPAIRED_FAMILY_SELECTION_PROTOCOL_VERSION;
  readonly bridgeId: string;
  readonly requestSha256: string;
  readonly repairId: string;
  readonly familyId: string;
  readonly sourceManifestArtifactId: ArtifactId;
  readonly sourceManifestSha256: string;
  readonly referenceArtifactId: ArtifactId;
  readonly revisionEvidenceArtifactIds: readonly ArtifactId[];
  readonly revisionIds: readonly string[];
  readonly candidateArtifactIds: readonly ArtifactId[];
  readonly familyEvidenceArtifactIds: readonly ArtifactId[];
  readonly revisedManifestArtifactIds: readonly ArtifactId[];
  readonly externalEvidenceArtifactIds: readonly ArtifactId[];
  readonly selectionRequest: NormalizedCandidateSelectionRequest;
  readonly selectionRequestSha256: string;
  readonly selectionJob: JsonValue;
  readonly passed: true;
  readonly completedAt: string;
  readonly metadata?: JsonValue;
}

export interface RepairedFamilySelectionResult {
  readonly evidenceArtifactId: ArtifactId;
  readonly evidence: RepairedFamilySelectionEvidence;
  readonly selectionRequest: NormalizedCandidateSelectionRequest;
  readonly selectionJob: JsonValue;
}

export interface RepairedFamilySelectionOptions {
  readonly artifacts: ArtifactStore;
  readonly now?: () => Date;
}

export class RepairedFamilySelectionError extends Error {
  public readonly code: string;
  public readonly details?: JsonValue;

  public constructor(code: string, message: string, details?: JsonValue) {
    super(message);
    this.name = "RepairedFamilySelectionError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
