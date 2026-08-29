import { createHash } from "node:crypto";
import type { BookCoverDesignIntelligenceResultV1 } from "./book-cover-design-intelligence.js";

export const BOOK_COVER_COMMERCIAL_RELEASE_SCHEMA_VERSION = 1 as const;
export const BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT =
  "evavo_art_book_cover_commercial_release_v1" as const;
export const BOOK_COVER_COMMERCIAL_MARKET_FRESHNESS_DAYS = 45 as const;

export type BookCoverCommercialReleaseStatus =
  | "blocked"
  | "needs_market_research"
  | "needs_retail_proofs"
  | "needs_human_review"
  | "ready_for_docs_composition";

export type BookCoverCommercialProofId =
  | "thumbnail_60px"
  | "thumbnail_96px"
  | "thumbnail_100px"
  | "thumbnail_120px"
  | "grayscale"
  | "blur_squint"
  | "retailer_light_dark"
  | "retailer_search_tile"
  | "kindle_library_tile"
  | "mobile_grayscale"
  | "three_second_glance"
  | "series_shelf"
  | "spine_shelf"
  | "full_wrap"
  | "full_size"
  | "audiobook_square"
  | "physical_print";

export interface BookCoverZeroCostExecutionV1 {
  mode: "local_first_zero_cost";
  localValidationCommand: string;
  githubHostedActionsRequired: false;
  paidCiRequired: false;
  paidCrawlerRequired: false;
  paidImageApiRequiredForValidation: false;
  vercelBackgroundWorkerRequired: false;
  requestTimeMarketplaceBrowsingAllowed: false;
  networkRequiredForValidation: false;
  workflowFilesAuthoritative: false;
}

export interface BookCoverCommercialMarketAuthoritySnapshotV1 {
  sourceRepository:
    | "EVAVO-STUDIO/Website"
    | "EVAVO-STUDIO/evavo-docs-suite";
  sourceOutputKind:
    | "book_cover_genre_market_authority"
    | "book_cover_market_positioning_authority"
    | "book_cover_commercial_direction_authority";
  sourceSchemaVersion: string;
  status:
    | "ready_for_art_direction"
    | "ready_for_concepts"
    | "ready_for_creative_route_generation"
    | "ready_for_production";
  projectId: string;
  bookId: string;
  evaluatedAt: string;
  authorityDigestSha256: string;
  evidencePolicyVersion: string;
  currentComparableCount: number;
  categoryLeaderCount: number;
  recentReleaseCount: number;
  adjacentOpportunityCount: number;
  categoryPathCount: number;
  distinctAuthorCount: number;
  visualModeCount: number;
  titleStyleCount: number;
  paletteFamilyCount: number;
  sourceHostCount: number;
  coverSnapshotDigestCount: number;
  recognitionSignals: string[];
  saturationRisks: string[];
  differentiators: string[];
  prohibitedImitations: string[];
  researchLimitations: string[];
  salesGuaranteeAllowed: false;
  competitorImitationAllowed: false;
  machineAutoApprovalAllowed: false;
  zeroCostExecution: BookCoverZeroCostExecutionV1;
}

export interface BookCoverCommercialSelectionV1 {
  routeId: string;
  candidateSetAuthorityDigestSha256: string;
  selectedCandidateId: string;
  selectedCandidateArtifactSha256: string;
  finalTextFreeArtworkSha256: string;
  selectedBy: string;
  selectedAt: string;
  selectionRationale: string[];
  independentCandidatesReviewed: number;
  pairwiseOriginalityReviewCompleted: true;
  candidateArtworkTextFree: true;
  editableTypographyDeferredToDocsSuite: true;
  humanFinishingCompleted: true;
  humanFinisherName: string;
  humanFinishingEvidenceSha256: string;
  automaticSelectionAllowed: false;
}

export interface BookCoverCommercialProofResultV1 {
  proofId: BookCoverCommercialProofId;
  status: "pass" | "fail";
  reviewedBy: string;
  reviewedAt: string;
  evidenceSha256: string;
  notes: string[];
}

export interface BookCoverCommercialRightsAndProvenanceV1 {
  sourceManifestSha256: string;
  rightsReviewStatus: "cleared";
  sourceProvenanceStatus: "complete";
  humanCraftEvidenceStatus: "complete";
  aiContentClassification:
    | "not_applicable"
    | "ai_assisted"
    | "ai_generated";
  kdpDisclosureAction:
    | "not_required"
    | "disclose_on_upload"
    | "confirm_before_upload";
  providerAndModelRecorded: boolean;
  sourceLicencesRecorded: true;
  finalArtworkRightsCleared: true;
  reviewedBy: string;
  reviewedAt: string;
  notes: string[];
}

export interface BookCoverCommercialHumanApprovalV1 {
  decision:
    | "approve_for_docs_composition"
    | "request_revision"
    | "reject";
  reviewerName: string;
  reviewerRole: string;
  reviewedAt: string;
  rationale: string[];
  acknowledgedWarnings: string[];
  confirmsMarketFitWithoutImitation: boolean;
  confirmsManuscriptSpecificity: boolean;
  confirmsTextFreeArtwork: boolean;
  confirmsNamedHumanFinishing: boolean;
}

export interface BookCoverCommercialReleaseInputV1 {
  outputKind: "evavo_art_book_cover_commercial_release_input";
  schemaVersion: typeof BOOK_COVER_COMMERCIAL_RELEASE_SCHEMA_VERSION;
  contract: typeof BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT;
  projectId: string;
  bookId: string;
  editionId?: string;
  compiledAt: string;
  marketAuthority: BookCoverCommercialMarketAuthoritySnapshotV1;
  designIntelligence: BookCoverDesignIntelligenceResultV1;
  selection: BookCoverCommercialSelectionV1;
  proofResults: BookCoverCommercialProofResultV1[];
  rightsAndProvenance: BookCoverCommercialRightsAndProvenanceV1;
  approval: BookCoverCommercialHumanApprovalV1;
  execution: BookCoverZeroCostExecutionV1;
  automaticSelectionAllowed: false;
  automaticPromotionAllowed: false;
  publicationAllowed: false;
}

export interface BookCoverCommercialReleaseAuthorityV1 {
  outputKind: "evavo_art_book_cover_commercial_release_authority";
  schemaVersion: typeof BOOK_COVER_COMMERCIAL_RELEASE_SCHEMA_VERSION;
  contract: typeof BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT;
  status: BookCoverCommercialReleaseStatus;
  allowedUse:
    | "diagnostic_only"
    | "market_research_only"
    | "art_revision_only"
    | "human_review_only"
    | "docs_suite_composition";
  projectId: string;
  bookId: string;
  editionId?: string;
  compiledAt: string;
  selectedRoute: {
    routeId: string;
    routeKind: string;
    routeLabel: string;
    selectedCandidateId: string;
  };
  boundEvidence: {
    marketAuthorityDigestSha256: string;
    designDirectionFingerprintSha256: string;
    candidateSetAuthorityDigestSha256: string;
    selectedCandidateArtifactSha256: string;
    finalTextFreeArtworkSha256: string;
    sourceManifestSha256: string;
    humanFinishingEvidenceSha256: string;
  };
  exactMetadataHandoff: {
    title: string;
    subtitle?: string;
    seriesTitle?: string;
    authorDisplayName: string;
    artworkTextPolicy: "text_free";
    typographyAuthority: "evavo-docs-suite";
  };
  marketEvidenceSummary: {
    evaluatedAt: string;
    ageDays: number;
    currentComparableCount: number;
    categoryLeaderCount: number;
    recentReleaseCount: number;
    adjacentOpportunityCount: number;
    categoryPathCount: number;
    distinctAuthorCount: number;
    sourceHostCount: number;
    coverSnapshotDigestCount: number;
  };
  proofSummary: {
    requiredProofIds: string[];
    suppliedProofIds: string[];
    passedProofCount: number;
    failedProofCount: number;
    missingProofIds: string[];
  };
  execution: BookCoverZeroCostExecutionV1;
  humanDecision: {
    selectionBy: string;
    finishingBy: string;
    rightsReviewBy: string;
    finalReviewBy: string;
    decision: BookCoverCommercialHumanApprovalV1["decision"];
  };
  docsSuiteCompositionAuthorized: boolean;
  automaticSelectionAllowed: false;
  automaticPromotionAllowed: false;
  publicationAllowed: false;
  blockers: string[];
  warnings: string[];
  requiredActions: string[];
  authorityDigestSha256: string;
}

export interface BookCoverCommercialReleaseCompilationResultV1 {
  outputKind: "evavo_art_book_cover_commercial_release_compilation_result";
  schemaVersion: typeof BOOK_COVER_COMMERCIAL_RELEASE_SCHEMA_VERSION;
  contract: typeof BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT;
  status: BookCoverCommercialReleaseStatus;
  authority: BookCoverCommercialReleaseAuthorityV1;
  blockers: string[];
  warnings: string[];
  docsSuiteCompositionAuthorized: boolean;
  automaticSelectionPerformed: false;
  automaticPromotionPerformed: false;
  publicationPerformed: false;
}

export interface BookCoverCommercialReleaseValidationV1 {
  valid: boolean;
  issues: string[];
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,299}$/;
const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const READY_MARKET_STATUSES = new Set([
  "ready_for_art_direction",
  "ready_for_concepts",
  "ready_for_creative_route_generation",
  "ready_for_production",
]);
const ZERO_COST_COMMAND =
  "node scripts/run-book-cover-commercial-release-local.mjs";

export function listBookCoverCommercialReleaseCapabilities() {
  return Object.freeze({
    outputKind: "evavo_art_book_cover_commercial_release_capabilities",
    schemaVersion: BOOK_COVER_COMMERCIAL_RELEASE_SCHEMA_VERSION,
    contract: BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT,
    capabilities: [
      "book.cover.commercial_release.compile",
      "book.cover.commercial_release.validate",
      "book.cover.docs_suite_handoff.authorize",
    ] as const,
    localValidationAuthoritative: true as const,
    githubHostedActionsRequired: false as const,
    vercelBackgroundWorkerRequired: false as const,
    paidCiRequired: false as const,
    automaticSelectionAllowed: false as const,
    automaticPromotionAllowed: false as const,
    publicationAllowed: false as const,
  });
}

export function compileBookCoverCommercialReleaseAuthority(
  value: unknown,
): BookCoverCommercialReleaseCompilationResultV1 {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const marketDeficits: string[] = [];
  const proofDeficits: string[] = [];
  const reviewDeficits: string[] = [];
  const input = isRecord(value)
    ? value as Partial<BookCoverCommercialReleaseInputV1>
    : {};

  if (!isRecord(value)) blockers.push("Commercial-release input must be one object.");
  if (
    input.outputKind !== "evavo_art_book_cover_commercial_release_input"
    || input.schemaVersion !== BOOK_COVER_COMMERCIAL_RELEASE_SCHEMA_VERSION
    || input.contract !== BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT
  ) {
    blockers.push("Commercial-release input kind, version or contract is invalid.");
  }

  const projectId = safeId(input.projectId, "projectId", blockers);
  const bookId = safeId(input.bookId, "bookId", blockers);
  const editionId = input.editionId === undefined
    ? undefined
    : safeId(input.editionId, "editionId", blockers);
  const compiledAt = timestamp(input.compiledAt, "compiledAt", blockers);

  for (const field of [
    "automaticSelectionAllowed",
    "automaticPromotionAllowed",
    "publicationAllowed",
  ] as const) {
    if (input[field] !== false) blockers.push(`${field} must remain false.`);
  }

  const execution = parseZeroCostExecution(input.execution, "execution", blockers);
  const market = parseMarketAuthority(
    input.marketAuthority,
    { projectId, bookId, compiledAt },
    blockers,
    marketDeficits,
    warnings,
  );
  const design = parseDesignIntelligence(
    input.designIntelligence,
    { bookId, editionId },
    blockers,
    warnings,
  );
  const selection = parseSelection(
    input.selection,
    design,
    compiledAt,
    blockers,
  );
  const proofSummary = parseProofs(
    input.proofResults,
    design.requiredProofIds,
    compiledAt,
    blockers,
    proofDeficits,
  );
  const rights = parseRights(input.rightsAndProvenance, compiledAt, blockers);
  const approval = parseApproval(
    input.approval,
    design.warnings,
    compiledAt,
    blockers,
    reviewDeficits,
  );

  if (!sameZeroCostExecution(execution, market.zeroCostExecution)) {
    blockers.push("Market authority and release execution policies differ.");
  }
  if (execution.localValidationCommand !== ZERO_COST_COMMAND) {
    warnings.push(`Recommended local command is ${ZERO_COST_COMMAND}.`);
  }
  if (
    rights.aiContentClassification === "ai_generated"
    && rights.kdpDisclosureAction !== "disclose_on_upload"
  ) {
    blockers.push("AI-generated cover content must be marked disclose_on_upload.");
  }
  if (
    rights.aiContentClassification !== "not_applicable"
    && !rights.providerAndModelRecorded
  ) {
    blockers.push("AI-assisted or AI-generated artwork requires provider and model records.");
  }

  const uniqueBlockers = unique(blockers).sort();
  const uniqueWarnings = unique(warnings).sort();
  const uniqueMarketDeficits = unique(marketDeficits).sort();
  const uniqueProofDeficits = unique(proofDeficits).sort();
  const uniqueReviewDeficits = unique(reviewDeficits).sort();
  const status: BookCoverCommercialReleaseStatus = uniqueBlockers.length
    ? "blocked"
    : uniqueMarketDeficits.length
      ? "needs_market_research"
      : uniqueProofDeficits.length
        ? "needs_retail_proofs"
        : uniqueReviewDeficits.length
          ? "needs_human_review"
          : "ready_for_docs_composition";
  const allowedUse: BookCoverCommercialReleaseAuthorityV1["allowedUse"] =
    status === "ready_for_docs_composition"
      ? "docs_suite_composition"
      : status === "needs_human_review"
        ? "human_review_only"
        : status === "needs_retail_proofs"
          ? "art_revision_only"
          : status === "needs_market_research"
            ? "market_research_only"
            : "diagnostic_only";
  const docsSuiteCompositionAuthorized = status === "ready_for_docs_composition";
  const requiredActions = unique([
    ...uniqueMarketDeficits,
    ...uniqueProofDeficits,
    ...uniqueReviewDeficits,
    ...uniqueBlockers.map((item) => `Resolve blocker: ${item}`),
  ]).sort();

  const unsigned: Omit<BookCoverCommercialReleaseAuthorityV1, "authorityDigestSha256"> = {
    outputKind: "evavo_art_book_cover_commercial_release_authority",
    schemaVersion: BOOK_COVER_COMMERCIAL_RELEASE_SCHEMA_VERSION,
    contract: BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT,
    status,
    allowedUse,
    projectId: projectId || "invalid",
    bookId: bookId || "invalid",
    ...(editionId ? { editionId } : {}),
    compiledAt,
    selectedRoute: {
      routeId: selection.routeId,
      routeKind: selection.routeKind,
      routeLabel: selection.routeLabel,
      selectedCandidateId: selection.selectedCandidateId,
    },
    boundEvidence: {
      marketAuthorityDigestSha256: normalizeDigest(market.authorityDigestSha256),
      designDirectionFingerprintSha256: normalizeDigest(design.directionFingerprint),
      candidateSetAuthorityDigestSha256: normalizeDigest(selection.candidateSetAuthorityDigestSha256),
      selectedCandidateArtifactSha256: normalizeDigest(selection.selectedCandidateArtifactSha256),
      finalTextFreeArtworkSha256: normalizeDigest(selection.finalTextFreeArtworkSha256),
      sourceManifestSha256: normalizeDigest(rights.sourceManifestSha256),
      humanFinishingEvidenceSha256: normalizeDigest(selection.humanFinishingEvidenceSha256),
    },
    exactMetadataHandoff: {
      title: design.title,
      ...(design.subtitle ? { subtitle: design.subtitle } : {}),
      ...(design.seriesTitle ? { seriesTitle: design.seriesTitle } : {}),
      authorDisplayName: design.authorDisplayName,
      artworkTextPolicy: "text_free",
      typographyAuthority: "evavo-docs-suite",
    },
    marketEvidenceSummary: {
      evaluatedAt: market.evaluatedAt,
      ageDays: market.ageDays,
      currentComparableCount: market.currentComparableCount,
      categoryLeaderCount: market.categoryLeaderCount,
      recentReleaseCount: market.recentReleaseCount,
      adjacentOpportunityCount: market.adjacentOpportunityCount,
      categoryPathCount: market.categoryPathCount,
      distinctAuthorCount: market.distinctAuthorCount,
      sourceHostCount: market.sourceHostCount,
      coverSnapshotDigestCount: market.coverSnapshotDigestCount,
    },
    proofSummary,
    execution,
    humanDecision: {
      selectionBy: selection.selectedBy,
      finishingBy: selection.humanFinisherName,
      rightsReviewBy: rights.reviewedBy,
      finalReviewBy: approval.reviewerName,
      decision: approval.decision,
    },
    docsSuiteCompositionAuthorized,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    publicationAllowed: false,
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
    requiredActions,
  };
  const authority: BookCoverCommercialReleaseAuthorityV1 = {
    ...unsigned,
    authorityDigestSha256: sha256(unsigned),
  };
  return {
    outputKind: "evavo_art_book_cover_commercial_release_compilation_result",
    schemaVersion: BOOK_COVER_COMMERCIAL_RELEASE_SCHEMA_VERSION,
    contract: BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT,
    status,
    authority,
    blockers: uniqueBlockers,
    warnings: uniqueWarnings,
    docsSuiteCompositionAuthorized,
    automaticSelectionPerformed: false,
    automaticPromotionPerformed: false,
    publicationPerformed: false,
  };
}

export function validateBookCoverCommercialReleaseAuthority(
  value: unknown,
): BookCoverCommercialReleaseValidationV1 {
  const issues: string[] = [];
  if (!isRecord(value)) return { valid: false, issues: ["Commercial-release authority must be one object."] };
  const authority = value as Partial<BookCoverCommercialReleaseAuthorityV1>;
  if (
    authority.outputKind !== "evavo_art_book_cover_commercial_release_authority"
    || authority.schemaVersion !== BOOK_COVER_COMMERCIAL_RELEASE_SCHEMA_VERSION
    || authority.contract !== BOOK_COVER_COMMERCIAL_RELEASE_CONTRACT
  ) issues.push("Commercial-release authority kind, version or contract is invalid.");
  if (!SAFE_ID.test(String(authority.projectId ?? ""))) issues.push("Commercial-release projectId is invalid.");
  if (!SAFE_ID.test(String(authority.bookId ?? ""))) issues.push("Commercial-release bookId is invalid.");
  if (authority.editionId !== undefined && !SAFE_ID.test(String(authority.editionId))) issues.push("Commercial-release editionId is invalid.");
  if (!isTimestamp(authority.compiledAt)) issues.push("Commercial-release compiledAt is invalid.");
  for (const evidenceDigest of Object.values(authority.boundEvidence ?? {})) {
    if (!isDigest(evidenceDigest)) issues.push("Commercial-release bound evidence contains an invalid SHA-256 digest.");
  }
  if (!isDigest(authority.authorityDigestSha256)) issues.push("Commercial-release authority digest is invalid.");
  if (authority.execution) parseZeroCostExecution(authority.execution, "authority.execution", issues);
  else issues.push("Commercial-release authority is missing zero-cost execution policy.");
  if (
    authority.automaticSelectionAllowed !== false
    || authority.automaticPromotionAllowed !== false
    || authority.publicationAllowed !== false
  ) issues.push("Commercial-release automatic or publication authority flags are invalid.");
  const status = authority.status;
  const ready = status === "ready_for_docs_composition";
  if (authority.docsSuiteCompositionAuthorized !== ready) issues.push("Docs Suite composition authorization differs from authority status.");
  if (ready) {
    if ((authority.blockers ?? []).length) issues.push("Ready commercial-release authority retains blockers.");
    if ((authority.requiredActions ?? []).length) issues.push("Ready commercial-release authority retains required actions.");
    if (authority.allowedUse !== "docs_suite_composition") issues.push("Ready commercial-release authority has the wrong allowed use.");
    if ((authority.proofSummary?.failedProofCount ?? 1) !== 0) issues.push("Ready commercial-release authority retains failed proofs.");
    if ((authority.proofSummary?.missingProofIds ?? ["missing"]).length !== 0) issues.push("Ready commercial-release authority retains missing proofs.");
    if (authority.humanDecision?.decision !== "approve_for_docs_composition") issues.push("Ready commercial-release authority lacks final human approval.");
  }
  if (authority.exactMetadataHandoff?.artworkTextPolicy !== "text_free") issues.push("Commercial-release artwork must remain text-free.");
  if (authority.exactMetadataHandoff?.typographyAuthority !== "evavo-docs-suite") issues.push("Commercial-release typography authority must be Docs Suite.");
  if (isDigest(authority.authorityDigestSha256)) {
    const { authorityDigestSha256: _discarded, ...unsigned } = authority as BookCoverCommercialReleaseAuthorityV1;
    if (sha256(unsigned) !== authority.authorityDigestSha256) issues.push("Commercial-release authority digest differs from its canonical contents.");
  }
  return { valid: issues.length === 0, issues: unique(issues).sort() };
}

export function assertBookCoverCommercialReleaseAuthority(
  value: unknown,
): asserts value is BookCoverCommercialReleaseAuthorityV1 {
  const validation = validateBookCoverCommercialReleaseAuthority(value);
  if (!validation.valid) throw new Error(validation.issues.join(" "));
}

function parseMarketAuthority(
  value: unknown,
  identity: { projectId: string; bookId: string; compiledAt: string },
  blockers: string[],
  deficits: string[],
  warnings: string[],
) {
  const record = isRecord(value) ? value : {};
  if (!isRecord(value)) blockers.push("marketAuthority must be one object.");
  const sourceRepository = record.sourceRepository;
  if (sourceRepository !== "EVAVO-STUDIO/Website" && sourceRepository !== "EVAVO-STUDIO/evavo-docs-suite") blockers.push("Market authority source repository is invalid.");
  if (![
    "book_cover_genre_market_authority",
    "book_cover_market_positioning_authority",
    "book_cover_commercial_direction_authority",
  ].includes(String(record.sourceOutputKind))) blockers.push("Market authority output kind is invalid.");
  if (!substantive(record.sourceSchemaVersion, 1, 100)) blockers.push("Market authority schema version is invalid.");
  if (!READY_MARKET_STATUSES.has(String(record.status))) deficits.push("Market authority must be approved for art direction or production.");
  match(record.projectId, identity.projectId, "Market authority project differs from the release project.", blockers);
  match(record.bookId, identity.bookId, "Market authority book differs from the release book.", blockers);
  const evaluatedAt = timestamp(record.evaluatedAt, "marketAuthority.evaluatedAt", blockers);
  const ageDays = ageInDays(identity.compiledAt, evaluatedAt);
  if (ageDays < -1) blockers.push("Market authority evaluation date is in the future.");
  if (ageDays > BOOK_COVER_COMMERCIAL_MARKET_FRESHNESS_DAYS) deficits.push(`Market authority is older than ${BOOK_COVER_COMMERCIAL_MARKET_FRESHNESS_DAYS} days.`);
  const authorityDigestSha256 = digest(record.authorityDigestSha256, "marketAuthority.authorityDigestSha256", blockers);
  if (!substantive(record.evidencePolicyVersion, 5, 160)) blockers.push("Market authority evidence policy version is invalid.");
  const metrics = {
    currentComparableCount: integer(record.currentComparableCount, 0, 10_000, "currentComparableCount", blockers),
    categoryLeaderCount: integer(record.categoryLeaderCount, 0, 10_000, "categoryLeaderCount", blockers),
    recentReleaseCount: integer(record.recentReleaseCount, 0, 10_000, "recentReleaseCount", blockers),
    adjacentOpportunityCount: integer(record.adjacentOpportunityCount, 0, 10_000, "adjacentOpportunityCount", blockers),
    categoryPathCount: integer(record.categoryPathCount, 0, 1_000, "categoryPathCount", blockers),
    distinctAuthorCount: integer(record.distinctAuthorCount, 0, 10_000, "distinctAuthorCount", blockers),
    visualModeCount: integer(record.visualModeCount, 0, 1_000, "visualModeCount", blockers),
    titleStyleCount: integer(record.titleStyleCount, 0, 1_000, "titleStyleCount", blockers),
    paletteFamilyCount: integer(record.paletteFamilyCount, 0, 1_000, "paletteFamilyCount", blockers),
    sourceHostCount: integer(record.sourceHostCount, 0, 1_000, "sourceHostCount", blockers),
    coverSnapshotDigestCount: integer(record.coverSnapshotDigestCount, 0, 10_000, "coverSnapshotDigestCount", blockers),
  };
  for (const [field, minimum] of Object.entries({
    currentComparableCount: 12,
    categoryLeaderCount: 3,
    recentReleaseCount: 3,
    adjacentOpportunityCount: 3,
    categoryPathCount: 2,
    distinctAuthorCount: 8,
    visualModeCount: 3,
    titleStyleCount: 2,
    paletteFamilyCount: 3,
    sourceHostCount: 2,
    coverSnapshotDigestCount: 6,
  })) {
    if (metrics[field as keyof typeof metrics] < minimum) deficits.push(`Market evidence requires ${field} of at least ${minimum}.`);
  }
  const recognitionSignals = texts(record.recognitionSignals, "recognitionSignals", 2, 24, blockers);
  const saturationRisks = texts(record.saturationRisks, "saturationRisks", 1, 24, blockers);
  const differentiators = texts(record.differentiators, "differentiators", 2, 24, blockers);
  const prohibitedImitations = texts(record.prohibitedImitations, "prohibitedImitations", 3, 36, blockers);
  const researchLimitations = texts(record.researchLimitations, "researchLimitations", 1, 24, blockers);
  void recognitionSignals;
  void saturationRisks;
  void differentiators;
  void prohibitedImitations;
  warnings.push(...researchLimitations.map((item) => `Market research limitation: ${item}`));
  for (const flag of ["salesGuaranteeAllowed", "competitorImitationAllowed", "machineAutoApprovalAllowed"] as const) {
    if (record[flag] !== false) blockers.push(`Market authority ${flag} must remain false.`);
  }
  const zeroCostExecution = parseZeroCostExecution(record.zeroCostExecution, "marketAuthority.zeroCostExecution", blockers);
  return {
    sourceRepository,
    evaluatedAt,
    ageDays,
    authorityDigestSha256,
    zeroCostExecution,
    ...metrics,
  };
}

function parseDesignIntelligence(
  value: unknown,
  identity: { bookId: string; editionId?: string },
  blockers: string[],
  warnings: string[],
) {
  const design = isRecord(value)
    ? value as Partial<BookCoverDesignIntelligenceResultV1>
    : {};
  if (!isRecord(value)) blockers.push("designIntelligence must be one object.");
  if (
    design.outputKind !== "evavo_art_book_cover_design_intelligence_result"
    || design.schemaVersion !== 1
    || design.contract !== "evavo_art_book_cover_design_intelligence_v1"
  ) blockers.push("Design-intelligence identity or contract is invalid.");
  if (design.status !== "ready" || !isRecord(design.direction)) blockers.push("Design intelligence must be ready with one direction.");
  match(design.bookId, identity.bookId, "Design intelligence book differs from the release book.", blockers);
  match(design.editionId ?? "", identity.editionId ?? "", "Design intelligence edition differs from the release edition.", blockers);
  for (const flag of ["providerCallPerformed", "selectionPerformed", "promotionPerformed", "publicationPerformed"] as const) {
    if (design[flag] !== false) blockers.push(`Design intelligence ${flag} must remain false.`);
  }
  warnings.push(...((Array.isArray(design.warnings) ? design.warnings : []).filter((item): item is string => typeof item === "string")));
  const direction: Record<string, unknown> = isRecord(design.direction)
    ? design.direction as unknown as Record<string, unknown>
    : {};
  const typography: Record<string, unknown> = isRecord(direction.typography)
    ? direction.typography
    : {};
  if (typography.authority !== "evavo-docs-suite" || typography.artworkTextPolicy !== "text_free") blockers.push("Design intelligence must defer editable typography to Docs Suite and require text-free artwork.");
  const routeRecords: Record<string, unknown>[] = Array.isArray(direction.routes)
    ? direction.routes.filter(isRecord)
    : [];
  if (routeRecords.length < 2) blockers.push("Design intelligence must retain at least two routes.");
  const routes = routeRecords.map((route) => ({
    routeId: safeId(route.routeId, "direction.routeId", blockers),
    routeKind: substantive(route.kind, 1, 160) ? String(route.kind) : (blockers.push("Direction route kind is invalid."), "invalid"),
    routeLabel: substantive(route.label, 1, 300) ? String(route.label) : (blockers.push("Direction route label is invalid."), "invalid"),
  }));
  const retailProofPlan: Record<string, unknown> = isRecord(direction.retailProofPlan)
    ? direction.retailProofPlan
    : {};
  const requiredProofIds: string[] = Array.isArray(retailProofPlan.requiredProofs)
    ? unique(retailProofPlan.requiredProofs
      .filter(isRecord)
      .map((proof) => String(proof.proofId ?? ""))
      .filter((proofId): proofId is string => proofId.length > 0))
    : [];
  if (requiredProofIds.length < 4) blockers.push("Design intelligence must require at least four retail proofs.");
  const directionFingerprint = digest(direction.directionFingerprint, "direction.directionFingerprint", blockers);
  return {
    title: substantive(typography.exactTitle, 1, 240) ? String(typography.exactTitle) : (blockers.push("Exact title is invalid."), ""),
    subtitle: optionalSubstantive(typography.exactSubtitle, 240, "Exact subtitle", blockers),
    seriesTitle: optionalSubstantive(typography.exactSeriesTitle, 240, "Exact series title", blockers),
    authorDisplayName: substantive(typography.exactAuthorDisplayName, 2, 180) ? String(typography.exactAuthorDisplayName) : (blockers.push("Exact author display name is invalid."), ""),
    routes,
    requiredProofIds,
    directionFingerprint,
    warnings: Array.isArray(design.warnings) ? design.warnings.filter((item): item is string => typeof item === "string") : [],
  };
}

function parseSelection(
  value: unknown,
  design: ReturnType<typeof parseDesignIntelligence>,
  compiledAt: string,
  blockers: string[],
) {
  const record = isRecord(value) ? value : {};
  if (!isRecord(value)) blockers.push("selection must be one object.");
  const routeId = safeId(record.routeId, "selection.routeId", blockers);
  const route = design.routes.find((item) => item.routeId === routeId);
  if (!route) blockers.push("Selected route is absent from design intelligence.");
  const selectedCandidateId = safeId(record.selectedCandidateId, "selectedCandidateId", blockers);
  const selectedBy = person(record.selectedBy, "selectedBy", blockers);
  const selectedAt = timestamp(record.selectedAt, "selectedAt", blockers);
  if (ageInDays(compiledAt, selectedAt) < -1) blockers.push("Selection occurs after commercial-release compilation.");
  const selectionRationale = texts(record.selectionRationale, "selectionRationale", 2, 12, blockers);
  void selectionRationale;
  const independentCandidatesReviewed = integer(record.independentCandidatesReviewed, 0, 100, "independentCandidatesReviewed", blockers);
  if (independentCandidatesReviewed < 3) blockers.push("At least three independent candidates must be reviewed.");
  for (const flag of [
    "pairwiseOriginalityReviewCompleted",
    "candidateArtworkTextFree",
    "editableTypographyDeferredToDocsSuite",
    "humanFinishingCompleted",
  ] as const) {
    if (record[flag] !== true) blockers.push(`Selection ${flag} must be true.`);
  }
  if (record.automaticSelectionAllowed !== false) blockers.push("Selection automaticSelectionAllowed must remain false.");
  return {
    routeId,
    routeKind: route?.routeKind ?? "invalid",
    routeLabel: route?.routeLabel ?? "invalid",
    selectedCandidateId,
    selectedBy,
    humanFinisherName: person(record.humanFinisherName, "humanFinisherName", blockers),
    candidateSetAuthorityDigestSha256: digest(record.candidateSetAuthorityDigestSha256, "candidateSetAuthorityDigestSha256", blockers),
    selectedCandidateArtifactSha256: digest(record.selectedCandidateArtifactSha256, "selectedCandidateArtifactSha256", blockers),
    finalTextFreeArtworkSha256: digest(record.finalTextFreeArtworkSha256, "finalTextFreeArtworkSha256", blockers),
    humanFinishingEvidenceSha256: digest(record.humanFinishingEvidenceSha256, "humanFinishingEvidenceSha256", blockers),
  };
}

function parseProofs(
  value: unknown,
  requiredProofIds: string[],
  compiledAt: string,
  blockers: string[],
  deficits: string[],
): BookCoverCommercialReleaseAuthorityV1["proofSummary"] {
  if (!Array.isArray(value)) {
    blockers.push("proofResults must be an array.");
    value = [];
  }
  const records = (value as unknown[]).filter(isRecord);
  const seen = new Set<string>();
  let passedProofCount = 0;
  let failedProofCount = 0;
  for (const [index, proof] of records.entries()) {
    const proofId = safeId(proof.proofId, `proofResults[${index}].proofId`, blockers);
    if (seen.has(proofId)) blockers.push(`Proof ${proofId} is duplicated.`);
    seen.add(proofId);
    if (proof.status === "pass") passedProofCount += 1;
    else if (proof.status === "fail") {
      failedProofCount += 1;
      deficits.push(`Retail proof ${proofId} must pass.`);
    } else blockers.push(`Proof ${proofId} status is invalid.`);
    person(proof.reviewedBy, `proof ${proofId} reviewedBy`, blockers);
    const reviewedAt = timestamp(proof.reviewedAt, `proof ${proofId} reviewedAt`, blockers);
    if (ageInDays(compiledAt, reviewedAt) < -1) blockers.push(`Proof ${proofId} occurs after commercial-release compilation.`);
    digest(proof.evidenceSha256, `proof ${proofId} evidenceSha256`, blockers);
    texts(proof.notes, `proof ${proofId} notes`, 1, 12, blockers);
  }
  const missingProofIds = requiredProofIds.filter((proofId) => !seen.has(proofId));
  for (const proofId of missingProofIds) deficits.push(`Required retail proof ${proofId} is missing.`);
  return {
    requiredProofIds: [...requiredProofIds].sort(),
    suppliedProofIds: [...seen].sort(),
    passedProofCount,
    failedProofCount,
    missingProofIds: [...missingProofIds].sort(),
  };
}

function parseRights(
  value: unknown,
  compiledAt: string,
  blockers: string[],
) {
  const record = isRecord(value) ? value : {};
  if (!isRecord(value)) blockers.push("rightsAndProvenance must be one object.");
  if (record.rightsReviewStatus !== "cleared") blockers.push("Artwork rights review must be cleared.");
  if (record.sourceProvenanceStatus !== "complete") blockers.push("Artwork source provenance must be complete.");
  if (record.humanCraftEvidenceStatus !== "complete") blockers.push("Human craft evidence must be complete.");
  const aiContentClassification = ["not_applicable", "ai_assisted", "ai_generated"].includes(String(record.aiContentClassification))
    ? record.aiContentClassification as BookCoverCommercialRightsAndProvenanceV1["aiContentClassification"]
    : (blockers.push("AI content classification is invalid."), "not_applicable" as const);
  const kdpDisclosureAction = ["not_required", "disclose_on_upload", "confirm_before_upload"].includes(String(record.kdpDisclosureAction))
    ? record.kdpDisclosureAction as BookCoverCommercialRightsAndProvenanceV1["kdpDisclosureAction"]
    : (blockers.push("KDP disclosure action is invalid."), "confirm_before_upload" as const);
  if (record.sourceLicencesRecorded !== true) blockers.push("Source licences must be recorded.");
  if (record.finalArtworkRightsCleared !== true) blockers.push("Final artwork rights must be cleared.");
  const reviewedAt = timestamp(record.reviewedAt, "rights reviewedAt", blockers);
  if (ageInDays(compiledAt, reviewedAt) < -1) blockers.push("Rights review occurs after commercial-release compilation.");
  texts(record.notes, "rights notes", 1, 20, blockers);
  return {
    sourceManifestSha256: digest(record.sourceManifestSha256, "sourceManifestSha256", blockers),
    aiContentClassification,
    kdpDisclosureAction,
    providerAndModelRecorded: record.providerAndModelRecorded === true,
    reviewedBy: person(record.reviewedBy, "rights reviewedBy", blockers),
  };
}

function parseApproval(
  value: unknown,
  designWarnings: string[],
  compiledAt: string,
  blockers: string[],
  deficits: string[],
) {
  const record = isRecord(value) ? value : {};
  if (!isRecord(value)) blockers.push("approval must be one object.");
  const decision = ["approve_for_docs_composition", "request_revision", "reject"].includes(String(record.decision))
    ? record.decision as BookCoverCommercialHumanApprovalV1["decision"]
    : (blockers.push("Commercial-release approval decision is invalid."), "reject" as const);
  const reviewerName = person(record.reviewerName, "approval reviewerName", blockers);
  person(record.reviewerRole, "approval reviewerRole", blockers);
  const reviewedAt = timestamp(record.reviewedAt, "approval reviewedAt", blockers);
  if (ageInDays(compiledAt, reviewedAt) < -1) blockers.push("Final approval occurs after commercial-release compilation.");
  texts(record.rationale, "approval rationale", 2, 16, blockers);
  const acknowledgedWarnings = texts(record.acknowledgedWarnings, "acknowledgedWarnings", 0, 64, blockers);
  for (const warning of designWarnings) if (!acknowledgedWarnings.includes(warning)) deficits.push(`Final reviewer must acknowledge design warning: ${warning}`);
  for (const flag of [
    "confirmsMarketFitWithoutImitation",
    "confirmsManuscriptSpecificity",
    "confirmsTextFreeArtwork",
    "confirmsNamedHumanFinishing",
  ] as const) {
    if (record[flag] !== true) deficits.push(`Final human approval must confirm ${flag}.`);
  }
  if (decision !== "approve_for_docs_composition") deficits.push("A named reviewer must approve the cover for Docs Suite composition.");
  return { decision, reviewerName };
}

function parseZeroCostExecution(
  value: unknown,
  label: string,
  blockers: string[],
): BookCoverZeroCostExecutionV1 {
  const record = isRecord(value) ? value : {};
  if (!isRecord(value)) blockers.push(`${label} must be one object.`);
  if (record.mode !== "local_first_zero_cost") blockers.push(`${label}.mode must be local_first_zero_cost.`);
  const localValidationCommand = substantive(record.localValidationCommand, 8, 500)
    ? String(record.localValidationCommand)
    : (blockers.push(`${label}.localValidationCommand is invalid.`), ZERO_COST_COMMAND);
  for (const field of [
    "githubHostedActionsRequired",
    "paidCiRequired",
    "paidCrawlerRequired",
    "paidImageApiRequiredForValidation",
    "vercelBackgroundWorkerRequired",
    "requestTimeMarketplaceBrowsingAllowed",
    "networkRequiredForValidation",
    "workflowFilesAuthoritative",
  ] as const) if (record[field] !== false) blockers.push(`${label}.${field} must remain false.`);
  return {
    mode: "local_first_zero_cost",
    localValidationCommand,
    githubHostedActionsRequired: false,
    paidCiRequired: false,
    paidCrawlerRequired: false,
    paidImageApiRequiredForValidation: false,
    vercelBackgroundWorkerRequired: false,
    requestTimeMarketplaceBrowsingAllowed: false,
    networkRequiredForValidation: false,
    workflowFilesAuthoritative: false,
  };
}

function sameZeroCostExecution(
  first: BookCoverZeroCostExecutionV1,
  second: BookCoverZeroCostExecutionV1,
): boolean {
  return canonical(first) === canonical(second);
}
function match(actual: unknown, expected: unknown, message: string, blockers: string[]) {
  if (actual !== expected) blockers.push(message);
}
function safeId(value: unknown, label: string, blockers: string[]): string {
  if (typeof value === "string" && SAFE_ID.test(value) && !["__proto__", "constructor", "prototype"].includes(value)) return value;
  blockers.push(`${label} is invalid.`);
  return "invalid";
}
function person(value: unknown, label: string, blockers: string[]): string {
  if (substantive(value, 2, 300)) return String(value);
  blockers.push(`${label} is invalid.`);
  return "invalid";
}
function timestamp(value: unknown, label: string, blockers: string[]): string {
  if (isTimestamp(value)) return value;
  blockers.push(`${label} must be canonical UTC ISO-8601.`);
  return "1970-01-01T00:00:00.000Z";
}
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_TIME.test(value) && Number.isFinite(Date.parse(value));
}
function digest(value: unknown, label: string, blockers: string[]): string {
  if (isDigest(value)) return normalizeDigest(value);
  blockers.push(`${label} must be one SHA-256 digest.`);
  return `sha256:${"0".repeat(64)}`;
}
function isDigest(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}
function normalizeDigest(value: string): string {
  return value.startsWith("sha256:") ? value : `sha256:${value}`;
}
function integer(value: unknown, minimum: number, maximum: number, label: string, blockers: string[]): number {
  if (Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum) return value as number;
  blockers.push(`${label} must be an integer from ${minimum} to ${maximum}.`);
  return minimum;
}
function texts(value: unknown, label: string, minimum: number, maximum: number, blockers: string[]): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum || !value.every((item) => substantive(item, 1, 1_000))) {
    blockers.push(`${label} must contain ${minimum} to ${maximum} substantive text values.`);
    return [];
  }
  return unique(value as string[]);
}
function substantive(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === "string" && value === value.trim() && value.length >= minimum && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
}
function optionalSubstantive(value: unknown, maximum: number, label: string, blockers: string[]): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (substantive(value, 1, maximum)) return value;
  blockers.push(`${label} is invalid.`);
  return undefined;
}
function ageInDays(later: string, earlier: string): number {
  const laterTime = Date.parse(later);
  const earlierTime = Date.parse(earlier);
  if (!Number.isFinite(laterTime) || !Number.isFinite(earlierTime)) return Number.POSITIVE_INFINITY;
  return Math.floor((laterTime - earlierTime) / 86_400_000);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
}
function sha256(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;
}
