export const BOOK_NARRATIVE_REGISTER_CONTRACT = "evavo_docs_book_narrative_register_v1" as const;
export const BOOK_NARRATIVE_REGISTER_SCHEMA_VERSION = 1 as const;

export type BookNarrativeGenreId =
  | "literary"
  | "historical"
  | "mystery"
  | "thriller"
  | "crime_noir"
  | "horror"
  | "gothic"
  | "dark_fantasy"
  | "epic_fantasy"
  | "science_fiction"
  | "space_opera"
  | "romance"
  | "adventure"
  | "war"
  | "western"
  | "magical_realism"
  | "satire_comedy"
  | "young_adult"
  | "middle_grade"
  | "childrens";

export type BookNarrativeSceneFunctionId =
  | "opening_image"
  | "setup"
  | "inciting_disruption"
  | "commitment"
  | "investigation"
  | "discovery"
  | "negotiation"
  | "intimacy"
  | "temptation"
  | "betrayal"
  | "reversal"
  | "revelation"
  | "confrontation"
  | "action_set_piece"
  | "battle"
  | "chase"
  | "escape"
  | "journey"
  | "aftermath"
  | "grief"
  | "decision"
  | "climax"
  | "denouement"
  | "epilogue";

export type BookNarrativeScenarioId =
  | "interrogation"
  | "council_or_court"
  | "domestic_conflict"
  | "first_meeting"
  | "reunion"
  | "farewell"
  | "confession"
  | "seduction"
  | "argument"
  | "bargain"
  | "heist"
  | "infiltration"
  | "ritual"
  | "trial"
  | "survival"
  | "travel"
  | "siege"
  | "duel"
  | "rescue"
  | "funeral"
  | "celebration"
  | "investigation_at_scene"
  | "quiet_reflection"
  | "public_speech"
  | "custom";

export type BookNarrativeAudienceBand =
  | "children"
  | "middle_grade"
  | "young_adult"
  | "adult"
  | "cross_audience";

export type BookNarrativeRegisterDimensionId =
  | "pace"
  | "suspense"
  | "mystery"
  | "dread"
  | "romantic_charge"
  | "wonder"
  | "humour"
  | "violence_intensity"
  | "world_texture"
  | "procedural_detail"
  | "interiority"
  | "lyricism"
  | "moral_ambiguity"
  | "revelation_density"
  | "action_density"
  | "social_pressure"
  | "sensory_density"
  | "accessibility";

export interface BookNarrativeGenreWeightV1 {
  genreId: BookNarrativeGenreId;
  requestedWeight: number;
}

export interface BookNarrativeRegisterDimensionOverrideV1 {
  dimensionId: BookNarrativeRegisterDimensionId;
  value: number;
  evidenceIds: string[];
}

export interface BookNarrativeRegisterPolicyV1 {
  minimumGenres?: number;
  maximumGenres?: number;
  maximumDominantGenreWeight?: number;
  minimumRegisterDistanceFromGenre?: number;
  minimumPromiseRules?: number;
  minimumAvoidanceRules?: number;
}

export interface BookNarrativeRegisterCompileInputV1 {
  outputKind: "evavo_docs_book_narrative_register_compile_input";
  schemaVersion: 1;
  programmeId: string;
  projectId: string;
  volumeId: string;
  registerId: string;
  registerVersion: number;
  authorialVoiceProfile: unknown;
  genres: BookNarrativeGenreWeightV1[];
  sceneFunctionId: BookNarrativeSceneFunctionId;
  scenarioId: BookNarrativeScenarioId;
  customScenario?: string;
  audienceBand: BookNarrativeAudienceBand;
  dimensionOverrides: BookNarrativeRegisterDimensionOverrideV1[];
  projectPromiseIds: string[];
  projectAvoidanceIds: string[];
  evidenceIds: string[];
  policy?: BookNarrativeRegisterPolicyV1;
}

export interface BookNarrativeNormalizedGenreWeightV1 {
  genreId: BookNarrativeGenreId;
  normalizedWeight: number;
}

export interface BookNarrativeRegisterDimensionV1 {
  dimensionId: BookNarrativeRegisterDimensionId;
  value: number;
  genreContributionIds: BookNarrativeGenreId[];
  overlayContributionIds: string[];
}

export interface BookNarrativeRegisterProfileV1 {
  outputKind: "evavo_docs_book_narrative_register_profile";
  schemaVersion: 1;
  contract: typeof BOOK_NARRATIVE_REGISTER_CONTRACT;
  status: "ready";
  programmeId: string;
  projectId: string;
  volumeId: string;
  registerId: string;
  registerVersion: number;
  authorialVoiceProfileFingerprint: string;
  genres: BookNarrativeNormalizedGenreWeightV1[];
  minimumDistanceFromGenre: number;
  sceneFunctionId: BookNarrativeSceneFunctionId;
  scenarioId: BookNarrativeScenarioId;
  customScenario?: string;
  audienceBand: BookNarrativeAudienceBand;
  dimensions: BookNarrativeRegisterDimensionV1[];
  promiseRules: string[];
  failureSignals: string[];
  productionDirections: string[];
  counterweights: string[];
  projectPromiseIds: string[];
  projectAvoidanceIds: string[];
  evidenceIds: string[];
  providerInstruction: string;
  profileFingerprint: string;
  projectVoiceRemainsAuthoritative: true;
  namedCreatorInstructionPermitted: false;
  genreClicheTransferPermitted: false;
  canonicalAdmissionAllowed: false;
  publicationPerformed: false;
}

export interface BookNarrativeRegisterCompileResultV1 {
  outputKind: "evavo_docs_book_narrative_register_compile_result";
  schemaVersion: 1;
  status: "ready" | "blocked";
  profile?: BookNarrativeRegisterProfileV1;
  profileFingerprint?: string;
  blockers: string[];
  warnings: string[];
  canonicalAdmissionAllowed: false;
  publicationPerformed: false;
}
