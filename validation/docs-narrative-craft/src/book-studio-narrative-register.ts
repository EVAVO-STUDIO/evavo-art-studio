import { validateBookAuthorialVoiceProfile } from "./book-studio-authorial-voice-analyse";
import type { BookAuthorialVoiceProfileV1 } from "./book-studio-authorial-voice-types";
import {
  BOOK_NARRATIVE_GENRE_BLUEPRINTS,
  BOOK_NARRATIVE_REGISTER_DIMENSION_IDS,
  BOOK_NARRATIVE_SCENARIO_OVERLAYS,
  BOOK_NARRATIVE_SCENE_FUNCTION_OVERLAYS,
} from "./book-studio-narrative-register-library";
import {
  BOOK_NARRATIVE_REGISTER_CONTRACT,
  type BookNarrativeAudienceBand,
  type BookNarrativeGenreId,
  type BookNarrativeNormalizedGenreWeightV1,
  type BookNarrativeRegisterCompileResultV1,
  type BookNarrativeRegisterDimensionId,
  type BookNarrativeRegisterDimensionOverrideV1,
  type BookNarrativeRegisterDimensionV1,
  type BookNarrativeRegisterPolicyV1,
  type BookNarrativeRegisterProfileV1,
  type BookNarrativeScenarioId,
  type BookNarrativeSceneFunctionId,
} from "./book-studio-narrative-register-types";
import {
  canonicalReviewCraftJson,
  duplicateReviewCraftValues,
  rejectReviewCraftUnknown,
  reviewCraftArray,
  reviewCraftDigest,
  reviewCraftEnum,
  reviewCraftFinite,
  reviewCraftId,
  reviewCraftIds,
  reviewCraftInteger,
  reviewCraftRecord,
  reviewCraftText,
  roundReviewCraft,
  sha256ReviewCraftText,
  uniqueReviewCraft,
} from "./book-studio-review-craft-shared";

const GENRE_IDS = new Set<BookNarrativeGenreId>(Object.keys(BOOK_NARRATIVE_GENRE_BLUEPRINTS) as BookNarrativeGenreId[]);
const SCENE_FUNCTION_IDS = new Set<BookNarrativeSceneFunctionId>(Object.keys(BOOK_NARRATIVE_SCENE_FUNCTION_OVERLAYS) as BookNarrativeSceneFunctionId[]);
const SCENARIO_IDS = new Set<BookNarrativeScenarioId>(Object.keys(BOOK_NARRATIVE_SCENARIO_OVERLAYS) as BookNarrativeScenarioId[]);
const AUDIENCE_BANDS = new Set<BookNarrativeAudienceBand>(["children", "middle_grade", "young_adult", "adult", "cross_audience"]);
const DIMENSION_IDS = new Set<BookNarrativeRegisterDimensionId>(BOOK_NARRATIVE_REGISTER_DIMENSION_IDS);
const INPUT_KEYS = new Set([
  "outputKind", "schemaVersion", "programmeId", "projectId", "volumeId", "registerId", "registerVersion",
  "authorialVoiceProfile", "genres", "sceneFunctionId", "scenarioId", "customScenario", "audienceBand",
  "dimensionOverrides", "projectPromiseIds", "projectAvoidanceIds", "evidenceIds", "policy",
]);
const GENRE_KEYS = new Set(["genreId", "requestedWeight"]);
const OVERRIDE_KEYS = new Set(["dimensionId", "value", "evidenceIds"]);
const POLICY_KEYS = new Set([
  "minimumGenres", "maximumGenres", "maximumDominantGenreWeight", "minimumRegisterDistanceFromGenre",
  "minimumPromiseRules", "minimumAvoidanceRules",
]);

const DEFAULT_POLICY: Required<BookNarrativeRegisterPolicyV1> = {
  minimumGenres: 1,
  maximumGenres: 4,
  maximumDominantGenreWeight: 0.8,
  minimumRegisterDistanceFromGenre: 0.08,
  minimumPromiseRules: 2,
  minimumAvoidanceRules: 2,
};

const AUDIENCE_DIRECTIONS: Readonly<Record<BookNarrativeAudienceBand, string[]>> = Object.freeze({
  children: [
    "Use concrete goals, patterned cause and effect, memorable objects and read-aloud clarity.",
    "Keep fear, conflict and loss honest but developmentally appropriate and non-graphic.",
  ],
  middle_grade: [
    "Keep scene questions explicit enough to follow while preserving emotional and moral complexity.",
    "Give young characters genuine agency, competence, error and repair.",
  ],
  young_adult: [
    "Use immediate social interpretation, emerging autonomy and identity under consequence.",
    "Do not simplify emotion or morality merely because the viewpoint is young.",
  ],
  adult: [
    "Choose complexity according to the project rather than treating density or explicitness as automatic maturity.",
    "Permit unresolved moral and emotional pressure while retaining causal clarity.",
  ],
  cross_audience: [
    "Layer immediate concrete stakes with deeper relational, thematic and historical implications.",
    "Keep surface comprehension clear without flattening subtext or consequence.",
  ],
});

const AUDIENCE_COUNTERWEIGHTS: Readonly<Record<BookNarrativeAudienceBand, string[]>> = Object.freeze({
  children: ["Do not use baby talk, vague moralising or humiliation as a default corrective."],
  middle_grade: ["Do not make adults universally useless or erase the cost of danger after the scene."],
  young_adult: ["Do not imitate disposable slang or make every obstacle a failure to communicate."],
  adult: ["Do not confuse graphic content, cynicism or syntactic density with depth."],
  cross_audience: ["Do not make the adult layer depend on jokes or references that weaken the primary story."],
});

export async function compileBookNarrativeRegister(input: unknown): Promise<BookNarrativeRegisterCompileResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const source = reviewCraftRecord(input, "Narrative register compile input", blockers);
  rejectReviewCraftUnknown(source, INPUT_KEYS, "Narrative register compile input", blockers);
  if (source.outputKind !== "evavo_docs_book_narrative_register_compile_input") blockers.push("Narrative register input outputKind is invalid.");
  if (source.schemaVersion !== 1) blockers.push("Narrative register input schemaVersion is invalid.");
  const programmeId = reviewCraftId(source.programmeId, "programmeId", blockers);
  const projectId = reviewCraftId(source.projectId, "projectId", blockers);
  const volumeId = reviewCraftId(source.volumeId, "volumeId", blockers);
  const registerId = reviewCraftId(source.registerId, "registerId", blockers);
  const registerVersion = reviewCraftInteger(source.registerVersion, "registerVersion", blockers, 1, 1_000_000);
  const policy = parsePolicy(source.policy, blockers);

  const voiceBlockers = await validateBookAuthorialVoiceProfile(source.authorialVoiceProfile);
  blockers.push(...voiceBlockers.map((item) => `Authorial voice profile: ${item}`));
  const voiceProfile = source.authorialVoiceProfile as BookAuthorialVoiceProfileV1;
  if (voiceBlockers.length === 0) {
    if (voiceProfile.programmeId !== programmeId) blockers.push("Narrative register programme differs from the authorial voice profile.");
    if (voiceProfile.projectId !== projectId) blockers.push("Narrative register project differs from the authorial voice profile.");
  }

  const genres = parseGenres(source.genres, policy, blockers);
  const sceneFunctionId = reviewCraftEnum(source.sceneFunctionId, SCENE_FUNCTION_IDS, "sceneFunctionId", blockers, "setup");
  const scenarioId = reviewCraftEnum(source.scenarioId, SCENARIO_IDS, "scenarioId", blockers, "custom");
  const customScenario = source.customScenario === undefined
    ? undefined
    : reviewCraftText(source.customScenario, "customScenario", blockers, 2_000);
  if (scenarioId === "custom" && !customScenario) blockers.push("customScenario is required when scenarioId is custom.");
  if (scenarioId !== "custom" && customScenario) blockers.push("customScenario is allowed only when scenarioId is custom.");
  const audienceBand = reviewCraftEnum(source.audienceBand, AUDIENCE_BANDS, "audienceBand", blockers, "adult");
  const dimensionOverrides = parseOverrides(source.dimensionOverrides, blockers);
  const projectPromiseIds = reviewCraftIds(source.projectPromiseIds, "projectPromiseIds", blockers, 512, false);
  const projectAvoidanceIds = reviewCraftIds(source.projectAvoidanceIds, "projectAvoidanceIds", blockers, 512, false);
  const evidenceIds = reviewCraftIds(source.evidenceIds, "evidenceIds", blockers, 4_096, true);

  const { dimensions, minimumDistanceFromGenre } = compileDimensions(genres, sceneFunctionId, scenarioId, dimensionOverrides);
  if (genres.length > 1 && minimumDistanceFromGenre < policy.minimumRegisterDistanceFromGenre) {
    blockers.push(`Blended register remains too close to one genre (${minimumDistanceFromGenre}); minimum is ${policy.minimumRegisterDistanceFromGenre}.`);
  }
  const selectedBlueprints = genres.map((item) => BOOK_NARRATIVE_GENRE_BLUEPRINTS[item.genreId]);
  const sceneOverlay = BOOK_NARRATIVE_SCENE_FUNCTION_OVERLAYS[sceneFunctionId];
  const scenarioOverlay = BOOK_NARRATIVE_SCENARIO_OVERLAYS[scenarioId];
  const promiseRules = uniqueReviewCraft(selectedBlueprints.flatMap((item) => item.promiseRules));
  const failureSignals = uniqueReviewCraft(selectedBlueprints.flatMap((item) => item.failureSignals));
  const productionDirections = uniqueReviewCraft([
    ...selectedBlueprints.flatMap((item) => item.productionDirections),
    ...sceneOverlay.productionDirections,
    ...scenarioOverlay.productionDirections,
    ...AUDIENCE_DIRECTIONS[audienceBand],
  ]);
  const counterweights = uniqueReviewCraft([
    ...selectedBlueprints.flatMap((item) => item.counterweights),
    ...sceneOverlay.counterweights,
    ...scenarioOverlay.counterweights,
    ...AUDIENCE_COUNTERWEIGHTS[audienceBand],
  ]);
  if (promiseRules.length < policy.minimumPromiseRules) blockers.push(`Narrative register requires at least ${policy.minimumPromiseRules} genre promise rules.`);
  if (counterweights.length < policy.minimumAvoidanceRules) blockers.push(`Narrative register requires at least ${policy.minimumAvoidanceRules} counterweights.`);
  if (genres.length === 1) warnings.push("The register uses one genre lens; originality must come from project voice, scene causality and project-specific evidence rather than genre blending.");
  const finalBlockers = uniqueReviewCraft(blockers);
  if (finalBlockers.length) return blocked(finalBlockers, warnings);

  const providerInstruction = buildProviderInstruction({
    registerId,
    registerVersion,
    voiceProfile,
    genres,
    sceneFunctionId,
    scenarioId,
    customScenario,
    audienceBand,
    dimensions,
    promiseRules,
    failureSignals,
    productionDirections,
    counterweights,
    projectPromiseIds,
    projectAvoidanceIds,
  });
  const unsigned: Omit<BookNarrativeRegisterProfileV1, "profileFingerprint"> = {
    outputKind: "evavo_docs_book_narrative_register_profile",
    schemaVersion: 1,
    contract: BOOK_NARRATIVE_REGISTER_CONTRACT,
    status: "ready",
    programmeId,
    projectId,
    volumeId,
    registerId,
    registerVersion,
    authorialVoiceProfileFingerprint: voiceProfile.profileFingerprint,
    genres,
    minimumDistanceFromGenre,
    sceneFunctionId,
    scenarioId,
    ...(customScenario === undefined ? {} : { customScenario }),
    audienceBand,
    dimensions,
    promiseRules,
    failureSignals,
    productionDirections,
    counterweights,
    projectPromiseIds,
    projectAvoidanceIds,
    evidenceIds,
    providerInstruction,
    projectVoiceRemainsAuthoritative: true,
    namedCreatorInstructionPermitted: false,
    genreClicheTransferPermitted: false,
    canonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
  const profileFingerprint = await sha256ReviewCraftText(canonicalReviewCraftJson(unsigned));
  const profile: BookNarrativeRegisterProfileV1 = { ...unsigned, profileFingerprint };
  return {
    outputKind: "evavo_docs_book_narrative_register_compile_result",
    schemaVersion: 1,
    status: "ready",
    profile,
    profileFingerprint,
    blockers: [],
    warnings: uniqueReviewCraft(warnings),
    canonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
}

export async function validateBookNarrativeRegisterProfile(value: unknown): Promise<string[]> {
  const blockers: string[] = [];
  const source = reviewCraftRecord(value, "Narrative register profile", blockers);
  if (source.outputKind !== "evavo_docs_book_narrative_register_profile" || source.schemaVersion !== 1 || source.contract !== BOOK_NARRATIVE_REGISTER_CONTRACT || source.status !== "ready") blockers.push("Narrative register profile identity is invalid.");
  if (source.projectVoiceRemainsAuthoritative !== true) blockers.push("Narrative register must preserve project voice authority.");
  for (const key of ["namedCreatorInstructionPermitted", "genreClicheTransferPermitted", "canonicalAdmissionAllowed", "publicationPerformed"]) {
    if (source[key] !== false) blockers.push(`Narrative register ${key} must remain false.`);
  }
  const fingerprint = reviewCraftDigest(source.profileFingerprint, "profileFingerprint", blockers);
  const { profileFingerprint: _discarded, ...unsigned } = source;
  if (fingerprint !== await sha256ReviewCraftText(canonicalReviewCraftJson(unsigned))) blockers.push("Narrative register profile fingerprint does not match its exact contents.");
  return uniqueReviewCraft(blockers);
}

export function listBookNarrativeRegisterCapabilities() {
  return Object.freeze({
    outputKind: "evavo_docs_book_narrative_register_capabilities",
    schemaVersion: 1,
    contract: BOOK_NARRATIVE_REGISTER_CONTRACT,
    genres: [...GENRE_IDS].sort(),
    sceneFunctions: [...SCENE_FUNCTION_IDS].sort(),
    scenarios: [...SCENARIO_IDS].sort(),
    audienceBands: [...AUDIENCE_BANDS].sort(),
    dimensions: [...BOOK_NARRATIVE_REGISTER_DIMENSION_IDS],
    projectVoiceRemainsAuthoritative: true,
    namedCreatorInstructionPermitted: false,
    genreClicheTransferPermitted: false,
    providerCallPerformed: false,
    canonicalAdmissionAllowed: false,
    publicationPerformed: false,
  });
}

function parsePolicy(value: unknown, blockers: string[]): Required<BookNarrativeRegisterPolicyV1> {
  if (value === undefined) return { ...DEFAULT_POLICY };
  const source = reviewCraftRecord(value, "Narrative register policy", blockers);
  rejectReviewCraftUnknown(source, POLICY_KEYS, "Narrative register policy", blockers);
  const result: Required<BookNarrativeRegisterPolicyV1> = {
    minimumGenres: source.minimumGenres === undefined ? DEFAULT_POLICY.minimumGenres : reviewCraftInteger(source.minimumGenres, "minimumGenres", blockers, 1, 4),
    maximumGenres: source.maximumGenres === undefined ? DEFAULT_POLICY.maximumGenres : reviewCraftInteger(source.maximumGenres, "maximumGenres", blockers, 1, 6),
    maximumDominantGenreWeight: source.maximumDominantGenreWeight === undefined ? DEFAULT_POLICY.maximumDominantGenreWeight : reviewCraftFinite(source.maximumDominantGenreWeight, "maximumDominantGenreWeight", blockers, 0.4, 1),
    minimumRegisterDistanceFromGenre: source.minimumRegisterDistanceFromGenre === undefined ? DEFAULT_POLICY.minimumRegisterDistanceFromGenre : reviewCraftFinite(source.minimumRegisterDistanceFromGenre, "minimumRegisterDistanceFromGenre", blockers, 0, 0.5),
    minimumPromiseRules: source.minimumPromiseRules === undefined ? DEFAULT_POLICY.minimumPromiseRules : reviewCraftInteger(source.minimumPromiseRules, "minimumPromiseRules", blockers, 1, 20),
    minimumAvoidanceRules: source.minimumAvoidanceRules === undefined ? DEFAULT_POLICY.minimumAvoidanceRules : reviewCraftInteger(source.minimumAvoidanceRules, "minimumAvoidanceRules", blockers, 1, 20),
  };
  if (result.maximumGenres < result.minimumGenres) blockers.push("maximumGenres cannot be below minimumGenres.");
  return result;
}

function parseGenres(
  value: unknown,
  policy: Required<BookNarrativeRegisterPolicyV1>,
  blockers: string[],
): BookNarrativeNormalizedGenreWeightV1[] {
  const records = reviewCraftArray(value, "genres", blockers, policy.minimumGenres, policy.maximumGenres);
  const raw = records.map((item, index) => {
    const source = reviewCraftRecord(item, `genre ${index + 1}`, blockers);
    rejectReviewCraftUnknown(source, GENRE_KEYS, `genre ${index + 1}`, blockers);
    return {
      genreId: reviewCraftEnum(source.genreId, GENRE_IDS, `genre ${index + 1} genreId`, blockers, "literary"),
      requestedWeight: reviewCraftFinite(source.requestedWeight, `genre ${index + 1} requestedWeight`, blockers, Number.MIN_VALUE, 1_000),
    };
  }).sort((left, right) => left.genreId.localeCompare(right.genreId));
  const duplicates = duplicateReviewCraftValues(raw.map((item) => item.genreId));
  if (duplicates.length) blockers.push(`Genre IDs are duplicated: ${duplicates.join(", ")}.`);
  const total = raw.reduce((sum, item) => sum + item.requestedWeight, 0);
  if (!(total > 0)) blockers.push("Genre weights require a positive total.");
  const result = raw.map((item) => ({
    genreId: item.genreId,
    normalizedWeight: roundReviewCraft(total > 0 ? item.requestedWeight / total : 0),
  }));
  if (result.length > 1) for (const item of result) if (item.normalizedWeight > policy.maximumDominantGenreWeight) {
    blockers.push(`Genre ${item.genreId} dominates at ${item.normalizedWeight}; maximum is ${policy.maximumDominantGenreWeight}.`);
  }
  return result;
}

function parseOverrides(value: unknown, blockers: string[]): BookNarrativeRegisterDimensionOverrideV1[] {
  const records = reviewCraftArray(value, "dimensionOverrides", blockers, 0, BOOK_NARRATIVE_REGISTER_DIMENSION_IDS.length);
  const result = records.map((item, index) => {
    const source = reviewCraftRecord(item, `dimension override ${index + 1}`, blockers);
    rejectReviewCraftUnknown(source, OVERRIDE_KEYS, `dimension override ${index + 1}`, blockers);
    return {
      dimensionId: reviewCraftEnum(source.dimensionId, DIMENSION_IDS, `dimension override ${index + 1} dimensionId`, blockers, "pace"),
      value: roundReviewCraft(reviewCraftFinite(source.value, `dimension override ${index + 1} value`, blockers, -1, 1), 4),
      evidenceIds: reviewCraftIds(source.evidenceIds, `dimension override ${index + 1} evidenceIds`, blockers, 128, true),
    };
  }).sort((left, right) => left.dimensionId.localeCompare(right.dimensionId));
  const duplicates = duplicateReviewCraftValues(result.map((item) => item.dimensionId));
  if (duplicates.length) blockers.push(`Dimension overrides are duplicated: ${duplicates.join(", ")}.`);
  return result;
}

function compileDimensions(
  genres: BookNarrativeNormalizedGenreWeightV1[],
  sceneFunctionId: BookNarrativeSceneFunctionId,
  scenarioId: BookNarrativeScenarioId,
  overrides: BookNarrativeRegisterDimensionOverrideV1[],
): { dimensions: BookNarrativeRegisterDimensionV1[]; minimumDistanceFromGenre: number } {
  const scene = BOOK_NARRATIVE_SCENE_FUNCTION_OVERLAYS[sceneFunctionId];
  const scenario = BOOK_NARRATIVE_SCENARIO_OVERLAYS[scenarioId];
  const overrideMap = new Map(overrides.map((item) => [item.dimensionId, item.value]));
  const dimensions = BOOK_NARRATIVE_REGISTER_DIMENSION_IDS.map((dimensionId) => {
    const genreValue = genres.reduce((sum, item) => sum + (BOOK_NARRATIVE_GENRE_BLUEPRINTS[item.genreId].values[dimensionId] ?? 0) * item.normalizedWeight, 0);
    const sceneValue = scene.values[dimensionId] ?? 0;
    const scenarioValue = scenario.values[dimensionId] ?? 0;
    const layered = clamp(genreValue + sceneValue * 0.4 + scenarioValue * 0.3);
    const override = overrideMap.get(dimensionId);
    const value = override === undefined ? layered : clamp(layered * 0.55 + override * 0.45);
    const overlayContributionIds = [
      ...(sceneValue === 0 ? [] : [`scene:${sceneFunctionId}`]),
      ...(scenarioValue === 0 ? [] : [`scenario:${scenarioId}`]),
      ...(override === undefined ? [] : ["project:dimension_override"]),
    ];
    return {
      dimensionId,
      value: roundReviewCraft(value, 4),
      genreContributionIds: genres.filter((item) => (BOOK_NARRATIVE_GENRE_BLUEPRINTS[item.genreId].values[dimensionId] ?? 0) !== 0).map((item) => item.genreId),
      overlayContributionIds,
    };
  });
  const registerVector = new Map(dimensions.map((item) => [item.dimensionId, item.value]));
  const distances = genres.map((item) => vectorDistance(
    registerVector,
    new Map(BOOK_NARRATIVE_REGISTER_DIMENSION_IDS.map((dimensionId) => [dimensionId, BOOK_NARRATIVE_GENRE_BLUEPRINTS[item.genreId].values[dimensionId] ?? 0])),
  ));
  return {
    dimensions,
    minimumDistanceFromGenre: roundReviewCraft(distances.length ? Math.min(...distances) : 0, 4),
  };
}

function buildProviderInstruction(input: {
  registerId: string;
  registerVersion: number;
  voiceProfile: BookAuthorialVoiceProfileV1;
  genres: BookNarrativeNormalizedGenreWeightV1[];
  sceneFunctionId: BookNarrativeSceneFunctionId;
  scenarioId: BookNarrativeScenarioId;
  customScenario: string | undefined;
  audienceBand: BookNarrativeAudienceBand;
  dimensions: BookNarrativeRegisterDimensionV1[];
  promiseRules: string[];
  failureSignals: string[];
  productionDirections: string[];
  counterweights: string[];
  projectPromiseIds: string[];
  projectAvoidanceIds: string[];
}): string {
  return [
    `PROJECT NARRATIVE REGISTER: ${input.registerId} v${input.registerVersion}`,
    "The project-owned authorial voice remains the governing expression layer. Genre, scene and scenario are temporary craft lenses, not replacement voices and not libraries of stock phrases.",
    input.voiceProfile.providerInstruction,
    `Genre mix: ${input.genres.map((item) => `${item.genreId} ${item.normalizedWeight}`).join(", ")}.`,
    `Scene function: ${input.sceneFunctionId}.`,
    `Scenario: ${input.scenarioId}${input.customScenario ? ` — ${input.customScenario}` : ""}.`,
    `Audience band: ${input.audienceBand}.`,
    "Register dimensions:",
    ...input.dimensions.map((item) => `- ${item.dimensionId}: ${item.value}.`),
    "Reader promises:",
    ...input.promiseRules.map((item) => `- ${item}`),
    "Production directions:",
    ...input.productionDirections.map((item) => `- ${item}`),
    "Counterweights:",
    ...input.counterweights.map((item) => `- ${item}`),
    "Failure signals to avoid:",
    ...input.failureSignals.map((item) => `- ${item}`),
    `Project promise evidence: ${input.projectPromiseIds.join(", ") || "none supplied"}.`,
    `Project avoidance evidence: ${input.projectAvoidanceIds.join(", ") || "none supplied"}.`,
    "Use genre knowledge to improve expectation, pressure, pacing and payoff. Do not copy genre cliches, named creators, signature lines or recognisable surface mannerisms.",
  ].join("\n");
}

function vectorDistance(left: Map<BookNarrativeRegisterDimensionId, number>, right: Map<BookNarrativeRegisterDimensionId, number>): number {
  const sum = BOOK_NARRATIVE_REGISTER_DIMENSION_IDS.reduce((total, dimensionId) => total + ((left.get(dimensionId) ?? 0) - (right.get(dimensionId) ?? 0)) ** 2, 0);
  return Math.sqrt(sum / BOOK_NARRATIVE_REGISTER_DIMENSION_IDS.length);
}

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function blocked(blockers: string[], warnings: string[]): BookNarrativeRegisterCompileResultV1 {
  return {
    outputKind: "evavo_docs_book_narrative_register_compile_result",
    schemaVersion: 1,
    status: "blocked",
    blockers: uniqueReviewCraft(blockers),
    warnings: uniqueReviewCraft(warnings),
    canonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
}
