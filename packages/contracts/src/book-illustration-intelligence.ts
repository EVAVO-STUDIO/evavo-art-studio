/**
 * Provider-neutral Book illustration and print-craft intelligence.
 *
 * The contract translates narrative evidence into reproducible mark grammar,
 * print requirements and adversarial candidate QA. It never claims that a
 * generated image is handmade, never hides synthetic provenance and never
 * grants automatic selection, promotion, Book-use or publication authority.
 */

export const BOOK_ILLUSTRATION_INTELLIGENCE_SCHEMA_VERSION = 1 as const;
export const BOOK_ILLUSTRATION_INTELLIGENCE_CONTRACT =
  "evavo_art_book_illustration_intelligence_v1" as const;

export const BOOK_ILLUSTRATION_INTELLIGENCE_CAPABILITIES = [
  "book.illustration.plan.compile",
  "book.illustration.candidate.qa",
  "book.print_craft.qa",
  "book.graphic_novel.page.plan",
  "book.art.promotion.receipt",
] as const;

export type BookIllustrationCapability =
  (typeof BOOK_ILLUSTRATION_INTELLIGENCE_CAPABILITIES)[number];

export type BookIllustrationPurpose =
  | "front_cover_art"
  | "full_wrap_art"
  | "interior_full_page_illustration"
  | "interior_half_page_illustration"
  | "interior_spot_illustration"
  | "graphic_novel_page"
  | "graphic_novel_panel"
  | "diagram"
  | "map"
  | "ornament"
  | "endpaper";

export type BookIllustrationProcessFamily =
  | "relief_engraving"
  | "intaglio_etching"
  | "scratchboard"
  | "brush_pen_halftone"
  | "linocut"
  | "lithographic_tone"
  | "duotone"
  | "risograph"
  | "black_only"
  | "graphic_novel_ink"
  | "children_picture_book"
  | "technical_plate"
  | "cartographic_linework"
  | "ornamental_print"
  | "custom";

export type BookIllustrationGenreRoute =
  | "literary"
  | "historical"
  | "horror"
  | "mythic"
  | "grimdark_tabletop_fantasy"
  | "science_fiction"
  | "crime"
  | "romance"
  | "children"
  | "memoir"
  | "documentary"
  | "technical"
  | "reference"
  | "graphic_novel"
  | "pulp"
  | "ornamental"
  | "custom";

export type BookIllustrationPrintProfileId =
  | "generic_print"
  | "kdp_print"
  | "digital_only"
  | "custom";

export type BookIllustrationColourMode =
  | "black_only"
  | "grayscale"
  | "duotone"
  | "spot_colour"
  | "rgb"
  | "cmyk_conversion_required";

export interface BookIllustrationIdentityV1 {
  workspaceId: string;
  projectId: string;
  bookId: string;
  editionId?: string;
  requestId: string;
  assetId: string;
}

export interface BookIllustrationNarrativeBriefV1 {
  primarySubject: string;
  supportingSubjects: string[];
  narrativePurpose: string;
  emotionalTemperature: string;
  visualAction: string;
  compositionRequirements: string[];
  mustShow: string[];
  mustAvoid: string[];
  researchEvidenceIds: string[];
}

export interface BookIllustrationPrintProfileV1 {
  profileId: BookIllustrationPrintProfileId;
  trimWidthInches: number;
  trimHeightInches: number;
  deliveryWidthInches: number;
  deliveryHeightInches: number;
  geometryAuthority: "docs_suite_exact_dimensions";
  externalTemplateFingerprint?: string;
  bleedRequired: boolean;
  minimumPpi?: number;
  pureLineArtPpi?: number;
  screenLpi?: number;
  colourMode: BookIllustrationColourMode;
  paperDescription: string;
  maximumInkCoveragePercent: number;
}

export interface BookIllustrationPresentationPolicyV1 {
  generatedArtworkTextFreeRequired: true;
  editableTypographyRequired: true;
  editableLetteringRequired: boolean;
  labelsOwnedByDocsSuite: true;
  altTextOwnedByDocsSuite: true;
  provenanceDisclosureRequired: true;
}

export interface BookIllustrationPlanningInputV1 {
  outputKind: "evavo_art_book_illustration_planning_input";
  schemaVersion: typeof BOOK_ILLUSTRATION_INTELLIGENCE_SCHEMA_VERSION;
  contract: typeof BOOK_ILLUSTRATION_INTELLIGENCE_CONTRACT;
  identity: BookIllustrationIdentityV1;
  purpose: BookIllustrationPurpose;
  contentClass: string;
  visualPacketFingerprint: string;
  sourceBriefFingerprint: string;
  processFamily: BookIllustrationProcessFamily;
  customProcessFamily?: string;
  genreRoute: BookIllustrationGenreRoute;
  customGenreRoute?: string;
  desiredAesthetic: string;
  narrativeBrief: BookIllustrationNarrativeBriefV1;
  continuityLockIds: string[];
  rightsEvidenceIds: string[];
  namedCreatorReferences: string[];
  brandedFranchiseReferences: string[];
  printProfile: BookIllustrationPrintProfileV1;
  presentationPolicy: BookIllustrationPresentationPolicyV1;
  requestedAt: string;
  requestedBy: string;
  providerCallAllowed: false;
  automaticSelectionAllowed: false;
  automaticPromotionAllowed: false;
  bookUseBindingAllowed: false;
  publicationAllowed: false;
}

export interface BookIllustrationMarkGrammarV1 {
  contourHierarchy: {
    primary: string;
    secondary: string;
    tertiary: string;
    minimumDistinctWeights: number;
  };
  hatchGrammar: {
    followsForm: true;
    followsMaterial: true;
    followsLight: true;
    maximumCrosshatchLayers: number;
    maximumStippleCoveragePercent: number;
    randomScratchOverlayProhibited: true;
  };
  blackMassGrammar: {
    minimumAnchorMasses: number;
    maximumCoveragePercent: number;
    silhouetteReadRequired: true;
  };
  textureGrammar: {
    materialSpecificMarksRequired: true;
    repeatedTextureStampProhibited: true;
    clonedDistressProhibited: true;
    meaninglessPseudoDetailProhibited: true;
  };
  tonalGrammar: {
    maximumTonalSteps: number;
    halftoneAllowed: boolean;
    targetScreenLpi?: number;
  };
  reproductionGrammar: {
    minimumPositiveLineWidthPx: number;
    minimumReverseLineWidthPx: number;
    registrationTolerancePx: number;
    preserveLayeredEditableMaster: true;
  };
}

export interface BookIllustrationPrintRequirementsV1 {
  printUse: boolean;
  trimWidthInches: number;
  trimHeightInches: number;
  deliveryWidthInches: number;
  deliveryHeightInches: number;
  geometryAuthority: "docs_suite_exact_dimensions";
  externalTemplateFingerprint?: string;
  minimumContinuousTonePpi: number;
  minimumPureLineArtPpi: number;
  targetRasterPpi: number;
  targetPixelWidth: number;
  targetPixelHeight: number;
  bleedInchesPerOuterEdge: number;
  transparencyMustBeFlattenedAtDelivery: boolean;
  editableLayeredMasterRequired: true;
  maximumInkCoveragePercent: number;
  colourMode: BookIllustrationColourMode;
  paperDescription: string;
}

export interface BookIllustrationLayerPlanV1 {
  artworkLayer: "art_studio_text_free_art";
  typographyLayer: "docs_suite_editable_typography";
  letteringLayer: "docs_suite_editable_lettering" | "not_applicable";
  labelLayer: "docs_suite_editable_labels" | "not_applicable";
  accessibilityLayer: "docs_suite_alt_text_and_reading_order";
  generatedTextInsideArtworkAllowed: false;
}

export interface BookIllustrationQaThresholdsV1 {
  minimumLineWeightVariance: number;
  minimumHatchLightConsistency: number;
  minimumMaterialMarkVariation: number;
  maximumRepeatedTextureScore: number;
  maximumRandomNoiseScore: number;
  maximumPseudoDetailScore: number;
  minimumAnatomyScore: number;
  minimumHandsAndFacesScore: number;
  minimumPerspectiveScore: number;
  minimumContinuityScore: number;
  maximumDigitalSmoothingScore: number;
  minimumCompositionScore: number;
  minimumPrintSeparationScore: number;
}

export interface BookIllustrationIntelligencePlanV1 {
  outputKind: "evavo_art_book_illustration_intelligence_plan";
  schemaVersion: typeof BOOK_ILLUSTRATION_INTELLIGENCE_SCHEMA_VERSION;
  contract: typeof BOOK_ILLUSTRATION_INTELLIGENCE_CONTRACT;
  capabilities: readonly BookIllustrationCapability[];
  identity: BookIllustrationIdentityV1;
  purpose: BookIllustrationPurpose;
  contentClass: string;
  visualPacketFingerprint: string;
  sourceBriefFingerprint: string;
  processFamily: BookIllustrationProcessFamily;
  genreRoute: BookIllustrationGenreRoute;
  desiredAesthetic: string;
  narrativeBrief: BookIllustrationNarrativeBriefV1;
  continuityLockIds: string[];
  rightsEvidenceIds: string[];
  markGrammar: BookIllustrationMarkGrammarV1;
  printRequirements: BookIllustrationPrintRequirementsV1;
  layerPlan: BookIllustrationLayerPlanV1;
  qaThresholds: BookIllustrationQaThresholdsV1;
  rightsPolicy: {
    namedCreatorImitationProhibited: true;
    brandedFranchiseTransferProhibited: true;
    distinctiveSurfaceReconstructionProhibited: true;
    genericMechanismsAndHistoricalTechniquesAllowed: true;
    falseHandmadeClaimProhibited: true;
    syntheticProvenanceMayNotBeHidden: true;
  };
  planFingerprint: string;
  providerCallPerformed: false;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  publicationPerformed: false;
}

export interface BookIllustrationPlanCompilationResultV1 {
  outputKind: "evavo_art_book_illustration_plan_compilation_result";
  schemaVersion: typeof BOOK_ILLUSTRATION_INTELLIGENCE_SCHEMA_VERSION;
  contract: typeof BOOK_ILLUSTRATION_INTELLIGENCE_CONTRACT;
  status: "blocked" | "ready";
  plan?: BookIllustrationIntelligencePlanV1;
  blockers: string[];
  warnings: string[];
  providerCallPerformed: false;
  selectionPerformed: false;
  promotionPerformed: false;
  publicationPerformed: false;
}

export interface BookIllustrationCandidateTechnicalEvidenceV1 {
  widthPx: number;
  heightPx: number;
  printWidthInches: number;
  printHeightInches: number;
  effectiveContinuousTonePpi: number;
  effectivePureLineArtPpi: number;
  bleedInchesPerOuterEdge: number;
  hasTransparency: boolean;
  flattenedForDelivery: boolean;
  editableLayeredMasterAvailable: boolean;
  minimumPositiveLineWidthPx: number;
  minimumReverseLineWidthPx: number;
  maximumInkCoveragePercent: number;
  tonalStepCount: number;
  embeddedTextDetected: boolean;
  embeddedLogoDetected: boolean;
}

export interface BookIllustrationCandidateCraftEvidenceV1 {
  lineWeightVariance: number;
  hatchLightConsistency: number;
  materialMarkVariation: number;
  repeatedTextureScore: number;
  randomNoiseScore: number;
  pseudoDetailScore: number;
  anatomyScore: number;
  handsAndFacesScore: number;
  perspectiveScore: number;
  continuityScore: number;
  digitalSmoothingScore: number;
  compositionScore: number;
  printSeparationScore: number;
}

export interface BookIllustrationCandidateRightsEvidenceV1 {
  namedCreatorImitationDetected: boolean;
  brandedFranchiseElementsDetected: boolean;
  distinctiveSurfaceReconstructionDetected: boolean;
  falseHandmadeClaimDetected: boolean;
  syntheticProvenanceHidden: boolean;
}

export interface BookIllustrationCandidateQaInputV1 {
  outputKind: "evavo_art_book_illustration_candidate_qa_input";
  schemaVersion: typeof BOOK_ILLUSTRATION_INTELLIGENCE_SCHEMA_VERSION;
  contract: typeof BOOK_ILLUSTRATION_INTELLIGENCE_CONTRACT;
  candidateId: string;
  plan: BookIllustrationIntelligencePlanV1;
  observedPlanFingerprint: string;
  observedVisualPacketFingerprint: string;
  observedContinuityLockIds: string[];
  technical: BookIllustrationCandidateTechnicalEvidenceV1;
  craft: BookIllustrationCandidateCraftEvidenceV1;
  rights: BookIllustrationCandidateRightsEvidenceV1;
  evidenceIds: string[];
  providerCallPerformedByQa: false;
  candidateBytesRewrittenByQa: false;
  automaticSelectionAllowed: false;
  automaticPromotionAllowed: false;
  publicationAllowed: false;
}

export interface BookIllustrationQaFindingV1 {
  code: string;
  severity: "blocker" | "warning";
  category:
    | "identity"
    | "print"
    | "craft"
    | "continuity"
    | "presentation"
    | "rights"
    | "authority";
  message: string;
  remediation: string;
}

export interface BookIllustrationCandidateQaResultV1 {
  outputKind: "evavo_art_book_illustration_candidate_qa_result";
  schemaVersion: typeof BOOK_ILLUSTRATION_INTELLIGENCE_SCHEMA_VERSION;
  contract: typeof BOOK_ILLUSTRATION_INTELLIGENCE_CONTRACT;
  candidateId: string;
  planFingerprint: string;
  status: "rejected" | "needs_revision" | "ready_for_independent_review";
  findings: BookIllustrationQaFindingV1[];
  blockerCodes: string[];
  warningCodes: string[];
  resultFingerprint: string;
  providerCallPerformedByQa: false;
  candidateBytesRewrittenByQa: false;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  publicationPerformed: false;
}

type LooseRecord = any;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/;
const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const PURPOSES = [
  "front_cover_art",
  "full_wrap_art",
  "interior_full_page_illustration",
  "interior_half_page_illustration",
  "interior_spot_illustration",
  "graphic_novel_page",
  "graphic_novel_panel",
  "diagram",
  "map",
  "ornament",
  "endpaper",
] as const;
const PROCESS_FAMILIES = [
  "relief_engraving",
  "intaglio_etching",
  "scratchboard",
  "brush_pen_halftone",
  "linocut",
  "lithographic_tone",
  "duotone",
  "risograph",
  "black_only",
  "graphic_novel_ink",
  "children_picture_book",
  "technical_plate",
  "cartographic_linework",
  "ornamental_print",
  "custom",
] as const;
const GENRE_ROUTES = [
  "literary",
  "historical",
  "horror",
  "mythic",
  "grimdark_tabletop_fantasy",
  "science_fiction",
  "crime",
  "romance",
  "children",
  "memoir",
  "documentary",
  "technical",
  "reference",
  "graphic_novel",
  "pulp",
  "ornamental",
  "custom",
] as const;
const PRINT_PROFILES = ["generic_print", "kdp_print", "digital_only", "custom"] as const;
const COLOUR_MODES = ["black_only", "grayscale", "duotone", "spot_colour", "rgb", "cmyk_conversion_required"] as const;
const BLOCKED_AESTHETIC_PATTERNS = [
  /\bin the style of\b/i,
  /\bcopy the style\b/i,
  /\bexactly like (?:the )?(?:art|illustrations?) of\b/i,
  /\bai[- ]?undetectable\b/i,
  /\bpass as handmade\b/i,
  /\bpretend(?:ed)? (?:to be )?hand[- ]?drawn\b/i,
  /\bwarhammer\b/i,
  /\bgames workshop\b/i,
];

const PLAN_INPUT_KEYS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "identity",
  "purpose",
  "contentClass",
  "visualPacketFingerprint",
  "sourceBriefFingerprint",
  "processFamily",
  "customProcessFamily",
  "genreRoute",
  "customGenreRoute",
  "desiredAesthetic",
  "narrativeBrief",
  "continuityLockIds",
  "rightsEvidenceIds",
  "namedCreatorReferences",
  "brandedFranchiseReferences",
  "printProfile",
  "presentationPolicy",
  "requestedAt",
  "requestedBy",
  "providerCallAllowed",
  "automaticSelectionAllowed",
  "automaticPromotionAllowed",
  "bookUseBindingAllowed",
  "publicationAllowed",
]);
const IDENTITY_KEYS = new Set([
  "workspaceId",
  "projectId",
  "bookId",
  "editionId",
  "requestId",
  "assetId",
]);
const NARRATIVE_KEYS = new Set([
  "primarySubject",
  "supportingSubjects",
  "narrativePurpose",
  "emotionalTemperature",
  "visualAction",
  "compositionRequirements",
  "mustShow",
  "mustAvoid",
  "researchEvidenceIds",
]);
const PRINT_KEYS = new Set([
  "profileId",
  "trimWidthInches",
  "trimHeightInches",
  "deliveryWidthInches",
  "deliveryHeightInches",
  "geometryAuthority",
  "externalTemplateFingerprint",
  "bleedRequired",
  "minimumPpi",
  "pureLineArtPpi",
  "screenLpi",
  "colourMode",
  "paperDescription",
  "maximumInkCoveragePercent",
]);
const PRESENTATION_KEYS = new Set([
  "generatedArtworkTextFreeRequired",
  "editableTypographyRequired",
  "editableLetteringRequired",
  "labelsOwnedByDocsSuite",
  "altTextOwnedByDocsSuite",
  "provenanceDisclosureRequired",
]);
const QA_INPUT_KEYS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "candidateId",
  "plan",
  "observedPlanFingerprint",
  "observedVisualPacketFingerprint",
  "observedContinuityLockIds",
  "technical",
  "craft",
  "rights",
  "evidenceIds",
  "providerCallPerformedByQa",
  "candidateBytesRewrittenByQa",
  "automaticSelectionAllowed",
  "automaticPromotionAllowed",
  "publicationAllowed",
]);
const TECHNICAL_KEYS = new Set([
  "widthPx",
  "heightPx",
  "printWidthInches",
  "printHeightInches",
  "effectiveContinuousTonePpi",
  "effectivePureLineArtPpi",
  "bleedInchesPerOuterEdge",
  "hasTransparency",
  "flattenedForDelivery",
  "editableLayeredMasterAvailable",
  "minimumPositiveLineWidthPx",
  "minimumReverseLineWidthPx",
  "maximumInkCoveragePercent",
  "tonalStepCount",
  "embeddedTextDetected",
  "embeddedLogoDetected",
]);
const CRAFT_KEYS = new Set([
  "lineWeightVariance",
  "hatchLightConsistency",
  "materialMarkVariation",
  "repeatedTextureScore",
  "randomNoiseScore",
  "pseudoDetailScore",
  "anatomyScore",
  "handsAndFacesScore",
  "perspectiveScore",
  "continuityScore",
  "digitalSmoothingScore",
  "compositionScore",
  "printSeparationScore",
]);
const RIGHTS_KEYS = new Set([
  "namedCreatorImitationDetected",
  "brandedFranchiseElementsDetected",
  "distinctiveSurfaceReconstructionDetected",
  "falseHandmadeClaimDetected",
  "syntheticProvenanceHidden",
]);
const PLAN_OUTPUT_KEYS = new Set([
  "outputKind",
  "schemaVersion",
  "contract",
  "capabilities",
  "identity",
  "purpose",
  "contentClass",
  "visualPacketFingerprint",
  "sourceBriefFingerprint",
  "processFamily",
  "genreRoute",
  "desiredAesthetic",
  "narrativeBrief",
  "continuityLockIds",
  "rightsEvidenceIds",
  "markGrammar",
  "printRequirements",
  "layerPlan",
  "qaThresholds",
  "rightsPolicy",
  "planFingerprint",
  "providerCallPerformed",
  "selectionPerformed",
  "promotionPerformed",
  "bookUseBindingCreated",
  "publicationPerformed",
]);
const PRINT_REQUIREMENT_KEYS = new Set([
  "printUse",
  "trimWidthInches",
  "trimHeightInches",
  "deliveryWidthInches",
  "deliveryHeightInches",
  "geometryAuthority",
  "externalTemplateFingerprint",
  "minimumContinuousTonePpi",
  "minimumPureLineArtPpi",
  "targetRasterPpi",
  "targetPixelWidth",
  "targetPixelHeight",
  "bleedInchesPerOuterEdge",
  "transparencyMustBeFlattenedAtDelivery",
  "editableLayeredMasterRequired",
  "maximumInkCoveragePercent",
  "colourMode",
  "paperDescription",
]);
const LAYER_PLAN_KEYS = new Set([
  "artworkLayer",
  "typographyLayer",
  "letteringLayer",
  "labelLayer",
  "accessibilityLayer",
  "generatedTextInsideArtworkAllowed",
]);
const RIGHTS_POLICY_KEYS = new Set([
  "namedCreatorImitationProhibited",
  "brandedFranchiseTransferProhibited",
  "distinctiveSurfaceReconstructionProhibited",
  "genericMechanismsAndHistoricalTechniquesAllowed",
  "falseHandmadeClaimProhibited",
  "syntheticProvenanceMayNotBeHidden",
]);

export function compileBookIllustrationIntelligencePlan(
  value: unknown,
): BookIllustrationPlanCompilationResultV1 {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const input = strictObject(value, "input", PLAN_INPUT_KEYS, blockers);
  if (!input) return blockedPlan(blockers, warnings);

  if (
    input.outputKind !== "evavo_art_book_illustration_planning_input" ||
    input.schemaVersion !== BOOK_ILLUSTRATION_INTELLIGENCE_SCHEMA_VERSION ||
    input.contract !== BOOK_ILLUSTRATION_INTELLIGENCE_CONTRACT
  ) {
    blockers.push("Illustration planning input kind, schema version or contract is invalid.");
  }
  for (const field of [
    "providerCallAllowed",
    "automaticSelectionAllowed",
    "automaticPromotionAllowed",
    "bookUseBindingAllowed",
    "publicationAllowed",
  ] as const) {
    if (input[field] !== false) blockers.push(`${field} must remain false.`);
  }

  const identityRecord = strictObject(input.identity, "identity", IDENTITY_KEYS, blockers);
  const identity = parseIdentity(identityRecord, blockers);
  const purpose = enumValue(input.purpose, PURPOSES, "purpose", blockers);
  const contentClass = boundedText(input.contentClass, "contentClass", blockers, 200);
  const visualPacketFingerprint = sha(input.visualPacketFingerprint, "visualPacketFingerprint", blockers);
  const sourceBriefFingerprint = sha(input.sourceBriefFingerprint, "sourceBriefFingerprint", blockers);
  const processFamily = enumValue(input.processFamily, PROCESS_FAMILIES, "processFamily", blockers);
  const customProcessFamily = optionalText(input.customProcessFamily, "customProcessFamily", blockers, 500);
  if (processFamily === "custom" && customProcessFamily === undefined) {
    blockers.push("customProcessFamily is required when processFamily is custom.");
  }
  if (processFamily !== "custom" && customProcessFamily !== undefined) {
    blockers.push("customProcessFamily is allowed only when processFamily is custom.");
  }
  const genreRoute = enumValue(input.genreRoute, GENRE_ROUTES, "genreRoute", blockers);
  const customGenreRoute = optionalText(input.customGenreRoute, "customGenreRoute", blockers, 500);
  if (genreRoute === "custom" && customGenreRoute === undefined) {
    blockers.push("customGenreRoute is required when genreRoute is custom.");
  }
  if (genreRoute !== "custom" && customGenreRoute !== undefined) {
    blockers.push("customGenreRoute is allowed only when genreRoute is custom.");
  }
  const desiredAesthetic = boundedText(input.desiredAesthetic, "desiredAesthetic", blockers, 4_000);
  const narrativeBrief = parseNarrativeBrief(input.narrativeBrief, blockers);
  const continuityLockIds = idArray(input.continuityLockIds, "continuityLockIds", blockers, 0, 1_000);
  const rightsEvidenceIds = idArray(input.rightsEvidenceIds, "rightsEvidenceIds", blockers, 1, 1_000);
  const namedCreatorReferences = textArray(input.namedCreatorReferences, "namedCreatorReferences", blockers, 0, 64, 500);
  const brandedFranchiseReferences = textArray(input.brandedFranchiseReferences, "brandedFranchiseReferences", blockers, 0, 64, 500);
  const printProfile = parsePrintProfile(input.printProfile, blockers);
  const presentationPolicy = parsePresentationPolicy(input.presentationPolicy, blockers);
  const requestedAt = boundedText(input.requestedAt, "requestedAt", blockers, 100);
  if (!isCanonicalUtcTimestamp(requestedAt)) {
    blockers.push("requestedAt must be a real canonical UTC timestamp with milliseconds.");
  }
  const requestedBy = safeId(input.requestedBy, "requestedBy", blockers);

  if (namedCreatorReferences.length) {
    blockers.push("Named creator references are prohibited; describe abstract craft mechanisms instead.");
  }
  if (brandedFranchiseReferences.length) {
    blockers.push("Branded franchise references are prohibited; use project-owned generic design language.");
  }
  if (BLOCKED_AESTHETIC_PATTERNS.some((pattern) => pattern.test(desiredAesthetic))) {
    blockers.push("desiredAesthetic contains imitation, franchise-transfer or provenance-concealment language.");
  }
  if (
    narrativeBrief &&
    BLOCKED_AESTHETIC_PATTERNS.some((pattern) =>
      pattern.test(canonicalBookIllustrationJson(narrativeBrief)),
    )
  ) {
    blockers.push("narrativeBrief contains prohibited imitation, franchise or provenance-concealment language.");
  }
  if (!presentationPolicy) blockers.push("presentationPolicy is invalid.");
  if (
    presentationPolicy &&
    (purpose === "graphic_novel_page" || purpose === "graphic_novel_panel") &&
    !presentationPolicy.editableLetteringRequired
  ) {
    blockers.push("Graphic-novel artwork requires editableLetteringRequired=true.");
  }
  if (
    purpose === "full_wrap_art" &&
    printProfile &&
    printProfile.externalTemplateFingerprint === undefined
  ) {
    blockers.push("Full-wrap artwork requires an exact externalTemplateFingerprint from Docs Suite.");
  }

  if (blockers.length || !identity || !narrativeBrief || !printProfile || !presentationPolicy) {
    return blockedPlan(blockers, warnings);
  }

  const markGrammar = markGrammarFor(processFamily, printProfile);
  const printRequirements = printRequirementsFor(printProfile, processFamily);
  const layerPlan: BookIllustrationLayerPlanV1 = {
    artworkLayer: "art_studio_text_free_art",
    typographyLayer: "docs_suite_editable_typography",
    letteringLayer:
      purpose === "graphic_novel_page" || purpose === "graphic_novel_panel"
        ? "docs_suite_editable_lettering"
        : "not_applicable",
    labelLayer:
      purpose === "diagram" || purpose === "map"
        ? "docs_suite_editable_labels"
        : "not_applicable",
    accessibilityLayer: "docs_suite_alt_text_and_reading_order",
    generatedTextInsideArtworkAllowed: false,
  };
  const qaThresholds = qaThresholdsFor(processFamily, purpose);
  const withoutFingerprint = {
    outputKind: "evavo_art_book_illustration_intelligence_plan" as const,
    schemaVersion: BOOK_ILLUSTRATION_INTELLIGENCE_SCHEMA_VERSION,
    contract: BOOK_ILLUSTRATION_INTELLIGENCE_CONTRACT,
    capabilities: BOOK_ILLUSTRATION_INTELLIGENCE_CAPABILITIES,
    identity,
    purpose,
    contentClass,
    visualPacketFingerprint,
    sourceBriefFingerprint,
    processFamily,
    genreRoute,
    desiredAesthetic,
    narrativeBrief,
    continuityLockIds: [...continuityLockIds].sort(),
    rightsEvidenceIds: [...rightsEvidenceIds].sort(),
    markGrammar,
    printRequirements,
    layerPlan,
    qaThresholds,
    rightsPolicy: {
      namedCreatorImitationProhibited: true as const,
      brandedFranchiseTransferProhibited: true as const,
      distinctiveSurfaceReconstructionProhibited: true as const,
      genericMechanismsAndHistoricalTechniquesAllowed: true as const,
      falseHandmadeClaimProhibited: true as const,
      syntheticProvenanceMayNotBeHidden: true as const,
    },
    providerCallPerformed: false as const,
    selectionPerformed: false as const,
    promotionPerformed: false as const,
    bookUseBindingCreated: false as const,
    publicationPerformed: false as const,
  };
  const plan: BookIllustrationIntelligencePlanV1 = {
    ...withoutFingerprint,
    planFingerprint: fingerprint(withoutFingerprint),
  };
  if (printProfile.profileId === "kdp_print") {
    warnings.push(
      "KDP print delivery must be verified against the exact edition template, previewer output and physical proof before release.",
    );
  }
  return {
    outputKind: "evavo_art_book_illustration_plan_compilation_result",
    schemaVersion: BOOK_ILLUSTRATION_INTELLIGENCE_SCHEMA_VERSION,
    contract: BOOK_ILLUSTRATION_INTELLIGENCE_CONTRACT,
    status: "ready",
    plan,
    blockers: [],
    warnings: unique(warnings),
    providerCallPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    publicationPerformed: false,
  };
}

export function validateBookIllustrationIntelligencePlan(
  value: unknown,
): string[] {
  const issues: string[] = [];
  const plan = outputObject(value, "plan", PLAN_OUTPUT_KEYS, issues);
  if (!plan) return issues;
  if (
    plan.outputKind !== "evavo_art_book_illustration_intelligence_plan" ||
    plan.schemaVersion !== BOOK_ILLUSTRATION_INTELLIGENCE_SCHEMA_VERSION ||
    plan.contract !== BOOK_ILLUSTRATION_INTELLIGENCE_CONTRACT
  ) {
    issues.push("Illustration intelligence plan kind, schema version or contract is invalid.");
  }
  verifyObjectFingerprint(plan, "planFingerprint", "plan", issues);
  outputObject(plan.identity, "plan.identity", IDENTITY_KEYS, issues);
  outputObject(plan.narrativeBrief, "plan.narrativeBrief", NARRATIVE_KEYS, issues);
  const printRequirements = outputObject(
    plan.printRequirements,
    "plan.printRequirements",
    PRINT_REQUIREMENT_KEYS,
    issues,
  );
  if (printRequirements) {
    if (printRequirements.geometryAuthority !== "docs_suite_exact_dimensions") {
      issues.push("Illustration plan geometry must remain Docs Suite exact dimensions.");
    }
    if (
      !Number.isFinite(printRequirements.deliveryWidthInches) ||
      !Number.isFinite(printRequirements.deliveryHeightInches) ||
      printRequirements.deliveryWidthInches <= 0 ||
      printRequirements.deliveryHeightInches <= 0
    ) {
      issues.push("Illustration plan delivery geometry is invalid.");
    }
    if (
      plan.purpose === "full_wrap_art" &&
      (typeof printRequirements.externalTemplateFingerprint !== "string" ||
        !SHA256.test(printRequirements.externalTemplateFingerprint))
    ) {
      issues.push("Full-wrap illustration plan lost its exact external template binding.");
    }
  }
  const layerPlan = outputObject(plan.layerPlan, "plan.layerPlan", LAYER_PLAN_KEYS, issues);
  if (
    !layerPlan ||
    layerPlan.generatedTextInsideArtworkAllowed !== false ||
    layerPlan.typographyLayer !== "docs_suite_editable_typography" ||
    layerPlan.accessibilityLayer !== "docs_suite_alt_text_and_reading_order"
  ) {
    issues.push("Illustration intelligence plan lost editable-text or accessibility separation.");
  }
  const rightsPolicy = outputObject(
    plan.rightsPolicy,
    "plan.rightsPolicy",
    RIGHTS_POLICY_KEYS,
    issues,
  );
  if (rightsPolicy && Object.values(rightsPolicy).some((entry) => entry !== true)) {
    issues.push("Illustration intelligence rights policy must remain fully enabled.");
  }
  if (
    !Array.isArray(plan.capabilities) ||
    plan.capabilities.length !== BOOK_ILLUSTRATION_INTELLIGENCE_CAPABILITIES.length ||
    !BOOK_ILLUSTRATION_INTELLIGENCE_CAPABILITIES.every((capability) =>
      plan.capabilities.includes(capability),
    )
  ) {
    issues.push("Illustration intelligence plan capabilities differ from the contract.");
  }
  if (!Array.isArray(plan.rightsEvidenceIds) || plan.rightsEvidenceIds.length < 1) {
    issues.push("Illustration intelligence plan requires rights evidence.");
  }
  if (
    plan.providerCallPerformed !== false ||
    plan.selectionPerformed !== false ||
    plan.promotionPerformed !== false ||
    plan.bookUseBindingCreated !== false ||
    plan.publicationPerformed !== false
  ) {
    issues.push("Illustration intelligence plan claims forbidden authority or side effects.");
  }
  return unique(issues);
}

export function evaluateBookIllustrationCandidate(
  value: unknown,
): BookIllustrationCandidateQaResultV1 {
  const findings: BookIllustrationQaFindingV1[] = [];
  const input = strictObject(value, "input", QA_INPUT_KEYS, undefined);
  if (!input) {
    return qaFailure("invalid", "sha256:" + "0".repeat(64), [
      finding("qa_input_invalid", "blocker", "identity", "Candidate QA input must be one strict object.", "Provide one complete candidate QA input."),
    ]);
  }
  const parseBlockers: string[] = [];
  rejectUnknown(input, QA_INPUT_KEYS, "input", parseBlockers);
  if (
    input.outputKind !== "evavo_art_book_illustration_candidate_qa_input" ||
    input.schemaVersion !== BOOK_ILLUSTRATION_INTELLIGENCE_SCHEMA_VERSION ||
    input.contract !== BOOK_ILLUSTRATION_INTELLIGENCE_CONTRACT
  ) {
    parseBlockers.push("Candidate QA input kind, schema version or contract is invalid.");
  }
  for (const field of [
    "providerCallPerformedByQa",
    "candidateBytesRewrittenByQa",
    "automaticSelectionAllowed",
    "automaticPromotionAllowed",
    "publicationAllowed",
  ] as const) {
    if (input[field] !== false) parseBlockers.push(`${field} must remain false.`);
  }
  const candidateId = safeId(input.candidateId, "candidateId", parseBlockers);
  const plan = input.plan as BookIllustrationIntelligencePlanV1;
  const planIssues =
    plan && typeof plan === "object" ? validateBookIllustrationIntelligencePlan(plan) : ["plan is missing."];
  parseBlockers.push(...planIssues);
  const observedPlanFingerprint = sha(input.observedPlanFingerprint, "observedPlanFingerprint", parseBlockers);
  const observedVisualPacketFingerprint = sha(input.observedVisualPacketFingerprint, "observedVisualPacketFingerprint", parseBlockers);
  const observedContinuityLockIds = idArray(input.observedContinuityLockIds, "observedContinuityLockIds", parseBlockers, 0, 1_000);
  const technical = parseTechnical(input.technical, parseBlockers);
  const craft = parseCraft(input.craft, parseBlockers);
  const rights = parseRights(input.rights, parseBlockers);
  const evidenceIds = idArray(input.evidenceIds, "evidenceIds", parseBlockers, 1, 1_000);
  void evidenceIds;

  for (const message of unique(parseBlockers)) {
    findings.push(
      finding(
        "qa_contract_invalid",
        "blocker",
        "identity",
        message,
        "Recompile the plan and submit complete, fingerprint-bound QA evidence.",
      ),
    );
  }
  if (!plan || !technical || !craft || !rights) {
    return qaFailure(candidateId, plan?.planFingerprint ?? observedPlanFingerprint, findings);
  }

  if (observedPlanFingerprint !== plan.planFingerprint) {
    findings.push(finding("plan_fingerprint_mismatch", "blocker", "identity", "Observed plan fingerprint differs from the exact plan.", "Inspect the candidate against the plan that actually produced it."));
  }
  if (observedVisualPacketFingerprint !== plan.visualPacketFingerprint) {
    findings.push(finding("visual_packet_mismatch", "blocker", "identity", "Candidate was evaluated against a different visual narrative packet.", "Regenerate or re-evaluate against the exact manuscript-bound visual packet."));
  }
  if (!sameSet(observedContinuityLockIds, plan.continuityLockIds)) {
    findings.push(finding("continuity_lock_mismatch", "blocker", "continuity", "Observed continuity locks differ from the plan.", "Restore every exact character, location, prop and motif lock before review."));
  }

  evaluateTechnical(plan, technical, findings);
  evaluateCraft(plan, craft, findings);
  evaluateRights(rights, findings);

  const sortedFindings = [...findings].sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === "blocker" ? -1 : 1) ||
      a.code.localeCompare(b.code),
  );
  const blockerCodes = unique(sortedFindings.filter((entry) => entry.severity === "blocker").map((entry) => entry.code));
  const warningCodes = unique(sortedFindings.filter((entry) => entry.severity === "warning").map((entry) => entry.code));
  const status: BookIllustrationCandidateQaResultV1["status"] = blockerCodes.length
    ? "rejected"
    : warningCodes.length
      ? "needs_revision"
      : "ready_for_independent_review";
  const withoutFingerprint = {
    outputKind: "evavo_art_book_illustration_candidate_qa_result" as const,
    schemaVersion: BOOK_ILLUSTRATION_INTELLIGENCE_SCHEMA_VERSION,
    contract: BOOK_ILLUSTRATION_INTELLIGENCE_CONTRACT,
    candidateId,
    planFingerprint: plan.planFingerprint,
    status,
    findings: sortedFindings,
    blockerCodes,
    warningCodes,
    providerCallPerformedByQa: false as const,
    candidateBytesRewrittenByQa: false as const,
    selectionPerformed: false as const,
    promotionPerformed: false as const,
    bookUseBindingCreated: false as const,
    publicationPerformed: false as const,
  };
  return {
    ...withoutFingerprint,
    resultFingerprint: fingerprint(withoutFingerprint),
  };
}

function evaluateTechnical(
  plan: BookIllustrationIntelligencePlanV1,
  evidence: BookIllustrationCandidateTechnicalEvidenceV1,
  findings: BookIllustrationQaFindingV1[],
): void {
  const requirements = plan.printRequirements;
  const calculatedPpi = Math.min(
    evidence.widthPx / evidence.printWidthInches,
    evidence.heightPx / evidence.printHeightInches,
  );
  if (
    Math.abs(evidence.printWidthInches - requirements.deliveryWidthInches) > 0.01 ||
    Math.abs(evidence.printHeightInches - requirements.deliveryHeightInches) > 0.01
  ) {
    findings.push(finding("delivery_geometry_mismatch", "blocker", "print", "Candidate print dimensions differ from the edition-bound trim and bleed geometry.", "Use the exact edition delivery width and height from the plan."));
  }
  if (Math.abs(evidence.effectiveContinuousTonePpi - calculatedPpi) > 1) {
    findings.push(finding("reported_ppi_inconsistent", "blocker", "print", "Reported effective PPI is inconsistent with raster pixels and physical dimensions.", "Recalculate PPI from exact pixel dimensions and final physical size."));
  }
  if (evidence.effectivePureLineArtPpi > calculatedPpi + 1) {
    findings.push(finding("reported_line_ppi_impossible", "blocker", "print", "Reported line-art PPI exceeds the available raster resolution.", "Supply a higher-resolution raster or a verified vector master."));
  }
  if (evidence.widthPx < requirements.targetPixelWidth || evidence.heightPx < requirements.targetPixelHeight) {
    findings.push(finding("raster_dimensions_below_plan", "blocker", "print", "Candidate raster dimensions are below the edition-bound target.", "Render or master at the required target dimensions without upscaling a deficient source."));
  }
  if (requirements.printUse && evidence.effectiveContinuousTonePpi < requirements.minimumContinuousTonePpi) {
    findings.push(finding("continuous_tone_ppi_low", "blocker", "print", "Effective continuous-tone resolution is below the print minimum.", `Provide at least ${requirements.minimumContinuousTonePpi} effective PPI at final size.`));
  }
  if (requirements.printUse && isLineDominant(plan.processFamily) && evidence.effectivePureLineArtPpi < requirements.minimumPureLineArtPpi) {
    findings.push(finding("line_art_ppi_low", "blocker", "print", "Effective line-art resolution is below the process minimum.", `Provide at least ${requirements.minimumPureLineArtPpi} effective PPI for pure line art at final size.`));
  }
  if (requirements.bleedInchesPerOuterEdge > 0 && evidence.bleedInchesPerOuterEdge + 1e-9 < requirements.bleedInchesPerOuterEdge) {
    findings.push(finding("bleed_insufficient", "blocker", "print", "Outer-edge bleed is below the edition requirement.", `Extend artwork by at least ${requirements.bleedInchesPerOuterEdge.toFixed(3)} inches on each required outer edge.`));
  }
  if (requirements.transparencyMustBeFlattenedAtDelivery && evidence.hasTransparency && !evidence.flattenedForDelivery) {
    findings.push(finding("delivery_transparency_unflattened", "blocker", "print", "Delivery artwork retains transparency where the print profile requires flattening.", "Flatten transparency only in the delivery derivative while retaining the editable layered master."));
  }
  if (!evidence.editableLayeredMasterAvailable) {
    findings.push(finding("editable_master_missing", "blocker", "presentation", "No editable layered master is available.", "Preserve a layered master separately from flattened print derivatives."));
  }
  if (evidence.minimumPositiveLineWidthPx < plan.markGrammar.reproductionGrammar.minimumPositiveLineWidthPx) {
    findings.push(finding("positive_line_too_thin", "blocker", "print", "Positive lines fall below the process-safe minimum.", "Strengthen vulnerable positive lines before raster delivery."));
  }
  if (evidence.minimumReverseLineWidthPx < plan.markGrammar.reproductionGrammar.minimumReverseLineWidthPx) {
    findings.push(finding("reverse_line_too_thin", "blocker", "print", "Reverse lines fall below the process-safe minimum.", "Open reverse lines so they survive ink spread and reproduction."));
  }
  if (evidence.maximumInkCoveragePercent > requirements.maximumInkCoveragePercent) {
    findings.push(finding("ink_coverage_excessive", "blocker", "print", "Maximum ink coverage exceeds the plan.", "Reduce compounded dark-channel coverage while preserving value structure."));
  }
  if (evidence.tonalStepCount > plan.markGrammar.tonalGrammar.maximumTonalSteps) {
    findings.push(finding("tonal_steps_excessive", "warning", "craft", "The candidate exceeds the planned tonal-step discipline.", "Consolidate adjacent values into deliberate printable groups."));
  }
  if (evidence.embeddedTextDetected) {
    findings.push(finding("embedded_text_detected", "blocker", "presentation", "Generated artwork contains embedded text.", "Remove generated title, dialogue, caption, label and sound-effect pixels; keep all lettering editable in Docs Suite."));
  }
  if (evidence.embeddedLogoDetected) {
    findings.push(finding("embedded_logo_detected", "blocker", "rights", "Candidate contains an embedded logo or logo-like mark.", "Remove unapproved marks and use only project-owned, separately managed identity assets."));
  }
}

function evaluateCraft(
  plan: BookIllustrationIntelligencePlanV1,
  evidence: BookIllustrationCandidateCraftEvidenceV1,
  findings: BookIllustrationQaFindingV1[],
): void {
  const thresholds = plan.qaThresholds;
  const minimumChecks: Array<readonly [keyof BookIllustrationCandidateCraftEvidenceV1, number, string, string]> = [
    ["lineWeightVariance", thresholds.minimumLineWeightVariance, "line_weight_flat", "Build a clear primary, secondary and tertiary line hierarchy."],
    ["hatchLightConsistency", thresholds.minimumHatchLightConsistency, "hatch_light_conflict", "Rebuild hatching so direction and density describe form, material and one coherent light model."],
    ["materialMarkVariation", thresholds.minimumMaterialMarkVariation, "material_marks_generic", "Use material-specific marks rather than one texture language across every surface."],
    ["anatomyScore", thresholds.minimumAnatomyScore, "anatomy_failure", "Correct body construction, weight, joints and gesture before stylistic rendering."],
    ["handsAndFacesScore", thresholds.minimumHandsAndFacesScore, "hands_faces_failure", "Redraw hands and faces with explicit construction and expression checks."],
    ["perspectiveScore", thresholds.minimumPerspectiveScore, "perspective_failure", "Reconcile horizon, scale, overlap and scene geometry."],
    ["continuityScore", thresholds.minimumContinuityScore, "continuity_failure", "Restore exact character, costume, prop, location, damage and lighting continuity."],
    ["compositionScore", thresholds.minimumCompositionScore, "composition_weak", "Rebuild focal hierarchy, silhouette separation, negative space and narrative action."],
    ["printSeparationScore", thresholds.minimumPrintSeparationScore, "print_separation_weak", "Separate adjacent tonal and line structures so they remain readable after reproduction."],
  ];
  for (const [key, minimum, code, remediation] of minimumChecks) {
    if (evidence[key] < minimum) {
      findings.push(finding(code, "blocker", key === "continuityScore" ? "continuity" : "craft", `${String(key)} scored ${evidence[key]}, below the required ${minimum}.`, remediation));
    }
  }
  const maximumChecks: Array<readonly [keyof BookIllustrationCandidateCraftEvidenceV1, number, string, string]> = [
    ["repeatedTextureScore", thresholds.maximumRepeatedTextureScore, "repeated_texture_stamps", "Replace repeated stamps with marks that respond to local form and material."],
    ["randomNoiseScore", thresholds.maximumRandomNoiseScore, "random_scratch_overlay", "Remove decorative scratch/noise overlays that do not describe form, light or material."],
    ["pseudoDetailScore", thresholds.maximumPseudoDetailScore, "meaningless_pseudo_detail", "Replace unreadable pseudo-detail with intentional, verifiable structures."],
    ["digitalSmoothingScore", thresholds.maximumDigitalSmoothingScore, "digital_smoothing_excessive", "Restore decisive edges, mark rhythm and controlled value transitions."],
  ];
  for (const [key, maximum, code, remediation] of maximumChecks) {
    if (evidence[key] > maximum) {
      findings.push(finding(code, "blocker", "craft", `${String(key)} scored ${evidence[key]}, above the allowed ${maximum}.`, remediation));
    }
  }
}

function evaluateRights(
  evidence: BookIllustrationCandidateRightsEvidenceV1,
  findings: BookIllustrationQaFindingV1[],
): void {
  const checks: Array<readonly [keyof BookIllustrationCandidateRightsEvidenceV1, string, string]> = [
    ["namedCreatorImitationDetected", "named_creator_imitation", "Remove recognisable surface imitation and rebuild from generic techniques plus project-owned visual canon."],
    ["brandedFranchiseElementsDetected", "branded_franchise_transfer", "Remove proprietary symbols, trade dress, character designs and franchise-specific visual language."],
    ["distinctiveSurfaceReconstructionDetected", "distinctive_surface_reconstruction", "Replace copied surface signatures with independently authored mark grammar."],
    ["falseHandmadeClaimDetected", "false_handmade_claim", "Describe provenance truthfully; never label generated or transformed work as handmade."],
    ["syntheticProvenanceHidden", "synthetic_provenance_hidden", "Retain truthful internal provenance and make the required publication disclosure decision in Docs Suite."],
  ];
  for (const [key, code, remediation] of checks) {
    if (evidence[key]) {
      findings.push(finding(code, "blocker", "rights", `${String(key)} is true.`, remediation));
    }
  }
}

function markGrammarFor(
  process: BookIllustrationProcessFamily,
  profile: BookIllustrationPrintProfileV1,
): BookIllustrationMarkGrammarV1 {
  const lineDominant = isLineDominant(process);
  const sparse = process === "linocut" || process === "black_only" || process === "ornamental_print";
  const tonal = process === "lithographic_tone" || process === "duotone" || process === "risograph" || process === "children_picture_book";
  return {
    contourHierarchy: {
      primary: lineDominant ? "decisive silhouette and structural contour" : "controlled structural edge",
      secondary: "form, overlap and major material boundary",
      tertiary: "selective texture, wear and focal detail only",
      minimumDistinctWeights: lineDominant ? 3 : 2,
    },
    hatchGrammar: {
      followsForm: true,
      followsMaterial: true,
      followsLight: true,
      maximumCrosshatchLayers: sparse ? 1 : process === "intaglio_etching" || process === "relief_engraving" ? 4 : 3,
      maximumStippleCoveragePercent: sparse ? 8 : tonal ? 35 : 22,
      randomScratchOverlayProhibited: true,
    },
    blackMassGrammar: {
      minimumAnchorMasses: sparse ? 3 : 2,
      maximumCoveragePercent: process === "black_only" || process === "linocut" ? 68 : 48,
      silhouetteReadRequired: true,
    },
    textureGrammar: {
      materialSpecificMarksRequired: true,
      repeatedTextureStampProhibited: true,
      clonedDistressProhibited: true,
      meaninglessPseudoDetailProhibited: true,
    },
    tonalGrammar: {
      maximumTonalSteps: sparse ? 5 : tonal ? 12 : 8,
      halftoneAllowed: process === "brush_pen_halftone" || process === "duotone" || process === "risograph" || process === "graphic_novel_ink",
      ...(profile.screenLpi === undefined ? {} : { targetScreenLpi: profile.screenLpi }),
    },
    reproductionGrammar: {
      minimumPositiveLineWidthPx: lineDominant ? 1.5 : 1.25,
      minimumReverseLineWidthPx: lineDominant ? 2 : 1.75,
      registrationTolerancePx: process === "risograph" || process === "duotone" ? 2 : 1,
      preserveLayeredEditableMaster: true,
    },
  };
}

function printRequirementsFor(
  profile: BookIllustrationPrintProfileV1,
  process: BookIllustrationProcessFamily,
): BookIllustrationPrintRequirementsV1 {
  const printUse = profile.profileId !== "digital_only";
  const minimumContinuousTonePpi = printUse ? Math.max(300, profile.minimumPpi ?? 300) : Math.max(144, profile.minimumPpi ?? 144);
  const minimumPureLineArtPpi = printUse ? Math.max(600, profile.pureLineArtPpi ?? 600) : Math.max(300, profile.pureLineArtPpi ?? 300);
  const bleed = profile.bleedRequired ? 0.125 : 0;
  const targetRasterPpi = isLineDominant(process)
    ? minimumPureLineArtPpi
    : minimumContinuousTonePpi;
  return {
    printUse,
    trimWidthInches: profile.trimWidthInches,
    trimHeightInches: profile.trimHeightInches,
    deliveryWidthInches: profile.deliveryWidthInches,
    deliveryHeightInches: profile.deliveryHeightInches,
    geometryAuthority: "docs_suite_exact_dimensions",
    ...(profile.externalTemplateFingerprint === undefined
      ? {}
      : { externalTemplateFingerprint: profile.externalTemplateFingerprint }),
    minimumContinuousTonePpi,
    minimumPureLineArtPpi,
    targetRasterPpi,
    targetPixelWidth: Math.ceil(profile.deliveryWidthInches * targetRasterPpi),
    targetPixelHeight: Math.ceil(profile.deliveryHeightInches * targetRasterPpi),
    bleedInchesPerOuterEdge: bleed,
    transparencyMustBeFlattenedAtDelivery: printUse,
    editableLayeredMasterRequired: true,
    maximumInkCoveragePercent: profile.maximumInkCoveragePercent,
    colourMode: profile.colourMode,
    paperDescription: profile.paperDescription,
  };
}

function qaThresholdsFor(
  process: BookIllustrationProcessFamily,
  purpose: BookIllustrationPurpose,
): BookIllustrationQaThresholdsV1 {
  const humanFigure = !["diagram", "map", "ornament", "endpaper"].includes(purpose);
  const lineDominant = isLineDominant(process);
  return {
    minimumLineWeightVariance: lineDominant ? 62 : 48,
    minimumHatchLightConsistency: lineDominant ? 76 : 62,
    minimumMaterialMarkVariation: lineDominant ? 68 : 55,
    maximumRepeatedTextureScore: 18,
    maximumRandomNoiseScore: 12,
    maximumPseudoDetailScore: 15,
    minimumAnatomyScore: humanFigure ? 78 : 0,
    minimumHandsAndFacesScore: humanFigure ? 80 : 0,
    minimumPerspectiveScore: 75,
    minimumContinuityScore: 88,
    maximumDigitalSmoothingScore: lineDominant ? 20 : 38,
    minimumCompositionScore: 80,
    minimumPrintSeparationScore: 82,
  };
}

function isLineDominant(process: BookIllustrationProcessFamily): boolean {
  return [
    "relief_engraving",
    "intaglio_etching",
    "scratchboard",
    "brush_pen_halftone",
    "linocut",
    "black_only",
    "graphic_novel_ink",
    "technical_plate",
    "cartographic_linework",
    "ornamental_print",
  ].includes(process);
}

function parseIdentity(value: LooseRecord | undefined, blockers: string[]): BookIllustrationIdentityV1 | undefined {
  if (!value) return undefined;
  return {
    workspaceId: safeId(value.workspaceId, "identity.workspaceId", blockers),
    projectId: safeId(value.projectId, "identity.projectId", blockers),
    bookId: safeId(value.bookId, "identity.bookId", blockers),
    ...(value.editionId === undefined ? {} : { editionId: safeId(value.editionId, "identity.editionId", blockers) }),
    requestId: safeId(value.requestId, "identity.requestId", blockers),
    assetId: safeId(value.assetId, "identity.assetId", blockers),
  };
}

function parseNarrativeBrief(value: unknown, blockers: string[]): BookIllustrationNarrativeBriefV1 | undefined {
  const input = strictObject(value, "narrativeBrief", NARRATIVE_KEYS, blockers);
  if (!input) return undefined;
  return {
    primarySubject: boundedText(input.primarySubject, "narrativeBrief.primarySubject", blockers, 4_000),
    supportingSubjects: textArray(input.supportingSubjects, "narrativeBrief.supportingSubjects", blockers, 0, 128, 2_000),
    narrativePurpose: boundedText(input.narrativePurpose, "narrativeBrief.narrativePurpose", blockers, 4_000),
    emotionalTemperature: boundedText(input.emotionalTemperature, "narrativeBrief.emotionalTemperature", blockers, 2_000),
    visualAction: boundedText(input.visualAction, "narrativeBrief.visualAction", blockers, 8_000),
    compositionRequirements: textArray(input.compositionRequirements, "narrativeBrief.compositionRequirements", blockers, 1, 128, 2_000),
    mustShow: textArray(input.mustShow, "narrativeBrief.mustShow", blockers, 0, 128, 2_000),
    mustAvoid: textArray(input.mustAvoid, "narrativeBrief.mustAvoid", blockers, 1, 128, 2_000),
    researchEvidenceIds: idArray(input.researchEvidenceIds, "narrativeBrief.researchEvidenceIds", blockers, 0, 1_000),
  };
}

function parsePrintProfile(value: unknown, blockers: string[]): BookIllustrationPrintProfileV1 | undefined {
  const input = strictObject(value, "printProfile", PRINT_KEYS, blockers);
  if (!input) return undefined;
  const profileId = enumValue(input.profileId, PRINT_PROFILES, "printProfile.profileId", blockers);
  const trimWidthInches = numberInRange(
    input.trimWidthInches,
    1,
    30,
    "printProfile.trimWidthInches",
    blockers,
  );
  const trimHeightInches = numberInRange(
    input.trimHeightInches,
    1,
    40,
    "printProfile.trimHeightInches",
    blockers,
  );
  const deliveryWidthInches = numberInRange(
    input.deliveryWidthInches,
    1,
    100,
    "printProfile.deliveryWidthInches",
    blockers,
  );
  const deliveryHeightInches = numberInRange(
    input.deliveryHeightInches,
    1,
    100,
    "printProfile.deliveryHeightInches",
    blockers,
  );
  if (input.geometryAuthority !== "docs_suite_exact_dimensions") {
    blockers.push("printProfile.geometryAuthority must be docs_suite_exact_dimensions.");
  }
  const externalTemplateFingerprint = optionalSha(
    input.externalTemplateFingerprint,
    "printProfile.externalTemplateFingerprint",
    blockers,
  );
  const bleedRequired = booleanValue(
    input.bleedRequired,
    "printProfile.bleedRequired",
    blockers,
  );
  if (
    deliveryWidthInches + 0.000_001 < trimWidthInches ||
    deliveryHeightInches + 0.000_001 < trimHeightInches
  ) {
    blockers.push("Exact delivery dimensions cannot be smaller than trim dimensions.");
  }
  if (
    !bleedRequired &&
    (Math.abs(deliveryWidthInches - trimWidthInches) > 0.01 ||
      Math.abs(deliveryHeightInches - trimHeightInches) > 0.01)
  ) {
    blockers.push("Non-bleed artwork delivery dimensions must match trim dimensions.");
  }
  if (
    bleedRequired &&
    deliveryWidthInches <= trimWidthInches &&
    deliveryHeightInches <= trimHeightInches
  ) {
    blockers.push("Bleed-required artwork must include exact delivery dimensions beyond trim.");
  }
  if (profileId === "digital_only" && bleedRequired) {
    blockers.push("digital_only artwork cannot require physical print bleed.");
  }
  const minimumPpi = optionalInteger(input.minimumPpi, 72, 2_400, "printProfile.minimumPpi", blockers);
  const pureLineArtPpi = optionalInteger(input.pureLineArtPpi, 72, 2_400, "printProfile.pureLineArtPpi", blockers);
  const screenLpi = optionalInteger(input.screenLpi, 30, 400, "printProfile.screenLpi", blockers);
  if (profileId === "kdp_print" && minimumPpi !== undefined && minimumPpi < 300) {
    blockers.push("KDP print minimumPpi cannot be below 300.");
  }
  const effectiveMinimumPpi = minimumPpi ?? (profileId === "digital_only" ? 144 : 300);
  if (screenLpi !== undefined && effectiveMinimumPpi < screenLpi * 1.5) {
    blockers.push("minimumPpi must be at least 1.5 times screenLpi for halftone reproduction.");
  }
  return {
    profileId,
    trimWidthInches,
    trimHeightInches,
    deliveryWidthInches,
    deliveryHeightInches,
    geometryAuthority: "docs_suite_exact_dimensions",
    ...(externalTemplateFingerprint === undefined ? {} : { externalTemplateFingerprint }),
    bleedRequired,
    ...(minimumPpi === undefined ? {} : { minimumPpi }),
    ...(pureLineArtPpi === undefined ? {} : { pureLineArtPpi }),
    ...(screenLpi === undefined ? {} : { screenLpi }),
    colourMode: enumValue(input.colourMode, COLOUR_MODES, "printProfile.colourMode", blockers),
    paperDescription: boundedText(input.paperDescription, "printProfile.paperDescription", blockers, 1_000),
    maximumInkCoveragePercent: numberInRange(input.maximumInkCoveragePercent, 50, 400, "printProfile.maximumInkCoveragePercent", blockers),
  };
}

function parsePresentationPolicy(value: unknown, blockers: string[]): BookIllustrationPresentationPolicyV1 | undefined {
  const input = strictObject(value, "presentationPolicy", PRESENTATION_KEYS, blockers);
  if (!input) return undefined;
  if (input.generatedArtworkTextFreeRequired !== true) blockers.push("generatedArtworkTextFreeRequired must be true.");
  if (input.editableTypographyRequired !== true) blockers.push("editableTypographyRequired must be true.");
  if (typeof input.editableLetteringRequired !== "boolean") blockers.push("editableLetteringRequired must be boolean.");
  if (input.labelsOwnedByDocsSuite !== true) blockers.push("labelsOwnedByDocsSuite must be true.");
  if (input.altTextOwnedByDocsSuite !== true) blockers.push("altTextOwnedByDocsSuite must be true.");
  if (input.provenanceDisclosureRequired !== true) blockers.push("provenanceDisclosureRequired must be true.");
  return {
    generatedArtworkTextFreeRequired: true,
    editableTypographyRequired: true,
    editableLetteringRequired: input.editableLetteringRequired === true,
    labelsOwnedByDocsSuite: true,
    altTextOwnedByDocsSuite: true,
    provenanceDisclosureRequired: true,
  };
}

function parseTechnical(value: unknown, blockers: string[]): BookIllustrationCandidateTechnicalEvidenceV1 | undefined {
  const input = strictObject(value, "technical", TECHNICAL_KEYS, blockers);
  if (!input) return undefined;
  return {
    widthPx: integerInRange(input.widthPx, 1, 100_000, "technical.widthPx", blockers),
    heightPx: integerInRange(input.heightPx, 1, 100_000, "technical.heightPx", blockers),
    printWidthInches: numberInRange(input.printWidthInches, 0.1, 100, "technical.printWidthInches", blockers),
    printHeightInches: numberInRange(input.printHeightInches, 0.1, 100, "technical.printHeightInches", blockers),
    effectiveContinuousTonePpi: numberInRange(input.effectiveContinuousTonePpi, 1, 10_000, "technical.effectiveContinuousTonePpi", blockers),
    effectivePureLineArtPpi: numberInRange(input.effectivePureLineArtPpi, 1, 10_000, "technical.effectivePureLineArtPpi", blockers),
    bleedInchesPerOuterEdge: numberInRange(input.bleedInchesPerOuterEdge, 0, 2, "technical.bleedInchesPerOuterEdge", blockers),
    hasTransparency: booleanValue(input.hasTransparency, "technical.hasTransparency", blockers),
    flattenedForDelivery: booleanValue(input.flattenedForDelivery, "technical.flattenedForDelivery", blockers),
    editableLayeredMasterAvailable: booleanValue(input.editableLayeredMasterAvailable, "technical.editableLayeredMasterAvailable", blockers),
    minimumPositiveLineWidthPx: numberInRange(input.minimumPositiveLineWidthPx, 0, 1_000, "technical.minimumPositiveLineWidthPx", blockers),
    minimumReverseLineWidthPx: numberInRange(input.minimumReverseLineWidthPx, 0, 1_000, "technical.minimumReverseLineWidthPx", blockers),
    maximumInkCoveragePercent: numberInRange(input.maximumInkCoveragePercent, 0, 500, "technical.maximumInkCoveragePercent", blockers),
    tonalStepCount: integerInRange(input.tonalStepCount, 1, 10_000, "technical.tonalStepCount", blockers),
    embeddedTextDetected: booleanValue(input.embeddedTextDetected, "technical.embeddedTextDetected", blockers),
    embeddedLogoDetected: booleanValue(input.embeddedLogoDetected, "technical.embeddedLogoDetected", blockers),
  };
}

function parseCraft(value: unknown, blockers: string[]): BookIllustrationCandidateCraftEvidenceV1 | undefined {
  const input = strictObject(value, "craft", CRAFT_KEYS, blockers);
  if (!input) return undefined;
  return Object.fromEntries(
    [...CRAFT_KEYS].map((key) => [key, numberInRange(input[key], 0, 100, `craft.${key}`, blockers)]),
  ) as unknown as BookIllustrationCandidateCraftEvidenceV1;
}

function parseRights(value: unknown, blockers: string[]): BookIllustrationCandidateRightsEvidenceV1 | undefined {
  const input = strictObject(value, "rights", RIGHTS_KEYS, blockers);
  if (!input) return undefined;
  return Object.fromEntries(
    [...RIGHTS_KEYS].map((key) => [key, booleanValue(input[key], `rights.${key}`, blockers)]),
  ) as unknown as BookIllustrationCandidateRightsEvidenceV1;
}

function blockedPlan(blockers: string[], warnings: string[]): BookIllustrationPlanCompilationResultV1 {
  return {
    outputKind: "evavo_art_book_illustration_plan_compilation_result",
    schemaVersion: BOOK_ILLUSTRATION_INTELLIGENCE_SCHEMA_VERSION,
    contract: BOOK_ILLUSTRATION_INTELLIGENCE_CONTRACT,
    status: "blocked",
    blockers: unique(blockers),
    warnings: unique(warnings),
    providerCallPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    publicationPerformed: false,
  };
}

function qaFailure(
  candidateId: string,
  planFingerprint: string,
  findings: BookIllustrationQaFindingV1[],
): BookIllustrationCandidateQaResultV1 {
  const sorted = [...findings].sort((a, b) => a.code.localeCompare(b.code));
  const withoutFingerprint = {
    outputKind: "evavo_art_book_illustration_candidate_qa_result" as const,
    schemaVersion: BOOK_ILLUSTRATION_INTELLIGENCE_SCHEMA_VERSION,
    contract: BOOK_ILLUSTRATION_INTELLIGENCE_CONTRACT,
    candidateId,
    planFingerprint,
    status: "rejected" as const,
    findings: sorted,
    blockerCodes: unique(sorted.map((entry) => entry.code)),
    warningCodes: [] as string[],
    providerCallPerformedByQa: false as const,
    candidateBytesRewrittenByQa: false as const,
    selectionPerformed: false as const,
    promotionPerformed: false as const,
    bookUseBindingCreated: false as const,
    publicationPerformed: false as const,
  };
  return { ...withoutFingerprint, resultFingerprint: fingerprint(withoutFingerprint) };
}

function finding(
  code: string,
  severity: BookIllustrationQaFindingV1["severity"],
  category: BookIllustrationQaFindingV1["category"],
  message: string,
  remediation: string,
): BookIllustrationQaFindingV1 {
  return { code, severity, category, message, remediation };
}

function outputObject(
  value: unknown,
  label: string,
  allowed: ReadonlySet<string>,
  issues: string[],
): LooseRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push(`${label} must be one object.`);
    return undefined;
  }
  const output = value as LooseRecord;
  const unknown = Object.keys(output).filter((key) => !allowed.has(key)).sort();
  if (unknown.length) issues.push(`${label} contains unknown fields: ${unknown.join(", ")}.`);
  return output;
}

function verifyObjectFingerprint(
  value: LooseRecord,
  fingerprintField: string,
  label: string,
  issues: string[],
): void {
  const observed = value[fingerprintField];
  const unsigned = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== fingerprintField),
  );
  if (typeof observed !== "string" || observed !== fingerprint(unsigned)) {
    issues.push(`${label}.${fingerprintField} does not match exact contents.`);
  }
}

function isCanonicalUtcTimestamp(value: string): boolean {
  if (!ISO_UTC.test(value) || !/\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function strictObject(
  value: unknown,
  label: string,
  allowed: ReadonlySet<string>,
  blockers: string[] | undefined,
): LooseRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    blockers?.push(`${label} must be one object.`);
    return undefined;
  }
  const result = value as LooseRecord;
  rejectUnknown(result, allowed, label, blockers);
  return result;
}

function rejectUnknown(
  value: LooseRecord,
  allowed: ReadonlySet<string>,
  label: string,
  blockers: string[] | undefined,
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort();
  if (unknown.length) blockers?.push(`${label} contains unknown fields: ${unknown.join(", ")}.`);
}

function safeId(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !SAFE_ID.test(value) || ["__proto__", "constructor", "prototype"].includes(value)) {
    blockers.push(`${label} must be a safe opaque identifier.`);
    return "invalid";
  }
  return value;
}

function sha(value: unknown, label: string, blockers: string[]): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    blockers.push(`${label} must be a SHA-256 digest.`);
    return `sha256:${"0".repeat(64)}`;
  }
  return value.startsWith("sha256:") ? value : `sha256:${value}`;
}

function optionalSha(
  value: unknown,
  label: string,
  blockers: string[],
): string | undefined {
  if (value === undefined) return undefined;
  return sha(value, label, blockers);
}

function boundedText(value: unknown, label: string, blockers: string[], maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || value.includes("\0")) {
    blockers.push(`${label} must be substantive text no longer than ${maximum} characters.`);
    return "invalid";
  }
  return value.trim();
}

function optionalText(value: unknown, label: string, blockers: string[], maximum: number): string | undefined {
  if (value === undefined) return undefined;
  return boundedText(value, label, blockers, maximum);
}

function booleanValue(value: unknown, label: string, blockers: string[]): boolean {
  if (typeof value !== "boolean") {
    blockers.push(`${label} must be boolean.`);
    return false;
  }
  return value;
}

function numberInRange(value: unknown, minimum: number, maximum: number, label: string, blockers: string[]): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    blockers.push(`${label} must be a finite number from ${minimum} to ${maximum}.`);
    return minimum;
  }
  return value;
}

function integerInRange(value: unknown, minimum: number, maximum: number, label: string, blockers: string[]): number {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    blockers.push(`${label} must be an integer from ${minimum} to ${maximum}.`);
    return minimum;
  }
  return Number(value);
}

function optionalInteger(value: unknown, minimum: number, maximum: number, label: string, blockers: string[]): number | undefined {
  if (value === undefined) return undefined;
  return integerInRange(value, minimum, maximum, label, blockers);
}

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T, label: string, blockers: string[]): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    blockers.push(`${label} must be one of ${allowed.join(", ")}.`);
    return allowed[0]!;
  }
  return value as T[number];
}

function idArray(value: unknown, label: string, blockers: string[], minimum: number, maximum: number): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    blockers.push(`${label} must contain ${minimum} to ${maximum} identifier(s).`);
    return [];
  }
  const output = value.map((entry, index) => safeId(entry, `${label}[${index}]`, blockers));
  if (new Set(output).size !== output.length) blockers.push(`${label} must not contain duplicates.`);
  return output;
}

function textArray(value: unknown, label: string, blockers: string[], minimum: number, maximum: number, maximumText: number): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    blockers.push(`${label} must contain ${minimum} to ${maximum} text item(s).`);
    return [];
  }
  const output = value.map((entry, index) => boundedText(entry, `${label}[${index}]`, blockers, maximumText));
  if (new Set(output).size !== output.length) blockers.push(`${label} must not contain duplicates.`);
  return output;
}

function sameSet(left: string[], right: string[]): boolean {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function canonicalBookIllustrationJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Canonical illustration JSON cannot contain non-finite numbers.");
  }
  return value;
}

export function fingerprintBookIllustrationValue(value: unknown): string {
  return `sha256:${sha256Hex(canonicalBookIllustrationJson(value))}`;
}

function fingerprint(value: unknown): string {
  return fingerprintBookIllustrationValue(value);
}

function sha256Hex(message: string): string {
  const rightRotate = (value: number, amount: number) =>
    (value >>> amount) | (value << (32 - amount));
  const maxWord = 2 ** 32;
  const words: number[] = [];
  const ascii = unescape(encodeURIComponent(message));
  const bitLength = ascii.length * 8;
  const hash: number[] = [];
  const constants: number[] = [];
  const isComposite: Record<number, boolean> = {};
  let primeCounter = 0;
  for (let candidate = 2; primeCounter < 64; candidate += 1) {
    if (!isComposite[candidate]) {
      for (let multiple = candidate * candidate; multiple < 313; multiple += candidate) {
        isComposite[multiple] = true;
      }
      if (primeCounter < 8) hash[primeCounter] = (Math.sqrt(candidate) * maxWord) | 0;
      constants[primeCounter] = (Math.cbrt(candidate) * maxWord) | 0;
      primeCounter += 1;
    }
  }
  let padded = `${ascii}\x80`;
  while ((padded.length % 64) !== 56) padded += "\x00";
  for (let index = 0; index < padded.length; index += 1) {
    words[index >> 2] = (words[index >> 2] ?? 0) | (padded.charCodeAt(index) << ((3 - index) % 4) * 8);
  }
  words.push((bitLength / maxWord) | 0, bitLength | 0);
  for (let block = 0; block < words.length; block += 16) {
    const schedule = words.slice(block, block + 16);
    const oldHash = [...hash];
    for (let round = 0; round < 64; round += 1) {
      const w15 = schedule[round - 15] ?? 0;
      const w2 = schedule[round - 2] ?? 0;
      const word = round < 16
        ? schedule[round] ?? 0
        : (((schedule[round - 16] ?? 0) +
            (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
            (schedule[round - 7] ?? 0) +
            (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0);
      schedule[round] = word;
      const a = hash[0] ?? 0;
      const b = hash[1] ?? 0;
      const c = hash[2] ?? 0;
      const d = hash[3] ?? 0;
      const e = hash[4] ?? 0;
      const f = hash[5] ?? 0;
      const g = hash[6] ?? 0;
      const h = hash[7] ?? 0;
      const temp1 = (h +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & f) ^ (~e & g)) +
        (constants[round] ?? 0) + word) | 0;
      const temp2 = ((rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hash[7] = g;
      hash[6] = f;
      hash[5] = e;
      hash[4] = (d + temp1) | 0;
      hash[3] = c;
      hash[2] = b;
      hash[1] = a;
      hash[0] = (temp1 + temp2) | 0;
    }
    for (let index = 0; index < 8; index += 1) {
      hash[index] = ((hash[index] ?? 0) + (oldHash[index] ?? 0)) | 0;
    }
  }
  return hash.map((value) => (value >>> 0).toString(16).padStart(8, "0")).join("");
}
