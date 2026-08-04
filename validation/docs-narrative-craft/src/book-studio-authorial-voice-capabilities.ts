import {
  BOOK_AUTHORIAL_VOICE_CONTRACT,
  type BookAuthorialVoiceAntiPatternId,
  type BookAuthorialVoiceEnhancementTargetId,
  type BookAuthorialVoiceMetricId,
  type BookAuthorialVoiceSampleRole,
} from "./book-studio-authorial-voice-types";

export function listBookAuthorialVoiceCapabilities() {
  return Object.freeze({
    outputKind: "evavo_docs_book_authorial_voice_capabilities",
    schemaVersion: 1,
    contract: BOOK_AUTHORIAL_VOICE_CONTRACT,
    operations: ["compile_voice_profile", "validate_voice_profile", "compare_voice", "validate_voice_comparison"] as const,
    sampleRoles: ["narration", "dialogue", "description", "action", "reflection", "mixed"] as readonly BookAuthorialVoiceSampleRole[],
    metricIds: [
      "mean_sentence_words", "sentence_length_variation", "short_sentence_ratio", "long_sentence_ratio",
      "mean_paragraph_sentences", "paragraph_length_variation", "lexical_diversity", "dialogue_word_ratio",
      "contraction_rate", "first_person_rate", "third_person_rate", "emotion_label_rate", "intensifier_rate",
      "filter_verb_rate", "dialogue_tag_rate", "simile_marker_rate", "question_rate", "exclamation_rate",
      "semicolon_rate", "colon_rate", "em_dash_rate", "ellipsis_rate", "parenthetical_rate",
    ] as readonly BookAuthorialVoiceMetricId[],
    enhancementTargetIds: [
      "concrete_specificity", "image_precision", "syntax_variety", "paragraph_momentum", "dialogue_subtext",
      "character_voice_separation", "emotional_granularity", "tension_control", "motif_resonance",
      "thematic_pressure", "comic_timing", "lyricism", "compression", "accessibility", "world_texture",
      "scene_choreography", "revelation_design", "ending_resonance",
    ] as readonly BookAuthorialVoiceEnhancementTargetId[],
    antiPatternIds: [
      "stock_breath_release", "jaw_clench", "eyes_widen", "heart_pounded", "blood_ran_cold", "shiver_spine",
      "little_did_they_know", "not_x_but_y", "filter_verb_stack", "sudden_adverb", "generic_darkness",
      "generic_smile",
    ] as readonly BookAuthorialVoiceAntiPatternId[],
    rawSourceTextPersisted: false,
    providerExcerptPersisted: false,
    projectOwnedVoiceRequired: true,
    namedCreatorInstructionPermitted: false,
    canonicalAdmissionAllowed: false,
    publicationPerformed: false,
  });
}
