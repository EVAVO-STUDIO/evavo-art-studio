
import {
  BOOK_ART_CANDIDATE_SET_DEFAULT_CANDIDATES,
  BOOK_ART_CANDIDATE_SET_MAXIMUM_CANDIDATES,
  BOOK_ART_CANDIDATE_SET_MINIMUM_CANDIDATES,
  compileBookArtCandidateSetWorkOrder,
  type BookArtCandidateSetWorkOrderV1,
} from "./book-art-candidate-set.js";
import {
  fingerprintBookIllustrationValue,
  type BookIllustrationGenreRoute,
  type BookIllustrationProcessFamily,
} from "./book-illustration-intelligence.js";
import type {
  BookArtBriefV1,
  BookArtIdentityV1,
  BookArtManuscriptBindingV1,
  BookArtOutputRequirementV1,
  BookArtPurpose,
} from "./book-production.js";
import {
  compileBookArtProductionWorkOrder,
  fingerprintBookArtBrief,
  type BookArtProductionWorkOrderV1,
} from "./book-production-profile.js";

export const BOOK_ART_CREATIVE_DIRECTION_SCHEMA_VERSION = 1 as const;
export const BOOK_ART_CREATIVE_DIRECTION_CONTRACT =
  "evavo_book_art_creative_direction_v1" as const;

export const BOOK_ART_CREATIVE_DIRECTION_CAPABILITIES = Object.freeze([
  "book.creative_direction.compile",
  "book.creative_direction.route_programmes.compile",
] as const);

export type BookArtCreativeDirectionCapability =
  (typeof BOOK_ART_CREATIVE_DIRECTION_CAPABILITIES)[number];

export type BookArtCreativePurpose =
  | BookArtPurpose
  | "graphic_novel_page"
  | "graphic_novel_panel"
  | "endpaper";

export type BookArtCreativeGenre =
  | "literary"
  | "historical"
  | "horror"
  | "mythic"
  | "grimdark_fantasy"
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
  | "poetry"
  | "cookbook"
  | "academic"
  | "custom";

export type BookArtConceptRouteKind =
  | "material_symbol"
  | "environmental_pressure"
  | "relational_tension"
  | "consequence_moment"
  | "systems_cutaway"
  | "comparative_plate"
  | "sequential_rhythm"
  | "ritual_or_process"
  | "typographic_negative_space";

export type BookArtCompositionArchetype =
  | "single_anchor_with_counterweight"
  | "asymmetric_environmental_dominance"
  | "relational_distance_and_negative_space"
  | "aftermath_or_preaction_suspension"
  | "layered_cutaway"
  | "comparative_grid_without_generated_labels"
  | "sequential_depth_rhythm"
  | "radial_process_without_mandala_cliche"
  | "quiet_field_with_precise_intrusion"
  | "monumental_low_horizon"
  | "compressed_oblique_geometry"
  | "frontal_icon_with_material_asymmetry";

export interface BookArtNarrativeEvidenceV1 {
  evidenceId: string;
  label: string;
  meaning: string;
  importance: number;
  sourceLocationIds: string[];
}

export interface BookArtMotifEvidenceV1 extends BookArtNarrativeEvidenceV1 {
  visualForms: string[];
  transformations: string[];
}

export interface BookArtSettingEvidenceV1 extends BookArtNarrativeEvidenceV1 {
  era: string;
  culture: string;
  architecture: string[];
  materials: string[];
  weatherAndLight: string[];
}

export interface BookArtCharacterEvidenceV1 extends BookArtNarrativeEvidenceV1 {
  role: string;
  silhouette: string;
  costumeAndMaterial: string[];
  props: string[];
  innerOuterContradiction: string;
}

export interface BookArtSceneEvidenceV1 extends BookArtNarrativeEvidenceV1 {
  dramaticFunction: string;
  spoilerLevel: "none" | "minor" | "major" | "ending";
  visualSpecificity: number;
  emotionalCharge: number;
  compositionPotential: number;
  physicalAction: string;
  beforeOrAftermath: string;
}

export interface BookArtCreativeAudienceV1 {
  ageBand: string;
  readingMode: string;
  sophistication: "accessible" | "mainstream" | "specialist" | "literary";
  marketPosition: string;
  sensitivityIds: string[];
}

export interface BookArtEditionCompositionV1 {
  titleZone: "top" | "upper_third" | "centre" | "lower_third" | "custom";
  authorZone: "top" | "upper_third" | "centre" | "lower_third" | "custom";
  seriesZone: "none" | "top" | "upper_third" | "lower_third" | "custom";
  spineDirection: "not_applicable" | "top_to_bottom" | "bottom_to_top";
  barcodeZone: "not_applicable" | "back_lower_left" | "back_lower_right";
  readingDirection: "left_to_right" | "right_to_left";
  minimumQuietAreaPercent: number;
  customZoneNotes: string[];
}

export interface BookArtCreativePreferencesV1 {
  aestheticIntent: string;
  preferredProcessFamilies: BookIllustrationProcessFamily[];
  allowedProcessFamilies: BookIllustrationProcessFamily[];
  colourBias: string[];
  paperIntent: string;
  abstractionTolerance: number;
  spectacleTolerance: number;
  literalSceneTolerance: number;
  lineworkIntensity: number;
  routeCount: number;
  candidatesPerRoute: number;
  customGenreLabel?: string;
  prohibitedCompositionIds: string[];
}

export interface BookArtCreativeDirectionCompileInputV1 {
  outputKind: "evavo_book_art_creative_direction_compile_input";
  schemaVersion: typeof BOOK_ART_CREATIVE_DIRECTION_SCHEMA_VERSION;
  contract: typeof BOOK_ART_CREATIVE_DIRECTION_CONTRACT;
  identity: BookArtIdentityV1;
  purpose: BookArtCreativePurpose;
  manuscript: BookArtManuscriptBindingV1;
  output: BookArtOutputRequirementV1;
  contentClass: string;
  primaryGenre: BookArtCreativeGenre;
  secondaryGenres: BookArtCreativeGenre[];
  audience: BookArtCreativeAudienceV1;
  logline: string;
  centralConflict: string;
  emotionalPromise: string;
  themes: BookArtNarrativeEvidenceV1[];
  motifs: BookArtMotifEvidenceV1[];
  settings: BookArtSettingEvidenceV1[];
  characters: BookArtCharacterEvidenceV1[];
  scenes: BookArtSceneEvidenceV1[];
  spoilerRestrictionIds: string[];
  continuityRequirements: string[];
  historicalAndMaterialRequirements: string[];
  editionComposition: BookArtEditionCompositionV1;
  preferences: BookArtCreativePreferencesV1;
  rightsEvidenceIds: string[];
  namedCreatorReferences: string[];
  brandedFranchiseReferences: string[];
  requestedAt: string;
  requestedBy: string;
  providerCallAllowed: false;
  automaticSelectionAllowed: false;
  automaticPromotionAllowed: false;
  publicationAllowed: false;
}

export interface BookArtStyleSystemV1 {
  genreRoute: BookIllustrationGenreRoute;
  processFamilies: BookIllustrationProcessFamily[];
  primaryProcessFamily: BookIllustrationProcessFamily;
  markLogic: string[];
  tonalArchitecture: string;
  colourLogic: string[];
  lightingLogic: string[];
  materialLogic: string[];
  paperAndReproductionLogic: string[];
  visualRhythm: string[];
  generatedTextProhibited: true;
  namedCreatorImitationProhibited: true;
  brandedFranchiseTransferProhibited: true;
  falseHandmadeClaimProhibited: true;
}

export interface BookArtAntiGenericPolicyV1 {
  genericPromptBuzzwordsProhibited: string[];
  stockMotifsProhibited: string[];
  genreClichesProhibited: string[];
  syntheticSurfaceFailuresProhibited: string[];
  evidenceRequiredForEveryVisibleElement: true;
  materialSpecificMarkLanguageRequired: true;
  uniformMicrodetailProhibited: true;
  clonedTextureProhibited: true;
  globalScratchOverlayProhibited: true;
  meaninglessRunesAndPseudoTextProhibited: true;
  gratuitousGlowAndParticlesProhibited: true;
  genericMoviePosterCompositionProhibited: true;
  styleNameSubstitutionForArtDirectionProhibited: true;
}

export interface BookArtConceptRouteV1 {
  routeId: string;
  routeKind: BookArtConceptRouteKind;
  label: string;
  rationale: string;
  manuscriptEvidenceIds: string[];
  sourceLocationIds: string[];
  primarySubject: string;
  supportingSubjects: string[];
  compositionArchetype: BookArtCompositionArchetype;
  framing: string[];
  focalHierarchy: string[];
  depthlogic: string[];
  valueGroups: string[];
  tensionVector: string;
  movementGrammar: string[];
  negativeSpace: string[];
  typographyReserveZones: string[];
  materialsToRender: string[];
  lightingSources: string[];
  spoilerSafe: boolean;
  mustShow: string[];
  mustAvoid: string[];
  outputPurpose: BookArtProductionPurpose;
  routeFingerprint: string;
}

export interface BookArtCreativeDirectionPlanV1 {
  outputKind: "evavo_book_art_creative_direction_plan";
  schemaVersion: typeof BOOK_ART_CREATIVE_DIRECTION_SCHEMA_VERSION;
  contract: typeof BOOK_ART_CREATIVE_DIRECTION_CONTRACT;
  capabilities: readonly BookArtCreativeDirectionCapability[];
  identity: BookArtIdentityV1;
  purpose: BookArtCreativePurpose;
  productionPurpose: BookArtProductionPurpose;
  contentClass: string;
  primaryGenre: BookArtCreativeGenre;
  secondaryGenres: BookArtCreativeGenre[];
  audience: BookArtCreativeAudienceV1;
  manuscript: BookArtManuscriptBindingV1;
  output: BookArtOutputRequirementV1;
  styleSystem: BookArtStyleSystemV1;
  antiGenericPolicy: BookArtAntiGenericPolicyV1;
  conceptRoutes: BookArtConceptRouteV1 [];
  selectedRouteIds: string[];
  routeProgrammes: BookArtCreativeRouteProgrammeV1[];
  compositionDecisions:
    | "manuscript_symbol_first"
    | "environmental_pressure_first"
    | "relational_tension_first"
    | "consequence_before_peak_action"
    | "systems_and_causal_geometry"
    | "sequential_right_to_left_reading";
  providerInstruction: string;
  planFingerprint: string;
  providerCallPerformed: false;
  candidateArtifactsWritten: false;
  selectionPerformed: false;
  promotionPerformed: false;
  publicationPerformed: false;
}

export interface BookArtCreativeDirectionCompilationResultV1 {
  outputKind: "evavo_book_art_creative_direction_compilation_result";
  schemaVersion: typeof BOOK_ART_CREATIVE_DIRECTION_SCHEMA_VERSION;
  contract: typeof BOOK_ART_CREATIVE_DIRECTION_CONTRACT;
  status: "blocked" | "ready";
  identity: BookArtIdentityV1;
  plan?: BookArtCreativeDirectionPlanV1;
  blockers: string[];
  warnings: string[];
  providerCallPerformed: false;
  candidateArtifactsWritten: false;
  selectionPerformed: false;
  promotionPerformed: false;
  publicationPerformed: false;
}

export interface BookArtCreativeRouteProgrammeV1 {
  routeId: string;
  routeKind: BookArtConceptRouteKind;
  candidateCount: number;
  brief: BookArtBriefV1;
  productionWorkOrder: BookArtProductionWorkOrderV1;
  candidateSetWorkOrder: BookArtCandidateSetWorkOrderV1;
  routeFingerprint: string;
  providerCallPerformed: false;
  selectionPerformed: false;
  promotionPerformed: false;
  publicationPerformed: false;
}

/** A conversion only from the richer creative purposes to the current handoff. */
export type BookArtProductionPurpose = BookArtPurpose;

type GenreProfile = Readonly<{
  genreRoute: BookIllustrationGenreRoute;
  processFamilies: readonly BookIllustrationProcessFamily[];
  compositionArchetypes: readonly BookArtCompositionArchetype[];
  tonalArchitecture: string;
  colourLogic: readonly string[];
  lightingLogic: readonly string[];
  visualRhythm: readonly string[];
  cliches: readonly string[];
  preferredRouteKinds: readonly BookArtConceptRouteKind[];
}>;

const GENERE_PROFILES: ReadonlyRecord<BookArtCreativeGenre, GenreProfile> = {
  literary: {
    genreRoute: "literary",
    processFamilies: ["lithographic_tone", "intaglio_etching", "duotone", "black_only"],
    compositionArchetypes: ["quiet_field_with_precise_intrusion", "single_anchor_with_counterweight", "relational_distance_and_negative_space"],
    tonalArchitecture: "Broad quiet fields broken by one materially precise intrusion.",
    colourLogic: ["paper warmth", "one muted chromatic anchor only if it has narrative evidence"],
    lightingLogic: ["observed natural or interior light", "no motivation-free rim light"],
    visualRhythm: ["asymmetric pause", "negative space as part of the meaning"],
    cliches: ["generic literary silhouette on an empty landscape", "decorative botanical frames with no manuscript function"],
    preferredRouteKinds: ["material_symbol", "environmental_pressure", "relational_tension"],
  },
  historical: {
    genreRoute: "historical",
    processFamilies: ["relief_engraving", "intaglio_etching", "brush_pen_halftone", "black_only"],
    compositionArchetypes: ["asymmetric_environmental_dominance", "layered_cutaway", "aftermath_or_preaction_suspension"],
    tonalArchitecture: "Linework hierarchy and controlled black masses should preserve period material and local light.",
    colourLogic: ["black, paper and one evidence-backed spot colour", "no contemporary cinematic colour treatment"],
    lightingLogic: ["period-plausible lamp, weather and opening sources", "hardest edges at the structural load-bearing forms"],
    visualRhythm: ["alignment that makes architecture feel built, not procedural", "marks change when material changes"],
    cliches: ["sepia filter as a substitute for period specificity", "generic old map or compass without narrative function"],
    preferredRouteKinds: ["material_symbol", "environmental_pressure", "consequence_moment"],
  },
  horror: {
    genreRoute: "horror",
    processFamilies: ["scratchboard", "relief_engraving", "black_only", "duotone"],
    compositionArchetypes: ["quiet_field_with_precise_intrusion", "asymmetric_environmental_dominance", "aftermath_or_preaction_suspension"],
    tonalArchitecture: "Dread should accrue in readable value pressure, not in a brown-black filter or random noise.",
    colourLogic: ["light supports structure, not coloured glow", "spot colour only when blood, signage, wax or a recurring motif requires it"],
    lightingLogic: ["an identified physical source shapes every shadow", "suspense may preserve unresolved darkness but may not melt geometry"],
    visualRhythm: ["stillness, break, intrusion", "evidence is more disturbing than spectacle"],
    cliches: ["fogged cemetery with crows", "black-eyed child in a darkest corner", "red-edged smiling demon"],
    preferredRouteKinds: ["environmental_pressure", "material_symbol", "consequence_moment"],
  },
  mythic: {
    genreRoute: "mythic",
    processFamilies: ["relief_engraving", "lincut", "ornamental_print", "duotone"],
    compositionArchetypes: ["radial_process_without_mandala_cliche", "single_anchor_with_counterweight", "monumental_low_horizon"],
    tonalArchitecture: "Mythic scale should emerge from ritual, landscape, repetition and human cost.",
    colourLogic: ["restrained earth, bone, ink, mineral and one consequential spot colour"],
    lightingLogic: ["sun, moon, fire, reflection or cosmic source must be legible", "not much gratuitous backlight"],
    visualRhythm: ["repetition with meaningful varkkºwµç