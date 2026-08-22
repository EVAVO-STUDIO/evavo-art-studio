import {
  compileDocsBookArtReleaseEnvelope,
  validateBookArtArtifactReceipt,
  type ArtStudioBookPromotionBatchV1,
  type BookArtArtifactReceiptV1,
  type BookArtIdentityV1,
  type BookArtPurpose,
  type DocsBookArtReleaseEnvelopeV1,
} from "@evavo/art-contracts";
import { normalizeJson, sha256, stableStringify } from "@evavo/art-artifacts";

export const DOCS_BOOK_ART_PRODUCTION_RETURN_SCHEMA_VERSION = 1 as const;
export const DOCS_BOOK_ART_PRODUCTION_RETURN_CONTRACT =
  "evavo_art_studio_docs_book_production_return_v1" as const;

export interface DocsBookArtSelectionEvidenceV1 {
  candidateSetId: string;
  selectedCandidateId: string;
  recommendedCandidateId: string;
  selectedCandidateArtifactId: string;
  candidateSetPlanFingerprintSha256: string;
  executionEvidenceFingerprintSha256: string;
  consensusFingerprintSha256: string;
  selectionReceiptSha256: string;
  promotionReceiptSha256: string;
  finalDocsReviewEvidenceId: string;
  finalDocsReviewerId: string;
  candidateProducerId: string;
  selectionAuthorityId: string;
  productionPromotionId: string;
}

export interface DocsBookArtTechnicalReturnEvidenceV1 {
  artifactId: string;
  contentSha256: string;
  technicalQualityReceiptSha256: string;
  widthPx: number;
  heightPx: number;
  mimeType: string;
  effectivePpi?: number;
  generatedTextDetected: false;
  embeddedLogoDetected: false;
  alphaPolicySatisfied: true;
  exactOutputGeometryVerified: true;
  immutableMasterVerified: true;
  inspectedAt: string;
  inspectedBy: string;
  evidenceId: string;
}

export interface DocsBookArtReturnControlV1 {
  returnId: string;
  returnedAt: string;
  returnedBy: string;
  independentAttestorId: string;
  attestationEvidenceIds: string[];
}

export interface DocsBookArtProductionReturnInputV1 {
  outputKind: "evavo_art_studio_docs_book_production_return_input";
  schemaVersion: typeof DOCS_BOOK_ART_PRODUCTION_RETURN_SCHEMA_VERSION;
  contract: typeof DOCS_BOOK_ART_PRODUCTION_RETURN_CONTRACT;
  release: unknown;
  promotionBatch: unknown;
  migrationItemId: string;
  purpose: BookArtPurpose;
  selection: DocsBookArtSelectionEvidenceV1;
  technicalEvidence: DocsBookArtTechnicalReturnEvidenceV1;
  returnControl: DocsBookArtReturnControlV1;
  typographyOwnedByDocsSuite: true;
  artworkUseBindingPerformed: false;
  authoritativeDocsWritesPerformed: false;
  publicationPerformed: false;
}

export interface DocsBookArtProductionReturnResultV1 {
  outputKind: "evavo_art_studio_docs_book_production_return_result";
  schemaVersion: typeof DOCS_BOOK_ART_PRODUCTION_RETURN_SCHEMA_VERSION;
  contract: typeof DOCS_BOOK_ART_PRODUCTION_RETURN_CONTRACT;
  status: "blocked" | "ready_for_docs_book_use_binding";
  identity: BookArtIdentityV1;
  purpose: BookArtPurpose;
  releaseFingerprint: string;
  finalArtBriefFingerprint: string;
  promotionBatchFingerprint: string;
  migrationItemId: string;
  selection: DocsBookArtSelectionEvidenceV1;
  technicalEvidence: DocsBookArtTechnicalReturnEvidenceV1;
  selectedArtifact?: BookArtArtifactReceiptV1;
  returnControl: DocsBookArtReturnControlV1;
  blockerIds: string[];
  warningIds: string[];
  exactDocsReleaseVerified: boolean;
  exactFinalArtBriefVerified: boolean;
  promotionBatchVerified: boolean;
  selectedArtifactVerified: boolean;
  selectionEvidenceVerified: boolean;
  technicalEvidenceVerified: boolean;
  reviewerSeparationVerified: boolean;
  rightsAndProvenanceVerified: boolean;
  textFreeArtworkVerified: boolean;
  readyForDocsBookUseBinding: boolean;
  artStudioSelectionPerformed: boolean;
  artStudioPromotionPerformed: boolean;
  typographyOwnedByDocsSuite: true;
  typographyApplied: false;
  artworkUseBindingCreated: false;
  fullWrapComposed: false;
  barcodeApplied: false;
  authoritativeDocsWritesPerformed: false;
  retailerUploadPerformed: false;
  publicationPerformed: false;
  returnFingerprint: string;
}

const INPUT_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "release",
  "promotionBatch",
  "migrationItemId",
  "purpose",
  "selection",
  "technicalEvidence",
  "returnControl",
  "typographyOwnedByDocsSuite",
  "artworkUseBindingPerformed",
  "authoritativeDocsWritesPerformed",
  "publicationPerformed",
]);
const SELECTION_FIELDS = new Set([
  "candidateSetId",
  "selectedCandidateId",
  "recommendedCandidateId",
  "selectedCandidateArtifactId",
  "candidateSetPlanFingerprintSha256",
  "executionEvidenceFingerprintSha256",
  "consensusFingerprintSha256",
  "selectionReceiptSha256",
  "promotionReceiptSha256",
  "finalDocsReviewEvidenceId",
  "finalDocsReviewerId",
  "candidateProducerId",
  "selectionAuthorityId",
  "productionPromotionId",
]);
const TECHNICAL_FIELDS = new Set([
  "artifactId",
  "contentSha256",
  "technicalQualityReceiptSha256",
  "widthPx",
  "heightPx",
  "mimeType",
  "effectivePpi",
  "generatedTextDetected",
  "embeddedLogoDetected",
  "alphaPolicySatisfied",
  "exactOutputGeometryVerified",
  "immutableMasterVerified",
  "inspectedAt",
  "inspectedBy",
  "evidenceId",
]);
const CONTROL_FIELDS = new Set([
  "returnId",
  "returnedAt",
  "returnedBy",
  "independentAttestorId",
  "attestationEvidenceIds",
]);
const PROMOTION_BATCH_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "batchId",
  "sourceArtImportBatchFingerprint",
  "expectedMigrationItemIds",
  "items",
  "batchFingerprint",
  "authoritativeWritesPerformed",
  "artifactBytesRewritten",
  "publicationPerformed",
]);
const PROMOTION_ITEM_FIELDS = new Set(["migrationItemId", "artifact"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,299}$/;
const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const PURPOSES = new Set<BookArtPurpose>([
  "front_cover_art",
  "full_wrap_art",
  "interior_full_page_illustration",
  "interior_half_page_illustration",
  "interior_spot_illustration",
  "diagram",
  "map",
  "ornament",
]);

export async function compileDocsBookArtProductionReturn(
  value: unknown,
): Promise<DocsBookArtProductionReturnResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const input = object(value, "productionReturnInput", blockers);
  rejectUnknown(input, INPUT_FIELDS, "productionReturnInput", blockers);
  if (
    input.outputKind !== "evavo_art_studio_docs_book_production_return_input" ||
    input.schemaVersion !== DOCS_BOOK_ART_PRODUCTION_RETURN_SCHEMA_VERSION ||
    input.contract !== DOCS_BOOK_ART_PRODUCTION_RETURN_CONTRACT
  ) {
    blockers.push("productionReturnInput:identity_or_version_invalid");
  }
  if (
    input.typographyOwnedByDocsSuite !== true ||
    input.artworkUseBindingPerformed !== false ||
    input.authoritativeDocsWritesPerformed !== false ||
    input.publicationPerformed !== false
  ) {
    blockers.push("productionReturnInput:authority_flags_invalid");
  }

  const releaseCompilation = await compileDocsBookArtReleaseEnvelope(input.release);
  blockers.push(
    ...releaseCompilation.blockers.map((entry) => `release:${entry}`),
  );
  warnings.push(
    ...releaseCompilation.warnings.map((entry) => `release:${entry}`),
  );
  const release = input.release as DocsBookArtReleaseEnvelopeV1;
  const finalBrief = release?.finalArtBrief;
  const identity = finalBrief?.identity ?? emptyIdentity();
  const purpose = parsePurpose(input.purpose, blockers);
  if (releaseCompilation.status !== "ready") {
    blockers.push("release:exact_verified_release_required");
  }
  if (finalBrief && purpose !== finalBrief.purpose) {
    blockers.push("purpose:does_not_match_final_art_brief");
  }

  const migrationItemId = safeId(
    input.migrationItemId,
    "migrationItemId",
    blockers,
  );
  const selection = parseSelection(input.selection, blockers);
  const technicalEvidence = parseTechnicalEvidence(
    input.technicalEvidence,
    blockers,
  );
  const returnControl = parseReturnControl(input.returnControl, blockers);

  const batch = await parseAndVerifyPromotionBatch(input.promotionBatch, blockers);
  const matchingItems = batch.items.filter(
    (item) => item.migrationItemId === migrationItemId,
  );
  if (matchingItems.length !== 1) {
    blockers.push("promotionBatch:exact_migration_item_required");
  }
  const selectedArtifact = matchingItems[0]?.artifact;
  let selectedArtifactVerified = false;
  let rightsAndProvenanceVerified = false;
  let textFreeArtworkVerified = false;
  if (selectedArtifact) {
    const validation = validateBookArtArtifactReceipt(selectedArtifact);
    blockers.push(
      ...validation.issues.map((entry) => `selectedArtifact:${entry}`),
    );
    const { artifactFingerprint: _artifactFingerprint, ...unsignedArtifact } =
      selectedArtifact;
    void _artifactFingerprint;
    if (selectedArtifact.artifactFingerprint !== fingerprint(unsignedArtifact)) {
      blockers.push("selectedArtifact:artifact_fingerprint_mismatch");
    }
    verifyArtifactAgainstRelease(
      selectedArtifact,
      finalBrief,
      selection,
      technicalEvidence,
      blockers,
    );
    selectedArtifactVerified =
      validation.valid &&
      !blockers.some((entry) => entry.startsWith("selectedArtifact:"));
    rightsAndProvenanceVerified =
      selectedArtifact.status === "approved" &&
      selectedArtifact.provenance.rightsStatus === "approved_commercial" &&
      selectedArtifact.provenance.rightsEvidenceIds.length > 0 &&
      selectedArtifact.unresolvedRisks.length === 0;
    textFreeArtworkVerified =
      selectedArtifact.generatedTextDetected === false &&
      technicalEvidence.generatedTextDetected === false &&
      technicalEvidence.embeddedLogoDetected === false &&
      finalBrief?.output.textPolicy === "text_free";
  }
  if (!rightsAndProvenanceVerified) {
    blockers.push("selectedArtifact:rights_and_provenance_not_approved");
  }
  if (!textFreeArtworkVerified) {
    blockers.push("selectedArtifact:text_free_artwork_not_verified");
  }

  const selectionEvidenceVerified = verifySelectionEvidence(
    selectedArtifact,
    selection,
    blockers,
  );
  const technicalEvidenceVerified = verifyTechnicalEvidence(
    selectedArtifact,
    finalBrief,
    technicalEvidence,
    blockers,
  );
  const reviewerSeparationVerified = verifyReviewerSeparation(
    selectedArtifact,
    selection,
    technicalEvidence,
    returnControl,
    blockers,
  );

  if (
    finalBrief &&
    isTimestamp(returnControl.returnedAt) &&
    Date.parse(returnControl.returnedAt) < Date.parse(finalBrief.createdAt)
  ) {
    blockers.push("returnControl.returnedAt:precedes_final_art_brief");
  }
  if (
    selectedArtifact?.promotedAt &&
    isTimestamp(returnControl.returnedAt) &&
    Date.parse(returnControl.returnedAt) < Date.parse(selectedArtifact.promotedAt)
  ) {
    blockers.push("returnControl.returnedAt:precedes_art_promotion");
  }

  const exactDocsReleaseVerified =
    releaseCompilation.status === "ready" &&
    releaseCompilation.releaseVerified === true;
  const exactFinalArtBriefVerified =
    exactDocsReleaseVerified &&
    releaseCompilation.exactFinalArtBriefVerified === true;
  const promotionBatchVerified =
    !blockers.some((entry) => entry.startsWith("promotionBatch:"));
  const status = blockers.length
    ? ("blocked" as const)
    : ("ready_for_docs_book_use_binding" as const);
  const readyForDocsBookUseBinding =
    status === "ready_for_docs_book_use_binding" &&
    exactDocsReleaseVerified &&
    exactFinalArtBriefVerified &&
    promotionBatchVerified &&
    selectedArtifactVerified &&
    selectionEvidenceVerified &&
    technicalEvidenceVerified &&
    reviewerSeparationVerified &&
    rightsAndProvenanceVerified &&
    textFreeArtworkVerified;

  const body = {
    outputKind: "evavo_art_studio_docs_book_production_return_result" as const,
    schemaVersion: DOCS_BOOK_ART_PRODUCTION_RETURN_SCHEMA_VERSION,
    contract: DOCS_BOOK_ART_PRODUCTION_RETURN_CONTRACT,
    status,
    identity,
    purpose,
    releaseFingerprint:
      release?.releaseReceipt?.releaseFingerprint ?? emptyDigest(),
    finalArtBriefFingerprint: finalBrief?.briefFingerprint ?? emptyDigest(),
    promotionBatchFingerprint: batch.batchFingerprint,
    migrationItemId,
    selection,
    technicalEvidence,
    ...(selectedArtifact === undefined ? {} : { selectedArtifact }),
    returnControl,
    blockerIds: unique(blockers).sort(),
    warningIds: unique(warnings).sort(),
    exactDocsReleaseVerified,
    exactFinalArtBriefVerified,
    promotionBatchVerified,
    selectedArtifactVerified,
    selectionEvidenceVerified,
    technicalEvidenceVerified,
    reviewerSeparationVerified,
    rightsAndProvenanceVerified,
    textFreeArtworkVerified,
    readyForDocsBookUseBinding,
    artStudioSelectionPerformed: readyForDocsBookUseBinding,
    artStudioPromotionPerformed: readyForDocsBookUseBinding,
    typographyOwnedByDocsSuite: true as const,
    typographyApplied: false as const,
    artworkUseBindingCreated: false as const,
    fullWrapComposed: false as const,
    barcodeApplied: false as const,
    authoritativeDocsWritesPerformed: false as const,
    retailerUploadPerformed: false as const,
    publicationPerformed: false as const,
  };
  return {
    ...body,
    returnFingerprint: fingerprint(body),
  };
}

async function parseAndVerifyPromotionBatch(
  value: unknown,
  blockers: string[],
): Promise<ArtStudioBookPromotionBatchV1> {
  const source = object(value, "promotionBatch", blockers);
  rejectUnknown(source, PROMOTION_BATCH_FIELDS, "promotionBatch", blockers);
  if (
    source.outputKind !== "evavo_art_studio_book_promotion_batch" ||
    source.schemaVersion !== 1
  ) {
    blockers.push("promotionBatch:identity_or_version_invalid");
  }
  if (
    source.authoritativeWritesPerformed !== false ||
    source.artifactBytesRewritten !== false ||
    source.publicationPerformed !== false
  ) {
    blockers.push("promotionBatch:authority_flags_invalid");
  }
  const expectedMigrationItemIds = stringArray(
    source.expectedMigrationItemIds,
    "promotionBatch.expectedMigrationItemIds",
    blockers,
    1,
    10_000,
  ).sort();
  const rawItems = Array.isArray(source.items) ? source.items : [];
  if (!Array.isArray(source.items) || rawItems.length > 10_000) {
    blockers.push("promotionBatch.items:invalid_or_unbounded");
  }
  const items: ArtStudioBookPromotionBatchV1["items"] = [];
  for (let index = 0; index < rawItems.length; index += 1) {
    const item = object(rawItems[index], `promotionBatch.items[${index}]`, blockers);
    rejectUnknown(
      item,
      PROMOTION_ITEM_FIELDS,
      `promotionBatch.items[${index}]`,
      blockers,
    );
    items.push({
      migrationItemId: safeId(
        item.migrationItemId,
        `promotionBatch.items[${index}].migrationItemId`,
        blockers,
      ),
      artifact: item.artifact as BookArtArtifactReceiptV1,
    });
  }
  const itemIds = items.map((item) => item.migrationItemId).sort();
  if (canonical(itemIds) !== canonical(expectedMigrationItemIds)) {
    blockers.push("promotionBatch.items:does_not_match_expected_set");
  }
  if (new Set(itemIds).size !== itemIds.length) {
    blockers.push("promotionBatch.items:duplicate_migration_items");
  }
  const batchFingerprint = digest(
    source.batchFingerprint,
    "promotionBatch.batchFingerprint",
    blockers,
  );
  const unsigned = {
    outputKind: "evavo_art_studio_book_promotion_batch" as const,
    schemaVersion: 1 as const,
    batchId: safeId(source.batchId, "promotionBatch.batchId", blockers),
    sourceArtImportBatchFingerprint: digest(
      source.sourceArtImportBatchFingerprint,
      "promotionBatch.sourceArtImportBatchFingerprint",
      blockers,
    ),
    expectedMigrationItemIds,
    items: [...items].sort((left, right) =>
      left.migrationItemId.localeCompare(right.migrationItemId),
    ),
    authoritativeWritesPerformed: false as const,
    artifactBytesRewritten: false as const,
    publicationPerformed: false as const,
  };
  if (batchFingerprint !== fingerprint(unsigned)) {
    blockers.push("promotionBatch:batch_fingerprint_mismatch");
  }
  return { ...unsigned, batchFingerprint };
}

function verifyArtifactAgainstRelease(
  artifact: BookArtArtifactReceiptV1,
  brief: DocsBookArtReleaseEnvelopeV1["finalArtBrief"] | undefined,
  selection: DocsBookArtSelectionEvidenceV1,
  technical: DocsBookArtTechnicalReturnEvidenceV1,
  blockers: string[],
): void {
  if (!brief) {
    blockers.push("selectedArtifact:final_art_brief_missing");
    return;
  }
  for (const key of ["workspaceId", "projectId", "bookId", "requestId"] as const) {
    if (artifact.identity[key] !== brief.identity[key]) {
      blockers.push(`selectedArtifact:identity_${key}_mismatch`);
    }
  }
  if (artifact.identity.editionId !== brief.identity.editionId) {
    blockers.push("selectedArtifact:identity_editionId_mismatch");
  }
  if (
    normalizeDigestValue(artifact.sourceBriefFingerprint) !==
    normalizeDigestValue(brief.briefFingerprint)
  ) {
    blockers.push("selectedArtifact:source_brief_fingerprint_mismatch");
  }
  if (artifact.artifactId !== technical.artifactId) {
    blockers.push("selectedArtifact:technical_artifact_id_mismatch");
  }
  if (artifact.contentSha256 !== technical.contentSha256) {
    blockers.push("selectedArtifact:technical_content_hash_mismatch");
  }
  if (artifact.selectionReceiptSha256 !== selection.selectionReceiptSha256) {
    blockers.push("selectedArtifact:selection_receipt_mismatch");
  }
  if (artifact.promotionReceiptSha256 !== selection.promotionReceiptSha256) {
    blockers.push("selectedArtifact:promotion_receipt_mismatch");
  }
}

function verifySelectionEvidence(
  artifact: BookArtArtifactReceiptV1 | undefined,
  selection: DocsBookArtSelectionEvidenceV1,
  blockers: string[],
): boolean {
  if (!artifact) return false;
  if (selection.selectedCandidateId !== selection.recommendedCandidateId) {
    blockers.push("selection:selected_candidate_not_consensus_recommendation");
  }
  if (selection.selectedCandidateArtifactId === artifact.artifactId) {
    blockers.push("selection:selected_candidate_must_precede_promoted_master");
  }
  if (
    !artifact.provenance.sourceArtifactIds.includes(
      selection.selectedCandidateArtifactId,
    )
  ) {
    blockers.push("selection:selected_candidate_artifact_not_in_lineage");
  }
  if (
    artifact.selectionReceiptSha256 !== selection.selectionReceiptSha256 ||
    artifact.promotionReceiptSha256 !== selection.promotionReceiptSha256
  ) {
    blockers.push("selection:receipt_chain_mismatch");
  }
  return !blockers.some((entry) => entry.startsWith("selection:"));
}

function verifyTechnicalEvidence(
  artifact: BookArtArtifactReceiptV1 | undefined,
  brief: DocsBookArtReleaseEnvelopeV1["finalArtBrief"] | undefined,
  evidence: DocsBookArtTechnicalReturnEvidenceV1,
  blockers: string[],
): boolean {
  if (!artifact || !brief) return false;
  if (
    evidence.artifactId !== artifact.artifactId ||
    evidence.contentSha256 !== artifact.contentSha256 ||
    evidence.technicalQualityReceiptSha256 !==
      artifact.technicalQualityReceiptSha256 ||
    evidence.widthPx !== artifact.widthPx ||
    evidence.heightPx !== artifact.heightPx ||
    evidence.mimeType !== artifact.mimeType
  ) {
    blockers.push("technicalEvidence:artifact_receipt_mismatch");
  }
  if (
    evidence.widthPx !== brief.output.widthPx ||
    evidence.heightPx !== brief.output.heightPx ||
    !brief.output.allowedMimeTypes.includes(
      evidence.mimeType as (typeof brief.output.allowedMimeTypes)[number],
    )
  ) {
    blockers.push("technicalEvidence:final_art_brief_output_mismatch");
  }
  if (
    brief.output.minimumPpi !== undefined &&
    (evidence.effectivePpi === undefined ||
      evidence.effectivePpi < brief.output.minimumPpi)
  ) {
    blockers.push("technicalEvidence:effective_ppi_below_brief_minimum");
  }
  if (
    evidence.generatedTextDetected !== false ||
    evidence.embeddedLogoDetected !== false ||
    evidence.alphaPolicySatisfied !== true ||
    evidence.exactOutputGeometryVerified !== true ||
    evidence.immutableMasterVerified !== true
  ) {
    blockers.push("technicalEvidence:required_checks_failed");
  }
  return !blockers.some((entry) => entry.startsWith("technicalEvidence:"));
}

function verifyReviewerSeparation(
  artifact: BookArtArtifactReceiptV1 | undefined,
  selection: DocsBookArtSelectionEvidenceV1,
  technical: DocsBookArtTechnicalReturnEvidenceV1,
  control: DocsBookArtReturnControlV1,
  blockers: string[],
): boolean {
  const actors = [
    selection.candidateProducerId,
    selection.finalDocsReviewerId,
    selection.selectionAuthorityId,
    artifact?.promotedBy ?? "missing-promoter",
    technical.inspectedBy,
    control.returnedBy,
    control.independentAttestorId,
  ];
  if (new Set(actors).size !== actors.length) {
    blockers.push("reviewerSeparation:distinct_roles_required");
  }
  if (!control.attestationEvidenceIds.includes(selection.finalDocsReviewEvidenceId)) {
    blockers.push("reviewerSeparation:final_docs_review_evidence_not_attested");
  }
  if (!control.attestationEvidenceIds.includes(technical.evidenceId)) {
    blockers.push("reviewerSeparation:technical_evidence_not_attested");
  }
  return !blockers.some((entry) => entry.startsWith("reviewerSeparation:"));
}

function parseSelection(
  value: unknown,
  blockers: string[],
): DocsBookArtSelectionEvidenceV1 {
  const source = object(value, "selection", blockers);
  rejectUnknown(source, SELECTION_FIELDS, "selection", blockers);
  return {
    candidateSetId: safeId(source.candidateSetId, "selection.candidateSetId", blockers),
    selectedCandidateId: safeId(source.selectedCandidateId, "selection.selectedCandidateId", blockers),
    recommendedCandidateId: safeId(source.recommendedCandidateId, "selection.recommendedCandidateId", blockers),
    selectedCandidateArtifactId: safeId(source.selectedCandidateArtifactId, "selection.selectedCandidateArtifactId", blockers),
    candidateSetPlanFingerprintSha256: digest(source.candidateSetPlanFingerprintSha256, "selection.candidateSetPlanFingerprintSha256", blockers),
    executionEvidenceFingerprintSha256: digest(source.executionEvidenceFingerprintSha256, "selection.executionEvidenceFingerprintSha256", blockers),
    consensusFingerprintSha256: digest(source.consensusFingerprintSha256, "selection.consensusFingerprintSha256", blockers),
    selectionReceiptSha256: digest(source.selectionReceiptSha256, "selection.selectionReceiptSha256", blockers),
    promotionReceiptSha256: digest(source.promotionReceiptSha256, "selection.promotionReceiptSha256", blockers),
    finalDocsReviewEvidenceId: safeId(source.finalDocsReviewEvidenceId, "selection.finalDocsReviewEvidenceId", blockers),
    finalDocsReviewerId: safeId(source.finalDocsReviewerId, "selection.finalDocsReviewerId", blockers),
    candidateProducerId: safeId(source.candidateProducerId, "selection.candidateProducerId", blockers),
    selectionAuthorityId: safeId(source.selectionAuthorityId, "selection.selectionAuthorityId", blockers),
    productionPromotionId: safeId(source.productionPromotionId, "selection.productionPromotionId", blockers),
  };
}

function parseTechnicalEvidence(
  value: unknown,
  blockers: string[],
): DocsBookArtTechnicalReturnEvidenceV1 {
  const source = object(value, "technicalEvidence", blockers);
  rejectUnknown(source, TECHNICAL_FIELDS, "technicalEvidence", blockers);
  return {
    artifactId: safeId(source.artifactId, "technicalEvidence.artifactId", blockers),
    contentSha256: digest(source.contentSha256, "technicalEvidence.contentSha256", blockers),
    technicalQualityReceiptSha256: digest(source.technicalQualityReceiptSha256, "technicalEvidence.technicalQualityReceiptSha256", blockers),
    widthPx: integer(source.widthPx, "technicalEvidence.widthPx", blockers, 1, 100_000),
    heightPx: integer(source.heightPx, "technicalEvidence.heightPx", blockers, 1, 100_000),
    mimeType: text(source.mimeType, "technicalEvidence.mimeType", blockers, 200),
    ...(source.effectivePpi === undefined
      ? {}
      : { effectivePpi: finite(source.effectivePpi, "technicalEvidence.effectivePpi", blockers, 1, 10_000) }),
    generatedTextDetected: source.generatedTextDetected === false ? false : (blockers.push("technicalEvidence.generatedTextDetected:must_be_false"), false),
    embeddedLogoDetected: source.embeddedLogoDetected === false ? false : (blockers.push("technicalEvidence.embeddedLogoDetected:must_be_false"), false),
    alphaPolicySatisfied: source.alphaPolicySatisfied === true ? true : (blockers.push("technicalEvidence.alphaPolicySatisfied:must_be_true"), true),
    exactOutputGeometryVerified: source.exactOutputGeometryVerified === true ? true : (blockers.push("technicalEvidence.exactOutputGeometryVerified:must_be_true"), true),
    immutableMasterVerified: source.immutableMasterVerified === true ? true : (blockers.push("technicalEvidence.immutableMasterVerified:must_be_true"), true),
    inspectedAt: timestamp(source.inspectedAt, "technicalEvidence.inspectedAt", blockers),
    inspectedBy: safeId(source.inspectedBy, "technicalEvidence.inspectedBy", blockers),
    evidenceId: safeId(source.evidenceId, "technicalEvidence.evidenceId", blockers),
  };
}

function parseReturnControl(
  value: unknown,
  blockers: string[],
): DocsBookArtReturnControlV1 {
  const source = object(value, "returnControl", blockers);
  rejectUnknown(source, CONTROL_FIELDS, "returnControl", blockers);
  const attestationEvidenceIds = stringArray(
    source.attestationEvidenceIds,
    "returnControl.attestationEvidenceIds",
    blockers,
    1,
    256,
  ).sort();
  return {
    returnId: safeId(source.returnId, "returnControl.returnId", blockers),
    returnedAt: timestamp(source.returnedAt, "returnControl.returnedAt", blockers),
    returnedBy: safeId(source.returnedBy, "returnControl.returnedBy", blockers),
    independentAttestorId: safeId(source.independentAttestorId, "returnControl.independentAttestorId", blockers),
    attestationEvidenceIds,
  };
}

function object(value: unknown, label: string, blockers: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    blockers.push(`${label}:not_object`);
    return {};
  }
  return value as Record<string, unknown>;
}
function rejectUnknown(value: Record<string, unknown>, allowed: ReadonlySet<string>, label: string, blockers: string[]): void {
  for (const key of Object.keys(value).filter((entry) => !allowed.has(entry)).sort()) blockers.push(`${label}:unknown_field:${key}`);
}
function safeId(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !SAFE_ID.test(value) || ["__proto__", "constructor", "prototype"].includes(value)) {
    blockers.push(`${label}:invalid`);
    return "invalid-id";
  }
  return value;
}
function normalizeDigestValue(value: string): string {
  return value.replace(/^sha256:/, "");
}
function digest(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    blockers.push(`${label}:invalid_sha256`);
    return emptyDigest();
  }
  return value.replace(/^sha256:/, "");
}
function timestamp(value: unknown, label: string, blockers: string[]): string {
  if (!isTimestamp(value)) {
    blockers.push(`${label}:invalid_timestamp`);
    return "1970-01-01T00:00:00.000Z";
  }
  return value;
}
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
}
function text(value: unknown, label: string, blockers: string[], maximum: number): string {
  if (typeof value !== "string" || value !== value.trim() || value.length < 1 || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    blockers.push(`${label}:invalid`);
    return "invalid";
  }
  return value;
}
function integer(value: unknown, label: string, blockers: string[], minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    blockers.push(`${label}:invalid_integer`);
    return minimum;
  }
  return Number(value);
}
function finite(value: unknown, label: string, blockers: string[], minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    blockers.push(`${label}:invalid_number`);
    return minimum;
  }
  return value;
}
function stringArray(value: unknown, label: string, blockers: string[], minimum: number, maximum: number): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    blockers.push(`${label}:invalid_or_unbounded`);
    return [];
  }
  const result = value.map((entry, index) => safeId(entry, `${label}[${index}]`, blockers));
  if (new Set(result).size !== result.length) blockers.push(`${label}:duplicates`);
  return result;
}
function parsePurpose(value: unknown, blockers: string[]): BookArtPurpose {
  if (typeof value !== "string" || !PURPOSES.has(value as BookArtPurpose)) {
    blockers.push("purpose:unsupported");
    return "front_cover_art";
  }
  return value as BookArtPurpose;
}
function fingerprint(value: unknown): string {
  return sha256(stableStringify(normalizeJson(value)));
}
function canonical(value: unknown): string {
  return stableStringify(normalizeJson(value));
}
function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
function emptyDigest(): string {
  return "0".repeat(64);
}
function emptyIdentity(): BookArtIdentityV1 {
  return { workspaceId: "invalid", projectId: "invalid", bookId: "invalid", requestId: "invalid" };
}
