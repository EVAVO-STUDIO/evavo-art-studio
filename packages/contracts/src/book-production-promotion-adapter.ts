import type {
  BookArtArtifactReceiptV1,
  BookArtIdentityV1,
  BookArtProvenanceV1,
} from "./book-production.js";
import { validateBookArtArtifactReceipt } from "./book-production.js";

export interface BookArtArtifactSnapshotV1 {
  artifactId: string;
  descriptorSha256: string;
  contentSha256: string;
  sizeBytes: number;
  mediaType: string;
  storageClass: "source" | "master" | "intermediate" | "preview" | "evidence" | "manifest" | "runtime";
  sourceArtifacts: string[];
  labels: Record<string, string>;
}

export interface BookArtArtifactVerificationSnapshotV1 {
  artifactId: string;
  exists: boolean;
  descriptorValid: boolean;
  contentValid: boolean;
  expectedContentSha256: string;
  actualContentSha256?: string;
  expectedSizeBytes: number;
  actualSizeBytes?: number;
}

export interface CandidatePromotionResultSnapshotV1 {
  schemaVersion: "1.0";
  promotionId: string;
  selectionEvidenceArtifactId: string;
  candidateArtifactId: string;
  masterArtifactId: string;
  authorizationEvidenceArtifactId: string;
  reference: {
    schemaVersion: "1.0";
    namespace: string;
    name: string;
    generation: number;
    artifactId: string;
    contentHash: string;
    previousArtifactId?: string;
    updatedAt: string;
    actor?: string;
  };
  approvalMode: "automatic" | "human";
}

export interface BookArtProductionEvidenceV1 {
  outputKind: "evavo_book_art_production_evidence";
  schemaVersion: 1;
  identity: BookArtIdentityV1;
  sourceBriefFingerprint: string;
  promotionId: string;
  selectionEvidenceArtifactId: string;
  candidateArtifactId: string;
  masterArtifactId: string;
  authorizationEvidenceArtifactId: string;
  masterContentSha256: string;
  masterSizeBytes: number;
  technicalQualityReceiptSha256: string;
  widthPx: number;
  heightPx: number;
  mimeType: string;
  provenance: BookArtProvenanceV1;
  generatedTextDetected: boolean;
  unresolvedRisks: string[];
  evidenceFingerprint: string;
}

export interface BookArtPromotionReceiptCompileInputV1 {
  promotion: CandidatePromotionResultSnapshotV1;
  masterArtifact: BookArtArtifactSnapshotV1;
  masterVerification: BookArtArtifactVerificationSnapshotV1;
  selectionEvidenceArtifact: BookArtArtifactSnapshotV1;
  selectionEvidenceVerification: BookArtArtifactVerificationSnapshotV1;
  authorizationArtifact: BookArtArtifactSnapshotV1;
  authorizationVerification: BookArtArtifactVerificationSnapshotV1;
  productionEvidenceArtifact: BookArtArtifactSnapshotV1;
  productionEvidenceVerification: BookArtArtifactVerificationSnapshotV1;
  productionEvidenceJson: string;
}

export interface BookArtPromotionBatchCompileItemV1 {
  migrationItemId: string;
  input: BookArtPromotionReceiptCompileInputV1;
}

export interface BookArtPromotionBatchCompileInputV1 {
  batchId: string;
  sourceArtImportBatchFingerprint: string;
  expectedMigrationItemIds: string[];
  items: BookArtPromotionBatchCompileItemV1[];
}

export interface ArtStudioBookPromotionBatchItemV1 {
  migrationItemId: string;
  artifact: BookArtArtifactReceiptV1;
}

export interface ArtStudioBookPromotionBatchV1 {
  outputKind: "evavo_art_studio_book_promotion_batch";
  schemaVersion: 1;
  batchId: string;
  sourceArtImportBatchFingerprint: string;
  expectedMigrationItemIds: string[];
  items: ArtStudioBookPromotionBatchItemV1[];
  batchFingerprint: string;
  authoritativeWritesPerformed: false;
  artifactBytesRewritten: false;
  publicationPerformed: false;
}

const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/;
const ARTIFACT_ID = /^artifact_[A-Za-z0-9_-]{8,200}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/tiff"]);
const STORAGE_CLASSES = new Set(["source", "master", "intermediate", "preview", "evidence", "manifest", "runtime"]);
const PROVENANCE_ORIGINS = new Set(["commissioned", "licensed", "human_authored", "ai_assisted", "ai_generated", "mixed_composite"]);
const RIGHTS_STATUSES = new Set(["approved_commercial", "review_required", "blocked"]);
const AI_DISCLOSURES = new Set(["not_applicable", "ai_assisted", "ai_generated", "review_required"]);
const MAXIMUM_EVIDENCE_BYTES = 1_048_576;
const MAXIMUM_BATCH_ITEMS = 10_000;

export class BookArtPromotionAdapterError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "BookArtPromotionAdapterError";
    this.code = code;
  }
}

export async function compileBookArtArtifactReceiptFromPromotion(
  input: BookArtPromotionReceiptCompileInputV1,
): Promise<BookArtArtifactReceiptV1> {
  const promotion = validatePromotion(input?.promotion);
  const master = validateArtifact(input?.masterArtifact, "master artifact");
  const selection = validateArtifact(input?.selectionEvidenceArtifact, "selection evidence artifact");
  const authorization = validateArtifact(input?.authorizationArtifact, "authorization artifact");
  const productionEvidenceArtifact = validateArtifact(input?.productionEvidenceArtifact, "production evidence artifact");
  validateVerification(input?.masterVerification, master, "master artifact");
  validateVerification(input?.selectionEvidenceVerification, selection, "selection evidence artifact");
  validateVerification(input?.authorizationVerification, authorization, "authorization artifact");
  validateVerification(input?.productionEvidenceVerification, productionEvidenceArtifact, "production evidence artifact");

  requireEqual(master.artifactId, promotion.masterArtifactId, "Promotion master artifact differs from the retained master artifact.");
  requireEqual(selection.artifactId, promotion.selectionEvidenceArtifactId, "Promotion selection evidence differs from the retained selection artifact.");
  requireEqual(authorization.artifactId, promotion.authorizationEvidenceArtifactId, "Promotion authorization evidence differs from the retained authorization artifact.");
  requireEqual(promotion.reference.artifactId, master.artifactId, "Promotion reference does not resolve to the retained master artifact.");
  requireEqual(normalizeSha(promotion.reference.contentHash), master.contentSha256, "Promotion reference content hash differs from the retained master bytes.");

  requireArtifactRole(master, "selected-art-master");
  requireLabel(master, "approvalState", "selected");
  requireLabel(master, "qualityState", "passed");
  requireLabel(master, "promotionId", promotion.promotionId);
  requireLabel(master, "selectionEvidenceArtifactId", selection.artifactId);
  requireLabel(master, "sourceCandidateArtifactId", promotion.candidateArtifactId);
  requireLabel(master, "approvalMode", promotion.approvalMode);
  requireSource(master, promotion.candidateArtifactId, "Selected master does not retain the source candidate lineage.");
  requireSource(master, selection.artifactId, "Selected master does not retain the selection-evidence lineage.");
  if (master.storageClass !== "master") fail("invalid_master_storage_class", "Selected Book Art master must use master storage class.");
  if (!IMAGE_MIME_TYPES.has(master.mediaType)) fail("invalid_master_media_type", "Selected Book Art master must be a supported image type.");

  requireArtifactRole(selection, "candidate-selection-evidence");
  if (selection.storageClass !== "evidence" || selection.mediaType !== "application/json") {
    fail("invalid_selection_evidence", "Selection evidence must be immutable JSON evidence.");
  }

  requireArtifactRole(authorization, "candidate-promotion-authorization");
  requireLabel(authorization, "promotionId", promotion.promotionId);
  if (authorization.storageClass !== "evidence" || authorization.mediaType !== "application/json") {
    fail("invalid_authorization_evidence", "Promotion authorization must be immutable JSON evidence.");
  }
  for (const artifactId of [selection.artifactId, promotion.candidateArtifactId, master.artifactId]) {
    requireSource(authorization, artifactId, `Promotion authorization is missing source lineage ${artifactId}.`);
  }

  requireArtifactRole(productionEvidenceArtifact, "book-art-production-evidence");
  requireLabel(productionEvidenceArtifact, "promotionId", promotion.promotionId);
  requireLabel(productionEvidenceArtifact, "masterArtifactId", master.artifactId);
  if (productionEvidenceArtifact.storageClass !== "evidence" || productionEvidenceArtifact.mediaType !== "application/json") {
    fail("invalid_production_evidence_artifact", "Book Art production evidence must be immutable JSON evidence.");
  }
  for (const artifactId of [promotion.candidateArtifactId, selection.artifactId, authorization.artifactId, master.artifactId]) {
    requireSource(productionEvidenceArtifact, artifactId, `Book Art production evidence is missing source lineage ${artifactId}.`);
  }

  const productionEvidence = await parseProductionEvidence(
    input?.productionEvidenceJson,
    productionEvidenceArtifact,
  );
  validateEvidenceChain(productionEvidence, promotion, master, selection, authorization);

  const actor = text(promotion.reference.actor);
  if (!strictText(actor, 300)) fail("missing_promotion_actor", "Promotion reference must retain a bounded actor identity.");
  if (!isTimestamp(promotion.reference.updatedAt)) fail("invalid_promotion_timestamp", "Promotion reference updatedAt is invalid.");

  const withoutFingerprint: Omit<BookArtArtifactReceiptV1, "artifactFingerprint"> = {
    outputKind: "evavo_book_art_artifact_receipt",
    schemaVersion: 1,
    contract: "evavo_book_art_handoff_v1",
    identity: productionEvidence.identity,
    sourceBriefFingerprint: productionEvidence.sourceBriefFingerprint,
    status: "approved",
    artifactId: master.artifactId,
    artifactReference: compileArtifactReference(promotion),
    contentSha256: master.contentSha256,
    byteLength: master.sizeBytes,
    mimeType: master.mediaType,
    widthPx: productionEvidence.widthPx,
    heightPx: productionEvidence.heightPx,
    provenance: productionEvidence.provenance,
    technicalQualityReceiptSha256: productionEvidence.technicalQualityReceiptSha256,
    selectionReceiptSha256: selection.contentSha256,
    promotionReceiptSha256: authorization.contentSha256,
    promotedBy: actor,
    promotedAt: promotion.reference.updatedAt,
    generatedTextDetected: productionEvidence.generatedTextDetected,
    unresolvedRisks: [...productionEvidence.unresolvedRisks],
    publicationPerformed: false,
  };
  const receipt: BookArtArtifactReceiptV1 = {
    ...withoutFingerprint,
    artifactFingerprint: await sha256Text(canonicalJson(withoutFingerprint)),
  };
  const validation = validateBookArtArtifactReceipt(receipt);
  if (!validation.valid) {
    fail("invalid_compiled_receipt", `Compiled Book Art receipt is invalid: ${validation.issues.join(" ")}`);
  }
  return receipt;
}

export async function compileBookArtPromotionBatch(
  input: BookArtPromotionBatchCompileInputV1,
): Promise<ArtStudioBookPromotionBatchV1> {
  const batchId = requireSafeId(input?.batchId, "batchId");
  const sourceArtImportBatchFingerprint = requireSha(input?.sourceArtImportBatchFingerprint, "sourceArtImportBatchFingerprint");
  if (!Array.isArray(input?.expectedMigrationItemIds) || input.expectedMigrationItemIds.length < 1 || input.expectedMigrationItemIds.length > MAXIMUM_BATCH_ITEMS) {
    fail("invalid_expected_item_set", `Book Art promotion batch requires 1-${MAXIMUM_BATCH_ITEMS} expected migration item IDs.`);
  }
  if (!Array.isArray(input?.items) || input.items.length > MAXIMUM_BATCH_ITEMS) {
    fail("invalid_batch_items", `Book Art promotion batch items must contain at most ${MAXIMUM_BATCH_ITEMS} records.`);
  }
  const expectedIds = input.expectedMigrationItemIds.map((id) => requireSafeId(id, "expectedMigrationItemId"));
  const itemIds = input.items.map((item) => requireSafeId(item?.migrationItemId, "migrationItemId"));
  const duplicateExpected = duplicates(expectedIds);
  const duplicateItems = duplicates(itemIds);
  if (duplicateExpected.length) fail("duplicate_expected_items", `Expected migration item IDs are duplicated: ${duplicateExpected.join(", ")}.`);
  if (duplicateItems.length) fail("duplicate_batch_items", `Promotion batch item IDs are duplicated: ${duplicateItems.join(", ")}.`);
  const expectedSet = new Set(expectedIds);
  const itemSet = new Set(itemIds);
  const missing = [...expectedSet].filter((id) => !itemSet.has(id)).sort();
  const unexpected = [...itemSet].filter((id) => !expectedSet.has(id)).sort();
  if (missing.length) fail("missing_batch_items", `Promotion batch is missing expected items: ${missing.join(", ")}.`);
  if (unexpected.length) fail("unexpected_batch_items", `Promotion batch contains unexpected items: ${unexpected.join(", ")}.`);

  const items: ArtStudioBookPromotionBatchItemV1[] = [];
  for (const item of [...input.items].sort((a, b) => a.migrationItemId.localeCompare(b.migrationItemId))) {
    items.push({
      migrationItemId: item.migrationItemId,
      artifact: await compileBookArtArtifactReceiptFromPromotion(item.input),
    });
  }
  const withoutFingerprint: Omit<ArtStudioBookPromotionBatchV1, "batchFingerprint"> = {
    outputKind: "evavo_art_studio_book_promotion_batch",
    schemaVersion: 1,
    batchId,
    sourceArtImportBatchFingerprint,
    expectedMigrationItemIds: [...expectedIds].sort(),
    items,
    authoritativeWritesPerformed: false,
    artifactBytesRewritten: false,
    publicationPerformed: false,
  };
  return {
    ...withoutFingerprint,
    batchFingerprint: await sha256Text(canonicalJson(withoutFingerprint)),
  };
}

export async function fingerprintBookArtProductionEvidence(
  value: Omit<BookArtProductionEvidenceV1, "evidenceFingerprint"> | BookArtProductionEvidenceV1,
): Promise<string> {
  const { evidenceFingerprint: _discarded, ...unsigned } = value as BookArtProductionEvidenceV1;
  return sha256Text(canonicalJson(unsigned));
}

function validatePromotion(value: CandidatePromotionResultSnapshotV1): CandidatePromotionResultSnapshotV1 {
  if (!value || typeof value !== "object") fail("invalid_promotion", "Candidate promotion result must be an object.");
  if (value.schemaVersion !== "1.0") fail("invalid_promotion_version", "Candidate promotion result schemaVersion is invalid.");
  requireSafeId(value.promotionId, "promotionId");
  for (const [label, artifactId] of [
    ["selectionEvidenceArtifactId", value.selectionEvidenceArtifactId],
    ["candidateArtifactId", value.candidateArtifactId],
    ["masterArtifactId", value.masterArtifactId],
    ["authorizationEvidenceArtifactId", value.authorizationEvidenceArtifactId],
  ] as const) requireArtifactId(artifactId, label);
  if (value.approvalMode !== "automatic" && value.approvalMode !== "human") fail("invalid_approval_mode", "Candidate promotion approvalMode is invalid.");
  const reference = value.reference;
  if (!reference || reference.schemaVersion !== "1.0") fail("invalid_promotion_reference", "Candidate promotion reference is invalid.");
  if (!strictText(reference.namespace, 300) || !strictText(reference.name, 300)) fail("invalid_reference_identity", "Candidate promotion reference namespace or name is invalid.");
  if (!Number.isSafeInteger(reference.generation) || reference.generation < 1) fail("invalid_reference_generation", "Candidate promotion reference generation is invalid.");
  requireArtifactId(reference.artifactId, "reference.artifactId");
  requireSha(reference.contentHash, "reference.contentHash");
  if (reference.previousArtifactId !== undefined) requireArtifactId(reference.previousArtifactId, "reference.previousArtifactId");
  if (!isTimestamp(reference.updatedAt)) fail("invalid_reference_timestamp", "Candidate promotion reference updatedAt is invalid.");
  if (reference.actor !== undefined && !strictText(reference.actor, 300)) fail("invalid_reference_actor", "Candidate promotion reference actor is invalid.");
  return structuredClone(value);
}

function validateArtifact(value: BookArtArtifactSnapshotV1, label: string): BookArtArtifactSnapshotV1 {
  if (!value || typeof value !== "object") fail("invalid_artifact_snapshot", `${label} must be an object.`);
  requireArtifactId(value.artifactId, `${label}.artifactId`);
  requireSha(value.descriptorSha256, `${label}.descriptorSha256`);
  requireSha(value.contentSha256, `${label}.contentSha256`);
  if (!Number.isSafeInteger(value.sizeBytes) || value.sizeBytes < 1) fail("invalid_artifact_size", `${label}.sizeBytes is invalid.`);
  if (!strictText(value.mediaType, 200)) fail("invalid_artifact_media_type", `${label}.mediaType is invalid.`);
  if (!STORAGE_CLASSES.has(value.storageClass)) fail("invalid_artifact_storage_class", `${label}.storageClass is invalid.`);
  if (!Array.isArray(value.sourceArtifacts) || value.sourceArtifacts.length > 512) fail("invalid_artifact_lineage", `${label}.sourceArtifacts is invalid.`);
  for (const artifactId of value.sourceArtifacts) requireArtifactId(artifactId, `${label}.sourceArtifactId`);
  if (!value.labels || typeof value.labels !== "object" || Array.isArray(value.labels)) fail("invalid_artifact_labels", `${label}.labels is invalid.`);
  for (const [key, item] of Object.entries(value.labels)) {
    if (!strictText(key, 200) || !strictText(item, 2_000)) fail("invalid_artifact_label", `${label} contains an invalid label.`);
  }
  return structuredClone(value);
}

function validateVerification(
  value: BookArtArtifactVerificationSnapshotV1,
  artifact: BookArtArtifactSnapshotV1,
  label: string,
): void {
  if (!value || typeof value !== "object") fail("missing_artifact_verification", `${label} verification is missing.`);
  requireEqual(value.artifactId, artifact.artifactId, `${label} verification identifies a different artifact.`);
  if (value.exists !== true || value.descriptorValid !== true || value.contentValid !== true) {
    fail("artifact_verification_failed", `${label} did not pass exact descriptor and content verification.`);
  }
  requireEqual(normalizeSha(value.expectedContentSha256), artifact.contentSha256, `${label} expected content checksum differs from the descriptor.`);
  requireEqual(normalizeSha(value.actualContentSha256), artifact.contentSha256, `${label} actual content checksum differs from the descriptor.`);
  requireEqual(value.expectedSizeBytes, artifact.sizeBytes, `${label} expected size differs from the descriptor.`);
  requireEqual(value.actualSizeBytes, artifact.sizeBytes, `${label} actual size differs from the descriptor.`);
}

async function parseProductionEvidence(
  rawJson: string,
  artifact: BookArtArtifactSnapshotV1,
): Promise<BookArtProductionEvidenceV1> {
  if (typeof rawJson !== "string") fail("missing_production_evidence", "Book Art production evidence JSON is required.");
  const bytes = new TextEncoder().encode(rawJson);
  if (bytes.byteLength < 2 || bytes.byteLength > MAXIMUM_EVIDENCE_BYTES) fail("invalid_production_evidence_size", "Book Art production evidence JSON size is invalid.");
  requireEqual(await sha256Bytes(bytes), artifact.contentSha256, "Book Art production evidence bytes differ from the immutable evidence artifact.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    fail("invalid_production_evidence_json", "Book Art production evidence is not valid JSON.");
  }
  const input = requireRecord(parsed, "Book Art production evidence");
  rejectUnknownKeys(input, new Set([
    "outputKind", "schemaVersion", "identity", "sourceBriefFingerprint", "promotionId",
    "selectionEvidenceArtifactId", "candidateArtifactId", "masterArtifactId",
    "authorizationEvidenceArtifactId", "masterContentSha256", "masterSizeBytes",
    "technicalQualityReceiptSha256", "widthPx", "heightPx", "mimeType", "provenance",
    "generatedTextDetected", "unresolvedRisks", "evidenceFingerprint",
  ]), "Book Art production evidence");
  if (input.outputKind !== "evavo_book_art_production_evidence" || input.schemaVersion !== 1) fail("invalid_production_evidence_kind", "Book Art production evidence kind or version is invalid.");
  const identity = parseIdentity(input.identity);
  const provenance = parseProvenance(input.provenance);
  const unresolvedRisks = parseStringArray(input.unresolvedRisks, "unresolvedRisks", 256, 2_000);
  const result: BookArtProductionEvidenceV1 = {
    outputKind: "evavo_book_art_production_evidence",
    schemaVersion: 1,
    identity,
    sourceBriefFingerprint: requireSha(input.sourceBriefFingerprint, "sourceBriefFingerprint"),
    promotionId: requireSafeId(input.promotionId, "promotionId"),
    selectionEvidenceArtifactId: requireArtifactId(input.selectionEvidenceArtifactId, "selectionEvidenceArtifactId"),
    candidateArtifactId: requireArtifactId(input.candidateArtifactId, "candidateArtifactId"),
    masterArtifactId: requireArtifactId(input.masterArtifactId, "masterArtifactId"),
    authorizationEvidenceArtifactId: requireArtifactId(input.authorizationEvidenceArtifactId, "authorizationEvidenceArtifactId"),
    masterContentSha256: requireSha(input.masterContentSha256, "masterContentSha256"),
    masterSizeBytes: requirePositiveInteger(input.masterSizeBytes, "masterSizeBytes", Number.MAX_SAFE_INTEGER),
    technicalQualityReceiptSha256: requireSha(input.technicalQualityReceiptSha256, "technicalQualityReceiptSha256"),
    widthPx: requirePositiveInteger(input.widthPx, "widthPx", 100_000),
    heightPx: requirePositiveInteger(input.heightPx, "heightPx", 100_000),
    mimeType: requireImageMimeType(input.mimeType),
    provenance,
    generatedTextDetected: requireBoolean(input.generatedTextDetected, "generatedTextDetected"),
    unresolvedRisks,
    evidenceFingerprint: requireSha(input.evidenceFingerprint, "evidenceFingerprint"),
  };
  requireEqual(result.evidenceFingerprint, await fingerprintBookArtProductionEvidence(result), "Book Art production evidence fingerprint differs from its exact canonical contents.");
  return result;
}

function validateEvidenceChain(
  evidence: BookArtProductionEvidenceV1,
  promotion: CandidatePromotionResultSnapshotV1,
  master: BookArtArtifactSnapshotV1,
  selection: BookArtArtifactSnapshotV1,
  authorization: BookArtArtifactSnapshotV1,
): void {
  requireEqual(evidence.promotionId, promotion.promotionId, "Book Art production evidence belongs to a different promotion.");
  requireEqual(evidence.selectionEvidenceArtifactId, selection.artifactId, "Book Art production evidence names different selection evidence.");
  requireEqual(evidence.candidateArtifactId, promotion.candidateArtifactId, "Book Art production evidence names a different source candidate.");
  requireEqual(evidence.masterArtifactId, master.artifactId, "Book Art production evidence names a different master artifact.");
  requireEqual(evidence.authorizationEvidenceArtifactId, authorization.artifactId, "Book Art production evidence names different authorization evidence.");
  requireEqual(evidence.masterContentSha256, master.contentSha256, "Book Art production evidence names different master bytes.");
  requireEqual(evidence.masterSizeBytes, master.sizeBytes, "Book Art production evidence names a different master byte length.");
  requireEqual(evidence.mimeType, master.mediaType, "Book Art production evidence names a different master media type.");
}

function parseIdentity(value: unknown): BookArtIdentityV1 {
  const input = requireRecord(value, "Book Art identity");
  rejectUnknownKeys(input, new Set(["workspaceId", "projectId", "bookId", "editionId", "requestId"]), "Book Art identity");
  return {
    workspaceId: requireSafeId(input.workspaceId, "identity.workspaceId"),
    projectId: requireSafeId(input.projectId, "identity.projectId"),
    bookId: requireSafeId(input.bookId, "identity.bookId"),
    ...(input.editionId === undefined ? {} : { editionId: requireSafeId(input.editionId, "identity.editionId") }),
    requestId: requireSafeId(input.requestId, "identity.requestId"),
  };
}

function parseProvenance(value: unknown): BookArtProvenanceV1 {
  const input = requireRecord(value, "Book Art provenance");
  rejectUnknownKeys(input, new Set([
    "origin", "provider", "model", "modelVersion", "promptSha256", "seed",
    "sourceArtifactIds", "rightsEvidenceIds", "rightsStatus", "aiDisclosure",
  ]), "Book Art provenance");
  const origin = text(input.origin);
  const rightsStatus = text(input.rightsStatus);
  const aiDisclosure = text(input.aiDisclosure);
  if (!PROVENANCE_ORIGINS.has(origin)) fail("invalid_provenance_origin", "Book Art provenance origin is invalid.");
  if (!RIGHTS_STATUSES.has(rightsStatus)) fail("invalid_rights_status", "Book Art rights status is invalid.");
  if (!AI_DISCLOSURES.has(aiDisclosure)) fail("invalid_ai_disclosure", "Book Art AI disclosure is invalid.");
  return {
    origin: origin as BookArtProvenanceV1["origin"],
    ...(input.provider === undefined ? {} : { provider: requireStrictText(input.provider, "provenance.provider", 300) }),
    ...(input.model === undefined ? {} : { model: requireStrictText(input.model, "provenance.model", 300) }),
    ...(input.modelVersion === undefined ? {} : { modelVersion: requireStrictText(input.modelVersion, "provenance.modelVersion", 300) }),
    ...(input.promptSha256 === undefined ? {} : { promptSha256: requireSha(input.promptSha256, "provenance.promptSha256") }),
    ...(input.seed === undefined ? {} : { seed: requireStrictText(input.seed, "provenance.seed", 300) }),
    sourceArtifactIds: parseStringArray(input.sourceArtifactIds, "provenance.sourceArtifactIds", 512, 500),
    rightsEvidenceIds: parseNonEmptyStringArray(input.rightsEvidenceIds, "provenance.rightsEvidenceIds", 256, 1_000),
    rightsStatus: rightsStatus as BookArtProvenanceV1["rightsStatus"],
    aiDisclosure: aiDisclosure as BookArtProvenanceV1["aiDisclosure"],
  };
}

function compileArtifactReference(promotion: CandidatePromotionResultSnapshotV1): string {
  const reference = promotion.reference;
  return `art-studio://${encodeURIComponent(reference.namespace)}/${encodeURIComponent(reference.name)}/${reference.generation}/${reference.artifactId}`;
}

function requireArtifactRole(artifact: BookArtArtifactSnapshotV1, expected: string): void {
  requireLabel(artifact, "artifactRole", expected);
}
function requireLabel(artifact: BookArtArtifactSnapshotV1, key: string, expected: string): void {
  requireEqual(artifact.labels[key], expected, `Artifact ${artifact.artifactId} label ${key} is invalid.`);
}
function requireSource(artifact: BookArtArtifactSnapshotV1, sourceId: string, message: string): void {
  if (!artifact.sourceArtifacts.includes(sourceId)) fail("missing_artifact_lineage", message);
}
function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_object", `${label} must be an object.`);
  return value as Record<string, unknown>;
}
function rejectUnknownKeys(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) fail("unknown_fields", `${label} contains unsupported fields: ${unknown.sort().join(", ")}.`);
}
function requireSafeId(value: unknown, label: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value) || ["__proto__", "constructor", "prototype"].includes(value)) fail("invalid_identity", `${label} is invalid.`);
  return value;
}
function requireArtifactId(value: unknown, label: string): string {
  if (typeof value !== "string" || !ARTIFACT_ID.test(value)) fail("invalid_artifact_id", `${label} is invalid.`);
  return value;
}
function requireSha(value: unknown, label: string): string {
  const normalized = normalizeSha(value);
  if (!normalized) fail("invalid_sha256", `${label} must be an exact SHA-256.`);
  return normalized;
}
function normalizeSha(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/^sha256:/, "");
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : undefined;
}
function requireStrictText(value: unknown, label: string, maximum: number): string {
  if (!strictText(value, maximum)) fail("invalid_text", `${label} is invalid.`);
  return value as string;
}
function strictText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value === value.trim() && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
}
function requirePositiveInteger(value: unknown, label: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) fail("invalid_integer", `${label} must be a positive safe integer.`);
  return Number(value);
}
function requireBoolean(value: unknown, label: string): boolean {
  if (value !== true && value !== false) fail("invalid_boolean", `${label} must be boolean.`);
  return value;
}
function requireImageMimeType(value: unknown): string {
  const result = text(value);
  if (!IMAGE_MIME_TYPES.has(result)) fail("invalid_image_media_type", "Book Art evidence media type is unsupported.");
  return result;
}
function parseStringArray(value: unknown, label: string, maximumItems: number, maximumLength: number): string[] {
  if (!Array.isArray(value) || value.length > maximumItems || value.some((item) => !strictText(item, maximumLength))) fail("invalid_string_array", `${label} is invalid.`);
  return [...value] as string[];
}
function parseNonEmptyStringArray(value: unknown, label: string, maximumItems: number, maximumLength: number): string[] {
  const result = parseStringArray(value, label, maximumItems, maximumLength);
  if (!result.length) fail("empty_string_array", `${label} must not be empty.`);
  return result;
}
function requireEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) fail("identity_mismatch", message);
}
function requireBooleanLabel(value: unknown): boolean {
  if (value === true || value === false) return value;
  fail("invalid_boolean", "Boolean value is invalid.");
}
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value));
}
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const value of values) seen.has(value) ? duplicated.add(value) : seen.add(value);
  return [...duplicated].sort();
}
function canonicalJson(value: unknown): string { return JSON.stringify(canonical(value)); }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}
async function sha256Text(value: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(value));
}
async function sha256Bytes(value: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function fail(code: string, message: string): never {
  throw new BookArtPromotionAdapterError(code, message);
}
