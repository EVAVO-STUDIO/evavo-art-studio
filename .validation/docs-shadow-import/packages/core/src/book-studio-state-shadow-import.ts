import {
  canonicalBookJson,
  sha256BookText,
} from "./book-studio-project-contracts";
import {
  compileBookStateMigrationBundle,
} from "./book-studio-state-migration-bundle";
import type {
  BookStateMigrationBundleInputV1,
  BookStateMigrationBundleResultV1,
  BookStateMigrationOperationExecutor,
} from "./book-studio-state-migration-types";

export const BOOK_STATE_SHADOW_IMPORT_CONTRACT =
  "evavo_docs_book_state_shadow_import_v1" as const;
export const BOOK_STATE_SHADOW_ROLLBACK_CONTRACT =
  "evavo_docs_book_state_shadow_rollback_v1" as const;

const SAFE_ID = /^[a-z][a-z0-9._:@/-]{1,299}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const MAX_EVIDENCE_IDS = 100_000;

export interface BookStateShadowImportRequestV1 {
  outputKind: "evavo_docs_book_state_shadow_import_request";
  schemaVersion: 1;
  contract: typeof BOOK_STATE_SHADOW_IMPORT_CONTRACT;
  authorityMode: "shadow_migration";
  importId: string;
  idempotencyKey: string;
  bundle: BookStateMigrationBundleInputV1;
  expectedValidationFingerprint: string;
  expectedCurrentRevision: number;
  expectedCurrentSnapshotFingerprint: string | null;
  requestedAt: string;
  requestedBy: string;
  evidenceIds: string[];
  authoritativeWritesAllowed: false;
  canonicalManuscriptMutationAllowed: false;
  runtimeCutoverApproved: false;
  sourceDeletionApproved: false;
  publicationPerformed: false;
}

export interface BookStateShadowImportPlanV1 {
  outputKind: "evavo_docs_book_state_shadow_import_plan";
  schemaVersion: 1;
  contract: typeof BOOK_STATE_SHADOW_IMPORT_CONTRACT;
  status: "ready_for_shadow_import";
  importId: string;
  idempotencyKey: string;
  projectId: string;
  programmeId: string;
  sourceRepository: "EVAVO-STUDIO/Website";
  sourceCommit: string;
  bundleFingerprint: string;
  statePayloadFingerprint: string;
  itemFingerprints: string[];
  expectedCurrentRevision: number;
  expectedCurrentSnapshotFingerprint: string | null;
  requestedAt: string;
  requestedBy: string;
  evidenceIds: string[];
  requestFingerprint: string;
  planFingerprint: string;
  authoritativeWritesPerformed: false;
  statePersisted: false;
  canonicalManuscriptMutationPerformed: false;
  websiteCompatibilityRuntimeStillAuthoritative: true;
  docsSuiteCanonicalWriterEnabled: false;
  dualAuthoritativeWritesAllowed: false;
  runtimeCutoverApproved: false;
  sourceDeletionApproved: false;
  publicationPerformed: false;
}

export interface PreparedBookStateShadowImportV1 {
  request: BookStateShadowImportRequestV1;
  validationResult: BookStateMigrationBundleResultV1;
  plan: BookStateShadowImportPlanV1;
}

export interface BookStateShadowRollbackRequestV1 {
  outputKind: "evavo_docs_book_state_shadow_rollback_request";
  schemaVersion: 1;
  contract: typeof BOOK_STATE_SHADOW_ROLLBACK_CONTRACT;
  authorityMode: "shadow_migration";
  rehearsalId: string;
  projectId: string;
  expectedCurrentRevision: number;
  expectedCurrentSnapshotFingerprint: string;
  expectedPreviousSnapshotFingerprint: string | null;
  requestedAt: string;
  requestedBy: string;
  evidenceIds: string[];
  authoritativeWritesAllowed: false;
  canonicalManuscriptMutationAllowed: false;
  runtimeCutoverApproved: false;
  sourceDeletionApproved: false;
  publicationPerformed: false;
}

export interface BookStateShadowRollbackPlanV1 {
  outputKind: "evavo_docs_book_state_shadow_rollback_plan";
  schemaVersion: 1;
  contract: typeof BOOK_STATE_SHADOW_ROLLBACK_CONTRACT;
  status: "ready_for_rollback_rehearsal";
  rehearsalId: string;
  projectId: string;
  expectedCurrentRevision: number;
  expectedCurrentSnapshotFingerprint: string;
  expectedPreviousSnapshotFingerprint: string | null;
  restoreEmptyState: boolean;
  requestedAt: string;
  requestedBy: string;
  evidenceIds: string[];
  requestFingerprint: string;
  planFingerprint: string;
  authoritativeWritesPerformed: false;
  statePersisted: false;
  canonicalManuscriptMutationPerformed: false;
  websiteCompatibilityRuntimeStillAuthoritative: true;
  docsSuiteCanonicalWriterEnabled: false;
  dualAuthoritativeWritesAllowed: false;
  runtimeCutoverApproved: false;
  sourceDeletionApproved: false;
  publicationPerformed: false;
}

export async function prepareBookStateShadowImport(
  input: unknown,
  executeOperation: BookStateMigrationOperationExecutor,
): Promise<PreparedBookStateShadowImportV1> {
  const source = strictRecord(input, IMPORT_KEYS, "Shadow state import request");
  if (
    source.outputKind !== "evavo_docs_book_state_shadow_import_request" ||
    source.schemaVersion !== 1 ||
    source.contract !== BOOK_STATE_SHADOW_IMPORT_CONTRACT ||
    source.authorityMode !== "shadow_migration"
  ) throw new Error("BOOK_STATE_SHADOW_IMPORT_CONTRACT_INVALID");
  requireFalseAuthority(source, "BOOK_STATE_SHADOW_IMPORT_AUTHORITY_INVALID");

  const importId = id(source.importId, "BOOK_STATE_SHADOW_IMPORT_ID_INVALID");
  const idempotencyKey = id(
    source.idempotencyKey,
    "BOOK_STATE_SHADOW_IMPORT_IDEMPOTENCY_INVALID",
  );
  const expectedValidationFingerprint = digest(
    source.expectedValidationFingerprint,
    "BOOK_STATE_SHADOW_IMPORT_VALIDATION_FINGERPRINT_INVALID",
  );
  const expectedCurrentRevision = nonNegativeInteger(
    source.expectedCurrentRevision,
    "BOOK_STATE_SHADOW_IMPORT_EXPECTED_REVISION_INVALID",
  );
  const expectedCurrentSnapshotFingerprint = nullableDigest(
    source.expectedCurrentSnapshotFingerprint,
    "BOOK_STATE_SHADOW_IMPORT_EXPECTED_SNAPSHOT_INVALID",
  );
  if (
    (expectedCurrentRevision === 0) !==
    (expectedCurrentSnapshotFingerprint === null)
  ) throw new Error("BOOK_STATE_SHADOW_IMPORT_EXPECTATION_INCONSISTENT");
  const requestedAt = timestamp(
    source.requestedAt,
    "BOOK_STATE_SHADOW_IMPORT_REQUESTED_AT_INVALID",
  );
  const requestedBy = text(
    source.requestedBy,
    300,
    "BOOK_STATE_SHADOW_IMPORT_REQUESTED_BY_INVALID",
  );
  const evidenceIds = ids(
    source.evidenceIds,
    "BOOK_STATE_SHADOW_IMPORT_EVIDENCE_INVALID",
  );
  const bundle = source.bundle as BookStateMigrationBundleInputV1;
  const exactValidation = await compileBookStateMigrationBundle(
    bundle,
    executeOperation,
  );
  if (exactValidation.bundleFingerprint !== expectedValidationFingerprint) {
    throw new Error("BOOK_STATE_SHADOW_IMPORT_VALIDATION_MISMATCH");
  }
  if (
    exactValidation.status !== "ready_for_cutover_review" ||
    exactValidation.blockers.length ||
    exactValidation.statePersisted !== false ||
    exactValidation.docsSuiteCanonicalWriterEnabled !== false ||
    exactValidation.runtimeCutoverApproved !== false ||
    exactValidation.publicationPerformed !== false
  ) throw new Error("BOOK_STATE_SHADOW_IMPORT_BUNDLE_NOT_READY");

  const request: BookStateShadowImportRequestV1 = {
    outputKind: "evavo_docs_book_state_shadow_import_request",
    schemaVersion: 1,
    contract: BOOK_STATE_SHADOW_IMPORT_CONTRACT,
    authorityMode: "shadow_migration",
    importId,
    idempotencyKey,
    bundle,
    expectedValidationFingerprint,
    expectedCurrentRevision,
    expectedCurrentSnapshotFingerprint,
    requestedAt,
    requestedBy,
    evidenceIds,
    authoritativeWritesAllowed: false,
    canonicalManuscriptMutationAllowed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
  };
  const requestFingerprint = await sha256BookText(canonicalBookJson(request));
  const statePayloadFingerprint = await sha256BookText(
    canonicalBookJson({ bundle, validationResult: exactValidation }),
  );
  const unsignedPlan: Omit<BookStateShadowImportPlanV1, "planFingerprint"> = {
    outputKind: "evavo_docs_book_state_shadow_import_plan",
    schemaVersion: 1,
    contract: BOOK_STATE_SHADOW_IMPORT_CONTRACT,
    status: "ready_for_shadow_import",
    importId,
    idempotencyKey,
    projectId: exactValidation.projectId,
    programmeId: exactValidation.programmeId,
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommit: exactValidation.sourceCommit,
    bundleFingerprint: exactValidation.bundleFingerprint,
    statePayloadFingerprint,
    itemFingerprints: exactValidation.itemResults
      .map((item) => item.itemFingerprint)
      .sort(),
    expectedCurrentRevision,
    expectedCurrentSnapshotFingerprint,
    requestedAt,
    requestedBy,
    evidenceIds,
    requestFingerprint,
    authoritativeWritesPerformed: false,
    statePersisted: false,
    canonicalManuscriptMutationPerformed: false,
    websiteCompatibilityRuntimeStillAuthoritative: true,
    docsSuiteCanonicalWriterEnabled: false,
    dualAuthoritativeWritesAllowed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
  };
  return {
    request,
    validationResult: exactValidation,
    plan: {
      ...unsignedPlan,
      planFingerprint: await sha256BookText(canonicalBookJson(unsignedPlan)),
    },
  };
}

export async function compileBookStateShadowRollbackPlan(
  input: unknown,
): Promise<BookStateShadowRollbackPlanV1> {
  const source = strictRecord(
    input,
    ROLLBACK_KEYS,
    "Shadow state rollback request",
  );
  if (
    source.outputKind !== "evavo_docs_book_state_shadow_rollback_request" ||
    source.schemaVersion !== 1 ||
    source.contract !== BOOK_STATE_SHADOW_ROLLBACK_CONTRACT ||
    source.authorityMode !== "shadow_migration"
  ) throw new Error("BOOK_STATE_SHADOW_ROLLBACK_CONTRACT_INVALID");
  requireFalseAuthority(source, "BOOK_STATE_SHADOW_ROLLBACK_AUTHORITY_INVALID");
  const rehearsalId = id(
    source.rehearsalId,
    "BOOK_STATE_SHADOW_ROLLBACK_ID_INVALID",
  );
  const projectId = id(
    source.projectId,
    "BOOK_STATE_SHADOW_ROLLBACK_PROJECT_INVALID",
  );
  const expectedCurrentRevision = positiveInteger(
    source.expectedCurrentRevision,
    "BOOK_STATE_SHADOW_ROLLBACK_REVISION_INVALID",
  );
  const expectedCurrentSnapshotFingerprint = digest(
    source.expectedCurrentSnapshotFingerprint,
    "BOOK_STATE_SHADOW_ROLLBACK_CURRENT_INVALID",
  );
  const expectedPreviousSnapshotFingerprint = nullableDigest(
    source.expectedPreviousSnapshotFingerprint,
    "BOOK_STATE_SHADOW_ROLLBACK_PREVIOUS_INVALID",
  );
  const requestedAt = timestamp(
    source.requestedAt,
    "BOOK_STATE_SHADOW_ROLLBACK_REQUESTED_AT_INVALID",
  );
  const requestedBy = text(
    source.requestedBy,
    300,
    "BOOK_STATE_SHADOW_ROLLBACK_REQUESTED_BY_INVALID",
  );
  const evidenceIds = ids(
    source.evidenceIds,
    "BOOK_STATE_SHADOW_ROLLBACK_EVIDENCE_INVALID",
  );
  const normalized = {
    outputKind: "evavo_docs_book_state_shadow_rollback_request" as const,
    schemaVersion: 1 as const,
    contract: BOOK_STATE_SHADOW_ROLLBACK_CONTRACT,
    authorityMode: "shadow_migration" as const,
    rehearsalId,
    projectId,
    expectedCurrentRevision,
    expectedCurrentSnapshotFingerprint,
    expectedPreviousSnapshotFingerprint,
    requestedAt,
    requestedBy,
    evidenceIds,
    authoritativeWritesAllowed: false as const,
    canonicalManuscriptMutationAllowed: false as const,
    runtimeCutoverApproved: false as const,
    sourceDeletionApproved: false as const,
    publicationPerformed: false as const,
  };
  const requestFingerprint = await sha256BookText(canonicalBookJson(normalized));
  const unsigned: Omit<BookStateShadowRollbackPlanV1, "planFingerprint"> = {
    outputKind: "evavo_docs_book_state_shadow_rollback_plan",
    schemaVersion: 1,
    contract: BOOK_STATE_SHADOW_ROLLBACK_CONTRACT,
    status: "ready_for_rollback_rehearsal",
    rehearsalId,
    projectId,
    expectedCurrentRevision,
    expectedCurrentSnapshotFingerprint,
    expectedPreviousSnapshotFingerprint,
    restoreEmptyState: expectedPreviousSnapshotFingerprint === null,
    requestedAt,
    requestedBy,
    evidenceIds,
    requestFingerprint,
    authoritativeWritesPerformed: false,
    statePersisted: false,
    canonicalManuscriptMutationPerformed: false,
    websiteCompatibilityRuntimeStillAuthoritative: true,
    docsSuiteCanonicalWriterEnabled: false,
    dualAuthoritativeWritesAllowed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
  };
  return {
    ...unsigned,
    planFingerprint: await sha256BookText(canonicalBookJson(unsigned)),
  };
}

const IMPORT_KEYS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "authorityMode",
  "importId",
  "idempotencyKey",
  "bundle",
  "expectedValidationFingerprint",
  "expectedCurrentRevision",
  "expectedCurrentSnapshotFingerprint",
  "requestedAt",
  "requestedBy",
  "evidenceIds",
  "authoritativeWritesAllowed",
  "canonicalManuscriptMutationAllowed",
  "runtimeCutoverApproved",
  "sourceDeletionApproved",
  "publicationPerformed",
]);
const ROLLBACK_KEYS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "authorityMode",
  "rehearsalId",
  "projectId",
  "expectedCurrentRevision",
  "expectedCurrentSnapshotFingerprint",
  "expectedPreviousSnapshotFingerprint",
  "requestedAt",
  "requestedBy",
  "evidenceIds",
  "authoritativeWritesAllowed",
  "canonicalManuscriptMutationAllowed",
  "runtimeCutoverApproved",
  "sourceDeletionApproved",
  "publicationPerformed",
]);

function strictRecord(
  value: unknown,
  allowed: ReadonlySet<string>,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const source = value as Record<string, unknown>;
  const unknown = Object.keys(source).filter((key) => !allowed.has(key)).sort();
  if (unknown.length) {
    throw new Error(`${label} contains unsupported fields: ${unknown.join(", ")}.`);
  }
  return source;
}
function requireFalseAuthority(source: Record<string, unknown>, code: string): void {
  if (
    source.authoritativeWritesAllowed !== false ||
    source.canonicalManuscriptMutationAllowed !== false ||
    source.runtimeCutoverApproved !== false ||
    source.sourceDeletionApproved !== false ||
    source.publicationPerformed !== false
  ) throw new Error(code);
}
function id(value: unknown, code: string): string {
  if (
    typeof value !== "string" ||
    !SAFE_ID.test(value) ||
    ["__proto__", "constructor", "prototype"].includes(value)
  ) throw new Error(code);
  return value;
}
function digest(value: unknown, code: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) throw new Error(code);
  return value;
}
function nullableDigest(value: unknown, code: string): string | null {
  return value === null ? null : digest(value, code);
}
function timestamp(value: unknown, code: string): string {
  if (
    typeof value !== "string" ||
    !ISO_TIMESTAMP.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) throw new Error(code);
  return value;
}
function text(value: unknown, maximum: number, code: string): string {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    !value.length ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) throw new Error(code);
  return value;
}
function ids(value: unknown, code: string): string[] {
  if (!Array.isArray(value) || value.length > MAX_EVIDENCE_IDS) throw new Error(code);
  const result = value.map((entry) => id(entry, code));
  if (new Set(result).size !== result.length) throw new Error(code);
  return [...result].sort();
}
function nonNegativeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(code);
  return Number(value);
}
function positiveInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(code);
  return Number(value);
}
