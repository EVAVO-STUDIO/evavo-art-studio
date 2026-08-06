import type { BookProviderId } from "./book-studio-project-contracts";

export const BOOK_AUTHORING_CONTRACT = "evavo_docs_book_authoring_v1" as const;
export const BOOK_AUTHORING_SCHEMA_VERSION = 1 as const;

export type BookAuthoringOperation =
  | "draft_candidate"
  | "revise_candidate"
  | "critique_candidate"
  | "evaluate_voice"
  | "fact_check_candidate"
  | "continuity_review"
  | "line_edit_candidate"
  | "copyedit_candidate"
  | "proofread_candidate"
  | "custom";

export type BookAuthoringResponseMode =
  | "strict_json_schema"
  | "forced_single_tool"
  | "adapter_structured_output";

export type BookAuthoringResultStatus =
  | "complete"
  | "partial"
  | "needs_work"
  | "blocked";

export interface BookAuthoringContinuationV1 {
  complete: boolean;
  remainingUnitIds: string[];
  exactPartialTailSha256?: string;
  continuationPacketRequired: boolean;
}

export interface BookAuthoringPacketV1 {
  outputKind: "evavo_docs_book_authoring_packet";
  schemaVersion: typeof BOOK_AUTHORING_SCHEMA_VERSION;
  contract: typeof BOOK_AUTHORING_CONTRACT;
  authorityMode: "shadow_migration";
  packetId: string;
  projectId: string;
  programmeId: string;
  volumeId: string;
  manuscriptRevisionId: string;
  manuscriptSha256: string;
  projectFingerprint: string;
  storyStateFingerprint: string;
  executionTaskId: string;
  taskFingerprint: string;
  provider: BookProviderId;
  modelName: string;
  operation: BookAuthoringOperation;
  customOperation?: string;
  responseMode: BookAuthoringResponseMode;
  responseToolName?: string;
  responseContractFingerprint: string;
  targetUnitIds: string[];
  readOnlyUnitIds: string[];
  expectedChangedUnitIds: string[];
  allowedActionIds: string[];
  prohibitedActionIds: string[];
  requiredOutputStateIds: string[];
  contextEvidenceIds: string[];
  projectVoiceAnchorIds: string[];
  factClaimIds: string[];
  researchClaimIds: string[];
  narrativeConstraintIds: string[];
  acceptedPatternIds: string[];
  rejectedPatternIds: string[];
  unresolvedIssueIds: string[];
  unresolvedResearchIds: string[];
  checkpointId: string;
  checkpointFingerprint: string;
  idempotencyKey: string;
  maximumOutputCharacters: number;
  createdAt: string;
  expiresAt: string;
  continuationOfPacketId?: string;
  priorPartialTailSha256?: string;
  remainingUnitIds: string[];
  packetFingerprint: string;
  providerMayMutateCanonicalState: false;
  automaticCanonicalAdmissionAllowed: false;
  websiteCompatibilityRuntimeStillAuthoritative: true;
  dualAuthoritativeWritesAllowed: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export interface BookAuthoringChangedUnitV1 {
  unitId: string;
  beforeSha256: string;
  afterSha256: string;
  actionIds: string[];
  evidenceIds: string[];
  craftEvidenceIds: string[];
}

export interface BookAuthoringResultV1 {
  outputKind: "evavo_docs_book_authoring_result";
  schemaVersion: typeof BOOK_AUTHORING_SCHEMA_VERSION;
  contract: typeof BOOK_AUTHORING_CONTRACT;
  packetId: string;
  packetFingerprint: string;
  provider: BookProviderId;
  modelName: string;
  responseContractFingerprint: string;
  status: BookAuthoringResultStatus;
  candidateObjectId?: string;
  candidateTextSha256?: string;
  candidateByteLength?: number;
  manuscriptSha256Before: string;
  manuscriptSha256After: string;
  changedUnits: BookAuthoringChangedUnitV1[];
  declaredActionIds: string[];
  producedStateIds: string[];
  producedEvidenceIds: string[];
  appliedVoiceAnchorIds: string[];
  addressedFactClaimIds: string[];
  addressedResearchClaimIds: string[];
  rejectedPatternChecks: Record<string, { passed: boolean; evidenceId: string }>;
  unresolvedRiskIds: string[];
  checkpointId: string;
  checkpointFingerprint: string;
  completedAt: string;
  continuation: BookAuthoringContinuationV1;
  phraseOverlapScanRequired: true;
  resultFingerprint: string;
  canonicalAdmissionAllowed: false;
  canonicalManuscriptMutationPerformed: false;
  publicationPerformed: false;
}

export interface BookAuthoringPacketValidationResultV1 {
  outputKind: "evavo_docs_book_authoring_packet_validation";
  schemaVersion: 1;
  status: "ready" | "blocked";
  packet?: BookAuthoringPacketV1;
  blockers: string[];
  warnings: string[];
  packetFingerprint?: string;
  canonicalAdmissionAllowed: false;
  canonicalManuscriptMutationPerformed: false;
  publicationPerformed: false;
}

export interface BookAuthoringResultValidationResultV1 {
  outputKind: "evavo_docs_book_authoring_result_validation";
  schemaVersion: 1;
  status: "accepted_for_review" | "continuation_required" | "needs_work" | "blocked";
  result?: BookAuthoringResultV1;
  blockers: string[];
  requiredActions: string[];
  outOfScopeUnitIds: string[];
  prohibitedActionIdsUsed: string[];
  missingOutputStateIds: string[];
  missingVoiceAnchorIds: string[];
  missingRejectedPatternChecks: string[];
  resultFingerprint?: string;
  canonicalAdmissionAllowed: false;
  canonicalManuscriptMutationPerformed: false;
  publicationPerformed: false;
}

export interface BookAuthoringAdmissionEvidenceV1 {
  outputKind: "evavo_docs_book_authoring_admission_evidence";
  schemaVersion: 1;
  packetFingerprint: string;
  resultFingerprint: string;
  phraseOverlapReceiptFingerprint: string;
  continuityReceiptFingerprint: string;
  factualIntegrityReceiptFingerprint: string;
  antiGenericityReceiptFingerprint: string;
  independentReviewReceiptFingerprint: string;
  phraseOverlapPassed: boolean;
  continuityPassed: boolean;
  factualIntegrityPassed: boolean;
  antiGenericityPassed: boolean;
  independentReviewPassed: boolean;
  humanReviewRequired: boolean;
  humanReviewRecorded: boolean;
  beforeManuscriptSha256: string;
  proposedAfterManuscriptSha256: string;
  evidenceIds: string[];
  evidenceFingerprint: string;
}

export interface BookAuthoringAdmissionResultV1 {
  outputKind: "evavo_docs_book_authoring_admission_result";
  schemaVersion: 1;
  status: "ready_for_website_compare_and_swap" | "needs_work" | "blocked";
  blockers: string[];
  requiredActions: string[];
  admissionFingerprint: string;
  websiteCompatibilityWriterRequired: true;
  docsSuiteCanonicalWriterEnabled: false;
  canonicalAdmissionAllowed: false;
  canonicalManuscriptMutationPerformed: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}
