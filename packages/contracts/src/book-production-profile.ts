import type {
  BookArtBriefV1,
  BookArtIdentityV1,
  BookArtPurpose,
  BookArtValidationResult,
} from "./book-production.js";
import { BOOK_ART_HANDOFF_CONTRACT, validateBookArtBrief } from "./book-production.js";

export const BOOK_ART_PROFILE_SCHEMA_VERSION = 1 as const;
export const BOOK_ART_PROFILE_CONTRACT = "evavo_book_art_profile_v1" as const;

export type BookArtProductionAssetClass =
  | "cover_background"
  | "interior_illustration"
  | "diagram"
  | "map"
  | "ornament";

export type BookArtProviderAssetKind = "print" | "illustration";
export type BookArtProviderTransparency = "required" | "preferred" | "opaque";
export type BookArtProviderBackgroundStrategy = "native-alpha" | "provider-auto" | "opaque-source";

export interface BookArtProviderRequestV1 {
  schemaVersion: "1.0";
  operation: "generate";
  assetKind: BookArtProviderAssetKind;
  continuityPhase: "independent";
  requestId: string;
  assetId: string;
  candidateFamilyId: string;
  creativeIntent: string;
  negativeIntent: string;
  style: {
    styleName: string;
    intent: string;
    mustHave: string[];
    mustAvoid: string[];
    identityLocks: string[];
    palette: string[];
    lineTreatment: string[];
    materials: string[];
    cameraRules: string[];
    compositionRules: string[];
    eraRules: string[];
  };
  shot: {
    subject: string;
    include: string[];
    exclude: string[];
    separateAssets: string[];
    framing: string[];
  };
  target: {
    width: number;
    height: number;
    transparency: BookArtProviderTransparency;
    outputFormat: "png";
  };
  background: {
    strategy: BookArtProviderBackgroundStrategy;
  };
  quality: "standard" | "high";
  candidateCount: 1;
  selection: {
    allowedAdapterIds: string[];
    allowFallback: false;
    requireSeed: false;
  };
  metadata: {
    workspaceId: string;
    projectId: string;
    bookId: string;
    editionId?: string;
    bookRequestId: string;
    purpose: BookArtPurpose;
    manuscriptRevisionId: string;
    manuscriptSha256: string;
    extractedTextSha256: string;
    visualCanonSha256: string;
    artDirectionSha256: string;
    sourceBriefFingerprint: string;
    conceptTerritoryId: string;
    rightsEvidenceIds: string[];
    providerCandidateMayBeFinal: false;
    publicationPerformed: false;
  };
}

export interface BookArtProductionWorkOrderV1 {
  outputKind: "evavo_book_art_production_work_order";
  schemaVersion: typeof BOOK_ART_PROFILE_SCHEMA_VERSION;
  contract: typeof BOOK_ART_PROFILE_CONTRACT;
  handoffContract: typeof BOOK_ART_HANDOFF_CONTRACT;
  identity: BookArtIdentityV1;
  purpose: BookArtPurpose;
  assetClass: BookArtProductionAssetClass;
  sourceBriefFingerprint: string;
  providerRequest: BookArtProviderRequestV1;
  technicalRequirements: {
    deliveryWidthPx: number;
    deliveryHeightPx: number;
    minimumPpi?: number;
    allowedDeliveryMimeTypes: string[];
    colourIntent: "rgb" | "grayscale" | "monochrome" | "cmyk_conversion_required";
    alpha: "required" | "forbidden" | "allowed";
    textPolicy: "text_free" | "exact_editable_labels_only";
    printUse: boolean;
    digitalUse: boolean;
    providerCandidateIntermediateFormat: "image/png";
    masteringRequired: true;
  };
  authorityBoundary: {
    artStudioOwns: string[];
    docsSuiteOwns: string[];
    forbiddenInputAuthorities: string[];
  };
  sourceEvidence: {
    manuscriptRevisionId: string;
    manuscriptSha256: string;
    extractedTextSha256: string;
    visualCanonSha256: string;
    artDirectionSha256: string;
    approvedEvidenceIds: string[];
    rightsEvidenceIds: string[];
  };
  workOrderFingerprintSha256: string;
  authoritativeWritesPerformed: false;
  providerCandidateMayBeFinal: false;
  selectionRequired: true;
  promotionRequired: true;
  bookUseBindingRequired: true;
  artifactBytesRewritten: false;
  canonicalRendererMustVerifyBytes: true;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export interface BookArtProductionWorkOrderCompilationResultV1 {
  outputKind: "evavo_book_art_production_work_order_compilation_result";
  schemaVersion: typeof BOOK_ART_PROFILE_SCHEMA_VERSION;
  status: "blocked" | "ready";
  identity: BookArtIdentityV1;
  workOrder?: BookArtProductionWorkOrderV1;
  blockers: string[];
  warnings: string[];
  authoritativeWritesPerformed: false;
  providerCandidateMayBeFinal: false;
  promotionRequired: true;
  artifactBytesRewritten: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export interface LegacyWebsiteBookArtPlanTranslationInputV1 {
  outputKind: "evavo_legacy_website_book_art_plan_translation_input";
  schemaVersion: typeof BOOK_ART_PROFILE_SCHEMA_VERSION;
  brief: unknown;
  legacyPlan: unknown;
  candidateId: string;
}

export interface LegacyWebsiteBookArtPlanEvidenceV1 {
  sourceRepository: "EVAVO-STUDIO/Website";
  planOutputKind?: string;
  planVersion?: string;
  legacyProjectId?: string;
  legacyRunId?: string;
  legacyCandidateId?: string;
  legacyTerritoryId?: string;
  legacyPromptDigestSha256?: string;
  legacyPlanDigestSha256?: string;
  legacyInputDigestSha256?: string;
  legacySceneDigestSha256?: string;
  legacyArtDirectionDigestSha256?: string;
  legacyTaskState?: string;
  rawLegacyPromptRetained: false;
  sourceReferenceRetained: true;
  artifactBytesRead: false;
  artifactBytesRewritten: false;
}

export interface LegacyWebsiteBookArtPlanTranslationResultV1 {
  outputKind: "evavo_legacy_website_book_art_plan_translation_result";
  schemaVersion: typeof BOOK_ART_PROFILE_SCHEMA_VERSION;
  status: "blocked" | "ready_for_shadow_comparison";
  identity: BookArtIdentityV1;
  workOrder?: BookArtProductionWorkOrderV1;
  legacyEvidence: LegacyWebsiteBookArtPlanEvidenceV1;
  blockers: string[];
  warnings: string[];
  shadowOnly: true;
  rawLegacyPromptTrustedAsAuthority: false;
  authoritativeWritesPerformed: false;
  providerCandidateMayBeFinal: false;
  promotionRequired: true;
  artifactBytesRead: false;
  artifactBytesRewritten: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/;
const PROVIDER_SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
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
const COLOUR_INTENTS = new Set(["rgb", "grayscale", "monochrome", "cmyk_conversion_required"] as const);
const ALPHA_POLICIES = new Set(["required", "forbidden", "allowed"] as const);
const TEXT_POLICIES = new Set(["text_free", "exact_editable_labels_only"] as const);
const MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/tiff"]);
const TOP_LEVEL_FIELDS = new Set([
  "outputKind", "schemaVersion", "contract", "identity", "purpose", "manuscript",
  "conceptTerritoryId", "conceptTerritoryLabel", "creativeThesis", "primarySubject",
  "supportingSubjects", "compositionRequirements", "mustShow", "mustNotShow",
  "spoilerRestrictions", "continuityRequirements", "historicalAndMaterialRequirements",
  "negativeSpaceRequirements", "output", "rightsEvidenceIds", "createdAt",
  "briefFingerprint", "providerCandidateMayBeFinal", "publicationPerformed",
]);
const IDENTITY_FIELDS = new Set(["workspaceId", "projectId", "bookId", "editionId", "requestId"]);
const MANUSCRIPT_FIELDS = new Set([
  "manuscriptRevisionId", "manuscriptSha256", "extractedTextSha256", "visualCanonSha256",
  "artDirectionSha256", "approvedEvidenceIds",
]);
const OUTPUT_FIELDS = new Set([
  "widthPx", "heightPx", "minimumPpi", "allowedMimeTypes", "colourIntent", "alpha",
  "textPolicy", "printUse", "digitalUse",
]);
const TRANSLATION_FIELDS = new Set(["outputKind", "schemaVersion", "brief", "legacyPlan", "candidateId"]);
const LEGACY_PLAN_FIELDS = new Set([
  "outputKind", "version", "status", "projectId", "runId", "requestedAt", "profile",
  "sceneDigestSha256", "artDirectionDigestSha256", "publicationTextDigestSha256",
  "directionStatus", "providerProfile", "maximumRefinementRounds", "genreProfiles",
  "conceptTerritories", "tasks", "nextCandidateId", "completedCandidateIds", "hardErrors",
  "warnings", "executionRules", "blockedClaims", "inputSnapshot", "inputDigestSha256",
  "planDigestSha256",
]);
const LEGACY_TASK_FIELDS = new Set([
  "candidateId", "order", "territoryId", "territoryLabel", "territoryArchetype",
  "variationId", "prompt", "promptDigestSha256", "expectedWidthPx", "expectedHeightPx",
  "flattenBackgroundHex", "idempotencyKey", "state", "completedEvidence", "stopConditions",
]);
const FORBIDDEN_AUTHORITY_KEYS = [
  "title", "subtitle", "author", "contributor", "spine", "isbn", "barcode", "kdp",
  "trim", "bleed", "pagecount", "page_count", "price", "pricing", "publication",
  "backcovercopy", "back_cover_copy", "metadata", "keywords", "categories",
];

export async function fingerprintBookArtBrief(
  value: Omit<BookArtBriefV1, "briefFingerprint"> | BookArtBriefV1,
): Promise<string> {
  const { briefFingerprint: _discarded, ...unsigned } =
    value as BookArtBriefV1;
  return `sha256:${await sha256(canonicalJson(unsigned))}`;
}

export async function compileBookArtProductionWorkOrder(
  value: unknown,
): Promise<BookArtProductionWorkOrderCompilationResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const input = record(value);
  if (!input) {
    return blockedCompilation(emptyIdentity(), ["Book Art production brief must be one object."], warnings);
  }
  rejectUnknownFields(input, TOP_LEVEL_FIELDS, "Book Art production brief", blockers);
  const identityRecord = record(input.identity);
  const manuscriptRecord = record(input.manuscript);
  const outputRecord = record(input.output);
  if (!identityRecord) blockers.push("Book Art production brief identity must be an object.");
  else rejectUnknownFields(identityRecord, IDENTITY_FIELDS, "Book Art production brief identity", blockers);
  if (!manuscriptRecord) blockers.push("Book Art production brief manuscript must be an object.");
  else rejectUnknownFields(manuscriptRecord, MANUSCRIPT_FIELDS, "Book Art production brief manuscript", blockers);
  if (!outputRecord) blockers.push("Book Art production brief output must be an object.");
  else rejectUnknownFields(outputRecord, OUTPUT_FIELDS, "Book Art production brief output", blockers);
  const identity = parseIdentity(identityRecord);
  rejectForbiddenAuthorityKeys(input, blockers);
  const brief = input as unknown as BookArtBriefV1;
  let validation: BookArtValidationResult;
  try { validation = validateBookArtBrief(brief); }
  catch (error) {
    validation = { valid: false, issues: [message(error, "Book Art brief validation failed.")] };
  }
  blockers.push(...validation.issues);
  if (validation.valid) {
    const expectedBriefFingerprint = await fingerprintBookArtBrief(brief);
    if (
      normalizeSha(brief.briefFingerprint) !==
      normalizeSha(expectedBriefFingerprint)
    ) {
      blockers.push(
        "Book Art production brief fingerprint differs from its exact canonical contents.",
      );
    }
  }
  validateProfileFields(brief, blockers);
  if (blockers.length) return blockedCompilation(identity, unique(blockers), warnings);

  const providerRequest = providerRequestFor(brief);
  const withoutFingerprint: Omit<BookArtProductionWorkOrderV1, "workOrderFingerprintSha256"> = {
    outputKind: "evavo_book_art_production_work_order",
    schemaVersion: BOOK_ART_PROFILE_SCHEMA_VERSION,
    contract: BOOK_ART_PROFILE_CONTRACT,
    handoffContract: BOOK_ART_HANDOFF_CONTRACT,
    identity: cloneIdentity(brief.identity),
    purpose: brief.purpose,
    assetClass: assetClassFor(brief.purpose),
    sourceBriefFingerprint: normalizeSha(brief.briefFingerprint)!,
    providerRequest,
    technicalRequirements: {
      deliveryWidthPx: brief.output.widthPx,
      deliveryHeightPx: brief.output.heightPx,
      ...(brief.output.minimumPpi === undefined ? {} : { minimumPpi: brief.output.minimumPpi }),
      allowedDeliveryMimeTypes: [...brief.output.allowedMimeTypes],
      colourIntent: brief.output.colourIntent,
      alpha: brief.output.alpha,
      textPolicy: brief.output.textPolicy,
      printUse: brief.output.printUse,
      digitalUse: brief.output.digitalUse,
      providerCandidateIntermediateFormat: "image/png",
      masteringRequired: true,
    },
    authorityBoundary: {
      artStudioOwns: [
        "provider-neutral candidate generation, editing and inpaint execution",
        "candidate provenance, exact raster inspection, mastering and repair",
        "candidate comparison, selection evidence and immutable promotion",
      ],
      docsSuiteOwns: [
        "manuscript and visual-canon authority",
        "cover and interior composition, editable typography and illustration placement",
        "ISBN, barcode, edition geometry, KDP proof and publication packaging",
      ],
      forbiddenInputAuthorities: [...FORBIDDEN_AUTHORITY_KEYS],
    },
    sourceEvidence: {
      manuscriptRevisionId: brief.manuscript.manuscriptRevisionId,
      manuscriptSha256: brief.manuscript.manuscriptSha256,
      extractedTextSha256: brief.manuscript.extractedTextSha256,
      visualCanonSha256: brief.manuscript.visualCanonSha256,
      artDirectionSha256: brief.manuscript.artDirectionSha256,
      approvedEvidenceIds: [...brief.manuscript.approvedEvidenceIds],
      rightsEvidenceIds: [...brief.rightsEvidenceIds],
    },
    authoritativeWritesPerformed: false,
    providerCandidateMayBeFinal: false,
    selectionRequired: true,
    promotionRequired: true,
    bookUseBindingRequired: true,
    artifactBytesRewritten: false,
    canonicalRendererMustVerifyBytes: true,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
  const workOrder: BookArtProductionWorkOrderV1 = {
    ...withoutFingerprint,
    workOrderFingerprintSha256: await sha256(canonicalJson(withoutFingerprint)),
  };
  const workOrderValidation = await validateBookArtProductionWorkOrder(workOrder);
  if (!workOrderValidation.valid) {
    return blockedCompilation(identity, workOrderValidation.issues, warnings);
  }
  warnings.push("The production work order creates a provider candidate only; selection, promotion and Book Studio use binding remain separate.");
  return {
    outputKind: "evavo_book_art_production_work_order_compilation_result",
    schemaVersion: BOOK_ART_PROFILE_SCHEMA_VERSION,
    status: "ready",
    identity,
    workOrder,
    blockers: [],
    warnings: unique(warnings),
    authoritativeWritesPerformed: false,
    providerCandidateMayBeFinal: false,
    promotionRequired: true,
    artifactBytesRewritten: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

export async function validateBookArtProductionWorkOrder(
  value: BookArtProductionWorkOrderV1,
): Promise<BookArtValidationResult> {
  const issues: string[] = [];
  if (value?.outputKind !== "evavo_book_art_production_work_order") issues.push("Book Art work order outputKind is invalid.");
  if (value?.schemaVersion !== BOOK_ART_PROFILE_SCHEMA_VERSION) issues.push("Book Art work order schemaVersion is invalid.");
  if (value?.contract !== BOOK_ART_PROFILE_CONTRACT) issues.push("Book Art work order contract is invalid.");
  if (value?.handoffContract !== BOOK_ART_HANDOFF_CONTRACT) issues.push("Book Art work order handoff contract is invalid.");
  validateIdentity(value?.identity, issues);
  if (!PURPOSES.has(value?.purpose)) issues.push("Book Art work order purpose is invalid.");
  if (value?.assetClass !== assetClassFor(value?.purpose)) issues.push("Book Art work order asset class differs from purpose.");
  if (!isSha(value?.sourceBriefFingerprint)) issues.push("Book Art work order sourceBriefFingerprint is invalid.");
  if (value?.providerCandidateMayBeFinal !== false) issues.push("A provider candidate may never be final.");
  if (value?.authoritativeWritesPerformed !== false) issues.push("Profile compilation cannot perform authoritative writes.");
  if (value?.selectionRequired !== true || value?.promotionRequired !== true || value?.bookUseBindingRequired !== true) issues.push("Selection, promotion and book-use binding gates are mandatory.");
  if (value?.artifactBytesRewritten !== false || value?.runtimeCutoverApproved !== false || value?.publicationPerformed !== false) issues.push("Work order cannot claim byte rewrite, runtime cutover or publication.");
  if (value?.canonicalRendererMustVerifyBytes !== true) issues.push("Canonical renderer byte verification is mandatory.");
  validateProviderRequest(value?.providerRequest, value, issues);
  if (!isSha(value?.workOrderFingerprintSha256)) issues.push("Book Art work order fingerprint is invalid.");
  else {
    const { workOrderFingerprintSha256: _fingerprint, ...withoutFingerprint } = value;
    const expected = await sha256(canonicalJson(withoutFingerprint));
    if (normalizeSha(value.workOrderFingerprintSha256) !== expected) issues.push("Book Art work order fingerprint does not match exact contents.");
  }
  return { valid: issues.length === 0, issues: unique(issues) };
}

export async function translateLegacyWebsiteBookArtGenerationPlan(
  value: unknown,
): Promise<LegacyWebsiteBookArtPlanTranslationResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const input = record(value);
  if (!input) return blockedTranslation(emptyIdentity(), emptyLegacyEvidence(), ["Legacy Website Book Art plan translation input must be one object."], warnings);
  rejectUnknownFields(input, TRANSLATION_FIELDS, "Legacy Website Book Art plan translation input", blockers);
  if (input.outputKind !== "evavo_legacy_website_book_art_plan_translation_input" || input.schemaVersion !== BOOK_ART_PROFILE_SCHEMA_VERSION) blockers.push("Legacy Website Book Art plan translation kind or version is invalid.");
  const candidateId = text(input.candidateId);
  if (!isSafeId(candidateId)) blockers.push("Legacy Website Book Art candidateId is invalid.");
  const compilation = await compileBookArtProductionWorkOrder(input.brief);
  blockers.push(...compilation.blockers);
  const identity = compilation.identity;
  const plan = record(input.legacyPlan);
  const evidence = legacyEvidence(plan, candidateId);
  if (!plan) blockers.push("Legacy Website Book Art generation plan must be an object.");
  else {
    rejectUnknownFields(plan, LEGACY_PLAN_FIELDS, "Legacy Website Book Art generation plan", blockers);
    if (plan.outputKind !== "book_cover_artwork_generation_plan" || plan.version !== "book_cover_artwork_generation_plan_v1") blockers.push("Legacy Website Book Art generation plan kind or version is invalid.");
    if (plan.status !== "ready_to_generate") blockers.push("Legacy Website Book Art generation plan must be ready_to_generate for shadow translation.");
    if (plan.projectId !== identity.projectId) blockers.push("Legacy Website Book Art generation plan belongs to a different project.");
    if (!isSafeId(plan.runId)) blockers.push("Legacy Website Book Art generation plan runId is invalid.");
    if (!isSha(plan.sceneDigestSha256) || !isSha(plan.artDirectionDigestSha256) || !isSha(plan.inputDigestSha256) || !isSha(plan.planDigestSha256)) blockers.push("Legacy Website Book Art generation plan digests are invalid.");
    const brief = record(input.brief);
    const manuscript = record(brief?.manuscript);
    if (plan.artDirectionDigestSha256 !== manuscript?.artDirectionSha256) blockers.push("Legacy Website Book Art generation plan uses stale or different art direction.");
    const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
    const matching = tasks.filter((task) => record(task)?.candidateId === candidateId).map(record).filter((task): task is Record<string, unknown> => Boolean(task));
    if (matching.length !== 1) blockers.push("Legacy Website Book Art generation plan must contain the candidate exactly once.");
    else {
      const task = matching[0]!;
      rejectUnknownFields(task, LEGACY_TASK_FIELDS, "Legacy Website Book Art generation task", blockers);
      if (task.state !== "ready") blockers.push("Legacy Website Book Art generation task must remain ready for shadow translation.");
      if (!isSafeId(task.territoryId) || task.territoryId !== brief?.conceptTerritoryId) blockers.push("Legacy Website Book Art task concept territory differs from the canonical brief.");
      if (!isSha(task.promptDigestSha256)) blockers.push("Legacy Website Book Art task prompt digest is invalid.");
      if (typeof task.prompt !== "string" || task.prompt.trim().length < 20) blockers.push("Legacy Website Book Art task prompt is missing or not substantive.");
      if (!Number.isInteger(task.expectedWidthPx) || Number(task.expectedWidthPx) < 64 || !Number.isInteger(task.expectedHeightPx) || Number(task.expectedHeightPx) < 64) blockers.push("Legacy Website Book Art task dimensions are invalid.");
    }
  }
  if (blockers.length || !compilation.workOrder) return blockedTranslation(identity, evidence, unique(blockers), warnings);
  warnings.push("The raw legacy Website provider prompt is retained by digest for parity evidence but is not trusted as the new Art Studio authority.");
  return {
    outputKind: "evavo_legacy_website_book_art_plan_translation_result",
    schemaVersion: BOOK_ART_PROFILE_SCHEMA_VERSION,
    status: "ready_for_shadow_comparison",
    identity,
    workOrder: compilation.workOrder,
    legacyEvidence: evidence,
    blockers: [],
    warnings: unique([...compilation.warnings, ...warnings]),
    shadowOnly: true,
    rawLegacyPromptTrustedAsAuthority: false,
    authoritativeWritesPerformed: false,
    providerCandidateMayBeFinal: false,
    promotionRequired: true,
    artifactBytesRead: false,
    artifactBytesRewritten: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

function providerRequestFor(brief: BookArtBriefV1): BookArtProviderRequestV1 {
  const sourceSha = normalizeSha(brief.briefFingerprint)!;
  const transparency = transparencyFor(brief);
  const canvas = providerCanvas(brief.output.widthPx, brief.output.heightPx);
  const requestId = providerId(`bookart:${sourceSha.slice(0, 32)}`, sourceSha);
  const assetId = providerId(`book:${brief.identity.bookId}:${brief.purpose}:${brief.conceptTerritoryId}`, sourceSha);
  const familyId = providerId(`book:${brief.identity.bookId}:${brief.conceptTerritoryId}`, normalizeSha(brief.manuscript.artDirectionSha256)!);
  return {
    schemaVersion: "1.0",
    operation: "generate",
    assetKind: providerAssetKindFor(brief.purpose),
    continuityPhase: "independent",
    requestId,
    assetId,
    candidateFamilyId: familyId,
    creativeIntent: brief.creativeThesis,
    negativeIntent: unique([...brief.mustNotShow, ...brief.spoilerRestrictions]).join("; "),
    style: {
      styleName: brief.conceptTerritoryLabel,
      intent: brief.creativeThesis,
      mustHave: unique([...brief.mustShow, ...brief.continuityRequirements]),
      mustAvoid: unique([...brief.mustNotShow, ...brief.spoilerRestrictions, "generated publication text", "title lettering", "author lettering", "ISBN or barcode"]),
      identityLocks: [...brief.continuityRequirements],
      palette: [],
      lineTreatment: [],
      materials: [...brief.historicalAndMaterialRequirements],
      cameraRules: [],
      compositionRules: unique([...brief.compositionRequirements, ...brief.negativeSpaceRequirements]),
      eraRules: [...brief.historicalAndMaterialRequirements],
    },
    shot: {
      subject: brief.primarySubject,
      include: unique([...brief.supportingSubjects, ...brief.mustShow]),
      exclude: unique([...brief.mustNotShow, ...brief.spoilerRestrictions]),
      separateAssets: ["publication typography", "ISBN and barcode", "captions and labels"],
      framing: unique([...brief.compositionRequirements, ...brief.negativeSpaceRequirements]),
    },
    target: {
      width: canvas.width,
      height: canvas.height,
      transparency,
      outputFormat: "png",
    },
    background: { strategy: backgroundFor(transparency) },
    quality: brief.output.printUse ? "high" : "standard",
    candidateCount: 1,
    selection: { allowedAdapterIds: [], allowFallback: false, requireSeed: false },
    metadata: {
      workspaceId: brief.identity.workspaceId,
      projectId: brief.identity.projectId,
      bookId: brief.identity.bookId,
      ...(brief.identity.editionId === undefined ? {} : { editionId: brief.identity.editionId }),
      bookRequestId: brief.identity.requestId,
      purpose: brief.purpose,
      manuscriptRevisionId: brief.manuscript.manuscriptRevisionId,
      manuscriptSha256: brief.manuscript.manuscriptSha256,
      extractedTextSha256: brief.manuscript.extractedTextSha256,
      visualCanonSha256: brief.manuscript.visualCanonSha256,
      artDirectionSha256: brief.manuscript.artDirectionSha256,
      sourceBriefFingerprint: sourceSha,
      conceptTerritoryId: brief.conceptTerritoryId,
      rightsEvidenceIds: [...brief.rightsEvidenceIds],
      providerCandidateMayBeFinal: false,
      publicationPerformed: false,
    },
  };
}

function validateProviderRequest(request: BookArtProviderRequestV1 | undefined, workOrder: BookArtProductionWorkOrderV1, issues: string[]): void {
  if (!request || typeof request !== "object") { issues.push("Book Art provider request is missing."); return; }
  if (request.schemaVersion !== "1.0" || request.operation !== "generate" || request.continuityPhase !== "independent") issues.push("Book Art provider request protocol is invalid.");
  for (const [name, value] of [["requestId", request.requestId], ["assetId", request.assetId], ["candidateFamilyId", request.candidateFamilyId]] as const) if (!PROVIDER_SAFE_ID.test(value)) issues.push(`Book Art provider request ${name} is invalid.`);
  if (request.candidateCount !== 1 || request.selection.allowFallback !== false) issues.push("Book Art provider request must create one non-fallback candidate at a time.");
  if (request.target.outputFormat !== "png") issues.push("Book Art provider candidates must retain a PNG intermediate master.");
  if (!Number.isInteger(request.target.width) || request.target.width < 64 || request.target.width > 8192 || !Number.isInteger(request.target.height) || request.target.height < 64 || request.target.height > 8192) issues.push("Book Art provider canvas is invalid.");
  if (request.metadata.sourceBriefFingerprint !== workOrder.sourceBriefFingerprint) issues.push("Book Art provider metadata uses a different source brief.");
  if (request.metadata.projectId !== workOrder.identity.projectId || request.metadata.bookId !== workOrder.identity.bookId || request.metadata.bookRequestId !== workOrder.identity.requestId) issues.push("Book Art provider metadata identity differs from the work order.");
  if (request.metadata.providerCandidateMayBeFinal !== false || request.metadata.publicationPerformed !== false) issues.push("Book Art provider metadata cannot claim finality or publication.");
  const joined = canonicalJson(request).toLowerCase();
  for (const forbidden of ["isbn", "barcode", "kdp", "pricing", "backcovercopy"]) if (joined.includes(`\"${forbidden}\"`)) issues.push(`Book Art provider request contains forbidden Docs Suite authority: ${forbidden}.`);
}

function validateProfileFields(brief: BookArtBriefV1, blockers: string[]): void {
  if (!PURPOSES.has(brief?.purpose)) blockers.push("Book Art production purpose is invalid.");
  if (!COLOUR_INTENTS.has(brief?.output?.colourIntent)) blockers.push("Book Art production colour intent is invalid.");
  if (!ALPHA_POLICIES.has(brief?.output?.alpha)) blockers.push("Book Art production alpha policy is invalid.");
  if (!TEXT_POLICIES.has(brief?.output?.textPolicy)) blockers.push("Book Art production text policy is invalid.");
  if (typeof brief?.output?.printUse !== "boolean" || typeof brief?.output?.digitalUse !== "boolean" || (!brief.output.printUse && !brief.output.digitalUse)) blockers.push("Book Art production output must target print, digital or both.");
  if (!Array.isArray(brief?.output?.allowedMimeTypes) || brief.output.allowedMimeTypes.length < 1 || brief.output.allowedMimeTypes.some((mime) => !MIME_TYPES.has(mime))) blockers.push("Book Art production delivery MIME types are invalid.");
  if (!Array.isArray(brief?.rightsEvidenceIds) || brief.rightsEvidenceIds.length < 1) blockers.push("Book Art production rights evidence is required.");
  if (!isSha(brief?.briefFingerprint)) blockers.push("Book Art production brief fingerprint is invalid.");
}

function rejectForbiddenAuthorityKeys(value: Record<string, unknown>, blockers: string[]): void {
  const found: string[] = [];
  walk(value, "brief", (path, key) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (FORBIDDEN_AUTHORITY_KEYS.includes(normalized)) found.push(`${path}.${key}`);
  });
  if (found.length) blockers.push(`Book Art production brief contains Docs Suite-owned authority fields: ${found.sort().join(", ")}.`);
}

function walk(value: unknown, path: string, visit: (path: string, key: string) => void): void {
  if (Array.isArray(value)) { value.forEach((entry, index) => walk(entry, `${path}[${index}]`, visit)); return; }
  const input = record(value); if (!input) return;
  for (const [key, entry] of Object.entries(input)) { visit(path, key); walk(entry, `${path}.${key}`, visit); }
}

function legacyEvidence(plan: Record<string, unknown> | undefined, candidateId: string): LegacyWebsiteBookArtPlanEvidenceV1 {
  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  const task = tasks.map(record).find((item) => item?.candidateId === candidateId);
  const planOutputKind = optionalText(plan?.outputKind);
  const planVersion = optionalText(plan?.version);
  const legacyProjectId = optionalText(plan?.projectId);
  const legacyRunId = optionalText(plan?.runId);
  const legacyTerritoryId = optionalText(task?.territoryId);
  const legacyPromptDigestSha256 = optionalSha(task?.promptDigestSha256);
  const legacyPlanDigestSha256 = optionalSha(plan?.planDigestSha256);
  const legacyInputDigestSha256 = optionalSha(plan?.inputDigestSha256);
  const legacySceneDigestSha256 = optionalSha(plan?.sceneDigestSha256);
  const legacyArtDirectionDigestSha256 = optionalSha(plan?.artDirectionDigestSha256);
  const legacyTaskState = optionalText(task?.state);
  return {
    sourceRepository: "EVAVO-STUDIO/Website",
    ...(planOutputKind === undefined ? {} : { planOutputKind }),
    ...(planVersion === undefined ? {} : { planVersion }),
    ...(legacyProjectId === undefined ? {} : { legacyProjectId }),
    ...(legacyRunId === undefined ? {} : { legacyRunId }),
    ...(candidateId ? { legacyCandidateId: candidateId } : {}),
    ...(legacyTerritoryId === undefined ? {} : { legacyTerritoryId }),
    ...(legacyPromptDigestSha256 === undefined ? {} : { legacyPromptDigestSha256 }),
    ...(legacyPlanDigestSha256 === undefined ? {} : { legacyPlanDigestSha256 }),
    ...(legacyInputDigestSha256 === undefined ? {} : { legacyInputDigestSha256 }),
    ...(legacySceneDigestSha256 === undefined ? {} : { legacySceneDigestSha256 }),
    ...(legacyArtDirectionDigestSha256 === undefined ? {} : { legacyArtDirectionDigestSha256 }),
    ...(legacyTaskState === undefined ? {} : { legacyTaskState }),
    rawLegacyPromptRetained: false,
    sourceReferenceRetained: true,
    artifactBytesRead: false,
    artifactBytesRewritten: false,
  };
}

function blockedCompilation(identity: BookArtIdentityV1, blockers: string[], warnings: string[]): BookArtProductionWorkOrderCompilationResultV1 {
  return {
    outputKind: "evavo_book_art_production_work_order_compilation_result",
    schemaVersion: BOOK_ART_PROFILE_SCHEMA_VERSION,
    status: "blocked",
    identity,
    blockers: unique(blockers),
    warnings: unique(warnings),
    authoritativeWritesPerformed: false,
    providerCandidateMayBeFinal: false,
    promotionRequired: true,
    artifactBytesRewritten: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}
function blockedTranslation(identity: BookArtIdentityV1, evidence: LegacyWebsiteBookArtPlanEvidenceV1, blockers: string[], warnings: string[]): LegacyWebsiteBookArtPlanTranslationResultV1 {
  return {
    outputKind: "evavo_legacy_website_book_art_plan_translation_result",
    schemaVersion: BOOK_ART_PROFILE_SCHEMA_VERSION,
    status: "blocked",
    identity,
    legacyEvidence: evidence,
    blockers: unique(blockers),
    warnings: unique(warnings),
    shadowOnly: true,
    rawLegacyPromptTrustedAsAuthority: false,
    authoritativeWritesPerformed: false,
    providerCandidateMayBeFinal: false,
    promotionRequired: true,
    artifactBytesRead: false,
    artifactBytesRewritten: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

function assetClassFor(purpose: BookArtPurpose): BookArtProductionAssetClass {
  if (purpose === "front_cover_art" || purpose === "full_wrap_art") return "cover_background";
  if (purpose === "interior_full_page_illustration" || purpose === "interior_half_page_illustration" || purpose === "interior_spot_illustration") return "interior_illustration";
  if (purpose === "diagram") return "diagram";
  if (purpose === "map") return "map";
  return "ornament";
}
function providerAssetKindFor(purpose: BookArtPurpose): BookArtProviderAssetKind { return purpose === "front_cover_art" || purpose === "full_wrap_art" ? "print" : "illustration"; }
function transparencyFor(brief: BookArtBriefV1): BookArtProviderTransparency {
  if (brief.output.alpha === "required") return "required";
  if (brief.output.alpha === "forbidden" || assetClassFor(brief.purpose) === "cover_background") return "opaque";
  return "preferred";
}
function backgroundFor(transparency: BookArtProviderTransparency): BookArtProviderBackgroundStrategy {
  if (transparency === "required") return "native-alpha";
  if (transparency === "preferred") return "provider-auto";
  return "opaque-source";
}
function providerCanvas(width: number, height: number): { width: number; height: number } {
  const maximum = Math.max(width, height);
  if (maximum <= 8192) return { width, height };
  const scale = 8192 / maximum;
  return { width: Math.max(64, Math.round(width * scale)), height: Math.max(64, Math.round(height * scale)) };
}
function providerId(candidate: string, digest: string): string {
  const cleaned = candidate.replace(/[^A-Za-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "");
  const fallback = `bookart:${digest.slice(0, 32)}`;
  const value = cleaned || fallback;
  const bounded = value.length <= 128 ? value : `${value.slice(0, 91)}:${digest.slice(0, 32)}`;
  return PROVIDER_SAFE_ID.test(bounded) ? bounded : fallback;
}

function rejectUnknownFields(value: Record<string, unknown>, allowed: ReadonlySet<string>, label: string, blockers: string[]): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort();
  if (unknown.length) blockers.push(`${label} contains unknown fields: ${unknown.join(", ")}.`);
}
function validateIdentity(identity: BookArtIdentityV1 | undefined, issues: string[]): void {
  if (!identity) { issues.push("Book Art work order identity is missing."); return; }
  for (const key of ["workspaceId", "projectId", "bookId", "requestId"] as const) if (!isSafeId(identity[key])) issues.push(`Book Art work order identity ${key} is invalid.`);
  if (identity.editionId !== undefined && !isSafeId(identity.editionId)) issues.push("Book Art work order identity editionId is invalid.");
}
function parseIdentity(value: Record<string, unknown> | undefined): BookArtIdentityV1 {
  return {
    workspaceId: text(value?.workspaceId),
    projectId: text(value?.projectId),
    bookId: text(value?.bookId),
    ...(value?.editionId === undefined ? {} : { editionId: text(value.editionId) }),
    requestId: text(value?.requestId),
  };
}
function cloneIdentity(value: BookArtIdentityV1): BookArtIdentityV1 { return { ...value }; }
function emptyIdentity(): BookArtIdentityV1 { return { workspaceId: "", projectId: "", bookId: "", requestId: "" }; }
function emptyLegacyEvidence(): LegacyWebsiteBookArtPlanEvidenceV1 { return { sourceRepository: "EVAVO-STUDIO/Website", rawLegacyPromptRetained: false, sourceReferenceRetained: true, artifactBytesRead: false, artifactBytesRewritten: false }; }
function record(value: unknown): Record<string, unknown> | undefined { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function optionalText(value: unknown): string | undefined { const result = text(value).trim(); return result ? result : undefined; }
function optionalSha(value: unknown): string | undefined { return isSha(value) ? value : undefined; }
function isSha(value: unknown): value is string { return typeof value === "string" && SHA256.test(value); }
function normalizeSha(value: string): string | undefined { const normalized = value.replace(/^sha256:/, ""); return /^[a-f0-9]{64}$/.test(normalized) ? normalized : undefined; }
function isSafeId(value: unknown): value is string { return typeof value === "string" && SAFE_ID.test(value) && !["__proto__", "constructor", "prototype"].includes(value); }
function unique(values: string[]): string[] { return [...new Set(values.map((item) => item.trim()).filter(Boolean))]; }
function canonicalJson(value: unknown): string { return JSON.stringify(canonical(value)); }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function message(error: unknown, fallback: string): string { return error instanceof Error && error.message ? error.message : fallback; }
