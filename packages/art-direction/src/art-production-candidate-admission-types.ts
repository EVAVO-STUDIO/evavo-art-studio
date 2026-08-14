import type { LayeredProductionAlphaPolicy } from "./layered-production-types.js";
import {
  ART_PRODUCTION_CANDIDATE_ADMISSION_RECEIPT_KIND,
  ART_PRODUCTION_CANDIDATE_ADMISSION_REQUEST_KIND,
  ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
} from "./art-production-contract.js";

export interface ArtProductionCandidateEvidence {
  readonly artifactId: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  readonly alphaPolicy: LayeredProductionAlphaPolicy;
}

export interface ArtProductionProviderEvidence {
  readonly providerId: string;
  readonly model: string;
  readonly providerJobId: string;
  readonly requestArtifactId: string;
  readonly requestSha256: string;
  readonly responseArtifactId: string;
  readonly responseSha256: string;
}

export interface ArtProductionCandidateAdmissionRequestInput {
  readonly schemaVersion: "1.0";
  readonly kind: typeof ART_PRODUCTION_CANDIDATE_ADMISSION_REQUEST_KIND;
  readonly planId: string;
  readonly planSha256: string;
  readonly loopSha256: string;
  readonly profileSha256: string;
  readonly batchSha256: string;
  readonly jobSha256: string;
  readonly unitId: string;
  readonly attemptNumber: number;
  readonly providerEvidence: ArtProductionProviderEvidence;
  readonly candidate: ArtProductionCandidateEvidence;
  readonly inspectionEvidenceArtifactId: string;
  readonly inspectionEvidenceSha256: string;
  readonly admittedBy: string;
  readonly admittedAt: string;
}

export interface ArtProductionCandidateAdmissionReceipt {
  readonly schemaVersion: "1.0";
  readonly kind: typeof ART_PRODUCTION_CANDIDATE_ADMISSION_RECEIPT_KIND;
  readonly protocolVersion: typeof ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION;
  readonly planId: string;
  readonly planSha256: string;
  readonly loopSha256: string;
  readonly profileSha256: string;
  readonly unitId: string;
  readonly scheduledJob: Readonly<{
    readonly batchSha256: string;
    readonly jobSha256: string;
    readonly attemptNumber: number;
    readonly mode: "generate" | "repair";
    readonly jobBasisSha256: string;
  }>;
  readonly providerEvidence: ArtProductionProviderEvidence;
  readonly candidate: ArtProductionCandidateEvidence;
  readonly inspectionEvidenceArtifactId: string;
  readonly inspectionEvidenceSha256: string;
  readonly admittedBy: string;
  readonly admittedAt: string;
  readonly requestSha256: string;
  readonly admissionBasisSha256: string;
  readonly authority: Readonly<{
    readonly providerExecution: false;
    readonly imageInspection: false;
    readonly automaticCandidateAdmission: false;
    readonly creativeDecision: false;
    readonly imageMutation: false;
    readonly packagingExecution: false;
    readonly targetRepositoryMutation: false;
    readonly gitCommit: false;
    readonly gitPush: false;
    readonly publication: false;
    readonly forcePush: false;
  }>;
  readonly admissionReceiptSha256: string;
}
