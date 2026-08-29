import { createHash } from "node:crypto";
import type { BookCreativeGenre } from "./book-creative-direction-types.js";

export const BOOK_COVER_DESIGN_INTELLIGENCE_CONTRACT =
  "evavo_art_book_cover_design_intelligence_v1" as const;
export const BOOK_COVER_DESIGN_INTELLIGENCE_SCHEMA_VERSION = 1 as const;

export type BookCoverFormat = "kindle_ebook" | "paperback" | "hardcover";
export type BookCoverRouteKind =
  | "typography_led_field"
  | "cropped_material_evidence"
  | "relational_negative_space"
  | "environment_as_pressure"
  | "documentary_artifact"
  | "consequence_before_or_after";

export interface BookCoverEvidenceV1 {
  evidenceId: string;
  label: string;
  meaning: string;
  sourceLocationIds: string[];
  visualForms: string[];
  materials: string[];
  importance: number;
  spoilerLevel: "none" | "minor" | "major" | "ending";
}

export interface BookCoverComparisonObservationV1 {
  evidenceId: string;
  observation: string;
  categorySignalToRetain: string;
  imitationToAvoid: string;
}

export interface BookCoverDesignIntelligenceInputV1 {
  outputKind: "evavo_art_book_cover_design_intelligence_input";
  schemaVersion: typeof BOOK_COVER_DESIGN_INTELLIGENCE_SCHEMA_VERSION;
  contract: typeof BOOK_COVER_DESIGN_INTELLIGENCE_CONTRACT;
  bookId: string;
  editionId?: string;
  title: string;
  subtitle?: string;
  seriesTitle?: string;
  seriesPosition?: number;
  authorDisplayName: string;
  primaryGenre: BookCreativeGenre;
  audience: string;
  emotionalPromise: string;
  centralConflict: string;
  themeEvidence: BookCoverEvidenceV1[];
  motifEvidence: BookCoverEvidenceV1[];
  settingEvidence: BookCoverEvidenceV1[];
  categorySignals: string[];
  audienceExpectations: string[];
  distinctionTarget: string;
  comparisonObservations: BookCoverComparisonObservationV1[];
  sharedSeriesIdentifiers: string[];
  bookSpecificSeriesFreedoms: string[];
  forbiddenSeriesDevices: string[];
  intendedFormats: BookCoverFormat[];
  requestedRouteCount: 2 | 3 | 4;
  requestedAt: string;
  requestedBy: string;
  providerCallAllowed: false;
  automaticSelectionAllowed: false;
  automaticPromotionAllowed: false;
  publicationAllowed: false;
}

export interface BookCoverPaletteRoleV1 {
  role: "paper_or_light" | "structural_dark" | "support" | "controlled_accent";
  name: string;
  rgbPreview: `#${string}`;
  maximumAreaPercent: number;
  purpose: string;
}

export interface BookCoverPaletteArchitectureV1 {
  roles: BookCoverPaletteRoleV1[];
  valueRule: string;
  saturationRule: string;
  printRule: string;
  prohibitedDefaults: string[];
}

export interface BookCoverTypographyHandoffV1 {
  exactTitle: string;
  exactSubtitle?: string;
  exactSeriesTitle?: string;
  exactAuthorDisplayName: string;
  titleLineBreakCandidates: string[][];
  titleStructureRules: string[];
  hierarchyRules: string[];
  constructionRules: string[];
  maximumTypeFamilies: 2;
  maximumWeights: 3;
  authority: "evavo-docs-suite";
  artworkTextPolicy: "text_free";
}

export interface BookCoverDesignRouteV1 {
  routeId: string;
  kind: BookCoverRouteKind;
  label: string;
  manuscriptEvidenceIds: string[];
  sourceLocationIds: string[];
  visualThesis: string;
  categorySignal: string;
  distinctiveSignal: string;
  compositionRules: string[];
  thumbnailPromise: string;
  textSafeArchitecture: string[];
  prohibitedShortcuts: string[];
}

export interface BookCoverRetailProofPlanV1 {
  requiredProofs: Array<{
    proofId:
      | "thumbnail_60px"
      | "thumbnail_100px"
      | "grayscale"
      | "blur_squint"
      | "retailer_light_dark"
      | "spine_shelf"
      | "full_wrap"
      | "full_size"
      | "physical_print";
    passCondition: string;
    humanDecisionRequired: true;
  }>;
  oneSecondQuestion: string;
  distanceQuestion: string;
  samenessQuestion: string;
}

export interface BookCoverDesignDirectionV1 {
  titleReading: {
    semanticTokens: string[];
    repeatedTokens: string[];
    relationalWords: string[];
    governingTension: string;
    antiLiteralRules: string[];
  };
  marketPositioning: {
    categorySignals: string[];
    audienceExpectations: string[];
    distinctionTarget: string;
    comparisonRules: string[];
    categoryRecognitionRule: string;
    differentiationRule: string;
  };
  palette: BookCoverPaletteArchitectureV1;
  typography: BookCoverTypographyHandoffV1;
  routes: BookCoverDesignRouteV1[];
  humanCraftRules: string[];
  antiSyntheticBlockers: string[];
  seriesRules: string[];
  retailProofPlan: BookCoverRetailProofPlanV1;
  productionHandoff: string[];
  providerInstruction: string;
  directionFingerprint: string;
}

export interface BookCoverDesignIntelligenceResultV1 {
  outputKind: "evavo_art_book_cover_design_intelligence_result";
  schemaVersion: typeof BOOK_COVER_DESIGN_INTELLIGENCE_SCHEMA_VERSION;
  contract: typeof BOOK_COVER_DESIGN_INTELLIGENCE_CONTRACT;
  status: "blocked" | "ready";
  bookId: string;
  editionId?: string;
  direction?: BookCoverDesignDirectionV1;
  blockers: string[];
  warnings: string[];
  providerCallPerformed: false;
  selectionPerformed: false;
  promotionPerformed: false;
  publicationPerformed: false;
}

interface PaletteProfile {
  roles: [BookCoverPaletteRoleV1, BookCoverPaletteRoleV1, BookCoverPaletteRoleV1, BookCoverPaletteRoleV1];
  avoid: string[];
}

const makeRole = (
  role: BookCoverPaletteRoleV1["role"],
  name: string,
  rgbPreview: `#${string}`,
  maximumAreaPercent: number,
  purpose: string,
): BookCoverPaletteRoleV1 => ({ role, name, rgbPreview, maximumAreaPercent, purpose });

const PALETTES: Record<BookCreativeGenre, PaletteProfile> = {
  literary: { roles: [makeRole("paper_or_light", "paper bone", "#E6DED0", 72, "quiet field and humane warmth"), makeRole("structural_dark", "ink black", "#1C1A18", 68, "title contrast and structural weight"), makeRole("support", "weathered stone", "#756F66", 36, "material atmosphere without a filter"), makeRole("controlled_accent", "oxblood", "#77342E", 9, "one consequential point of pressure")], avoid: ["generic beige minimalism", "gold-foil simulation", "automatic prestige black"] },
  historical: { roles: [makeRole("paper_or_light", "archive parchment", "#D9CEB8", 70, "period paper and daylight"), makeRole("structural_dark", "soot", "#211F1B", 70, "engraved hierarchy"), makeRole("support", "faded indigo", "#52616B", 34, "period material distinction"), makeRole("controlled_accent", "iron oxide", "#8A4937", 10, "human consequence, not decoration")], avoid: ["sepia over everything", "wax-seal shorthand", "pseudo-antique distress"] },
  horror: { roles: [makeRole("paper_or_light", "cold bone", "#D8D6CE", 58, "exposed negative space"), makeRole("structural_dark", "char", "#151518", 78, "compression and threat"), makeRole("support", "bruised plum", "#493842", 34, "unease without neon"), makeRole("controlled_accent", "mineral bile", "#85865A", 7, "one physically motivated disturbance")], avoid: ["black-and-red default", "glowing eyes", "fog plus centred figure"] },
  mythic: { roles: [makeRole("paper_or_light", "mineral limestone", "#CBC2AD", 62, "carved or weathered field"), makeRole("structural_dark", "pitch", "#171818", 74, "monumental silhouette"), makeRole("support", "verdigris", "#4E6962", 30, "age through material chemistry"), makeRole("controlled_accent", "ember oxide", "#8B402D", 8, "one active mythic pressure")], avoid: ["glowing sigil", "generic ornate border", "fantasy blue-orange"] },
  grimdark_fantasy: { roles: [makeRole("paper_or_light", "old bone", "#C9C0AE", 56, "scarce breathing room"), makeRole("structural_dark", "coal", "#171512", 82, "weight and danger"), makeRole("support", "tarnished steel", "#575B5A", 32, "material realism"), makeRole("controlled_accent", "dried madder", "#6B302B", 8, "specific consequence only")], avoid: ["red slash template", "hooded warrior poster", "weapon collage"] },
  science_fiction: { roles: [makeRole("paper_or_light", "porcelain", "#D9DFE1", 66, "clean information field"), makeRole("structural_dark", "deep graphite", "#151A1D", 72, "technical hierarchy"), makeRole("support", "signal slate", "#426675", 34, "system identity"), makeRole("controlled_accent", "safety amber", "#A66A2B", 8, "operational warning or focal event")], avoid: ["neon cyan-magenta", "random circuitry", "planet and tiny astronaut"] },
  crime: { roles: [makeRole("paper_or_light", "newsprint", "#D6D0C3", 62, "evidence and documentary texture"), makeRole("structural_dark", "charcoal", "#181818", 78, "hard title hierarchy"), makeRole("support", "sodium olive", "#62604C", 30, "institutional or street pressure"), makeRole("controlled_accent", "evidence red", "#862F2C", 7, "single factual marker")], avoid: ["crime-scene tape", "anonymous silhouette", "red fingerprint icon"] },
  romance: { roles: [makeRole("paper_or_light", "warm paper", "#F0E2D8", 72, "intimacy and openness"), makeRole("structural_dark", "deep plum", "#3D2636", 60, "mature contrast"), makeRole("support", "clay rose", "#A66F74", 36, "emotional temperature"), makeRole("controlled_accent", "leaf green", "#586650", 10, "place or relational counterpoint")], avoid: ["generic pastel wash", "floating couple", "script-font dependency"] },
  children: { roles: [makeRole("paper_or_light", "soft cream", "#F3E8CE", 76, "friendly field"), makeRole("structural_dark", "story navy", "#29354B", 55, "clear accessible hierarchy"), makeRole("support", "garden green", "#568067", 38, "world-building"), makeRole("controlled_accent", "coral", "#C66E59", 15, "play and focal action")], avoid: ["rainbow overload", "clip-art icon field", "airbrushed mascot"] },
  memoir: { roles: [makeRole("paper_or_light", "uncoated paper", "#E7E0D4", 74, "human scale"), makeRole("structural_dark", "soft black", "#24211F", 66, "editorial authority"), makeRole("support", "personal blue-grey", "#66727A", 32, "memory and distance"), makeRole("controlled_accent", "kept object", "#9A6044", 8, "one biographical detail")], avoid: ["generic portrait retouch", "sunset nostalgia", "handwritten-font simulation"] },
  documentary: { roles: [makeRole("paper_or_light", "record paper", "#E0DDD5", 70, "factual clarity"), makeRole("structural_dark", "record black", "#1C1D1D", 72, "editorial hierarchy"), makeRole("support", "institutional blue", "#516875", 30, "system context"), makeRole("controlled_accent", "index red", "#913F35", 6, "one verified annotation")], avoid: ["evidence-board collage", "fake stamps", "sensational red wash"] },
  technical: { roles: [makeRole("paper_or_light", "drawing stock", "#ECEAE3", 82, "legible diagrams"), makeRole("structural_dark", "technical ink", "#172027", 58, "information hierarchy"), makeRole("support", "process blue", "#426D80", 28, "system distinction"), makeRole("controlled_accent", "warning amber", "#AD7129", 7, "verified exception or hazard")], avoid: ["decorative circuitry", "glowing interface", "fake measurement labels"] },
  reference: { roles: [makeRole("paper_or_light", "library stock", "#E9E4D8", 80, "durable reference field"), makeRole("structural_dark", "library ink", "#202326", 62, "clear shelf hierarchy"), makeRole("support", "classification green", "#526D5D", 28, "navigation family"), makeRole("controlled_accent", "index ochre", "#A16D34", 8, "edition-specific marker")], avoid: ["icon salad", "generic knowledge network", "faux encyclopedia ornament"] },
  graphic_novel: { roles: [makeRole("paper_or_light", "panel paper", "#E7E1D5", 52, "open panel rhythm"), makeRole("structural_dark", "brush black", "#111313", 86, "silhouette and lettering contrast"), makeRole("support", "print blue", "#3F6574", 34, "secondary plane"), makeRole("controlled_accent", "spot vermilion", "#A13D32", 12, "controlled print spot")], avoid: ["everywhere detail", "movie-poster montage", "random Dutch angles"] },
  pulp: { roles: [makeRole("paper_or_light", "cheap stock", "#E8D8B8", 55, "period print energy"), makeRole("structural_dark", "press black", "#1A1714", 74, "bold hierarchy"), makeRole("support", "petrol blue", "#336677", 38, "graphic counterfield"), makeRole("controlled_accent", "press red", "#A83B2F", 16, "high-impact action accent")], avoid: ["modern glossy grading", "generic montage", "fake ageing overlay"] },
  poetry: { roles: [makeRole("paper_or_light", "quiet paper", "#ECE6DC", 84, "silence and cadence"), makeRole("structural_dark", "poem ink", "#292522", 54, "typographic gravity"), makeRole("support", "weather grey", "#7A7772", 24, "measured atmosphere"), makeRole("controlled_accent", "private colour", "#78515B", 6, "one image-bearing interruption")], avoid: ["stock flower", "watercolour wash default", "fake handwritten verse"] },
  cookbook: { roles: [makeRole("paper_or_light", "kitchen paper", "#F0E8D8", 68, "appetite and clarity"), makeRole("structural_dark", "pan black", "#27231F", 52, "usable hierarchy"), makeRole("support", "herb green", "#60704E", 34, "ingredient identity"), makeRole("controlled_accent", "ripe tomato", "#B54F3D", 14, "fresh focal ingredient")], avoid: ["floating ingredient explosion", "over-saturated food", "generic marble counter"] },
  academic: { roles: [makeRole("paper_or_light", "journal stock", "#E8E5DE", 84, "scholarly clarity"), makeRole("structural_dark", "citation black", "#202224", 58, "title authority"), makeRole("support", "discipline blue", "#4E6878", 26, "subject classification"), makeRole("controlled_accent", "editorial ochre", "#9A6A34", 5, "series or edition marker")], avoid: ["generic network graphic", "stock graduation imagery", "decorative equations"] },
  custom: { roles: [makeRole("paper_or_light", "project light", "#E5E0D7", 72, "negative space"), makeRole("structural_dark", "project dark", "#1D2022", 70, "hierarchy"), makeRole("support", "project support", "#637078", 32, "material distinction"), makeRole("controlled_accent", "project accent", "#8A4B3D", 8, "one evidence-bound focal event")], avoid: ["trend palette without evidence", "template recolour", "automatic cinematic grade"] },
};

const STOP_WORDS = new Set(["a", "an", "the", "of", "for", "and", "or", "to"]);
const RELATIONAL_WORDS = new Set(["under", "over", "within", "without", "between", "beneath", "above", "before", "after", "through", "against", "beyond", "inside", "outside"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const GLOBAL_ANTI_SYNTHETIC_BLOCKERS = [
  "generated lettering, pseudo-writing, fake logos, watermarks or signatures",
  "uniform micro-detail, equal edge sharpness or texture applied across every plane",
  "plastic skin, waxy materials, over-smoothed faces or airbrushed surfaces",
  "automatic orange-and-teal grade, cyan-magenta neon or unjustified red accent",
  "gratuitous rim light, bloom, floating particles, sparks, fog or glow",
  "centred object on a gradient with decorative symbols orbiting it",
  "generic storm, lone silhouette, hooded figure, glowing relic or floating-head montage",
  "cloned distress, random scratches, fake paper ageing or global grunge overlay",
  "icon salad, pseudo-historical ornament or motifs not bound to manuscript evidence",
  "provider-composed title, subtitle, author, series, spine copy, blurb, price or barcode",
];

const HUMAN_CRAFT_RULES = [
  "Use a small number of deliberate shapes; omission is a designed choice, not missing detail.",
  "Vary edge cadence by focal importance: hard structural edges, selective soft transitions and genuinely lost edges.",
  "Use controlled asymmetry and optical correction rather than mathematical centring everywhere.",
  "Make materials through construction, wear, pressure and light response, never a texture filter.",
  "Keep incidental irregularity local and causal; never distribute scratches, speckles or damage uniformly.",
  "Resolve hands, faces, architecture and period objects with reference-backed physical logic.",
  "Finish art, typography and wrap layout as separate editable layers with named human review decisions.",
  "Retire any route that could plausibly front ten unrelated books after changing only title and colour.",
];

export function compileBookCoverDesignIntelligence(
  value: unknown,
): BookCoverDesignIntelligenceResultV1 {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const input = isRecord(value) ? value as Partial<BookCoverDesignIntelligenceInputV1> : {};

  if (!isRecord(value)) blockers.push("cover_design_input_must_be_object");
  if (input.outputKind !== "evavo_art_book_cover_design_intelligence_input"
      || input.schemaVersion !== 1
      || input.contract !== BOOK_COVER_DESIGN_INTELLIGENCE_CONTRACT) {
    blockers.push("cover_design_input_contract_invalid");
  }
  const bookId = safeId(input.bookId, "book_id", blockers);
  const editionId = input.editionId === undefined ? undefined : safeId(input.editionId, "edition_id", blockers);
  const title = substantive(input.title, "title", 1, 240, blockers);
  const subtitle = optionalText(input.subtitle, "subtitle", 240, blockers);
  const seriesTitle = optionalText(input.seriesTitle, "series_title", 240, blockers);
  const author = substantive(input.authorDisplayName, "author_display_name", 2, 180, blockers);
  const genre = genreOf(input.primaryGenre, blockers);
  const audience = substantive(input.audience, "audience", 10, 600, blockers);
  const promise = substantive(input.emotionalPromise, "emotional_promise", 20, 1200, blockers);
  const conflict = substantive(input.centralConflict, "central_conflict", 20, 1200, blockers);
  const themes = evidenceOf(input.themeEvidence, "theme_evidence", 2, blockers);
  const motifs = evidenceOf(input.motifEvidence, "motif_evidence", 1, blockers);
  const settings = evidenceOf(input.settingEvidence, "setting_evidence", 1, blockers);
  const categorySignals = textList(input.categorySignals, "category_signals", 2, 6, blockers);
  const expectations = textList(input.audienceExpectations, "audience_expectations", 2, 8, blockers);
  const distinctionTarget = substantive(input.distinctionTarget, "distinction_target", 20, 800, blockers);
  const comparisons = comparisonsOf(input.comparisonObservations, blockers);
  const sharedSeries = textList(input.sharedSeriesIdentifiers, "shared_series_identifiers", 0, 4, blockers);
  const seriesFreedoms = textList(input.bookSpecificSeriesFreedoms, "book_specific_series_freedoms", 0, 12, blockers);
  const forbiddenSeries = textList(input.forbiddenSeriesDevices, "forbidden_series_devices", 0, 20, blockers);
  const formats = formatsOf(input.intendedFormats, blockers);
  const routeCount = integerOf(input.requestedRouteCount, 2, 4, "requested_route_count", blockers);
  const requestedAt = timestampOf(input.requestedAt, blockers);
  safeId(input.requestedBy, "requested_by", blockers);

  for (const key of ["providerCallAllowed", "automaticSelectionAllowed", "automaticPromotionAllowed", "publicationAllowed"] as const) {
    if (input[key] !== false) blockers.push(`${camelToSnake(key)}_must_remain_false`);
  }
  if (input.seriesPosition !== undefined && (!Number.isInteger(input.seriesPosition) || input.seriesPosition < 1 || input.seriesPosition > 999)) {
    blockers.push("series_position_invalid");
  }
  if (seriesTitle && input.seriesPosition === undefined) warnings.push("series_position_missing");
  if (!seriesTitle && sharedSeries.length > 0) blockers.push("shared_series_identifiers_require_series_title");
  if (seriesTitle && seriesFreedoms.length < 4) blockers.push("series_requires_at_least_four_book_specific_freedoms");
  if (sharedSeries.length > 2) blockers.push("series_visible_identifiers_must_not_exceed_two");
  if (seriesTitle && seriesFreedoms.every((rule) => /colou?r|hue|tint|shade/i.test(rule))) blockers.push("series_cannot_differentiate_by_colour_only");
  if (formats.length === 0) blockers.push("at_least_one_cover_format_required");

  const allEvidence = [...themes, ...motifs, ...settings];
  const approvedEvidenceIds = new Set(allEvidence.map((item) => item.evidenceId));
  for (const comparison of comparisons) {
    if (!comparison.imitationToAvoid.trim()) blockers.push(`comparison_imitation_rule_missing:${comparison.evidenceId}`);
  }
  if (new Set(allEvidence.map((item) => item.evidenceId)).size !== allEvidence.length) blockers.push("cover_evidence_ids_must_be_unique_across_groups");
  if (motifs.every((item) => item.spoilerLevel === "major" || item.spoilerLevel === "ending")) blockers.push("at_least_one_cover_safe_motif_required");

  const words = titleWords(title);
  if (words.semanticTokens.length === 0) blockers.push("title_requires_semantic_token");
  if (blockers.length > 0) return blocked(bookId, editionId, blockers, warnings);

  const palette = paletteFor(genre);
  const typography = typographyFor({ title, subtitle, seriesTitle, author, words });
  const routeCandidates = buildRoutes({
    bookId,
    title,
    genre,
    promise,
    conflict,
    themes,
    motifs,
    settings,
    categorySignals,
    distinctionTarget,
  });
  const routes = selectDistinctRoutes(routeCandidates, routeCount, title);
  if (routes.length !== routeCount) return blocked(bookId, editionId, ["insufficient_materially_distinct_cover_routes"], warnings);
  for (const route of routes) {
    if (route.manuscriptEvidenceIds.some((id) => !approvedEvidenceIds.has(id))) {
      blockers.push(`route_uses_unknown_evidence:${route.routeId}`);
    }
  }
  if (blockers.length > 0) return blocked(bookId, editionId, blockers, warnings);

  const titleReading = {
    semanticTokens: words.semanticTokens,
    repeatedTokens: words.repeatedTokens,
    relationalWords: words.relationalWords,
    governingTension: governingTension(title, words, conflict),
    antiLiteralRules: [
      "Do not illustrate every noun in the title.",
      "Choose one manuscript-bound contradiction that changes how the title is read.",
      ...(words.repeatedTokens.length > 0 ? [`Repeated title language (${words.repeatedTokens.join(", ")}) must influence hierarchy or spatial relation, not become repeated clip-art.`] : []),
      ...(words.relationalWords.length > 0 ? [`Relational language (${words.relationalWords.join(", ")}) must be expressed through scale, position, pressure or absence rather than a decorative symbol.`] : []),
    ],
  };
  const marketPositioning = {
    categorySignals,
    audienceExpectations: expectations,
    distinctionTarget,
    comparisonRules: comparisons.map((item) => `Retain only the category signal “${item.categorySignalToRetain}”; do not imitate “${item.imitationToAvoid}”. Observation: ${item.observation}`),
    categoryRecognitionRule: "A reader should recognise the broad shelf and emotional contract in one second without mistaking the cover for a template.",
    differentiationRule: "At least one dominant visual proposition must be unique to this manuscript, and category recognition may not depend on copied composition, proprietary marks or creator imitation.",
  };
  const seriesRules = seriesTitle
    ? [
        `Use no more than two quiet shared identifiers: ${sharedSeries.join("; ") || "define before release"}.`,
        `Differentiate this volume through at least four axes: ${seriesFreedoms.slice(0, 6).join("; ")}.`,
        "Do not produce a colour-swapped template; composition, scale, crop, material, light and image-making method must respond to this book.",
        ...forbiddenSeries.map((item) => `Series device prohibited: ${item}.`),
      ]
    : ["Do not imply a series system unless approved metadata names one."];
  const retailProofPlan = proofPlan(formats);
  const productionHandoff = [
    "Art Studio supplies separate text-free artwork and records the approved design-intelligence fingerprint.",
    "EVAVO Docs Suite imports exact approved metadata; it mechanically composes title, subtitle, series, author, spine copy, back-cover copy and barcode as editable deterministic layout.",
    "EVAVO Docs Suite is the sole authority for trim, bleed, spine width, page-count binding, barcode reservation, font embedding and final KDP wrap geometry.",
    "Final RGB-to-print conversion is controlled by proofed output; RGB preview values are direction only and must never be treated as final CMYK recipes.",
    "No provider candidate, however polished, is final until retail proofs, human review, rights, provenance and production preflight pass.",
  ];
  const providerInstruction = [
    `Create ${routeCount} separate, materially distinct, text-free cover-art candidates for “${title}”.`,
    `Audience: ${audience}. Emotional promise: ${promise}. Central pressure: ${conflict}.`,
    `Use these category signals without copying a market template: ${categorySignals.join("; ")}.`,
    `Distinctive target: ${distinctionTarget}.`,
    `Use this palette as a value-and-material architecture, not a grading preset: ${palette.roles.map((role) => `${role.role} ${role.name} ${role.rgbPreview}, max ${role.maximumAreaPercent}%`).join("; ")}.`,
    `Routes: ${routes.map((route) => `${route.label}: ${route.visualThesis}`).join(" | ")}.`,
    `Reserve deliberate negative space for Docs Suite typography. Never render title, author, series, blurb, spine copy, logos, labels, price, ISBN or barcode.`,
    `Reject: ${GLOBAL_ANTI_SYNTHETIC_BLOCKERS.join("; ")}.`,
    `Human craft: ${HUMAN_CRAFT_RULES.join("; ")}.`,
    "Produce one candidate per file, no contact sheets, no automatic winner and no automatic promotion.",
  ].join(" ");

  const unsigned: Omit<BookCoverDesignDirectionV1, "directionFingerprint"> = {
    titleReading,
    marketPositioning,
    palette,
    typography,
    routes,
    humanCraftRules: [...HUMAN_CRAFT_RULES],
    antiSyntheticBlockers: [...GLOBAL_ANTI_SYNTHETIC_BLOCKERS, ...palette.prohibitedDefaults],
    seriesRules,
    retailProofPlan,
    productionHandoff,
    providerInstruction,
  };
  const direction: BookCoverDesignDirectionV1 = {
    ...unsigned,
    directionFingerprint: sha256(unsigned),
  };
  warnings.push("rgb_palette_values_are_art_direction_previews_not_final_print_values");
  warnings.push("human_market_and_craft_review_remains_required");
  warnings.push(`compiled_at:${requestedAt}`);

  return {
    outputKind: "evavo_art_book_cover_design_intelligence_result",
    schemaVersion: 1,
    contract: BOOK_COVER_DESIGN_INTELLIGENCE_CONTRACT,
    status: "ready",
    bookId,
    ...(editionId ? { editionId } : {}),
    direction,
    blockers: [],
    warnings: unique(warnings),
    providerCallPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    publicationPerformed: false,
  };
}

export function listBookCoverDesignIntelligenceCapabilities() {
  return Object.freeze({
    outputKind: "evavo_art_book_cover_design_intelligence_capabilities",
    schemaVersion: 1,
    contract: BOOK_COVER_DESIGN_INTELLIGENCE_CONTRACT,
    capabilities: [
      "book.cover.title_semantics.compile",
      "book.cover.market_signal_balance.compile",
      "book.cover.palette_architecture.compile",
      "book.cover.typography_handoff.compile",
      "book.cover.route_diversity.compile",
      "book.cover.anti_synthetic_rules.compile",
      "book.cover.retail_proof_plan.compile",
    ] as const,
    geometryAuthority: "evavo-docs-suite" as const,
    typographyAuthority: "evavo-docs-suite" as const,
    providerCallPerformed: false as const,
    selectionPerformed: false as const,
    promotionPerformed: false as const,
    publicationPerformed: false as const,
  });
}

function paletteFor(genre: BookCreativeGenre): BookCoverPaletteArchitectureV1 {
  const profile = PALETTES[genre];
  return {
    roles: profile.roles.map((role) => ({ ...role })),
    valueRule: "Prove the cover first in three dominant value groups; focal hierarchy must survive grayscale and blur before colour is approved.",
    saturationRule: "Keep most of the cover restrained. The controlled accent may exceed surrounding saturation only when it identifies a manuscript-bound consequence.",
    printRule: "RGB values are comparative previews. Convert and adjust only inside a proofed print workflow; preserve value separation after gamut conversion and on uncoated stock simulation.",
    prohibitedDefaults: [...profile.avoid, "unmotivated black-red prestige palette", "colour used as the only series differentiator"],
  };
}

function typographyFor(input: {
  title: string;
  subtitle?: string;
  seriesTitle?: string;
  author: string;
  words: ReturnType<typeof titleWords>;
}): BookCoverTypographyHandoffV1 {
  const lineBreaks = titleLineBreaks(input.title);
  const titleStructureRules = [
    input.words.repeatedTokens.length > 0
      ? `Make repetition visible through scale, alignment or spacing without changing the exact words: ${input.words.repeatedTokens.join(", ")}.`
      : "Create hierarchy from syntax and meaning, not random enlargement of one word.",
    input.words.relationalWords.length > 0
      ? `Keep relational words meaningful in the line break: ${input.words.relationalWords.join(", ")}.`
      : "Break lines at semantic phrases, not at equal character counts alone.",
    "Preserve exact metadata spelling, punctuation, accents, apostrophes and capitalisation unless an approved typographic style explicitly changes case.",
  ];
  return {
    exactTitle: input.title,
    ...(input.subtitle ? { exactSubtitle: input.subtitle } : {}),
    ...(input.seriesTitle ? { exactSeriesTitle: input.seriesTitle } : {}),
    exactAuthorDisplayName: input.author,
    titleLineBreakCandidates: lineBreaks,
    titleStructureRules,
    hierarchyRules: [
      "The title is the first reading event unless approved market evidence establishes an author-led edition.",
      "Subtitle and series line remain subordinate and may never compete with the title at thumbnail size.",
      "Author treatment must be intentional and stable across editions, not automatically oversized or letterspaced as fake prestige.",
      "Spine hierarchy must remain identifiable when front-cover imagery is unavailable.",
    ],
    constructionRules: [
      "Compose all text mechanically in Docs Suite from locked metadata; never use provider-generated lettering.",
      "Use at most two licensed type families and three weights; avoid effect stacks, faux distress and ornamental substitution for art direction.",
      "Perform optical kerning, line-spacing, punctuation alignment, overshoot and small-size corrections by named human review.",
      "Keep typography editable until final preflight, then embed fonts in the released PDF while retaining the editable source package.",
      "Record font licence, exact font file identity, fallback prohibition and embedding evidence.",
    ],
    maximumTypeFamilies: 2,
    maximumWeights: 3,
    authority: "evavo-docs-suite",
    artworkTextPolicy: "text_free",
  };
}

function buildRoutes(context: {
  bookId: string;
  title: string;
  genre: BookCreativeGenre;
  promise: string;
  conflict: string;
  themes: BookCoverEvidenceV1[];
  motifs: BookCoverEvidenceV1[];
  settings: BookCoverEvidenceV1[];
  categorySignals: string[];
  distinctionTarget: string;
}): BookCoverDesignRouteV1[] {
  const safeMotif = context.motifs.find(coverSafe) ?? context.motifs[0]!;
  const theme = context.themes[0]!;
  const secondTheme = context.themes[1] ?? theme;
  const setting = context.settings.find(coverSafe) ?? context.settings[0]!;
  const route = (
    kind: BookCoverRouteKind,
    label: string,
    records: BookCoverEvidenceV1[],
    visualThesis: string,
    compositionRules: string[],
    thumbnailPromise: string,
    prohibitedShortcuts: string[],
  ): BookCoverDesignRouteV1 => ({
    routeId: `cover-route-${sha256({ kind, evidence: records.map((item) => item.evidenceId), title: context.title }).slice(7, 31)}`,
    kind,
    label,
    manuscriptEvidenceIds: unique(records.map((item) => item.evidenceId)),
    sourceLocationIds: unique(records.flatMap((item) => item.sourceLocationIds)),
    visualThesis,
    categorySignal: context.categorySignals[0]!,
    distinctiveSignal: context.distinctionTarget,
    compositionRules,
    thumbnailPromise,
    textSafeArchitecture: [
      "Use shaped quiet space rather than a generic gradient.",
      "Protect the title block at both 60px and full size.",
      "Keep the author and series zones free of high-frequency detail.",
    ],
    prohibitedShortcuts,
  });

  return [
    route(
      "typography_led_field",
      "Title as designed pressure",
      [theme, safeMotif],
      `Build one quiet material field in which the physical relation between ${theme.label} and ${safeMotif.label} carries the title's pressure; artwork stays text-free.`,
      ["One dominant field, one interruption and no decorative border.", "Let absence carry at least as much weight as the motif.", "No centred relic treatment."],
      `The title remains dominant while ${safeMotif.label} creates a manuscript-specific second read.`,
      ["generic minimal cover", "tiny centred icon", "fake foil or embossed text inside the artwork"],
    ),
    route(
      "cropped_material_evidence",
      "Cropped evidence",
      [safeMotif, setting],
      `Crop close enough that ${safeMotif.label} is understood through material construction, wear and consequence inside ${setting.label}, not as a genre icon.`,
      ["Use a decisive crop with one off-frame continuation.", "Separate primary, secondary and tertiary edge cadence.", "Do not reveal the full object merely for clarity."],
      `One material fact remains recognisable when detail collapses.`,
      ["floating object", "catalogue product lighting", "uniform texture detail"],
    ),
    route(
      "relational_negative_space",
      "Conflict held in distance",
      [theme, secondTheme, setting],
      `Turn the central conflict into a measurable distance, occlusion or imbalance between ${theme.label} and ${secondTheme.label}; use ${setting.label} to make that distance physical.`,
      ["Negative space is an active narrative shape.", "No floating heads or embrace shorthand.", "Use asymmetry and optical balance."],
      `The cover reads first as tension, then as place.`,
      ["character montage", "generic confrontation pose", "symmetrical split-face composition"],
    ),
    route(
      "environment_as_pressure",
      "Place exerts pressure",
      [setting, theme],
      `Make ${setting.label} act upon the reader through scale, access, wear and obstruction while ${theme.label} remains the human consequence.`,
      ["Environment carries more visual weight than any figure.", "Use at least three depth planes with different evidence.", "Avoid postcard completeness."],
      `The setting's pressure and genre are legible before small figures or props.`,
      ["postcard view", "storm added for mood", "empty architecture without use or wear"],
    ),
    route(
      "documentary_artifact",
      "Archive with consequence",
      [safeMotif, theme],
      `Treat ${safeMotif.label} as verified material evidence whose selection, crop and context reveal ${theme.label}; no fake stamps, pseudo-writing or decorative history.`,
      ["Use one evidence object and one counter-evidence trace.", "Keep provenance visible through material, not labels.", "Resist scrapbook collage."],
      `A factual object creates curiosity without revealing a spoiler.`,
      ["evidence-board collage", "fake handwriting", "wax seal or red string shorthand"],
    ),
    route(
      "consequence_before_or_after",
      "Consequence, not climax",
      [setting, safeMotif, theme],
      `Show the breath before or after the obvious event: ${safeMotif.label} and ${setting.label} hold the consequence while ${theme.label} changes the reading.`,
      ["No peak-action splash pose.", "Keep causal traces specific and countable.", "Let one unresolved action lead the eye into the title space."],
      `A single changed fact is legible at thumbnail size and rewards full-size inspection.`,
      ["explosion or debris for excitement", "movie-poster montage", "arbitrary motion blur or sparks"],
    ),
  ];
}

function proofPlan(formats: BookCoverFormat[]): BookCoverRetailProofPlanV1 {
  const proofs: BookCoverRetailProofPlanV1["requiredProofs"] = [
    { proofId: "thumbnail_60px", passCondition: "Broad category, title shape and one distinctive proposition survive at 60px without relying on fine detail.", humanDecisionRequired: true },
    { proofId: "thumbnail_100px", passCondition: "Exact title is readable and visual hierarchy is unambiguous at 100px.", humanDecisionRequired: true },
    { proofId: "grayscale", passCondition: "Title, focal evidence and background retain ordered value separation without colour.", humanDecisionRequired: true },
    { proofId: "blur_squint", passCondition: "Three value masses and the intended eye path survive blur or squint review.", humanDecisionRequired: true },
    { proofId: "retailer_light_dark", passCondition: "Cover remains bounded and legible against both light and dark retailer backgrounds.", humanDecisionRequired: true },
    { proofId: "full_size", passCondition: "Materials, anatomy, architecture, edges and typography remain credible at inspection size with no synthetic artefacts.", humanDecisionRequired: true },
  ];
  if (formats.some((format) => format !== "kindle_ebook")) {
    proofs.push(
      { proofId: "spine_shelf", passCondition: "Title and author hierarchy remains identifiable at realistic shelf-spine width and obeys page-count rules.", humanDecisionRequired: true },
      { proofId: "full_wrap", passCondition: "Back, spine and front form one intentional object; no important content enters trim, fold, hinge or barcode zones.", humanDecisionRequired: true },
      { proofId: "physical_print", passCondition: "A printed proof confirms colour, density, small type, trim tolerance, spine centring and material feel.", humanDecisionRequired: true },
    );
  }
  return {
    requiredProofs: proofs,
    oneSecondQuestion: "What shelf is this, what emotional promise is made, and what single detail makes this book rather than a template?",
    distanceQuestion: "Does the title and one visual proposition remain clear before the viewer can inspect detail?",
    samenessQuestion: "Could the same cover sell ten unrelated books after a colour and title change? Any yes retires the route.",
  };
}

function selectDistinctRoutes(routes: BookCoverDesignRouteV1[], count: number, title: string): BookCoverDesignRouteV1[] {
  const start = parseInt(sha256(title).slice(7, 11), 16) % routes.length;
  const ordered = [...routes.slice(start), ...routes.slice(0, start)];
  return ordered.slice(0, count);
}

function titleWords(title: string) {
  const raw = title.normalize("NFKC").toLocaleLowerCase("en-AU").match(/[\p{L}\p{N}’'-]+/gu) ?? [];
  const semanticTokens = raw.filter((word) => !STOP_WORDS.has(word));
  const counts = new Map<string, number>();
  for (const word of semanticTokens) counts.set(word, (counts.get(word) ?? 0) + 1);
  return {
    raw,
    semanticTokens,
    repeatedTokens: [...counts.entries()].filter(([, count]) => count > 1).map(([word]) => word),
    relationalWords: raw.filter((word) => RELATIONAL_WORDS.has(word)),
  };
}

function governingTension(title: string, words: ReturnType<typeof titleWords>, conflict: string): string {
  if (words.repeatedTokens.length > 0) return `The repeated idea “${words.repeatedTokens.join(" / ")}” changes meaning through the title's relation and the manuscript conflict: ${conflict}`;
  if (words.relationalWords.length > 0) return `The title “${title}” is governed by position and pressure (${words.relationalWords.join(", ")}), resolved through the manuscript conflict: ${conflict}`;
  return `The title “${title}” promises a specific change in meaning under the manuscript conflict: ${conflict}`;
}

function titleLineBreaks(title: string): string[][] {
  const words = title.trim().split(/\s+/u);
  if (words.length <= 2) return [[title]];
  const candidates: string[][] = [];
  for (let breakAt = 1; breakAt < words.length; breakAt += 1) {
    const left = words.slice(0, breakAt).join(" ");
    const right = words.slice(breakAt).join(" ");
    const relationPenalty = RELATIONAL_WORDS.has(words[breakAt - 1]!.toLocaleLowerCase("en-AU")) ? 20 : 0;
    const orphanPenalty = left.length <= 2 || right.length <= 2 ? 40 : 0;
    candidates.push(Object.assign([left, right], { score: Math.abs(left.length - right.length) + relationPenalty + orphanPenalty }));
  }
  return candidates
    .sort((a, b) => ((a as unknown as { score: number }).score - (b as unknown as { score: number }).score) || a.join("/").localeCompare(b.join("/")))
    .slice(0, 3)
    .map((lines) => [...lines]);
}

function evidenceOf(value: unknown, label: string, minimum: number, blockers: string[]): BookCoverEvidenceV1[] {
  if (!Array.isArray(value)) {
    blockers.push(`${label}_must_be_array`);
    return [];
  }
  const output: BookCoverEvidenceV1[] = [];
  value.forEach((item, index) => {
    const record = isRecord(item) ? item : {};
    const local = `${label}_${index}`;
    const spoiler = ["none", "minor", "major", "ending"].includes(String(record.spoilerLevel))
      ? record.spoilerLevel as BookCoverEvidenceV1["spoilerLevel"]
      : (blockers.push(`${local}_spoiler_level_invalid`), "major" as const);
    output.push({
      evidenceId: safeId(record.evidenceId, `${local}_evidence_id`, blockers),
      label: substantive(record.label, `${local}_label`, 2, 240, blockers),
      meaning: substantive(record.meaning, `${local}_meaning`, 10, 800, blockers),
      sourceLocationIds: idList(record.sourceLocationIds, `${local}_source_location_ids`, 1, 32, blockers),
      visualForms: textList(record.visualForms, `${local}_visual_forms`, 0, 16, blockers),
      materials: textList(record.materials, `${local}_materials`, 0, 16, blockers),
      importance: integerOf(record.importance, 1, 100, `${local}_importance`, blockers),
      spoilerLevel: spoiler,
    });
  });
  if (output.length < minimum) blockers.push(`${label}_requires_${minimum}`);
  return output.sort((a, b) => b.importance - a.importance || a.evidenceId.localeCompare(b.evidenceId));
}

function comparisonsOf(value: unknown, blockers: string[]): BookCoverComparisonObservationV1[] {
  if (!Array.isArray(value) || value.length < 3 || value.length > 12) {
    blockers.push("comparison_observations_require_between_3_and_12_records");
    return [];
  }
  return value.map((item, index) => {
    const record = isRecord(item) ? item : {};
    return {
      evidenceId: safeId(record.evidenceId, `comparison_${index}_evidence_id`, blockers),
      observation: substantive(record.observation, `comparison_${index}_observation`, 15, 600, blockers),
      categorySignalToRetain: substantive(record.categorySignalToRetain, `comparison_${index}_category_signal`, 5, 240, blockers),
      imitationToAvoid: substantive(record.imitationToAvoid, `comparison_${index}_imitation_to_avoid`, 5, 240, blockers),
    };
  });
}

function formatsOf(value: unknown, blockers: string[]): BookCoverFormat[] {
  if (!Array.isArray(value)) {
    blockers.push("intended_formats_must_be_array");
    return [];
  }
  const allowed = new Set<BookCoverFormat>(["kindle_ebook", "paperback", "hardcover"]);
  const output = value.filter((item): item is BookCoverFormat => typeof item === "string" && allowed.has(item as BookCoverFormat));
  if (output.length !== value.length) blockers.push("intended_formats_contains_invalid_value");
  return unique(output);
}

function genreOf(value: unknown, blockers: string[]): BookCreativeGenre {
  if (typeof value === "string" && Object.prototype.hasOwnProperty.call(PALETTES, value)) return value as BookCreativeGenre;
  blockers.push("primary_genre_invalid");
  return "custom";
}

function blocked(bookId: string, editionId: string | undefined, blockers: string[], warnings: string[]): BookCoverDesignIntelligenceResultV1 {
  return {
    outputKind: "evavo_art_book_cover_design_intelligence_result",
    schemaVersion: 1,
    contract: BOOK_COVER_DESIGN_INTELLIGENCE_CONTRACT,
    status: "blocked",
    bookId: bookId || "invalid",
    ...(editionId ? { editionId } : {}),
    blockers: unique(blockers).sort(),
    warnings: unique(warnings).sort(),
    providerCallPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    publicationPerformed: false,
  };
}

function coverSafe(item: BookCoverEvidenceV1): boolean {
  return item.spoilerLevel === "none" || item.spoilerLevel === "minor";
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function safeId(value: unknown, label: string, blockers: string[]): string {
  if (typeof value === "string" && SAFE_ID.test(value) && !["__proto__", "constructor", "prototype"].includes(value)) return value;
  blockers.push(`${label}_invalid`);
  return "invalid";
}
function substantive(value: unknown, label: string, minimum: number, maximum: number, blockers: string[]): string {
  if (typeof value === "string" && value.trim() === value && value.length >= minimum && value.length <= maximum) return value;
  blockers.push(`${label}_invalid`);
  return "";
}
function optionalText(value: unknown, label: string, maximum: number, blockers: string[]): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return substantive(value, label, 1, maximum, blockers);
}
function textList(value: unknown, label: string, minimum: number, maximum: number, blockers: string[]): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum || !value.every((item) => typeof item === "string" && item.trim() === item && item.length > 0 && item.length <= 600)) {
    blockers.push(`${label}_invalid`);
    return [];
  }
  return unique(value);
}
function idList(value: unknown, label: string, minimum: number, maximum: number, blockers: string[]): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    blockers.push(`${label}_invalid`);
    return [];
  }
  return unique(value.map((item, index) => safeId(item, `${label}_${index}`, blockers)));
}
function integerOf(value: unknown, minimum: number, maximum: number, label: string, blockers: string[]): number {
  if (Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum) return value as number;
  blockers.push(`${label}_invalid`);
  return minimum;
}
function timestampOf(value: unknown, blockers: string[]): string {
  if (typeof value === "string" && ISO_TIME.test(value) && Number.isFinite(Date.parse(value))) return value;
  blockers.push("requested_at_invalid");
  return "1970-01-01T00:00:00.000Z";
}
function camelToSnake(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}
function sha256(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;
}
