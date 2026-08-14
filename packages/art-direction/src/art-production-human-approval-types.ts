import {
  ART_PRODUCTION_HUMAN_APPROVAL_RECEIPT_KIND,
  ART_PRODUCTION_HUMAN_APPROVAL_REQUEST_KIND,
  ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
} from "./art-production-contract.js";

export interface ArtProductionHumanApprovalRequestInput {
  readonly schemaVersion: "1.0";
  readonly kind: typeof ART_PRODUCTION_HUMAN_APPROVAL_REQUEST_KIND;
  readonly planId: string;
  readonly planSha256: string;
  readonly loopSha256: string;
  readonly profileSha256: string;
  readonly unitId: string;
  readonly sourceArtifactId: string;
  readonly sourceSha256: string;
  readonly sourceBytes: number;
  readonly acceptedAttemptSha256: string;
  readonly reviewer: string;
  readonly reviewedAt: string;
  readonly decision: "approved";
  readonly decisionEvidenceArtifactId: string;
  readonly decisionEvidenceSha256: string;
}

export interface ArtProductionHumanApprovalReceipt {
  readonly schemaVersion: "1.0";
  readonly kind: typeof ART_PRODUCTION_HUMAN_APPROVAL_RECEIPT_KIND;
  readonly protocolVersion: typeof ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION;
  readonly planId: string;
  readonly planSha256: string;
  readonly loopSha256: string;
  readonly profileSha256: string;
  readonly unitId: string;
  readonly sourceArtifactId: string;
  readonly sourceSha256: string;
  readonly sourceBytes: number;
  readonly technicalReview: Readonly<{
    readonly attemptSha256: string;
    readonly weightedScore: number;
    readonly decision: "review-passed";
  }>;
  readonly reviewer: string;
  readonly reviewedAt: string;
  readonly decision: "approved";
  readonly decisionEvidenceArtifactId: string;
  readonly decisionEvidenceSha256: string;
  readonly requestSha256: string;
  readonly approvalBasisSha256: string;
  readonly authority: Readonly<{
    readonly providerExecution: false;
    readonly imageMutation: false;
    readonly creativeDecision: false;
    readonly packagingExecution: false;
    readonly targetRepositoryMutation: false;
    readonly gitCommit: false;
    readonly gitPush: false;
    readonly publication: false;
    readonly forcePush: false;
  }>;
  readonly approvalReceiptSha256: string;
}

/**
 * Compatibility name retained for existing package consumers. Packaging now
 * requires the complete governed receipt rather than a loose hash-only input.
 */
export type ArtProductionHumanApprovalInput =
  ArtProductionHumanApprovalReceipt;
