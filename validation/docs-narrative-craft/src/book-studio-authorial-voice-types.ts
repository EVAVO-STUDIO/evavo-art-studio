export const BOOK_AUTHORIAL_VOICE_CONTRACT = "evavo_docs_book_authorial_voice_v1" as const;
export const BOOK_AUTHORIAL_VOICE_SCHEMA_VERSION = 1 as const;

export type BookAuthorialVoiceSampleRole =
  | "narration"
  | "dialogue"
  | "description"
  | "action"
  | "reflection"
  | "mixed";

export type BookAuthorialVoiceMetricId =
  | "mean_sentence_words"
  | "sentence_length_variation"
  | "short_sentence_ratio"
  | "long_sentence_ratio"
  | "mean_paragraph_sentences"
  | "paragraph_length_variation"
  | "lexical_diversity"
  | "dialogue_word_ratio"
  | "contraction_rate"
  | "first_person_rate"
  | "third_person_rate"
  | "emotion_label_rate"
  | "intensifier_rate"
  | "filter_verb_rate"
  | "dialogue_tag_rate"
  | "simile_marker_rate"
  | "question_rate"
  | "exclamation_rate"
  | "semicolon_rate"
  | "colon_rate"
  | "em_dash_rate"
  | "ellipsis_rate"
  | "parenthetical_rate";

export type BookAuthorialVoiceEnhancementTargetId =
  | "concrete_specificity"
  | "image_precision"
  | "syntax_variety"
  | "paragraph_momentum"
  | "dialogue_subtext"
  | "character_voice_separation"
  | "emotional_granularity"
  | "tension_control"
  | "motif_resonance"
  | "thematic_pressure"
  | "comic_timing"
  | "lyricism"
  | "compression"
  | "accessibility"
  | "world_texture"
  | "scene_choreography"
  | "revelation_design"
  | "ending_resonance";

export type BookAuthorialVoiceAntiPatternId =
  | "stock_breath_release"
  | "jaw_clench"
  | "eyes_widen"
  | "heart_pounded"
  | "blood_ran_cold"
  | "shiver_spine"
  | "little_did_they_know"
  | "not_x_but_y"
  | "filter_verb_stack"
  | "sudden_adverb"
  | "generic_darkness"
  | "generic_smile";

export interface BookAuthorialVoiceSampleV1 {
  sampleId: string;
  role: BookAuthorialVoiceSampleRole;
  sourceKind: "user_owned" | "project_owned";
  text: string;
  textSha256?: string;
  rightsEvidenceIds: string[];
}

export interface BookAuthorialVoiceEnhancementTargetV1 {
  targetId: BookAuthorialVoiceEnhancementTargetId;
  strength: number;
  evidenceIds: string[];
}

export interface BookAuthorialVoicePolicyV1 {
  minimumSamples?: number;
  maximumSamples?: number;
  minimumTotalWords?: number;
  maximumTotalCharacters?: number;
  defaultToleranceRatio?: number;
  hardDriftMultiplier?: number;
  minimumPreservationScore?: number;
}

export interface BookAuthorialVoiceCompileInputV1 {
  outputKind: "evavo_docs_book_authorial_voice_compile_input";
  schemaVersion: 1;
  programmeId: string;
  projectId: string;
  voiceProfileId: string;
  voiceProfileVersion: number;
  samples: BookAuthorialVoiceSampleV1[];
  projectVoiceAnchorIds: string[];
  preserveMetricIds: BookAuthorialVoiceMetricId[];
  flexibleMetricIds: BookAuthorialVoiceMetricId[];
  enhancementTargets: BookAuthorialVoiceEnhancementTargetV1[];
  antiPatternIds: BookAuthorialVoiceAntiPatternId[];
  evidenceIds: string[];
  policy?: BookAuthorialVoicePolicyV1;
}

export interface BookAuthorialVoiceSampleFingerprintV1 {
  sampleId: string;
  role: BookAuthorialVoiceSampleRole;
  sourceKind: "user_owned" | "project_owned";
  textSha256: string;
  wordCount: number;
  rightsEvidenceIds: string[];
}

export interface BookAuthorialVoiceMetricV1 {
  metricId: BookAuthorialVoiceMetricId;
  baseline: number;
  tolerance: number;
  hardMinimum: number;
  hardMaximum: number;
  weight: number;
  core: boolean;
  evidenceSampleIds: string[];
}

export interface BookAuthorialVoiceProfileV1 {
  outputKind: "evavo_docs_book_authorial_voice_profile";
  schemaVersion: 1;
  contract: typeof BOOK_AUTHORIAL_VOICE_CONTRACT;
  status: "ready";
  programmeId: string;
  projectId: string;
  voiceProfileId: string;
  voiceProfileVersion: number;
  sampleFingerprints: BookAuthorialVoiceSampleFingerprintV1[];
  sampleCount: number;
  totalWordCount: number;
  projectVoiceAnchorIds: string[];
  metrics: BookAuthorialVoiceMetricV1[];
  descriptorIds: string[];
  preserveMetricIds: BookAuthorialVoiceMetricId[];
  flexibleMetricIds: BookAuthorialVoiceMetricId[];
  enhancementTargets: BookAuthorialVoiceEnhancementTargetV1[];
  antiPatternIds: BookAuthorialVoiceAntiPatternId[];
  minimumPreservationScore: number;
  providerInstruction: string;
  evidenceIds: string[];
  profileFingerprint: string;
  sourceTextPersisted: false;
  providerExcerptPersisted: false;
  projectOwnedVoiceRequired: true;
  namedCreatorInstructionPermitted: false;
  canonicalAdmissionAllowed: false;
  publicationPerformed: false;
}

export interface BookAuthorialVoiceCompileResultV1 {
  outputKind: "evavo_docs_book_authorial_voice_compile_result";
  schemaVersion: 1;
  status: "ready" | "needs_more_evidence" | "blocked";
  profile?: BookAuthorialVoiceProfileV1;
  profileFingerprint?: string;
  blockers: string[];
  warnings: string[];
  requiredActions: string[];
  sourceTextPersisted: false;
  canonicalAdmissionAllowed: false;
  publicationPerformed: false;
}

export interface BookAuthorialVoiceMetricComparisonV1 {
  metricId: BookAuthorialVoiceMetricId;
  baseline: number;
  candidate: number;
  absoluteDrift: number;
  normalizedDrift: number;
  withinTolerance: boolean;
  withinHardBoundary: boolean;
  weight: number;
  core: boolean;
}

export interface BookAuthorialVoiceAntiPatternFindingV1 {
  findingId: string;
  patternId: BookAuthorialVoiceAntiPatternId;
  occurrences: number;
  severity: "warning" | "blocking";
}

export interface BookAuthorialVoiceComparisonInputV1 {
  outputKind: "evavo_docs_book_authorial_voice_comparison_input";
  schemaVersion: 1;
  comparisonId: string;
  profile: BookAuthorialVoiceProfileV1;
  candidateId: string;
  candidateText: string;
  candidateTextSha256?: string;
  contextRole: BookAuthorialVoiceSampleRole;
  evidenceIds: string[];
}

export interface BookAuthorialVoiceComparisonV1 {
  outputKind: "evavo_docs_book_authorial_voice_comparison";
  schemaVersion: 1;
  contract: typeof BOOK_AUTHORIAL_VOICE_CONTRACT;
  comparisonId: string;
  profileFingerprint: string;
  candidateId: string;
  candidateTextSha256: string;
  contextRole: BookAuthorialVoiceSampleRole;
  metricComparisons: BookAuthorialVoiceMetricComparisonV1[];
  weightedDrift: number;
  preservationScore: number;
  minimumPreservationScore: number;
  softOutlierMetricIds: BookAuthorialVoiceMetricId[];
  hardOutlierMetricIds: BookAuthorialVoiceMetricId[];
  antiPatternFindings: BookAuthorialVoiceAntiPatternFindingV1[];
  accepted: boolean;
  evidenceIds: string[];
  comparisonFingerprint: string;
  rawCandidateTextPersisted: false;
  canonicalAdmissionAllowed: false;
  publicationPerformed: false;
}

export interface BookAuthorialVoiceComparisonResultV1 {
  outputKind: "evavo_docs_book_authorial_voice_comparison_result";
  schemaVersion: 1;
  status: "accepted" | "needs_work" | "blocked";
  comparison?: BookAuthorialVoiceComparisonV1;
  blockers: string[];
  warnings: string[];
  requiredActions: string[];
  canonicalAdmissionAllowed: false;
  publicationPerformed: false;
}
