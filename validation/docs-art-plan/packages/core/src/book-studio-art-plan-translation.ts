import { validateBookArtBriefExact } from "./book-studio-art-brief-exact";
import {
  BOOK_ART_HANDOFF_CONTRACT,
  type BookArtBriefV1,
  type BookArtIdentityV1,
  type BookArtPurpose,
} from "./book-studio-art-contracts";
import { canonicalBookJson, sha256BookText } from "./book-studio-project-contracts";

export const BOOK_ART_PLAN_TRANSLATION_CONTRACT =
  "evavo_docs_book_art_plan_translation_v1" as const;

export type BookArtPlanTranslationKind = "cover" | "illustration";
export type BookArtProductionAssetClass =
  | "cover_background"
  | "interior_illustration"
  | "diagram"
  | "map"
  | "ornament";

export interface BookArtPlanTranslationRequestV1 {
  outputKind:
    | "evavo_legacy_website_book_art_plan_translation_input"
    | "evavo_legacy_website_book_illustration_plan_translation_input";
  schemaVersion: 1;
  brief: BookArtBriefV1;
  legacyPlan: Record<string, unknown>;
  candidateId: string;
}

export interface BookArtProviderRequestV1 {
  schemaVersion: "1.0";
  operation: "generate";
  assetKind: "print" | "illustration";
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
    transparency: "required" | "preferred" | "opaque";
    outputFormat: "png";
  };
  background: {
    strategy: "native-alpha" | "provider-auto" | "opaque-source";
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
  schemaVersion: 1;
  contract: "evavo_book_art_profile_v1";
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
    colourIntent:
      | "rgb"
      | "grayscale"
      | "monochrome"
      | "cmyk_conversion_required";
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

export interface BookArtPlanTranslationCompilationV1 {
  outputKind: "evavo_docs_book_art_plan_translation_compilation";
  schemaVersion: 1;
  contract: typeof BOOK_ART_PLAN_TRANSLATION_CONTRACT;
  status: "ready" | "blocked";
  translationKind?: BookArtPlanTranslationKind;
  request?: BookArtPlanTranslationRequestV1;
  requestFingerprint?: string;
  expectedWorkOrder?: BookArtProductionWorkOrderV1;
  expectedLegacyEvidence?: Record<string, unknown>;
  blockers: string[];
  warnings: string[];
  artStudioCalled: false;
  providerCallPerformed: false;
  runtimeJobSubmitted: false;
  artifactBytesWritten: false;
  authoritativeBookWritesPerformed: false;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export interface BookArtPlanTranslationCoordinationV1 {
  outputKind: "evavo_docs_book_art_plan_translation_coordination";
  schemaVersion: 1;
  contract: typeof BOOK_ART_PLAN_TRANSLATION_CONTRACT;
  status: "ready_for_shadow_comparison" | "blocked";
  translationKind?: BookArtPlanTranslationKind;
  requestFingerprint?: string;
  workOrder?: BookArtProductionWorkOrderV1;
  legacyEvidence?: Record<string, unknown>;
  blockers: string[];
  warnings: string[];
  artStudioCalled: boolean;
  providerCallPerformed: false;
  runtimeJobSubmitted: false;
  artifactBytesWritten: false;
  authoritativeBookWritesPerformed: false;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/;
const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;
const PROVIDER_SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REQUEST_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "brief",
  "legacyPlan",
  "candidateId",
]);
const RESULT_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "status",
  "identity",
  "workOrder",
  "legacyEvidence",
  "blockers",
  "warnings",
  "shadowOnly",
  "rawLegacyPromptTrustedAsAuthority",
  "legacyLayoutTrustedAsArtAuthority",
  "authoritativeWritesPerformed",
  "providerCandidateMayBeFinal",
  "promotionRequired",
  "bookUseBindingRequired",
  "artifactBytesRead",
  "artifactBytesRewritten",
  "runtimeCutoverApproved",
  "publicationPerformed",
]);
const FORBIDDEN_AUTHORITY_KEYS = [
  "title",
  "subtitle",
  "author",
  "contributor",
  "spine",
  "isbn",
  "barcode",
  "kdp",
  "trim",
  "bleed",
  "pagecount",
  "page_count",
  "price",
  "pricing",
  "publication",
  "backcovercopy",
  "back_cover_copy",
  "metadata",
  "keywords",
  "categories",
];

export async function compileBookArtPlanTranslationRequest(
  value: unknown,
): Promise<BookArtPlanTranslationCompilationV1> {
  const blockers: string[] = [];
  const source = readRecord(value, "Book Art plan translation input", blockers);
  if (source) rejectUnknown(source, REQUEST_FIELDS, "Book Art plan translation input", blockers);
  const translationKind = kindFor(source?.outputKind, blockers);
  if (source?.schemaVersion !== 1) {
    blockers.push("Book Art plan translation schemaVersion is invalid.");
  }
  const candidateId = readSafeId(source?.candidateId, "candidateId", blockers);
  const legacyPlan = readRecord(source?.legacyPlan, "legacyPlan", blockers);
  const briefSource = readRecord(source?.brief, "brief", blockers);
  const brief = briefSource as unknown as BookArtBriefV1 | undefined;
  if (brief) {
    const validation = await validateBookArtBriefExact(brief);
    blockers.push(...validation.issues);
  }
  if (translationKind === "cover" && !isCoverPurpose(brief?.purpose)) {
    blockers.push("Cover plan translation requires a front_cover_art or full_wrap_art brief.");
  }
  if (translationKind === "illustration" && !isIllustrationPurpose(brief?.purpose)) {
    blockers.push("Illustration plan translation requires an illustration, diagram, map or ornament brief.");
  }
  const uniqueBlockers = unique(blockers);
  if (
    uniqueBlockers.length ||
    !translationKind ||
    !legacyPlan ||
    !brief
  ) {
    return blockedCompilation(uniqueBlockers);
  }
  const request: BookArtPlanTranslationRequestV1 = {
    outputKind: translationKind === "cover"
      ? "evavo_legacy_website_book_art_plan_translation_input"
      : "evavo_legacy_website_book_illustration_plan_translation_input",
    schemaVersion: 1,
    brief: structuredClone(brief),
    legacyPlan: structuredClone(legacyPlan),
    candidateId,
  };
  return {
    outputKind: "evavo_docs_book_art_plan_translation_compilation",
    schemaVersion: 1,
    contract: BOOK_ART_PLAN_TRANSLATION_CONTRACT,
    status: "ready",
    translationKind,
    request,
    requestFingerprint: await sha256BookText(canonicalBookJson(request)),
    expectedWorkOrder: await compileExpectedWorkOrder(request.brief),
    expectedLegacyEvidence: expectedEvidence(request, translationKind),
    blockers: [],
    warnings: [],
    artStudioCalled: false,
    providerCallPerformed: false,
    runtimeJobSubmitted: false,
    artifactBytesWritten: false,
    authoritativeBookWritesPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

export async function validateBookArtPlanTranslationResult(
  requestInput: unknown,
  resultInput: unknown,
): Promise<BookArtPlanTranslationCoordinationV1> {
  const compilation = await compileBookArtPlanTranslationRequest(requestInput);
  if (
    compilation.status !== "ready" ||
    !compilation.request ||
    !compilation.translationKind ||
    !compilation.requestFingerprint ||
    !compilation.expectedWorkOrder ||
    !compilation.expectedLegacyEvidence
  ) {
    return blockedCoordination({
      blockers: compilation.blockers,
      warnings: compilation.warnings,
      artStudioCalled: false,
    });
  }
  const blockers: string[] = [];
  const source = readRecord(resultInput, "Art Studio translation result", blockers);
  if (source) rejectUnknown(source, RESULT_FIELDS, "Art Studio translation result", blockers);
  const expectedOutputKind = compilation.translationKind === "cover"
    ? "evavo_legacy_website_book_art_plan_translation_result"
    : "evavo_legacy_website_book_illustration_plan_translation_result";
  if (source?.outputKind !== expectedOutputKind || source?.schemaVersion !== 1) {
    blockers.push("Art Studio translation result kind or version is invalid.");
  }
  if (source?.status !== "blocked" && source?.status !== "ready_for_shadow_comparison") {
    blockers.push("Art Studio translation status is invalid.");
  }
  requireLiteral(source?.shadowOnly, true, "shadowOnly", blockers);
  requireLiteral(
    source?.rawLegacyPromptTrustedAsAuthority,
    false,
    "rawLegacyPromptTrustedAsAuthority",
    blockers,
  );
  if (compilation.translationKind === "illustration") {
    requireLiteral(
      source?.legacyLayoutTrustedAsArtAuthority,
      false,
      "legacyLayoutTrustedAsArtAuthority",
      blockers,
    );
    requireLiteral(
      source?.bookUseBindingRequired,
      true,
      "bookUseBindingRequired",
      blockers,
    );
  } else if (
    source?.legacyLayoutTrustedAsArtAuthority !== undefined ||
    source?.bookUseBindingRequired !== undefined
  ) {
    blockers.push("Cover translation cannot return illustration-only authority fields.");
  }
  requireLiteral(
    source?.authoritativeWritesPerformed,
    false,
    "authoritativeWritesPerformed",
    blockers,
  );
  requireLiteral(
    source?.providerCandidateMayBeFinal,
    false,
    "providerCandidateMayBeFinal",
    blockers,
  );
  requireLiteral(source?.promotionRequired, true, "promotionRequired", blockers);
  requireLiteral(source?.artifactBytesRead, false, "artifactBytesRead", blockers);
  requireLiteral(
    source?.artifactBytesRewritten,
    false,
    "artifactBytesRewritten",
    blockers,
  );
  requireLiteral(
    source?.runtimeCutoverApproved,
    false,
    "runtimeCutoverApproved",
    blockers,
  );
  requireLiteral(
    source?.publicationPerformed,
    false,
    "publicationPerformed",
    blockers,
  );
  const resultBlockers = readTextArray(source?.blockers, "blockers", blockers);
  const warnings = readTextArray(source?.warnings, "warnings", blockers);
  if (
    canonicalBookJson(source?.identity) !==
    canonicalBookJson(compilation.request.brief.identity)
  ) {
    blockers.push("Art Studio translation identity differs from the exact Docs Suite brief.");
  }
  if (
    canonicalBookJson(source?.legacyEvidence) !==
    canonicalBookJson(compilation.expectedLegacyEvidence)
  ) {
    blockers.push("Art Studio legacy evidence differs from the exact retained Website plan.");
  }
  if (source?.status === "ready_for_shadow_comparison") {
    if (resultBlockers.length) {
      blockers.push("A ready Art Studio translation cannot retain blockers.");
    }
    if (
      canonicalBookJson(source.workOrder) !==
      canonicalBookJson(compilation.expectedWorkOrder)
    ) {
      blockers.push("Art Studio work order differs from the independently compiled Docs Suite expectation.");
    }
  } else {
    if (!resultBlockers.length) {
      blockers.push("A blocked Art Studio translation requires at least one blocker.");
    }
    if (source?.workOrder !== undefined) {
      blockers.push("A blocked Art Studio translation cannot return a work order.");
    }
  }
  const allBlockers = unique([...blockers, ...resultBlockers]);
  if (allBlockers.length || source?.status !== "ready_for_shadow_comparison") {
    return blockedCoordination({
      translationKind: compilation.translationKind,
      requestFingerprint: compilation.requestFingerprint,
      ...(isRecord(source?.legacyEvidence)
        ? { legacyEvidence: structuredClone(source.legacyEvidence) }
        : {}),
      blockers: allBlockers,
      warnings,
      artStudioCalled: true,
    });
  }
  return {
    outputKind: "evavo_docs_book_art_plan_translation_coordination",
    schemaVersion: 1,
    contract: BOOK_ART_PLAN_TRANSLATION_CONTRACT,
    status: "ready_for_shadow_comparison",
    translationKind: compilation.translationKind,
    requestFingerprint: compilation.requestFingerprint,
    workOrder: compilation.expectedWorkOrder,
    legacyEvidence: compilation.expectedLegacyEvidence,
    blockers: [],
    warnings,
    artStudioCalled: true,
    providerCallPerformed: false,
    runtimeJobSubmitted: false,
    artifactBytesWritten: false,
    authoritativeBookWritesPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

async function compileExpectedWorkOrder(
  brief: BookArtBriefV1,
): Promise<BookArtProductionWorkOrderV1> {
  const sourceBriefFingerprint = normalizeSha(brief.briefFingerprint);
  if (!sourceBriefFingerprint) throw new Error("Book Art brief fingerprint is invalid.");
  const withoutFingerprint: Omit<
    BookArtProductionWorkOrderV1,
    "workOrderFingerprintSha256"
  > = {
    outputKind: "evavo_book_art_production_work_order",
    schemaVersion: 1,
    contract: "evavo_book_art_profile_v1",
    handoffContract: BOOK_ART_HANDOFF_CONTRACT,
    identity: structuredClone(brief.identity),
    purpose: brief.purpose,
    assetClass: assetClassFor(brief.purpose),
    sourceBriefFingerprint,
    providerRequest: providerRequestFor(brief, sourceBriefFingerprint),
    technicalRequirements: {
      deliveryWidthPx: brief.output.widthPx,
      deliveryHeightPx: brief.output.heightPx,
      ...(brief.output.minimumPpi === undefined
        ? {}
        : { minimumPpi: brief.output.minimumPpi }),
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
  return {
    ...withoutFingerprint,
    workOrderFingerprintSha256: stripShaPrefix(
      await sha256BookText(canonicalBookJson(withoutFingerprint)),
    ),
  };
}

function providerRequestFor(
  brief: BookArtBriefV1,
  sourceBriefFingerprint: string,
): BookArtProviderRequestV1 {
  const transparency = transparencyFor(brief);
  const canvas = providerCanvas(brief.output.widthPx, brief.output.heightPx);
  const artDirectionSha = normalizeSha(brief.manuscript.artDirectionSha256) ??
    sourceBriefFingerprint;
  return {
    schemaVersion: "1.0",
    operation: "generate",
    assetKind: isCoverPurpose(brief.purpose) ? "print" : "illustration",
    continuityPhase: "independent",
    requestId: providerId(
      `bookart:${sourceBriefFingerprint.slice(0, 32)}`,
      sourceBriefFingerprint,
    ),
    assetId: providerId(
      `book:${brief.identity.bookId}:${brief.purpose}:${brief.conceptTerritoryId}`,
      sourceBriefFingerprint,
    ),
    candidateFamilyId: providerId(
      `book:${brief.identity.bookId}:${brief.conceptTerritoryId}`,
      artDirectionSha,
    ),
    creativeIntent: brief.creativeThesis,
    negativeIntent: unique([
      ...brief.mustNotShow,
      ...brief.spoilerRestrictions,
    ]).join("; "),
    style: {
      styleName: brief.conceptTerritoryLabel,
      intent: brief.creativeThesis,
      mustHave: unique([...brief.mustShow, ...brief.continuityRequirements]),
      mustAvoid: unique([
        ...brief.mustNotShow,
        ...brief.spoilerRestrictions,
        "generated publication text",
        "title lettering",
        "author lettering",
        "ISBN or barcode",
      ]),
      identityLocks: [...brief.continuityRequirements],
      palette: [],
      lineTreatment: [],
      materials: [...brief.historicalAndMaterialRequirements],
      cameraRules: [],
      compositionRules: unique([
        ...brief.compositionRequirements,
        ...brief.negativeSpaceRequirements,
      ]),
      eraRules: [...brief.historicalAndMaterialRequirements],
    },
    shot: {
      subject: brief.primarySubject,
      include: unique([...brief.supportingSubjects, ...brief.mustShow]),
      exclude: unique([...brief.mustNotShow, ...brief.spoilerRestrictions]),
      separateAssets: [
        "publication typography",
        "ISBN and barcode",
        "captions and labels",
      ],
      framing: unique([
        ...brief.compositionRequirements,
        ...brief.negativeSpaceRequirements,
      ]),
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
    selection: {
      allowedAdapterIds: [],
      allowFallback: false,
      requireSeed: false,
    },
    metadata: {
      workspaceId: brief.identity.workspaceId,
      projectId: brief.identity.projectId,
      bookId: brief.identity.bookId,
      ...(brief.identity.editionId === undefined
        ? {}
        : { editionId: brief.identity.editionId }),
      bookRequestId: brief.identity.requestId,
      purpose: brief.purpose,
      manuscriptRevisionId: brief.manuscript.manuscriptRevisionId,
      manuscriptSha256: brief.manuscript.manuscriptSha256,
      extractedTextSha256: brief.manuscript.extractedTextSha256,
      visualCanonSha256: brief.manuscript.visualCanonSha256,
      artDirectionSha256: brief.manuscript.artDirectionSha256,
      sourceBriefFingerprint,
      conceptTerritoryId: brief.conceptTerritoryId,
      rightsEvidenceIds: [...brief.rightsEvidenceIds],
      providerCandidateMayBeFinal: false,
      publicationPerformed: false,
    },
  };
}

function expectedEvidence(
  request: BookArtPlanTranslationRequestV1,
  kind: BookArtPlanTranslationKind,
): Record<string, unknown> {
  const plan = request.legacyPlan;
  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  const task = tasks
    .map((value) => isRecord(value) ? value : undefined)
    .find((value) => value?.candidateId === request.candidateId);
  if (kind === "cover") {
    return compact({
      sourceRepository: "EVAVO-STUDIO/Website",
      planOutputKind: optionalText(plan.outputKind),
      planVersion: optionalText(plan.version),
      legacyProjectId: optionalText(plan.projectId),
      legacyRunId: optionalText(plan.runId),
      legacyCandidateId: request.candidateId,
      legacyTerritoryId: optionalText(task?.territoryId),
      legacyPromptDigestSha256: optionalSha(task?.promptDigestSha256),
      legacyPlanDigestSha256: optionalSha(plan.planDigestSha256),
      legacyInputDigestSha256: optionalSha(plan.inputDigestSha256),
      legacySceneDigestSha256: optionalSha(plan.sceneDigestSha256),
      legacyArtDirectionDigestSha256: optionalSha(plan.artDirectionDigestSha256),
      legacyTaskState: optionalText(task?.state),
      rawLegacyPromptRetained: false,
      sourceReferenceRetained: true,
      artifactBytesRead: false,
      artifactBytesRewritten: false,
    });
  }
  const style = isRecord(plan.styleAuthority) ? plan.styleAuthority : undefined;
  const page = isRecord(plan.pageAuthority) ? plan.pageAuthority : undefined;
  return compact({
    sourceRepository: "EVAVO-STUDIO/Website",
    planOutputKind: optionalText(plan.outputKind),
    planVersion: optionalText(plan.version),
    legacyProjectId: optionalText(plan.projectId),
    legacyRunId: optionalText(plan.runId),
    legacyRequestedAt: optionalText(plan.requestedAt),
    legacyProfile: optionalText(plan.profile),
    styleAuthorityDigestSha256: optionalSha(style?.authorityDigestSha256),
    styleFamily: optionalText(style?.styleFamily),
    colourMode: optionalText(style?.colourMode),
    paperTone: optionalText(style?.paperTone),
    styleInkLayerMode: optionalText(style?.inkLayerMode),
    pageAuthorityDigestSha256: optionalSha(page?.authorityDigestSha256),
    pageId: optionalText(page?.pageId),
    pageRole: optionalText(page?.pageRole),
    narrativeMode: optionalText(page?.narrativeMode),
    directionDigestSha256: optionalSha(page?.directionDigestSha256),
    layoutDigestSha256: optionalSha(page?.layoutDigestSha256),
    manuscriptAuthorityDigestSha256: optionalSha(
      page?.manuscriptAuthorityDigestSha256,
    ),
    visualManuscriptAuthorityDigestSha256: optionalSha(
      page?.visualManuscriptAuthorityDigestSha256,
    ),
    sharesPageWithLiveText: typeof page?.sharesPageWithLiveText === "boolean"
      ? page.sharesPageWithLiveText
      : undefined,
    protectedTextZoneCount: Number.isInteger(page?.protectedTextZoneCount)
      ? Number(page?.protectedTextZoneCount)
      : undefined,
    legacyCandidateId: request.candidateId,
    variation: optionalText(task?.variation),
    promptDigestSha256: optionalSha(task?.promptDigestSha256),
    idempotencyKey: optionalSha(task?.idempotencyKey),
    expectedWidthPx: Number.isInteger(task?.expectedWidthPx)
      ? Number(task?.expectedWidthPx)
      : undefined,
    expectedHeightPx: Number.isInteger(task?.expectedHeightPx)
      ? Number(task?.expectedHeightPx)
      : undefined,
    createTransparentInkLayer:
      typeof task?.createTransparentInkLayer === "boolean"
        ? task.createTransparentInkLayer
        : undefined,
    taskInkLayerMode: optionalText(task?.inkLayerMode),
    taskState: optionalText(task?.state),
    inputDigestSha256: optionalSha(plan.inputDigestSha256),
    planDigestSha256: optionalSha(plan.planDigestSha256),
    rawLegacyPromptRetained: false,
    layoutGeometryRetained: false,
    sourceReferenceRetained: true,
    artifactBytesRead: false,
    artifactBytesRewritten: false,
  });
}

function blockedCompilation(
  blockers: string[],
): BookArtPlanTranslationCompilationV1 {
  return {
    outputKind: "evavo_docs_book_art_plan_translation_compilation",
    schemaVersion: 1,
    contract: BOOK_ART_PLAN_TRANSLATION_CONTRACT,
    status: "blocked",
    blockers: unique(blockers),
    warnings: [],
    artStudioCalled: false,
    providerCallPerformed: false,
    runtimeJobSubmitted: false,
    artifactBytesWritten: false,
    authoritativeBookWritesPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

function blockedCoordination(input: Readonly<{
  translationKind?: BookArtPlanTranslationKind;
  requestFingerprint?: string;
  legacyEvidence?: Record<string, unknown>;
  blockers: string[];
  warnings: string[];
  artStudioCalled: boolean;
}>): BookArtPlanTranslationCoordinationV1 {
  return {
    outputKind: "evavo_docs_book_art_plan_translation_coordination",
    schemaVersion: 1,
    contract: BOOK_ART_PLAN_TRANSLATION_CONTRACT,
    status: "blocked",
    ...(input.translationKind === undefined
      ? {}
      : { translationKind: input.translationKind }),
    ...(input.requestFingerprint === undefined
      ? {}
      : { requestFingerprint: input.requestFingerprint }),
    ...(input.legacyEvidence === undefined
      ? {}
      : { legacyEvidence: input.legacyEvidence }),
    blockers: unique(input.blockers),
    warnings: unique(input.warnings),
    artStudioCalled: input.artStudioCalled,
    providerCallPerformed: false,
    runtimeJobSubmitted: false,
    artifactBytesWritten: false,
    authoritativeBookWritesPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

function kindFor(
  value: unknown,
  blockers: string[],
): BookArtPlanTranslationKind | undefined {
  if (value === "evavo_legacy_website_book_art_plan_translation_input") {
    return "cover";
  }
  if (
    value ===
    "evavo_legacy_website_book_illustration_plan_translation_input"
  ) return "illustration";
  blockers.push("Book Art plan translation outputKind is invalid.");
  return undefined;
}

function assetClassFor(purpose: BookArtPurpose): BookArtProductionAssetClass {
  if (isCoverPurpose(purpose)) return "cover_background";
  if (
    purpose === "interior_full_page_illustration" ||
    purpose === "interior_half_page_illustration" ||
    purpose === "interior_spot_illustration"
  ) return "interior_illustration";
  if (purpose === "diagram") return "diagram";
  if (purpose === "map") return "map";
  return "ornament";
}

function isCoverPurpose(value: unknown): value is BookArtPurpose {
  return value === "front_cover_art" || value === "full_wrap_art";
}

function isIllustrationPurpose(value: unknown): value is BookArtPurpose {
  return value === "interior_full_page_illustration" ||
    value === "interior_half_page_illustration" ||
    value === "interior_spot_illustration" ||
    value === "diagram" ||
    value === "map" ||
    value === "ornament";
}

function transparencyFor(
  brief: BookArtBriefV1,
): "required" | "preferred" | "opaque" {
  if (brief.output.alpha === "required") return "required";
  if (brief.output.alpha === "forbidden" || isCoverPurpose(brief.purpose)) {
    return "opaque";
  }
  return "preferred";
}

function backgroundFor(
  transparency: "required" | "preferred" | "opaque",
): "native-alpha" | "provider-auto" | "opaque-source" {
  if (transparency === "required") return "native-alpha";
  if (transparency === "preferred") return "provider-auto";
  return "opaque-source";
}

function providerCanvas(
  width: number,
  height: number,
): { width: number; height: number } {
  const maximum = Math.max(width, height);
  if (maximum <= 8_192) return { width, height };
  const scale = 8_192 / maximum;
  return {
    width: Math.max(64, Math.round(width * scale)),
    height: Math.max(64, Math.round(height * scale)),
  };
}

function providerId(candidate: string, digest: string): string {
  const cleaned = candidate
    .replace(/[^A-Za-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const fallback = `bookart:${digest.slice(0, 32)}`;
  const value = cleaned || fallback;
  const bounded = value.length <= 128
    ? value
    : `${value.slice(0, 91)}:${digest.slice(0, 32)}`;
  return PROVIDER_SAFE_ID.test(bounded) ? bounded : fallback;
}

function normalizeSha(value: unknown): string | undefined {
  if (typeof value !== "string" || !SHA256.test(value)) return undefined;
  return value.replace(/^sha256:/, "");
}

function stripShaPrefix(value: string): string {
  return value.replace(/^sha256:/, "");
}

function readSafeId(
  value: unknown,
  label: string,
  blockers: string[],
): string {
  if (
    typeof value !== "string" ||
    !SAFE_ID.test(value) ||
    ["__proto__", "constructor", "prototype"].includes(value)
  ) {
    blockers.push(`${label} is invalid.`);
    return "invalid-id";
  }
  return value;
}

function readRecord(
  value: unknown,
  label: string,
  blockers: string[],
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    blockers.push(`${label} must be an object.`);
    return undefined;
  }
  return value;
}

function readTextArray(
  value: unknown,
  label: string,
  blockers: string[],
): string[] {
  if (!Array.isArray(value) || value.length > 512) {
    blockers.push(`${label} must be a bounded string array.`);
    return [];
  }
  const result: string[] = [];
  for (const item of value) {
    if (
      typeof item !== "string" ||
      item !== item.trim() ||
      item.length < 1 ||
      item.length > 2_000 ||
      /[\u0000-\u001f\u007f]/.test(item)
    ) blockers.push(`${label} contains invalid text.`);
    else result.push(item);
  }
  return unique(result);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rejectUnknown(
  source: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
  blockers: string[],
): void {
  const unknown = Object.keys(source).filter((key) => !allowed.has(key)).sort();
  if (unknown.length) {
    blockers.push(`${label} contains unsupported fields: ${unknown.join(", ")}.`);
  }
}

function requireLiteral(
  value: unknown,
  expected: boolean,
  label: string,
  blockers: string[],
): void {
  if (value !== expected) blockers.push(`${label} must remain ${String(expected)}.`);
}

function optionalText(value: unknown): string | undefined {
  const result = typeof value === "string" ? value.trim() : "";
  return result ? result : undefined;
}

function optionalSha(value: unknown): string | undefined {
  return typeof value === "string" && SHA256.test(value) ? value : undefined;
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
