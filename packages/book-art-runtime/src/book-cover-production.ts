export const BOOK_COVER_PRODUCTION_SCHEMA_VERSION = 1 as const;
export const BOOK_COVER_RENDER_PLAN_CONTRACT =
  "evavo_book_cover_render_plan_v1" as const;
export const BOOK_COVER_RELEASE_CONTRACT =
  "evavo_book_cover_release_v1" as const;

export type BookCoverFormat = "kindle_ebook" | "paperback" | "hardcover";
export type BookCoverArtworkProvenance =
  | "human_created"
  | "licensed_source"
  | "ai_assisted"
  | "ai_generated";
export type BookCoverBarcodePolicy =
  | "not_applicable"
  | "amazon_placed"
  | "publisher_supplied";
export type BookCoverColourSpace = "RGB" | "CMYK" | "GRAYSCALE";
export type BookCoverTypographyRole =
  | "title"
  | "subtitle"
  | "author"
  | "series"
  | "spine_title"
  | "spine_author"
  | "back_copy"
  | "imprint"
  | "isbn_text";

export interface BookCoverIdentityV1 {
  tenantId: string;
  workspaceId: string;
  projectId: string;
  bookId: string;
  manuscriptId: string;
  editionId: string;
  publicationId: string;
  requestId: string;
}

export interface BookCoverArtifactV1 {
  artifactId: string;
  objectId: string;
  sha256: string;
  mediaType: string;
  byteLength: number;
  immutable: true;
  widthPx?: number;
  heightPx?: number;
  ppi?: number;
  colourSpace?: BookCoverColourSpace;
  pageCount?: number;
}

export interface BookCoverMetadataV1 {
  title: string;
  subtitle?: string;
  authorName: string;
  seriesTitle?: string;
  imprint?: string;
  backCopy?: string;
}

export interface BookCoverArtDirectionV1 {
  creativeThesis: string;
  styleThesis: string;
  historicalMaterialReferences: string[];
  genericPatternsRejected: string[];
  imitationAvoidanceNotes: string;
  approvalEvidenceId: string;
}

export interface BookCoverSourceArtworkV1 {
  selectedCandidateId: string;
  selectionEvidenceId: string;
  artifact: BookCoverArtifactV1;
  textFree: true;
  provenanceMode: BookCoverArtworkProvenance;
  rightsEvidenceIds: string[];
  generationEvidenceIds: string[];
  originalityReviewEvidenceId: string;
}

export interface BookCoverTypographyLayerV1 {
  role: BookCoverTypographyRole;
  text: string;
  fontFamily: string;
  fontLicenseEvidenceId: string;
  fontSizePt: number;
  x: number;
  y: number;
  width: number;
  height: number;
  alignment: "left" | "center" | "right";
}

export interface BookCoverTypographyV1 {
  renderer: "deterministic_layout";
  modelRenderedText: false;
  metadataMatchEvidenceId: string;
  spellingReviewEvidenceId: string;
  layers: BookCoverTypographyLayerV1[];
}

export interface BookCoverBarcodePlanV1 {
  policy: BookCoverBarcodePolicy;
  reservedWidthInches: number;
  reservedHeightInches: number;
  distanceFromSpineInches: number;
  distanceFromTrimInches: number;
  reserveClear: boolean;
  whiteBackground: boolean;
  blackBars: boolean;
  rightSideUp: boolean;
  squareToCover: boolean;
  flattenedIntoArtwork: boolean;
  barcodeArtifact?: BookCoverArtifactV1;
}

export interface BookCoverPrintGeometryV1 {
  trimWidthInches: number;
  trimHeightInches: number;
  pageCount: number;
  bleedInches: number;
  spineWidthInches: number;
  spineTextEnabled: boolean;
  spineTextClearanceInches: number;
  templateArtifact: BookCoverArtifactV1;
  templateFingerprintSha256: string;
  templateObservedAt: string;
  hardcoverWrapInches?: number;
  hardcoverSafeTextFromEdgeInches?: number;
  hardcoverHingeInches?: number;
  barcode: BookCoverBarcodePlanV1;
}

export interface BookCoverRenderPlanInputV1 {
  outputKind: "evavo_book_cover_render_plan_input";
  schemaVersion: typeof BOOK_COVER_PRODUCTION_SCHEMA_VERSION;
  compiledAt: string;
  identity: BookCoverIdentityV1;
  format: BookCoverFormat;
  metadata: BookCoverMetadataV1;
  artDirection: BookCoverArtDirectionV1;
  sourceArtwork: BookCoverSourceArtworkV1;
  typography: BookCoverTypographyV1;
  printGeometry?: BookCoverPrintGeometryV1;
}

export interface BookCoverOutputRequirementsV1 {
  frontCover: {
    mediaTypes: readonly ["image/jpeg", "image/tiff"];
    minimumWidthPx: 625;
    minimumHeightPx: 1000;
    idealWidthPx: 1600;
    idealHeightPx: 2560;
    maximumWidthPx: 10000;
    maximumHeightPx: 10000;
    minimumHeightToWidthRatio: 1.6;
    maximumBytesExclusive: 52428800;
    preferredMinimumPpi: 300;
    requiredColourSpace: "RGB";
  };
  fullWrapCover?: {
    mediaType: "application/pdf";
    maximumBytes: 681574400;
    recommendedMaximumBytes: 41943040;
    minimumRasterPpi: 300;
    pageCount: 1;
    fontsEmbedded: true;
    transparenciesFlattened: true;
    cropMarksAbsent: true;
    templateMarksAbsent: true;
    unlocked: true;
  };
}

export interface BookCoverRenderPlanV1 {
  outputKind: "evavo_book_cover_render_plan";
  schemaVersion: typeof BOOK_COVER_PRODUCTION_SCHEMA_VERSION;
  contract: typeof BOOK_COVER_RENDER_PLAN_CONTRACT;
  compiledAt: string;
  identity: BookCoverIdentityV1;
  format: BookCoverFormat;
  source: BookCoverRenderPlanInputV1;
  outputRequirements: BookCoverOutputRequirementsV1;
  kdpAiImageDisclosureRequired: boolean;
  planFingerprintSha256: string;
  renderJobMayWriteOnlyCandidateArtifacts: true;
  renderingPerformed: false;
  bookStudioImportPerformed: false;
  publicationPerformed: false;
}

export interface BookCoverRenderPlanCompilationResultV1 {
  outputKind: "evavo_book_cover_render_plan_compilation_result";
  schemaVersion: typeof BOOK_COVER_PRODUCTION_SCHEMA_VERSION;
  status: "blocked" | "ready";
  plan?: BookCoverRenderPlanV1;
  blockers: string[];
  warnings: string[];
  renderingPerformed: false;
  bookStudioImportPerformed: false;
  publicationPerformed: false;
}

export interface BookCoverInspectionEvidenceV1 {
  metadataMatchEvidenceId: string;
  spellingEvidenceId: string;
  thumbnailEvidenceId: string;
  contrastEvidenceId: string;
  safeZoneEvidenceId: string;
  outputOpenEvidenceId: string;
  dimensionsEvidenceId: string;
  colourProfileEvidenceId: string;
  rightsEvidenceId: string;
  originalityEvidenceId: string;
  fontLicenceEvidenceId: string;
  fontEmbeddingEvidenceId?: string;
  transparencyFlatteningEvidenceId?: string;
  noCropMarksEvidenceId?: string;
  noTemplateMarksEvidenceId?: string;
  pdfUnlockedEvidenceId?: string;
  templateMatchEvidenceId?: string;
  barcodeEvidenceId?: string;
}

export interface BookCoverRenderExecutionV1 {
  rendererId: string;
  rendererVersion: string;
  renderedAt: string;
  renderReceiptId: string;
  renderPlanFingerprintSha256: string;
  frontCover: BookCoverArtifactV1;
  fullWrapCover?: BookCoverArtifactV1;
  editableSource: BookCoverArtifactV1;
  inspections: BookCoverInspectionEvidenceV1;
}

export interface BookCoverReleaseInputV1 {
  outputKind: "evavo_book_cover_release_input";
  schemaVersion: typeof BOOK_COVER_PRODUCTION_SCHEMA_VERSION;
  evaluatedAt: string;
  plan: unknown;
  execution: BookCoverRenderExecutionV1;
}

export interface BookStudioCoverEvidenceV1 {
  frontCover: BookCoverArtifactV1;
  fullWrapCover?: BookCoverArtifactV1;
  textLayout: {
    renderer: "deterministic_layout";
    modelRenderedText: false;
    title: string;
    subtitle?: string;
    authorName: string;
    seriesTitle?: string;
    layers: Array<{
      role: BookCoverTypographyRole;
      text: string;
      fontFamily: string;
      fontLicenseEvidenceId: string;
    }>;
  };
  artwork: {
    provenanceMode: BookCoverArtworkProvenance;
    rightsEvidenceIds: string[];
    artDirectionEvidenceId: string;
    originalityReviewEvidenceId: string;
    styleThesis: string;
    genericPatternsRejected: string[];
  };
  printGeometry?: {
    trimWidthInches: number;
    trimHeightInches: number;
    pageCount: number;
    bleedInches: number;
    spineWidthInches: number;
    barcodeReserved: boolean;
    coverTemplateFingerprint: string;
  };
  inspectionEvidenceIds: string[];
}

export interface BookCoverReleaseEvaluationV1 {
  outputKind: "evavo_book_cover_release_evaluation";
  schemaVersion: typeof BOOK_COVER_PRODUCTION_SCHEMA_VERSION;
  contract: typeof BOOK_COVER_RELEASE_CONTRACT;
  status: "blocked" | "ready_for_book_studio_import";
  evaluatedAt: string;
  plan?: BookCoverRenderPlanV1;
  bookStudioCoverEvidence?: BookStudioCoverEvidenceV1;
  blockers: string[];
  warnings: string[];
  kdpAiImageDisclosureRequired: boolean;
  renderPlanVerified: boolean;
  sourceSelectionVerified: boolean;
  creativeApprovalVerified: boolean;
  rightsVerified: boolean;
  deterministicTypographyVerified: boolean;
  renderingPerformed: boolean;
  bookStudioImportPerformed: false;
  publicationPerformed: false;
  releaseFingerprintSha256: string;
}

type UnknownRecord = Record<string, unknown>;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,299}$/;
const OBJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/ -]{0,499}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const FORMAT_VALUES = new Set<BookCoverFormat>([
  "kindle_ebook",
  "paperback",
  "hardcover",
]);
const PROVENANCE_VALUES = new Set<BookCoverArtworkProvenance>([
  "human_created",
  "licensed_source",
  "ai_assisted",
  "ai_generated",
]);
const BARCODE_VALUES = new Set<BookCoverBarcodePolicy>([
  "not_applicable",
  "amazon_placed",
  "publisher_supplied",
]);
const COLOUR_VALUES = new Set<BookCoverColourSpace>([
  "RGB",
  "CMYK",
  "GRAYSCALE",
]);
const ROLE_VALUES = new Set<BookCoverTypographyRole>([
  "title",
  "subtitle",
  "author",
  "series",
  "spine_title",
  "spine_author",
  "back_copy",
  "imprint",
  "isbn_text",
]);
const ALIGNMENT_VALUES = new Set(["left", "center", "right"] as const);

const PLAN_INPUT_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "compiledAt",
  "identity",
  "format",
  "metadata",
  "artDirection",
  "sourceArtwork",
  "typography",
  "printGeometry",
]);
const IDENTITY_FIELDS = new Set([
  "tenantId",
  "workspaceId",
  "projectId",
  "bookId",
  "manuscriptId",
  "editionId",
  "publicationId",
  "requestId",
]);
const METADATA_FIELDS = new Set([
  "title",
  "subtitle",
  "authorName",
  "seriesTitle",
  "imprint",
  "backCopy",
]);
const ART_DIRECTION_FIELDS = new Set([
  "creativeThesis",
  "styleThesis",
  "historicalMaterialReferences",
  "genericPatternsRejected",
  "imitationAvoidanceNotes",
  "approvalEvidenceId",
]);
const SOURCE_FIELDS = new Set([
  "selectedCandidateId",
  "selectionEvidenceId",
  "artifact",
  "textFree",
  "provenanceMode",
  "rightsEvidenceIds",
  "generationEvidenceIds",
  "originalityReviewEvidenceId",
]);
const TYPOGRAPHY_FIELDS = new Set([
  "renderer",
  "modelRenderedText",
  "metadataMatchEvidenceId",
  "spellingReviewEvidenceId",
  "layers",
]);
const LAYER_FIELDS = new Set([
  "role",
  "text",
  "fontFamily",
  "fontLicenseEvidenceId",
  "fontSizePt",
  "x",
  "y",
  "width",
  "height",
  "alignment",
]);
const PRINT_FIELDS = new Set([
  "trimWidthInches",
  "trimHeightInches",
  "pageCount",
  "bleedInches",
  "spineWidthInches",
  "spineTextEnabled",
  "spineTextClearanceInches",
  "templateArtifact",
  "templateFingerprintSha256",
  "templateObservedAt",
  "hardcoverWrapInches",
  "hardcoverSafeTextFromEdgeInches",
  "hardcoverHingeInches",
  "barcode",
]);
const BARCODE_FIELDS = new Set([
  "policy",
  "reservedWidthInches",
  "reservedHeightInches",
  "distanceFromSpineInches",
  "distanceFromTrimInches",
  "reserveClear",
  "whiteBackground",
  "blackBars",
  "rightSideUp",
  "squareToCover",
  "flattenedIntoArtwork",
  "barcodeArtifact",
]);
const ARTIFACT_FIELDS = new Set([
  "artifactId",
  "objectId",
  "sha256",
  "mediaType",
  "byteLength",
  "immutable",
  "widthPx",
  "heightPx",
  "ppi",
  "colourSpace",
  "pageCount",
]);
const RELEASE_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "evaluatedAt",
  "plan",
  "execution",
]);
const EXECUTION_FIELDS = new Set([
  "rendererId",
  "rendererVersion",
  "renderedAt",
  "renderReceiptId",
  "renderPlanFingerprintSha256",
  "frontCover",
  "fullWrapCover",
  "editableSource",
  "inspections",
]);
const INSPECTION_FIELDS = new Set([
  "metadataMatchEvidenceId",
  "spellingEvidenceId",
  "thumbnailEvidenceId",
  "contrastEvidenceId",
  "safeZoneEvidenceId",
  "outputOpenEvidenceId",
  "dimensionsEvidenceId",
  "colourProfileEvidenceId",
  "rightsEvidenceId",
  "originalityEvidenceId",
  "fontLicenceEvidenceId",
  "fontEmbeddingEvidenceId",
  "transparencyFlatteningEvidenceId",
  "noCropMarksEvidenceId",
  "noTemplateMarksEvidenceId",
  "pdfUnlockedEvidenceId",
  "templateMatchEvidenceId",
  "barcodeEvidenceId",
]);

export async function compileBookCoverRenderPlan(
  value: unknown,
): Promise<BookCoverRenderPlanCompilationResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const source = parseRenderPlanInput(value, blockers, warnings);
  if (!source || blockers.length) {
    return {
      outputKind: "evavo_book_cover_render_plan_compilation_result",
      schemaVersion: BOOK_COVER_PRODUCTION_SCHEMA_VERSION,
      status: "blocked",
      blockers: unique(blockers),
      warnings: unique(warnings),
      renderingPerformed: false,
      bookStudioImportPerformed: false,
      publicationPerformed: false,
    };
  }
  const outputRequirements = requirementsFor(source.format);
  const withoutFingerprint = {
    outputKind: "evavo_book_cover_render_plan" as const,
    schemaVersion: BOOK_COVER_PRODUCTION_SCHEMA_VERSION,
    contract: BOOK_COVER_RENDER_PLAN_CONTRACT,
    compiledAt: source.compiledAt,
    identity: source.identity,
    format: source.format,
    source,
    outputRequirements,
    kdpAiImageDisclosureRequired:
      source.sourceArtwork.provenanceMode === "ai_generated",
    renderJobMayWriteOnlyCandidateArtifacts: true as const,
    renderingPerformed: false as const,
    bookStudioImportPerformed: false as const,
    publicationPerformed: false as const,
  };
  const plan: BookCoverRenderPlanV1 = {
    ...withoutFingerprint,
    planFingerprintSha256: await fingerprint(withoutFingerprint),
  };
  return {
    outputKind: "evavo_book_cover_render_plan_compilation_result",
    schemaVersion: BOOK_COVER_PRODUCTION_SCHEMA_VERSION,
    status: "ready",
    plan,
    blockers: [],
    warnings: unique(warnings),
    renderingPerformed: false,
    bookStudioImportPerformed: false,
    publicationPerformed: false,
  };
}

export async function evaluateBookCoverRelease(
  value: unknown,
): Promise<BookCoverReleaseEvaluationV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const input = record(value);
  if (!input) {
    blockers.push("release:object_required");
  } else {
    rejectUnknown(input, RELEASE_FIELDS, "release", blockers);
    if (input.outputKind !== "evavo_book_cover_release_input") {
      blockers.push("release.outputKind:unsupported");
    }
    if (input.schemaVersion !== BOOK_COVER_PRODUCTION_SCHEMA_VERSION) {
      blockers.push("release.schemaVersion:unsupported");
    }
  }
  const evaluatedAt = canonicalTimestamp(
    input?.evaluatedAt,
    "release.evaluatedAt",
    blockers,
  );
  const suppliedPlan = record(input?.plan);
  const source = suppliedPlan?.source;
  const recompilation = await compileBookCoverRenderPlan(source);
  blockers.push(...recompilation.blockers);
  warnings.push(...recompilation.warnings);
  const plan = recompilation.plan;
  let renderPlanVerified = false;
  if (!suppliedPlan || !plan) {
    blockers.push("release.plan:verified_render_plan_required");
  } else {
    const suppliedFingerprint = safeSha(
      suppliedPlan.planFingerprintSha256,
      "release.plan.planFingerprintSha256",
      blockers,
    );
    renderPlanVerified = suppliedFingerprint === plan.planFingerprintSha256;
    if (!renderPlanVerified) blockers.push("release.plan:fingerprint_mismatch");
    if (suppliedPlan.contract !== BOOK_COVER_RENDER_PLAN_CONTRACT) {
      blockers.push("release.plan:contract_mismatch");
    }
  }

  const execution = parseExecution(input?.execution, blockers);
  const renderingPerformed = Boolean(
    execution &&
      execution.renderReceiptId &&
      execution.frontCover.immutable === true &&
      execution.frontCover.byteLength > 0,
  );
  if (plan && execution) {
    if (execution.renderPlanFingerprintSha256 !== plan.planFingerprintSha256) {
      blockers.push("release.execution:render_plan_fingerprint_mismatch");
    }
    if (Date.parse(execution.renderedAt) < Date.parse(plan.compiledAt)) {
      blockers.push("release.execution:rendered_before_plan");
    }
    if (Date.parse(evaluatedAt) < Date.parse(execution.renderedAt)) {
      blockers.push("release.evaluatedAt:before_renderedAt");
    }
    validateFrontCover(execution.frontCover, blockers, warnings);
    if (plan.format === "kindle_ebook") {
      if (execution.fullWrapCover) {
        blockers.push("release.execution.fullWrapCover:not_applicable_to_ebook");
      }
      requireNoPrintInspectionClaims(execution.inspections, blockers);
    } else {
      validatePrintRelease(plan, execution, blockers, warnings);
    }
    if (execution.editableSource.mediaType !== "application/pdf" &&
        execution.editableSource.mediaType !== "application/vnd.evavo.cover-source+json" &&
        execution.editableSource.mediaType !== "application/vnd.adobe.photoshop") {
      blockers.push("release.execution.editableSource:unsupported_media_type");
    }
  }

  const sourceSelectionVerified = Boolean(
    plan?.source.sourceArtwork.selectionEvidenceId &&
      plan.source.sourceArtwork.selectedCandidateId,
  );
  const creativeApprovalVerified = Boolean(
    plan?.source.artDirection.approvalEvidenceId,
  );
  const rightsVerified = Boolean(
    plan?.source.sourceArtwork.rightsEvidenceIds.length &&
      execution?.inspections.rightsEvidenceId,
  );
  const deterministicTypographyVerified = Boolean(
    plan?.source.typography.renderer === "deterministic_layout" &&
      plan.source.typography.modelRenderedText === false &&
      execution?.inspections.metadataMatchEvidenceId &&
      execution.inspections.spellingEvidenceId &&
      execution.inspections.fontLicenceEvidenceId,
  );
  if (!sourceSelectionVerified) blockers.push("release:source_selection_not_verified");
  if (!creativeApprovalVerified) blockers.push("release:creative_approval_not_verified");
  if (!rightsVerified) blockers.push("release:rights_not_verified");
  if (!deterministicTypographyVerified) {
    blockers.push("release:deterministic_typography_not_verified");
  }

  const uniqueBlockers = unique(blockers);
  const uniqueWarnings = unique(warnings);
  const ready = Boolean(
    plan &&
      execution &&
      renderPlanVerified &&
      renderingPerformed &&
      uniqueBlockers.length === 0,
  );
  const bookStudioCoverEvidence =
    ready && plan && execution
      ? toBookStudioEvidence(plan, execution)
      : undefined;
  const unsigned = {
    outputKind: "evavo_book_cover_release_evaluation" as const,
    schemaVersion: BOOK_COVER_PRODUCTION_SCHEMA_VERSION,
    contract: BOOK_COVER_RELEASE_CONTRACT,
    status: ready
      ? ("ready_for_book_studio_import" as const)
      : ("blocked" as const),
    evaluatedAt,
    ...(plan ? { plan } : {}),
    ...(bookStudioCoverEvidence ? { bookStudioCoverEvidence } : {}),
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
    kdpAiImageDisclosureRequired:
      plan?.kdpAiImageDisclosureRequired ?? false,
    renderPlanVerified,
    sourceSelectionVerified,
    creativeApprovalVerified,
    rightsVerified,
    deterministicTypographyVerified,
    renderingPerformed,
    bookStudioImportPerformed: false as const,
    publicationPerformed: false as const,
  };
  return {
    ...unsigned,
    releaseFingerprintSha256: await fingerprint(unsigned),
  };
}

function parseRenderPlanInput(
  value: unknown,
  blockers: string[],
  warnings: string[],
): BookCoverRenderPlanInputV1 | undefined {
  const input = record(value);
  if (!input) {
    blockers.push("plan:object_required");
    return undefined;
  }
  rejectUnknown(input, PLAN_INPUT_FIELDS, "plan", blockers);
  if (input.outputKind !== "evavo_book_cover_render_plan_input") {
    blockers.push("plan.outputKind:unsupported");
  }
  if (input.schemaVersion !== BOOK_COVER_PRODUCTION_SCHEMA_VERSION) {
    blockers.push("plan.schemaVersion:unsupported");
  }
  const compiledAt = canonicalTimestamp(
    input.compiledAt,
    "plan.compiledAt",
    blockers,
  );
  const identity = parseIdentity(input.identity, blockers);
  const format = enumValue(
    input.format,
    FORMAT_VALUES,
    "plan.format",
    blockers,
    "kindle_ebook",
  );
  const metadata = parseMetadata(input.metadata, blockers);
  const artDirection = parseArtDirection(input.artDirection, blockers);
  const sourceArtwork = parseSourceArtwork(input.sourceArtwork, blockers);
  const typography = parseTypography(input.typography, metadata, format, blockers);
  const printGeometry =
    input.printGeometry === undefined
      ? undefined
      : parsePrintGeometry(input.printGeometry, format, compiledAt, blockers, warnings);
  if (format === "kindle_ebook" && printGeometry) {
    blockers.push("plan.printGeometry:not_applicable_to_ebook");
  }
  if (format !== "kindle_ebook" && !printGeometry) {
    blockers.push("plan.printGeometry:required_for_print");
  }
  return {
    outputKind: "evavo_book_cover_render_plan_input",
    schemaVersion: BOOK_COVER_PRODUCTION_SCHEMA_VERSION,
    compiledAt,
    identity,
    format,
    metadata,
    artDirection,
    sourceArtwork,
    typography,
    ...(printGeometry ? { printGeometry } : {}),
  };
}

function parseIdentity(value: unknown, blockers: string[]): BookCoverIdentityV1 {
  const input = record(value);
  if (!input) {
    blockers.push("plan.identity:object_required");
    return emptyIdentity();
  }
  rejectUnknown(input, IDENTITY_FIELDS, "plan.identity", blockers);
  return {
    tenantId: safeId(input.tenantId, "plan.identity.tenantId", blockers),
    workspaceId: safeId(input.workspaceId, "plan.identity.workspaceId", blockers),
    projectId: safeId(input.projectId, "plan.identity.projectId", blockers),
    bookId: safeId(input.bookId, "plan.identity.bookId", blockers),
    manuscriptId: safeId(input.manuscriptId, "plan.identity.manuscriptId", blockers),
    editionId: safeId(input.editionId, "plan.identity.editionId", blockers),
    publicationId: safeId(input.publicationId, "plan.identity.publicationId", blockers),
    requestId: safeId(input.requestId, "plan.identity.requestId", blockers),
  };
}

function parseMetadata(value: unknown, blockers: string[]): BookCoverMetadataV1 {
  const input = record(value);
  if (!input) {
    blockers.push("plan.metadata:object_required");
    return { title: "", authorName: "" };
  }
  rejectUnknown(input, METADATA_FIELDS, "plan.metadata", blockers);
  const subtitle = optionalText(input.subtitle, "plan.metadata.subtitle", blockers, 240);
  const seriesTitle = optionalText(
    input.seriesTitle,
    "plan.metadata.seriesTitle",
    blockers,
    240,
  );
  const imprint = optionalText(input.imprint, "plan.metadata.imprint", blockers, 240);
  const backCopy = optionalText(input.backCopy, "plan.metadata.backCopy", blockers, 4000);
  return {
    title: requiredText(input.title, "plan.metadata.title", blockers, 240),
    ...(subtitle ? { subtitle } : {}),
    authorName: requiredText(
      input.authorName,
      "plan.metadata.authorName",
      blockers,
      240,
    ),
    ...(seriesTitle ? { seriesTitle } : {}),
    ...(imprint ? { imprint } : {}),
    ...(backCopy ? { backCopy } : {}),
  };
}

function parseArtDirection(
  value: unknown,
  blockers: string[],
): BookCoverArtDirectionV1 {
  const input = record(value);
  if (!input) {
    blockers.push("plan.artDirection:object_required");
    return {
      creativeThesis: "",
      styleThesis: "",
      historicalMaterialReferences: [],
      genericPatternsRejected: [],
      imitationAvoidanceNotes: "",
      approvalEvidenceId: "",
    };
  }
  rejectUnknown(input, ART_DIRECTION_FIELDS, "plan.artDirection", blockers);
  const historicalMaterialReferences = stringArray(
    input.historicalMaterialReferences,
    "plan.artDirection.historicalMaterialReferences",
    blockers,
    1,
    24,
  );
  const genericPatternsRejected = stringArray(
    input.genericPatternsRejected,
    "plan.artDirection.genericPatternsRejected",
    blockers,
    3,
    32,
  );
  return {
    creativeThesis: requiredText(
      input.creativeThesis,
      "plan.artDirection.creativeThesis",
      blockers,
      2000,
    ),
    styleThesis: requiredText(
      input.styleThesis,
      "plan.artDirection.styleThesis",
      blockers,
      2000,
    ),
    historicalMaterialReferences,
    genericPatternsRejected,
    imitationAvoidanceNotes: requiredText(
      input.imitationAvoidanceNotes,
      "plan.artDirection.imitationAvoidanceNotes",
      blockers,
      3000,
    ),
    approvalEvidenceId: safeId(
      input.approvalEvidenceId,
      "plan.artDirection.approvalEvidenceId",
      blockers,
    ),
  };
}

function parseSourceArtwork(
  value: unknown,
  blockers: string[],
): BookCoverSourceArtworkV1 {
  const input = record(value);
  if (!input) {
    blockers.push("plan.sourceArtwork:object_required");
    return {
      selectedCandidateId: "",
      selectionEvidenceId: "",
      artifact: emptyArtifact(),
      textFree: true,
      provenanceMode: "human_created",
      rightsEvidenceIds: [],
      generationEvidenceIds: [],
      originalityReviewEvidenceId: "",
    };
  }
  rejectUnknown(input, SOURCE_FIELDS, "plan.sourceArtwork", blockers);
  if (input.textFree !== true) {
    blockers.push("plan.sourceArtwork.textFree:must_be_true");
  }
  const provenanceMode = enumValue(
    input.provenanceMode,
    PROVENANCE_VALUES,
    "plan.sourceArtwork.provenanceMode",
    blockers,
    "human_created",
  );
  const generationEvidenceIds = idArray(
    input.generationEvidenceIds,
    "plan.sourceArtwork.generationEvidenceIds",
    blockers,
    provenanceMode === "human_created" ? 0 : 1,
    64,
  );
  return {
    selectedCandidateId: safeId(
      input.selectedCandidateId,
      "plan.sourceArtwork.selectedCandidateId",
      blockers,
    ),
    selectionEvidenceId: safeId(
      input.selectionEvidenceId,
      "plan.sourceArtwork.selectionEvidenceId",
      blockers,
    ),
    artifact: parseArtifact(input.artifact, "plan.sourceArtwork.artifact", blockers),
    textFree: true,
    provenanceMode,
    rightsEvidenceIds: idArray(
      input.rightsEvidenceIds,
      "plan.sourceArtwork.rightsEvidenceIds",
      blockers,
      1,
      64,
    ),
    generationEvidenceIds,
    originalityReviewEvidenceId: safeId(
      input.originalityReviewEvidenceId,
      "plan.sourceArtwork.originalityReviewEvidenceId",
      blockers,
    ),
  };
}

function parseTypography(
  value: unknown,
  metadata: BookCoverMetadataV1,
  format: BookCoverFormat,
  blockers: string[],
): BookCoverTypographyV1 {
  const input = record(value);
  if (!input) {
    blockers.push("plan.typography:object_required");
    return {
      renderer: "deterministic_layout",
      modelRenderedText: false,
      metadataMatchEvidenceId: "",
      spellingReviewEvidenceId: "",
      layers: [],
    };
  }
  rejectUnknown(input, TYPOGRAPHY_FIELDS, "plan.typography", blockers);
  if (input.renderer !== "deterministic_layout") {
    blockers.push("plan.typography.renderer:deterministic_layout_required");
  }
  if (input.modelRenderedText !== false) {
    blockers.push("plan.typography.modelRenderedText:must_be_false");
  }
  const rawLayers = array(input.layers, "plan.typography.layers", blockers, 2, 32);
  const layers = rawLayers.map((item, index) =>
    parseTypographyLayer(item, `plan.typography.layers[${index}]`, blockers),
  );
  const roles = layers.map((layer) => layer.role);
  for (const role of new Set(roles)) {
    if (roles.filter((value) => value === role).length > 1) {
      blockers.push(`plan.typography.layers:${role}_role_duplicated`);
    }
  }
  requireExactLayer(layers, "title", metadata.title, blockers);
  requireExactLayer(layers, "author", metadata.authorName, blockers);
  if (metadata.subtitle) requireExactLayer(layers, "subtitle", metadata.subtitle, blockers);
  else if (layers.some((layer) => layer.role === "subtitle")) {
    blockers.push("plan.typography.layers:subtitle_present_without_metadata");
  }
  if (metadata.seriesTitle) requireExactLayer(layers, "series", metadata.seriesTitle, blockers);
  else if (layers.some((layer) => layer.role === "series")) {
    blockers.push("plan.typography.layers:series_present_without_metadata");
  }
  if (metadata.backCopy) requireExactLayer(layers, "back_copy", metadata.backCopy, blockers);
  if (metadata.imprint) requireExactLayer(layers, "imprint", metadata.imprint, blockers);
  if (format === "kindle_ebook" && layers.some((layer) => layer.role.startsWith("spine_"))) {
    blockers.push("plan.typography.layers:spine_text_not_applicable_to_ebook");
  }
  return {
    renderer: "deterministic_layout",
    modelRenderedText: false,
    metadataMatchEvidenceId: safeId(
      input.metadataMatchEvidenceId,
      "plan.typography.metadataMatchEvidenceId",
      blockers,
    ),
    spellingReviewEvidenceId: safeId(
      input.spellingReviewEvidenceId,
      "plan.typography.spellingReviewEvidenceId",
      blockers,
    ),
    layers,
  };
}

function parseTypographyLayer(
  value: unknown,
  label: string,
  blockers: string[],
): BookCoverTypographyLayerV1 {
  const input = record(value);
  if (!input) {
    blockers.push(`${label}:object_required`);
    return {
      role: "title",
      text: "",
      fontFamily: "",
      fontLicenseEvidenceId: "",
      fontSizePt: 0,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      alignment: "left",
    };
  }
  rejectUnknown(input, LAYER_FIELDS, label, blockers);
  const x = number(input.x, `${label}.x`, blockers, 0, 1);
  const y = number(input.y, `${label}.y`, blockers, 0, 1);
  const width = number(input.width, `${label}.width`, blockers, 0.001, 1);
  const height = number(input.height, `${label}.height`, blockers, 0.001, 1);
  if (x + width > 1.000001) blockers.push(`${label}:exceeds_horizontal_canvas`);
  if (y + height > 1.000001) blockers.push(`${label}:exceeds_vertical_canvas`);
  return {
    role: enumValue(input.role, ROLE_VALUES, `${label}.role`, blockers, "title"),
    text: requiredText(input.text, `${label}.text`, blockers, 4000),
    fontFamily: requiredText(input.fontFamily, `${label}.fontFamily`, blockers, 240),
    fontLicenseEvidenceId: safeId(
      input.fontLicenseEvidenceId,
      `${label}.fontLicenseEvidenceId`,
      blockers,
    ),
    fontSizePt: number(input.fontSizePt, `${label}.fontSizePt`, blockers, 7, 400),
    x,
    y,
    width,
    height,
    alignment: enumValue(
      input.alignment,
      ALIGNMENT_VALUES,
      `${label}.alignment`,
      blockers,
      "left",
    ),
  };
}

function parsePrintGeometry(
  value: unknown,
  format: BookCoverFormat,
  compiledAt: string,
  blockers: string[],
  warnings: string[],
): BookCoverPrintGeometryV1 {
  const input = record(value);
  if (!input) {
    blockers.push("plan.printGeometry:object_required");
    return emptyPrintGeometry();
  }
  rejectUnknown(input, PRINT_FIELDS, "plan.printGeometry", blockers);
  const pageCount = integer(
    input.pageCount,
    "plan.printGeometry.pageCount",
    blockers,
    24,
    2000,
  );
  const spineTextEnabled = boolean(
    input.spineTextEnabled,
    "plan.printGeometry.spineTextEnabled",
    blockers,
  );
  const spineTextClearanceInches = number(
    input.spineTextClearanceInches,
    "plan.printGeometry.spineTextClearanceInches",
    blockers,
    0,
    2,
  );
  if (spineTextEnabled && pageCount < 79) {
    blockers.push("plan.printGeometry:spine_text_requires_at_least_79_pages");
  }
  if (spineTextEnabled && spineTextClearanceInches < 0.0625) {
    blockers.push("plan.printGeometry.spineTextClearanceInches:minimum_0_0625_required");
  }
  const templateObservedAt = canonicalTimestamp(
    input.templateObservedAt,
    "plan.printGeometry.templateObservedAt",
    blockers,
  );
  const templateAgeDays =
    (Date.parse(compiledAt) - Date.parse(templateObservedAt)) / 86_400_000;
  if (templateAgeDays < 0) blockers.push("plan.printGeometry.templateObservedAt:future");
  if (templateAgeDays > 30) {
    blockers.push("plan.printGeometry.templateObservedAt:template_older_than_30_days");
  }
  const templateArtifact = parseArtifact(
    input.templateArtifact,
    "plan.printGeometry.templateArtifact",
    blockers,
  );
  if (!["application/pdf", "image/png"].includes(templateArtifact.mediaType)) {
    blockers.push("plan.printGeometry.templateArtifact:pdf_or_png_required");
  }
  const bleedInches = number(
    input.bleedInches,
    "plan.printGeometry.bleedInches",
    blockers,
    0,
    1,
  );
  if (format === "paperback" && bleedInches < 0.125) {
    blockers.push("plan.printGeometry.bleedInches:paperback_minimum_0_125_required");
  }
  const hardcoverWrapInches = optionalNumber(
    input.hardcoverWrapInches,
    "plan.printGeometry.hardcoverWrapInches",
    blockers,
    0,
    2,
  );
  const hardcoverSafeTextFromEdgeInches = optionalNumber(
    input.hardcoverSafeTextFromEdgeInches,
    "plan.printGeometry.hardcoverSafeTextFromEdgeInches",
    blockers,
    0,
    2,
  );
  const hardcoverHingeInches = optionalNumber(
    input.hardcoverHingeInches,
    "plan.printGeometry.hardcoverHingeInches",
    blockers,
    0,
    2,
  );
  if (format === "hardcover") {
    if ((hardcoverWrapInches ?? 0) < 0.51) {
      blockers.push("plan.printGeometry.hardcoverWrapInches:minimum_0_51_required");
    }
    if ((hardcoverSafeTextFromEdgeInches ?? 0) < 0.635) {
      blockers.push("plan.printGeometry.hardcoverSafeTextFromEdgeInches:minimum_0_635_required");
    }
    if ((hardcoverHingeInches ?? 0) < 0.4) {
      blockers.push("plan.printGeometry.hardcoverHingeInches:minimum_0_4_required");
    }
  } else if (
    hardcoverWrapInches !== undefined ||
    hardcoverSafeTextFromEdgeInches !== undefined ||
    hardcoverHingeInches !== undefined
  ) {
    blockers.push("plan.printGeometry:hardcover_fields_not_applicable_to_paperback");
  }
  const barcode = parseBarcode(input.barcode, blockers, warnings);
  return {
    trimWidthInches: number(
      input.trimWidthInches,
      "plan.printGeometry.trimWidthInches",
      blockers,
      3,
      20,
    ),
    trimHeightInches: number(
      input.trimHeightInches,
      "plan.printGeometry.trimHeightInches",
      blockers,
      3,
      20,
    ),
    pageCount,
    bleedInches,
    spineWidthInches: number(
      input.spineWidthInches,
      "plan.printGeometry.spineWidthInches",
      blockers,
      0.01,
      5,
    ),
    spineTextEnabled,
    spineTextClearanceInches,
    templateArtifact,
    templateFingerprintSha256: safeSha(
      input.templateFingerprintSha256,
      "plan.printGeometry.templateFingerprintSha256",
      blockers,
    ),
    templateObservedAt,
    ...(hardcoverWrapInches === undefined ? {} : { hardcoverWrapInches }),
    ...(hardcoverSafeTextFromEdgeInches === undefined
      ? {}
      : { hardcoverSafeTextFromEdgeInches }),
    ...(hardcoverHingeInches === undefined ? {} : { hardcoverHingeInches }),
    barcode,
  };
}

function parseBarcode(
  value: unknown,
  blockers: string[],
  warnings: string[],
): BookCoverBarcodePlanV1 {
  const input = record(value);
  if (!input) {
    blockers.push("plan.printGeometry.barcode:object_required");
    return emptyBarcode();
  }
  rejectUnknown(input, BARCODE_FIELDS, "plan.printGeometry.barcode", blockers);
  const policy = enumValue(
    input.policy,
    BARCODE_VALUES,
    "plan.printGeometry.barcode.policy",
    blockers,
    "not_applicable",
  );
  const reservedWidthInches = number(
    input.reservedWidthInches,
    "plan.printGeometry.barcode.reservedWidthInches",
    blockers,
    0,
    10,
  );
  const reservedHeightInches = number(
    input.reservedHeightInches,
    "plan.printGeometry.barcode.reservedHeightInches",
    blockers,
    0,
    10,
  );
  const distanceFromSpineInches = number(
    input.distanceFromSpineInches,
    "plan.printGeometry.barcode.distanceFromSpineInches",
    blockers,
    0,
    10,
  );
  const distanceFromTrimInches = number(
    input.distanceFromTrimInches,
    "plan.printGeometry.barcode.distanceFromTrimInches",
    blockers,
    0,
    10,
  );
  const reserveClear = boolean(
    input.reserveClear,
    "plan.printGeometry.barcode.reserveClear",
    blockers,
  );
  const whiteBackground = boolean(
    input.whiteBackground,
    "plan.printGeometry.barcode.whiteBackground",
    blockers,
  );
  const blackBars = boolean(
    input.blackBars,
    "plan.printGeometry.barcode.blackBars",
    blockers,
  );
  const rightSideUp = boolean(
    input.rightSideUp,
    "plan.printGeometry.barcode.rightSideUp",
    blockers,
  );
  const squareToCover = boolean(
    input.squareToCover,
    "plan.printGeometry.barcode.squareToCover",
    blockers,
  );
  const flattenedIntoArtwork = boolean(
    input.flattenedIntoArtwork,
    "plan.printGeometry.barcode.flattenedIntoArtwork",
    blockers,
  );
  const barcodeArtifact =
    input.barcodeArtifact === undefined
      ? undefined
      : parseArtifact(
          input.barcodeArtifact,
          "plan.printGeometry.barcode.barcodeArtifact",
          blockers,
        );
  if (policy === "not_applicable") {
    blockers.push("plan.printGeometry.barcode.policy:print_barcode_policy_required");
  }
  if (distanceFromSpineInches < 0.25 || distanceFromTrimInches < 0.25) {
    blockers.push("plan.printGeometry.barcode:minimum_0_25_clearance_required");
  }
  if (!reserveClear || !whiteBackground || !blackBars || !rightSideUp || !squareToCover) {
    blockers.push("plan.printGeometry.barcode:placement_and_legibility_requirements_not_met");
  }
  if (flattenedIntoArtwork) {
    blockers.push("plan.printGeometry.barcode.flattenedIntoArtwork:must_be_false");
  }
  if (policy === "amazon_placed") {
    if (reservedWidthInches < 2 || reservedHeightInches < 1.2) {
      blockers.push("plan.printGeometry.barcode:amazon_reserve_minimum_2_by_1_2_required");
    }
    if (barcodeArtifact) {
      blockers.push("plan.printGeometry.barcode.barcodeArtifact:must_be_absent_for_amazon_placed");
    }
  }
  if (policy === "publisher_supplied") {
    if (reservedWidthInches < 1.4 || reservedHeightInches < 0.8) {
      blockers.push("plan.printGeometry.barcode:publisher_barcode_minimum_1_4_by_0_8_required");
    }
    if (!barcodeArtifact) {
      blockers.push("plan.printGeometry.barcode.barcodeArtifact:required_for_publisher_supplied");
    } else {
      const vector = ["image/svg+xml", "application/pdf"].includes(
        barcodeArtifact.mediaType,
      );
      if (!vector && (barcodeArtifact.ppi ?? 0) < 300) {
        blockers.push("plan.printGeometry.barcode.barcodeArtifact:raster_minimum_300_ppi_required");
      }
      if (!vector) warnings.push("A vector barcode is preferred for print reliability.");
    }
  }
  return {
    policy,
    reservedWidthInches,
    reservedHeightInches,
    distanceFromSpineInches,
    distanceFromTrimInches,
    reserveClear,
    whiteBackground,
    blackBars,
    rightSideUp,
    squareToCover,
    flattenedIntoArtwork,
    ...(barcodeArtifact ? { barcodeArtifact } : {}),
  };
}

function parseExecution(
  value: unknown,
  blockers: string[],
): BookCoverRenderExecutionV1 | undefined {
  const input = record(value);
  if (!input) {
    blockers.push("release.execution:object_required");
    return undefined;
  }
  rejectUnknown(input, EXECUTION_FIELDS, "release.execution", blockers);
  const fullWrapCover =
    input.fullWrapCover === undefined
      ? undefined
      : parseArtifact(input.fullWrapCover, "release.execution.fullWrapCover", blockers);
  return {
    rendererId: safeId(input.rendererId, "release.execution.rendererId", blockers),
    rendererVersion: requiredText(
      input.rendererVersion,
      "release.execution.rendererVersion",
      blockers,
      120,
    ),
    renderedAt: canonicalTimestamp(
      input.renderedAt,
      "release.execution.renderedAt",
      blockers,
    ),
    renderReceiptId: safeId(
      input.renderReceiptId,
      "release.execution.renderReceiptId",
      blockers,
    ),
    renderPlanFingerprintSha256: safeSha(
      input.renderPlanFingerprintSha256,
      "release.execution.renderPlanFingerprintSha256",
      blockers,
    ),
    frontCover: parseArtifact(
      input.frontCover,
      "release.execution.frontCover",
      blockers,
    ),
    ...(fullWrapCover ? { fullWrapCover } : {}),
    editableSource: parseArtifact(
      input.editableSource,
      "release.execution.editableSource",
      blockers,
    ),
    inspections: parseInspections(input.inspections, blockers),
  };
}

function parseInspections(
  value: unknown,
  blockers: string[],
): BookCoverInspectionEvidenceV1 {
  const input = record(value);
  if (!input) {
    blockers.push("release.execution.inspections:object_required");
    return emptyInspections();
  }
  rejectUnknown(input, INSPECTION_FIELDS, "release.execution.inspections", blockers);
  const optional = (field: keyof BookCoverInspectionEvidenceV1): string | undefined =>
    input[field] === undefined
      ? undefined
      : safeId(
          input[field],
          `release.execution.inspections.${String(field)}`,
          blockers,
        );
  const fontEmbeddingEvidenceId = optional("fontEmbeddingEvidenceId");
  const transparencyFlatteningEvidenceId = optional(
    "transparencyFlatteningEvidenceId",
  );
  const noCropMarksEvidenceId = optional("noCropMarksEvidenceId");
  const noTemplateMarksEvidenceId = optional("noTemplateMarksEvidenceId");
  const pdfUnlockedEvidenceId = optional("pdfUnlockedEvidenceId");
  const templateMatchEvidenceId = optional("templateMatchEvidenceId");
  const barcodeEvidenceId = optional("barcodeEvidenceId");
  return {
    metadataMatchEvidenceId: safeId(
      input.metadataMatchEvidenceId,
      "release.execution.inspections.metadataMatchEvidenceId",
      blockers,
    ),
    spellingEvidenceId: safeId(
      input.spellingEvidenceId,
      "release.execution.inspections.spellingEvidenceId",
      blockers,
    ),
    thumbnailEvidenceId: safeId(
      input.thumbnailEvidenceId,
      "release.execution.inspections.thumbnailEvidenceId",
      blockers,
    ),
    contrastEvidenceId: safeId(
      input.contrastEvidenceId,
      "release.execution.inspections.contrastEvidenceId",
      blockers,
    ),
    safeZoneEvidenceId: safeId(
      input.safeZoneEvidenceId,
      "release.execution.inspections.safeZoneEvidenceId",
      blockers,
    ),
    outputOpenEvidenceId: safeId(
      input.outputOpenEvidenceId,
      "release.execution.inspections.outputOpenEvidenceId",
      blockers,
    ),
    dimensionsEvidenceId: safeId(
      input.dimensionsEvidenceId,
      "release.execution.inspections.dimensionsEvidenceId",
      blockers,
    ),
    colourProfileEvidenceId: safeId(
      input.colourProfileEvidenceId,
      "release.execution.inspections.colourProfileEvidenceId",
      blockers,
    ),
    rightsEvidenceId: safeId(
      input.rightsEvidenceId,
      "release.execution.inspections.rightsEvidenceId",
      blockers,
    ),
    originalityEvidenceId: safeId(
      input.originalityEvidenceId,
      "release.execution.inspections.originalityEvidenceId",
      blockers,
    ),
    fontLicenceEvidenceId: safeId(
      input.fontLicenceEvidenceId,
      "release.execution.inspections.fontLicenceEvidenceId",
      blockers,
    ),
    ...(fontEmbeddingEvidenceId ? { fontEmbeddingEvidenceId } : {}),
    ...(transparencyFlatteningEvidenceId
      ? { transparencyFlatteningEvidenceId }
      : {}),
    ...(noCropMarksEvidenceId ? { noCropMarksEvidenceId } : {}),
    ...(noTemplateMarksEvidenceId ? { noTemplateMarksEvidenceId } : {}),
    ...(pdfUnlockedEvidenceId ? { pdfUnlockedEvidenceId } : {}),
    ...(templateMatchEvidenceId ? { templateMatchEvidenceId } : {}),
    ...(barcodeEvidenceId ? { barcodeEvidenceId } : {}),
  };
}

function validateFrontCover(
  artifact: BookCoverArtifactV1,
  blockers: string[],
  warnings: string[],
): void {
  if (!["image/jpeg", "image/tiff"].includes(artifact.mediaType)) {
    blockers.push("release.execution.frontCover:jpeg_or_tiff_required");
  }
  const width = artifact.widthPx ?? 0;
  const height = artifact.heightPx ?? 0;
  if (width < 625 || height < 1000) {
    blockers.push("release.execution.frontCover:minimum_625_by_1000_required");
  }
  if (width > 10000 || height > 10000) {
    blockers.push("release.execution.frontCover:maximum_10000_pixels_per_dimension");
  }
  if (width > 0 && height / width < 1.6) {
    blockers.push("release.execution.frontCover:minimum_1_6_height_width_ratio_required");
  }
  if (artifact.byteLength >= 50 * 1024 * 1024) {
    blockers.push("release.execution.frontCover:must_be_under_50_mb");
  }
  if (artifact.colourSpace !== "RGB") {
    blockers.push("release.execution.frontCover:rgb_required");
  }
  if ((artifact.ppi ?? 0) < 300) {
    blockers.push("release.execution.frontCover:release_quality_300_ppi_required");
  }
  if (width < 1600 || height < 2560) {
    warnings.push("The direct-upload cover meets KDP minimums but is below the preferred 1600 × 2560 release dimensions.");
  }
}

function validatePrintRelease(
  plan: BookCoverRenderPlanV1,
  execution: BookCoverRenderExecutionV1,
  blockers: string[],
  warnings: string[],
): void {
  const fullWrap = execution.fullWrapCover;
  if (!fullWrap) {
    blockers.push("release.execution.fullWrapCover:required_for_print");
  } else {
    if (fullWrap.mediaType !== "application/pdf") {
      blockers.push("release.execution.fullWrapCover:single_pdf_required");
    }
    if ((fullWrap.pageCount ?? 0) !== 1) {
      blockers.push("release.execution.fullWrapCover:exactly_one_page_required");
    }
    if ((fullWrap.ppi ?? 0) < 300) {
      blockers.push("release.execution.fullWrapCover:minimum_raster_300_ppi_required");
    }
    if (fullWrap.byteLength > 650 * 1024 * 1024) {
      blockers.push("release.execution.fullWrapCover:maximum_650_mb_exceeded");
    } else if (fullWrap.byteLength > 40 * 1024 * 1024) {
      warnings.push("The print cover exceeds KDP's recommended 40 MB cover size and may process slowly.");
    }
  }
  const inspections = execution.inspections;
  const requiredPrintInspections: Array<keyof BookCoverInspectionEvidenceV1> = [
    "fontEmbeddingEvidenceId",
    "transparencyFlatteningEvidenceId",
    "noCropMarksEvidenceId",
    "noTemplateMarksEvidenceId",
    "pdfUnlockedEvidenceId",
    "templateMatchEvidenceId",
    "barcodeEvidenceId",
  ];
  for (const field of requiredPrintInspections) {
    if (!inspections[field]) {
      blockers.push(`release.execution.inspections.${String(field)}:required_for_print`);
    }
  }
  if (!plan.source.printGeometry) {
    blockers.push("release.plan.printGeometry:required_for_print");
  }
}

function requireNoPrintInspectionClaims(
  inspections: BookCoverInspectionEvidenceV1,
  blockers: string[],
): void {
  const printOnly: Array<keyof BookCoverInspectionEvidenceV1> = [
    "fontEmbeddingEvidenceId",
    "transparencyFlatteningEvidenceId",
    "noCropMarksEvidenceId",
    "noTemplateMarksEvidenceId",
    "pdfUnlockedEvidenceId",
    "templateMatchEvidenceId",
    "barcodeEvidenceId",
  ];
  if (printOnly.some((field) => inspections[field] !== undefined)) {
    blockers.push("release.execution.inspections:print_only_receipts_not_applicable_to_ebook");
  }
}

function toBookStudioEvidence(
  plan: BookCoverRenderPlanV1,
  execution: BookCoverRenderExecutionV1,
): BookStudioCoverEvidenceV1 {
  const source = plan.source;
  const printGeometry = source.printGeometry;
  const inspectionEvidenceIds = Object.values(execution.inspections).filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  return {
    frontCover: execution.frontCover,
    ...(execution.fullWrapCover ? { fullWrapCover: execution.fullWrapCover } : {}),
    textLayout: {
      renderer: "deterministic_layout",
      modelRenderedText: false,
      title: source.metadata.title,
      ...(source.metadata.subtitle ? { subtitle: source.metadata.subtitle } : {}),
      authorName: source.metadata.authorName,
      ...(source.metadata.seriesTitle
        ? { seriesTitle: source.metadata.seriesTitle }
        : {}),
      layers: source.typography.layers.map((layer) => ({
        role: layer.role,
        text: layer.text,
        fontFamily: layer.fontFamily,
        fontLicenseEvidenceId: layer.fontLicenseEvidenceId,
      })),
    },
    artwork: {
      provenanceMode: source.sourceArtwork.provenanceMode,
      rightsEvidenceIds: [...source.sourceArtwork.rightsEvidenceIds],
      artDirectionEvidenceId: source.artDirection.approvalEvidenceId,
      originalityReviewEvidenceId:
        source.sourceArtwork.originalityReviewEvidenceId,
      styleThesis: source.artDirection.styleThesis,
      genericPatternsRejected: [...source.artDirection.genericPatternsRejected],
    },
    ...(printGeometry
      ? {
          printGeometry: {
            trimWidthInches: printGeometry.trimWidthInches,
            trimHeightInches: printGeometry.trimHeightInches,
            pageCount: printGeometry.pageCount,
            bleedInches: printGeometry.bleedInches,
            spineWidthInches: printGeometry.spineWidthInches,
            barcodeReserved: printGeometry.barcode.reserveClear,
            coverTemplateFingerprint:
              printGeometry.templateFingerprintSha256,
          },
        }
      : {}),
    inspectionEvidenceIds: unique(inspectionEvidenceIds),
  };
}

function requirementsFor(format: BookCoverFormat): BookCoverOutputRequirementsV1 {
  const frontCover = {
    mediaTypes: ["image/jpeg", "image/tiff"] as const,
    minimumWidthPx: 625 as const,
    minimumHeightPx: 1000 as const,
    idealWidthPx: 1600 as const,
    idealHeightPx: 2560 as const,
    maximumWidthPx: 10000 as const,
    maximumHeightPx: 10000 as const,
    minimumHeightToWidthRatio: 1.6 as const,
    maximumBytesExclusive: 52428800 as const,
    preferredMinimumPpi: 300 as const,
    requiredColourSpace: "RGB" as const,
  };
  if (format === "kindle_ebook") return { frontCover };
  return {
    frontCover,
    fullWrapCover: {
      mediaType: "application/pdf",
      maximumBytes: 681574400,
      recommendedMaximumBytes: 41943040,
      minimumRasterPpi: 300,
      pageCount: 1,
      fontsEmbedded: true,
      transparenciesFlattened: true,
      cropMarksAbsent: true,
      templateMarksAbsent: true,
      unlocked: true,
    },
  };
}

function parseArtifact(
  value: unknown,
  label: string,
  blockers: string[],
): BookCoverArtifactV1 {
  const input = record(value);
  if (!input) {
    blockers.push(`${label}:object_required`);
    return emptyArtifact();
  }
  rejectUnknown(input, ARTIFACT_FIELDS, label, blockers);
  const mediaType = requiredText(input.mediaType, `${label}.mediaType`, blockers, 128);
  if (!MEDIA_TYPE.test(mediaType)) blockers.push(`${label}.mediaType:invalid`);
  const objectId = requiredText(input.objectId, `${label}.objectId`, blockers, 500);
  if (!OBJECT_ID.test(objectId) || objectId.includes("..")) {
    blockers.push(`${label}.objectId:invalid`);
  }
  if (input.immutable !== true) blockers.push(`${label}.immutable:must_be_true`);
  const widthPx = optionalInteger(input.widthPx, `${label}.widthPx`, blockers, 1, 100000);
  const heightPx = optionalInteger(input.heightPx, `${label}.heightPx`, blockers, 1, 100000);
  const ppi = optionalInteger(input.ppi, `${label}.ppi`, blockers, 1, 2400);
  const colourSpace =
    input.colourSpace === undefined
      ? undefined
      : enumValue(
          input.colourSpace,
          COLOUR_VALUES,
          `${label}.colourSpace`,
          blockers,
          "RGB",
        );
  const pageCount = optionalInteger(
    input.pageCount,
    `${label}.pageCount`,
    blockers,
    1,
    10000,
  );
  return {
    artifactId: safeId(input.artifactId, `${label}.artifactId`, blockers),
    objectId,
    sha256: safeSha(input.sha256, `${label}.sha256`, blockers),
    mediaType,
    byteLength: integer(
      input.byteLength,
      `${label}.byteLength`,
      blockers,
      1,
      4_000_000_000,
    ),
    immutable: true,
    ...(widthPx === undefined ? {} : { widthPx }),
    ...(heightPx === undefined ? {} : { heightPx }),
    ...(ppi === undefined ? {} : { ppi }),
    ...(colourSpace === undefined ? {} : { colourSpace }),
    ...(pageCount === undefined ? {} : { pageCount }),
  };
}

function requireExactLayer(
  layers: BookCoverTypographyLayerV1[],
  role: BookCoverTypographyRole,
  expected: string,
  blockers: string[],
): void {
  const layer = layers.find((candidate) => candidate.role === role);
  if (!layer) blockers.push(`plan.typography.layers:${role}_required`);
  else if (layer.text !== expected) {
    blockers.push(`plan.typography.layers:${role}_must_match_metadata_exactly`);
  }
}

function record(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function rejectUnknown(
  input: UnknownRecord,
  allowed: ReadonlySet<string>,
  label: string,
  blockers: string[],
): void {
  const unknown = Object.keys(input).filter((key) => !allowed.has(key)).sort();
  if (unknown.length) blockers.push(`${label}:unsupported_fields:${unknown.join(",")}`);
}

function requiredText(
  value: unknown,
  label: string,
  blockers: string[],
  maximum: number,
): string {
  if (typeof value !== "string") {
    blockers.push(`${label}:string_required`);
    return "";
  }
  const result = value.trim();
  if (!result) blockers.push(`${label}:required`);
  if (result.length > maximum || result.includes("\0")) {
    blockers.push(`${label}:invalid_length_or_nul`);
  }
  return result;
}

function optionalText(
  value: unknown,
  label: string,
  blockers: string[],
  maximum: number,
): string | undefined {
  if (value === undefined) return undefined;
  return requiredText(value, label, blockers, maximum);
}

function safeId(value: unknown, label: string, blockers: string[]): string {
  const result = requiredText(value, label, blockers, 300);
  if (!SAFE_ID.test(result)) blockers.push(`${label}:invalid_id`);
  return result;
}

function safeSha(value: unknown, label: string, blockers: string[]): string {
  const result = requiredText(value, label, blockers, 71);
  if (!SHA256.test(result)) blockers.push(`${label}:invalid_sha256`);
  return result;
}

function canonicalTimestamp(
  value: unknown,
  label: string,
  blockers: string[],
): string {
  const result = requiredText(value, label, blockers, 30);
  if (!ISO_TIMESTAMP.test(result) || Number.isNaN(Date.parse(result))) {
    blockers.push(`${label}:canonical_utc_iso_required`);
  }
  return result;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  label: string,
  blockers: string[],
  fallback: T,
): T {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    blockers.push(`${label}:unsupported`);
    return fallback;
  }
  return value as T;
}

function number(
  value: unknown,
  label: string,
  blockers: string[],
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    blockers.push(`${label}:finite_number_required`);
    return minimum;
  }
  if (value < minimum || value > maximum) blockers.push(`${label}:out_of_range`);
  return value;
}

function optionalNumber(
  value: unknown,
  label: string,
  blockers: string[],
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined) return undefined;
  return number(value, label, blockers, minimum, maximum);
}

function integer(
  value: unknown,
  label: string,
  blockers: string[],
  minimum: number,
  maximum: number,
): number {
  const result = number(value, label, blockers, minimum, maximum);
  if (!Number.isInteger(result)) blockers.push(`${label}:integer_required`);
  return result;
}

function optionalInteger(
  value: unknown,
  label: string,
  blockers: string[],
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined) return undefined;
  return integer(value, label, blockers, minimum, maximum);
}

function boolean(value: unknown, label: string, blockers: string[]): boolean {
  if (typeof value !== "boolean") {
    blockers.push(`${label}:boolean_required`);
    return false;
  }
  return value;
}

function array(
  value: unknown,
  label: string,
  blockers: string[],
  minimum: number,
  maximum: number,
): unknown[] {
  if (!Array.isArray(value)) {
    blockers.push(`${label}:array_required`);
    return [];
  }
  if (value.length < minimum || value.length > maximum) {
    blockers.push(`${label}:length_out_of_range`);
  }
  return value;
}

function stringArray(
  value: unknown,
  label: string,
  blockers: string[],
  minimum: number,
  maximum: number,
): string[] {
  const result = array(value, label, blockers, minimum, maximum).map((item, index) =>
    requiredText(item, `${label}[${index}]`, blockers, 1000),
  );
  if (new Set(result.map((item) => item.toLocaleLowerCase("en-AU"))).size !== result.length) {
    blockers.push(`${label}:duplicates`);
  }
  return result;
}

function idArray(
  value: unknown,
  label: string,
  blockers: string[],
  minimum: number,
  maximum: number,
): string[] {
  const result = array(value, label, blockers, minimum, maximum).map((item, index) =>
    safeId(item, `${label}[${index}]`, blockers),
  );
  if (new Set(result).size !== result.length) blockers.push(`${label}:duplicates`);
  return result;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

async function fingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function canonical(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite number cannot be fingerprinted.");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonical);
  const input = record(value);
  if (!input) throw new TypeError("Unsupported fingerprint value.");
  const output: UnknownRecord = {};
  for (const key of Object.keys(input).sort()) {
    if (input[key] !== undefined) output[key] = canonical(input[key]);
  }
  return output;
}

function emptyIdentity(): BookCoverIdentityV1 {
  return {
    tenantId: "",
    workspaceId: "",
    projectId: "",
    bookId: "",
    manuscriptId: "",
    editionId: "",
    publicationId: "",
    requestId: "",
  };
}

function emptyArtifact(): BookCoverArtifactV1 {
  return {
    artifactId: "",
    objectId: "",
    sha256: "",
    mediaType: "",
    byteLength: 1,
    immutable: true,
  };
}

function emptyBarcode(): BookCoverBarcodePlanV1 {
  return {
    policy: "not_applicable",
    reservedWidthInches: 0,
    reservedHeightInches: 0,
    distanceFromSpineInches: 0,
    distanceFromTrimInches: 0,
    reserveClear: false,
    whiteBackground: false,
    blackBars: false,
    rightSideUp: false,
    squareToCover: false,
    flattenedIntoArtwork: false,
  };
}

function emptyPrintGeometry(): BookCoverPrintGeometryV1 {
  return {
    trimWidthInches: 3,
    trimHeightInches: 3,
    pageCount: 24,
    bleedInches: 0,
    spineWidthInches: 0.01,
    spineTextEnabled: false,
    spineTextClearanceInches: 0,
    templateArtifact: emptyArtifact(),
    templateFingerprintSha256: "",
    templateObservedAt: "",
    barcode: emptyBarcode(),
  };
}

function emptyInspections(): BookCoverInspectionEvidenceV1 {
  return {
    metadataMatchEvidenceId: "",
    spellingEvidenceId: "",
    thumbnailEvidenceId: "",
    contrastEvidenceId: "",
    safeZoneEvidenceId: "",
    outputOpenEvidenceId: "",
    dimensionsEvidenceId: "",
    colourProfileEvidenceId: "",
    rightsEvidenceId: "",
    originalityEvidenceId: "",
    fontLicenceEvidenceId: "",
  };
}
