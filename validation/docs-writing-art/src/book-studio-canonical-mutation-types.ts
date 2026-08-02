export const BOOK_CANONICAL_MUTATION_CONTRACT = 'evavo_docs_book_canonical_mutation_v1' as const;

export type BookCanonicalMutationKind = 'text_only' | 'structural';

export interface BookCanonicalUnitStateV1 {
  unitId: string;
  ordinal: number;
  textSha256: string;
}

export interface BookCanonicalSnapshotV1 {
  snapshotId: string;
  projectId: string;
  programmeId: string;
  volumeId: string;
  revisionNumber: number;
  manuscriptRevisionId: string;
  parentRevisionId?: string;
  manuscriptObjectId: string;
  manuscriptStorageVersion: string;
  manuscriptByteLength: number;
  manuscriptSha256: string;
  orderedUnits: BookCanonicalUnitStateV1[];
  unitSequenceSha256: string;
  sourceCoverageFingerprint: string;
  stateFingerprint: string;
}

export interface BookCanonicalChangedUnitV1 {
  unitId: string;
  beforeSha256?: string;
  afterSha256?: string;
  changeKind: 'added' | 'removed' | 'modified';
  actionIds: string[];
  evidenceIds: string[];
}

export interface BookCanonicalMutationPlanInputV1 {
  outputKind: 'evavo_docs_book_canonical_mutation_plan_input';
  schemaVersion: 1;
  contract: typeof BOOK_CANONICAL_MUTATION_CONTRACT;
  authorityMode: 'shadow_migration';
  mutationId: string;
  idempotencyKey: string;
  mutationKind: BookCanonicalMutationKind;
  currentSnapshot: BookCanonicalSnapshotV1;
  proposedSnapshot: BookCanonicalSnapshotV1;
  changedUnits: BookCanonicalChangedUnitV1[];
  authoringAdmissionStatus: 'ready_for_website_compare_and_swap' | 'needs_work' | 'blocked';
  authoringAdmissionFingerprint: string;
  authoringAdmissionObjectId: string;
  reviewCraftAdmissionStatus: 'ready_for_website_compare_and_swap' | 'needs_work' | 'blocked';
  reviewCraftAdmissionFingerprint: string;
  reviewCraftAdmissionObjectId: string;
  executionTaskId: string;
  executionTaskFingerprint: string;
  executionReceiptId: string;
  executionReceiptFingerprint: string;
  structuralChangeEvidenceIds: string[];
  expectedWebsiteStateRevision: number;
  expectedWebsiteStateFingerprint: string;
  requestedAt: string;
  requestedBy: string;
  evidenceIds: string[];
  websiteCompatibilityWriterRequired: true;
  docsSuiteCanonicalWriterEnabled: false;
  dualAuthoritativeWritesAllowed: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export interface BookCanonicalMutationPlanV1 {
  outputKind: 'evavo_docs_book_canonical_mutation_plan';
  schemaVersion: 1;
  contract: typeof BOOK_CANONICAL_MUTATION_CONTRACT;
  status: 'ready_for_website_compare_and_swap' | 'blocked';
  mutationId: string;
  idempotencyKey: string;
  mutationKind: BookCanonicalMutationKind;
  projectId: string;
  programmeId: string;
  volumeId: string;
  currentSnapshot: BookCanonicalSnapshotV1;
  proposedSnapshot: BookCanonicalSnapshotV1;
  changedUnits: BookCanonicalChangedUnitV1[];
  authoringAdmissionFingerprint: string;
  authoringAdmissionObjectId: string;
  reviewCraftAdmissionFingerprint: string;
  reviewCraftAdmissionObjectId: string;
  executionTaskId: string;
  executionTaskFingerprint: string;
  executionReceiptId: string;
  executionReceiptFingerprint: string;
  structuralChangeEvidenceIds: string[];
  expectedWebsiteStateRevision: number;
  expectedWebsiteStateFingerprint: string;
  requestedAt: string;
  requestedBy: string;
  evidenceIds: string[];
  rollbackSnapshotObjectId: string;
  rollbackSnapshotSha256: string;
  blockers: string[];
  warnings: string[];
  planFingerprint: string;
  websiteCompatibilityWriterRequired: true;
  docsSuiteCanonicalWriterEnabled: false;
  canonicalAdmissionAllowed: false;
  canonicalManuscriptMutationPerformed: false;
  dualAuthoritativeWritesAllowed: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export interface BookCanonicalMutationPlanResultV1 {
  outputKind: 'evavo_docs_book_canonical_mutation_plan_result';
  schemaVersion: 1;
  status: 'ready_for_website_compare_and_swap' | 'blocked';
  plan?: BookCanonicalMutationPlanV1;
  blockers: string[];
  warnings: string[];
  planFingerprint?: string;
  canonicalAdmissionAllowed: false;
  canonicalManuscriptMutationPerformed: false;
  publicationPerformed: false;
}

export interface WebsiteCanonicalMutationReceiptV1 {
  outputKind: 'evavo_website_book_canonical_mutation_receipt';
  schemaVersion: 1;
  mutationId: string;
  idempotencyKey: string;
  planFingerprint: string;
  transactionId: string;
  sourceRepository: 'EVAVO-STUDIO/Website';
  sourceCommit: string;
  sourcePath: string;
  sourceBlobSha1: string;
  expectedStateRevision: number;
  observedStateRevisionBefore: number;
  observedStateRevisionAfter: number;
  expectedStateFingerprint: string;
  observedStateFingerprintBefore: string;
  observedStateFingerprintAfter: string;
  manuscriptRevisionIdBefore: string;
  manuscriptRevisionIdAfter: string;
  manuscriptSha256Before: string;
  manuscriptSha256After: string;
  compareAndSwapSucceeded: boolean;
  idempotentReplay: boolean;
  persistedAt: string;
  persistedBy: string;
  rollbackSnapshotObjectId: string;
  rollbackSnapshotSha256: string;
  receiptFingerprint: string;
  canonicalManuscriptMutationPerformed: true;
  publicationPerformed: false;
}

export interface WebsiteCanonicalMutationReceiptImportInputV1 {
  outputKind: 'evavo_docs_website_canonical_mutation_receipt_import_input';
  schemaVersion: 1;
  plan: BookCanonicalMutationPlanV1;
  receipt: WebsiteCanonicalMutationReceiptV1;
  importedAt: string;
  importedBy: string;
}

export interface WebsiteCanonicalMutationReceiptImportResultV1 {
  outputKind: 'evavo_docs_website_canonical_mutation_receipt_import_result';
  schemaVersion: 1;
  status: 'ready_for_shadow_observation' | 'blocked';
  blockers: string[];
  requiredActions: string[];
  mutationId: string;
  planFingerprint: string;
  receiptFingerprint: string;
  transactionId: string;
  sourceCommit: string;
  sourcePath: string;
  sourceBlobSha1: string;
  importedAt: string;
  importedBy: string;
  idempotentReplay: boolean;
  resultingSnapshotFingerprint?: string;
  importFingerprint: string;
  statePersisted: false;
  authoritativeWritesPerformed: false;
  websiteCompatibilityRuntimeStillAuthoritative: true;
  docsSuiteCanonicalWriterEnabled: false;
  dualAuthoritativeWritesAllowed: false;
  runtimeCutoverApproved: false;
  sourceDeletionApproved: false;
  publicationPerformed: false;
}
