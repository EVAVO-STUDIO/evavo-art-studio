import type { BookProviderId } from "./book-studio-project-contracts";
import type { BookAuthoringOperation } from "./book-studio-authoring-types";

export const BOOK_WRITING_HANDOFF_CONTRACT = "evavo_docs_writing_handoff_v1" as const;

export interface BookWritingHandoffRequestV1 {
  outputKind: "evavo_docs_writing_handoff_request";
  schemaVersion: 1;
  contract: typeof BOOK_WRITING_HANDOFF_CONTRACT;
  requestId: string;
  packetId: string;
  packetFingerprint: string;
  projectId: string;
  volumeId: string;
  manuscriptRevisionId: string;
  operation: BookAuthoringOperation;
  allowedProviderIds: BookProviderId[];
  providerPolicyFingerprint: string;
  voiceProfileId: string;
  voiceProfileFingerprint: string;
  factSetFingerprint: string;
  contextObjectIds: string[];
  contextObjectFingerprints: string[];
  requiredEvidenceIds: string[];
  outputContractFingerprint: string;
  requestedAt: string;
  expiresAt: string;
  requestFingerprint: string;
  crossRepositoryRuntimeImportAllowed: false;
  writingStudioMayMutateManuscript: false;
  automaticCanonicalAdmissionAllowed: false;
  remoteWritesAllowed: false;
  publicationPerformed: false;
}

export interface BookWritingHandoffResponseV1 {
  outputKind: "evavo_docs_writing_handoff_response";
  schemaVersion: 1;
  contract: typeof BOOK_WRITING_HANDOFF_CONTRACT;
  requestId: string;
  requestFingerprint: string;
  packetId: string;
  packetFingerprint: string;
  provider: BookProviderId;
  modelName: string;
  status: "complete" | "partial" | "needs_work" | "blocked";
  candidateObjectId?: string;
  candidateSha256?: string;
  candidateByteLength?: number;
  voiceEvidenceIds: string[];
  factEvidenceIds: string[];
  qualityReceiptIds: string[];
  unresolvedRiskIds: string[];
  continuationRequired: boolean;
  exactPartialTailSha256?: string;
  completedAt: string;
  responseFingerprint: string;
  writingStudioMayMutateManuscript: false;
  canonicalAdmissionAllowed: false;
  publicationPerformed: false;
}

export interface BookWritingHandoffValidationResultV1 {
  outputKind: "evavo_docs_writing_handoff_validation";
  schemaVersion: 1;
  status: "ready" | "continuation_required" | "needs_work" | "blocked";
  request?: BookWritingHandoffRequestV1;
  response?: BookWritingHandoffResponseV1;
  blockers: string[];
  requiredActions: string[];
  requestFingerprint?: string;
  responseFingerprint?: string;
  manuscriptMutationPerformed: false;
  canonicalAdmissionAllowed: false;
  publicationPerformed: false;
}
