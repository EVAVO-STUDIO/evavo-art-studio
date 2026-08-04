import {
  BOOK_AUTHORIAL_VOICE_CONTRACT,
  type BookAuthorialVoiceAntiPatternFindingV1,
  type BookAuthorialVoiceAntiPatternId,
  type BookAuthorialVoiceCompileResultV1,
  type BookAuthorialVoiceComparisonResultV1,
  type BookAuthorialVoiceComparisonV1,
  type BookAuthorialVoiceEnhancementTargetId,
  type BookAuthorialVoiceEnhancementTargetV1,
  type BookAuthorialVoiceMetricComparisonV1,
  type BookAuthorialVoiceMetricId,
  type BookAuthorialVoiceMetricV1,
  type BookAuthorialVoicePolicyV1,
  type BookAuthorialVoiceProfileV1,
  type BookAuthorialVoiceSampleFingerprintV1,
  type BookAuthorialVoiceSampleRole,
} from "./book-studio-authorial-voice-types";
import {
  canonicalReviewCraftJson,
  duplicateReviewCraftValues,
  intersectsReviewCraft,
  rejectReviewCraftUnknown,
  reviewCraftArray,
  reviewCraftDigest,
  reviewCraftEnum,
  reviewCraftFinite,
  reviewCraftId,
  reviewCraftIds,
  reviewCraftInteger,
  reviewCraftRecord,
  roundReviewCraft,
  sha256ReviewCraftText,
  uniqueReviewCraft,
} from "./book-studio-review-craft-shared";

const SAMPLE_ROLES = new Set<BookAuthorialVoiceSampleRole>(["narration", "dialogue", "description", "action", "reflection", "mixed"]);
const SOURCE_KINDS = new Set(["user_owned", "project_owned"] as const);
const METRIC_IDS = new Set<BookAuthorialVoiceMetricId>([
  "mean_sentence_words", "sentence_length_variation", "short_sentence_ratio", "long_sentence_ratio",
  "mean_paragraph_sentences", "paragraph_length_variation", "lexical_diversity", "dialogue_word_ratio",
  "contraction_rate", "first_person_rate", "third_person_rate", "emotion_label_rate", "intensifier_rate",
  "filter_verb_rate", "dialogue_tag_rate", "simile_marker_rate", "question_rate", "exclamation_rate",
  "semicolon_rate", "colon_rate", "em_dash_rate", "ellipsis_rate", "parenthetical_rate",
]);
const ENHANCEMENT_TARGET_IDS = new Set<BookAuthorialVoiceEnhancementTargetId>([
  "concrete_specificity", "image_precision", "syntax_variety", "paragraph_momentum", "dialogue_subtext",
  "character_voice_separation", "emotional_granularity", "tension_control", "motif_resonance",
  "thematic_pressure", "comic_timing", "lyricism", "compression", "accessibility", "world_texture",
  "scene_choreography", "revelation_design", "ending_resonance",
]);
const ANTI_PATTERN_IDS = new Set<BookAuthorialVoiceAntiPatternId>([
  "stock_breath_release", "jaw_clench", "eyes_widen", "heart_pounded", "blood_ran_cold", "shiver_spine",
  "little_did_they_know", "not_x_but_y", "filter_verb_stack", "sudden_adverb", "generic_darkness", "generic_smile",
]);
const INPUT_KEYS = new Set([
  "outputKind", "schemaVersion", "programmeId", "projectId", "voiceProfileId", "voiceProfileVersion", "samples",
  "projectVoiceAnchorIds", "preserveMetricIds", "flexibleMetricIds", "enhancementTargets", "antiPatternIds",
  "evidenceIds", "policy",
]);
const SAMPLE_KEYS = new Set(["sampleId", "role", "sourceKind", "text", "textSha256", "rightsEvidenceIds"]);
const TARGET_KEYS = new Set(["targetId", "strength", "evidenceIds"]);
const POLICY_KEYS = new Set([
  "minimumSamples", "maximumSamples", "minimumTotalWords", "maximumTotalCharacters", "defaultToleranceRatio",
  "hardDriftMultiplier", "minimumPreservationScore",
]);
const COMPARISON_KEYS = new Set([
  "outputKind", "schemaVersion", "comparisonId", "profile", "candidateId", "candidateText", "candidateTextSha256",
  "contextRole", "evidenceIds",
]);

const DEFAULT_POLICY: Required<BookAuthorialVoicePolicyV1> = {
  minimumSamples: 2,
  maximumSamples: 16,
  minimumTotalWords: 800,
  maximumTotalCharacters: 2_000_000,
  defaultToleranceRatio: 0.25,
  hardDriftMultiplier: 2.5,
  minimumPreservationScore: 82,
};

const METRIC_WEIGHTS: Record<BookAuthorialVoiceMetricId, number> = {
  mean_sentence_words: 8,
  sentence_length_variation: 9,
  short_sentence_ratio: 5,
  long_sentence_ratio: 5,
  mean_paragraph_sentences: 6,
  paragraph_length_variation: 6,
  lexical_diversity: 7,
  dialogue_word_ratio: 8,
  contraction_rate: 3,
  first_person_rate: 5,
  third_person_rate: 5,
  emotion_label_rate: 5,
  intensifier_rate: 4,
  filter_verb_rate: 5,
  dialogue_tag_rate: 4,
  simile_marker_rate: 4,
  question_rate: 3,
  exclamation_rate: 3,
  semicolon_rate: 2,
  colon_rate: 2,
  em_dash_rate: 3,
  ellipsis_rate: 2,
  parenthetical_rate: 2,
};

const TOLERANCE_FLOORS: Record<BookAuthorialVoiceMetricId, number> = {
  mean_sentence_words: 2.5,
  sentence_length_variation: 0.12,
  short_sentence_ratio: 0.06,
  long_sentence_ratio: 0.05,
  mean_paragraph_sentences: 0.75,
  paragraph_length_variation: 0.15,
  lexical_diversity: 0.06,
  dialogue_word_ratio: 0.08,
  contraction_rate: 1.5,
  first_person_rate: 2,
  third_person_rate: 2,
  emotion_label_rate: 1.25,
  intensifier_rate: 1.25,
  filter_verb_rate: 1.5,
  dialogue_tag_rate: 1.25,
  simile_marker_rate: 0.8,
  question_rate: 0.8,
  exclamation_rate: 0.5,
  semicolon_rate: 0.35,
  colon_rate: 0.35,
  em_dash_rate: 0.5,
  ellipsis_rate: 0.35,
  parenthetical_rate: 0.35,
};

const RATIO_METRICS = new Set<BookAuthorialVoiceMetricId>([
  "sentence_length_variation", "short_sentence_ratio", "long_sentence_ratio", "paragraph_length_variation",
  "lexical_diversity", "dialogue_word_ratio",
]);

const FIRST_PERSON = new Set(["i", "me", "my", "mine", "myself", "we", "us", "our", "ours", "ourselves"]);
const THIRD_PERSON = new Set(["he", "him", "his", "himself", "she", "her", "hers", "herself", "they", "them", "their", "theirs", "themselves"]);
const EMOTION_WORDS = new Set([
  "afraid", "angry", "anxious", "ashamed", "calm", "confused", "delighted", "desperate", "disgusted", "embarrassed",
  "envious", "excited", "frightened", "furious", "glad", "grateful", "guilty", "happy", "hopeful", "humiliated",
  "jealous", "lonely", "miserable", "nervous", "proud", "relieved", "resentful", "sad", "scared", "shocked",
  "sorrowful", "terrified", "uneasy", "worried",
]);
const INTENSIFIERS = new Set([
  "absolutely", "awfully", "completely", "deeply", "entirely", "extremely", "highly", "incredibly", "literally",
  "particularly", "perfectly", "really", "so", "terribly", "totally", "utterly", "very",
]);
const FILTER_VERBS = new Set([
  "felt", "heard", "knew", "noticed", "realised", "realized", "saw", "seemed", "sensed", "thought", "watched", "wondered",
]);
const DIALOGUE_TAGS = new Set([
  "added", "answered", "asked", "called", "cried", "demanded", "murmured", "replied", "said", "shouted", "told", "whispered",
]);

interface ParsedSample {
  sampleId: string;
  role: BookAuthorialVoiceSampleRole;
  sourceKind: "user_owned" | "project_owned";
  text: string;
  textSha256: string;
  wordCount: number;
  rightsEvidenceIds: string[];
}

interface VoiceMeasurements {
  wordCount: number;
  values: Record<BookAuthorialVoiceMetricId, number>;
}

export async function compileBookAuthorialVoiceProfile(input: unknown): Promise<BookAuthorialVoiceCompileResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const requiredActions: string[] = [];
  const source = reviewCraftRecord(input, "Authorial voice compile input", blockers);
  rejectReviewCraftUnknown(source, INPUT_KEYS, "Authorial voice compile input", blockers);
  if (source.outputKind !== "evavo_docs_book_authorial_voice_compile_input") blockers.push("Authorial voice compile input outputKind is invalid.");
  if (source.schemaVersion !== 1) blockers.push("Authorial voice compile input schemaVersion is invalid.");
  const programmeId = reviewCraftId(source.programmeId, "programmeId", blockers);
  const projectId = reviewCraftId(source.projectId, "projectId", blockers);
  const voiceProfileId = reviewCraftId(source.voiceProfileId, "voiceProfileId", blockers);
  const voiceProfileVersion = reviewCraftInteger(source.voiceProfileVersion, "voiceProfileVersion", blockers, 1, 1_000_000);
  const policy = parsePolicy(source.policy, blockers);
  const projectVoiceAnchorIds = reviewCraftIds(source.projectVoiceAnchorIds, "projectVoiceAnchorIds", blockers, 512, true);
  const evidenceIds = reviewCraftIds(source.evidenceIds, "evidenceIds", blockers, 4_096, true);
  const preserveMetricIds = parseMetricIds(source.preserveMetricIds, "preserveMetricIds", blockers, true);
  const flexibleMetricIdsInput = parseMetricIds(source.flexibleMetricIds, "flexibleMetricIds", blockers, false);
  const overlap = intersectsReviewCraft(preserveMetricIds, flexibleMetricIdsInput);
  if (overlap.length) blockers.push(`Voice metrics cannot be both preserved and flexible: ${overlap.join(", ")}.`);
  const unspecified = [...METRIC_IDS].filter((metricId) => !preserveMetricIds.includes(metricId) && !flexibleMetricIdsInput.includes(metricId));
  const flexibleMetricIds = uniqueReviewCraft([...flexibleMetricIdsInput, ...unspecified]).sort();
  if (preserveMetricIds.length < 5) blockers.push("Authorial voice requires at least five preserved metrics.");
  const enhancementTargets = parseEnhancementTargets(source.enhancementTargets, blockers);
  const antiPatternIds = parseAntiPatternIds(source.antiPatternIds, blockers);

  const rawSamples = reviewCraftArray(source.samples, "samples", blockers, 1, policy.maximumSamples);
  const samples: ParsedSample[] = [];
  for (let index = 0; index < rawSamples.length; index += 1) {
    const sampleSource = reviewCraftRecord(rawSamples[index], `sample ${index + 1}`, blockers);
    rejectReviewCraftUnknown(sampleSource, SAMPLE_KEYS, `sample ${index + 1}`, blockers);
    const sampleId = reviewCraftId(sampleSource.sampleId, `sample ${index + 1} sampleId`, blockers);
    const role = reviewCraftEnum(sampleSource.role, SAMPLE_ROLES, `sample ${sampleId} role`, blockers, "mixed");
    const sourceKind = reviewCraftEnum(sampleSource.sourceKind, SOURCE_KINDS, `sample ${sampleId} sourceKind`, blockers, "project_owned");
    const text = proseText(sampleSource.text, `sample ${sampleId} text`, blockers, policy.maximumTotalCharacters);
    const actualTextSha256 = await sha256ReviewCraftText(text);
    if (sampleSource.textSha256 !== undefined && reviewCraftDigest(sampleSource.textSha256, `sample ${sampleId} textSha256`, blockers) !== actualTextSha256) blockers.push(`Sample ${sampleId} textSha256 does not match its exact text.`);
    const words = tokenize(text);
    samples.push({
      sampleId,
      role,
      sourceKind,
      text,
      textSha256: actualTextSha256,
      wordCount: words.length,
      rightsEvidenceIds: reviewCraftIds(sampleSource.rightsEvidenceIds, `sample ${sampleId} rightsEvidenceIds`, blockers, 128, true),
    });
  }
  samples.sort((left, right) => left.sampleId.localeCompare(right.sampleId));
  const duplicateSampleIds = duplicateReviewCraftValues(samples.map((item) => item.sampleId));
  if (duplicateSampleIds.length) blockers.push(`Authorial voice sample IDs are duplicated: ${duplicateSampleIds.join(", ")}.`);
  const duplicateFingerprints = duplicateReviewCraftValues(samples.map((item) => item.textSha256));
  if (duplicateFingerprints.length) blockers.push("Authorial voice samples cannot repeat identical text under multiple identities.");
  const totalCharacters = samples.reduce((sum, item) => sum + item.text.length, 0);
  const totalWordCount = samples.reduce((sum, item) => sum + item.wordCount, 0);
  if (totalCharacters > policy.maximumTotalCharacters) blockers.push(`Authorial voice samples exceed ${policy.maximumTotalCharacters} total characters.`);
  if (samples.length < policy.minimumSamples) requiredActions.push(`Supply at least ${policy.minimumSamples} distinct project-owned writing samples.`);
  if (totalWordCount < policy.minimumTotalWords) requiredActions.push(`Supply at least ${policy.minimumTotalWords} total words of project-owned writing; current total is ${totalWordCount}.`);
  const finalBlockers = uniqueReviewCraft(blockers);
  if (finalBlockers.length) return compileBlocked(finalBlockers, warnings, requiredActions);
  if (requiredActions.length) return compileNeedsEvidence(warnings, requiredActions);

  const measurements = measureVoice(samples.map((item) => item.text).join("\n\n"));
  const metrics = buildMetrics(measurements.values, preserveMetricIds, samples.map((item) => item.sampleId), policy);
  const descriptorIds = describeVoice(measurements.values);
  const sampleFingerprints: BookAuthorialVoiceSampleFingerprintV1[] = samples.map((item) => ({
    sampleId: item.sampleId,
    role: item.role,
    sourceKind: item.sourceKind,
    textSha256: item.textSha256,
    wordCount: item.wordCount,
    rightsEvidenceIds: item.rightsEvidenceIds,
  }));
  const providerInstruction = buildVoiceInstruction({
    voiceProfileId,
    voiceProfileVersion,
    metrics,
    descriptorIds,
    enhancementTargets,
    antiPatternIds,
    projectVoiceAnchorIds,
  });
  const unsigned: Omit<BookAuthorialVoiceProfileV1, "profileFingerprint"> = {
    outputKind: "evavo_docs_book_authorial_voice_profile",
    schemaVersion: 1,
    contract: BOOK_AUTHORIAL_VOICE_CONTRACT,
    status: "ready",
    programmeId,
    projectId,
    voiceProfileId,
    voiceProfileVersion,
    sampleFingerprints,
    sampleCount: samples.length,
    totalWordCount,
    projectVoiceAnchorIds,
    metrics,
    descriptorIds,
    preserveMetricIds,
    flexibleMetricIds,
    enhancementTargets,
    antiPatternIds,
    minimumPreservationScore: policy.minimumPreservationScore,
    providerInstruction,
    evidenceIds,
    sourceTextPersisted: false,
    providerExcerptPersisted: false,
    projectOwnedVoiceRequired: true,
    namedCreatorInstructionPermitted: false,
    canonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
  const profileFingerprint = await sha256ReviewCraftText(canonicalReviewCraftJson(unsigned));
  const profile: BookAuthorialVoiceProfileV1 = { ...unsigned, profileFingerprint };
  return {
    outputKind: "evavo_docs_book_authorial_voice_compile_result",
    schemaVersion: 1,
    status: "ready",
    profile,
    profileFingerprint,
    blockers: [],
    warnings: uniqueReviewCraft(warnings),
    requiredActions: [],
    sourceTextPersisted: false,
    canonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
}

export async function compareBookAuthorialVoice(input: unknown): Promise<BookAuthorialVoiceComparisonResultV1> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const requiredActions: string[] = [];
  const source = reviewCraftRecord(input, "Authorial voice comparison input", blockers);
  rejectReviewCraftUnknown(source, COMPARISON_KEYS, "Authorial voice comparison input", blockers);
  if (source.outputKind !== "evavo_docs_book_authorial_voice_comparison_input") blockers.push("Authorial voice comparison outputKind is invalid.");
  if (source.schemaVersion !== 1) blockers.push("Authorial voice comparison schemaVersion is invalid.");
  const profileBlockers = await validateBookAuthorialVoiceProfile(source.profile);
  blockers.push(...profileBlockers.map((item) => `Voice profile: ${item}`));
  if (blockers.length) return comparisonBlocked(blockers);
  const profile = source.profile as BookAuthorialVoiceProfileV1;
  const comparisonId = reviewCraftId(source.comparisonId, "comparisonId", blockers);
  const candidateId = reviewCraftId(source.candidateId, "candidateId", blockers);
  const candidateText = proseText(source.candidateText, "candidateText", blockers, 1_000_000);
  const candidateTextSha256 = await sha256ReviewCraftText(candidateText);
  if (source.candidateTextSha256 !== undefined && reviewCraftDigest(source.candidateTextSha256, "candidateTextSha256", blockers) !== candidateTextSha256) blockers.push("candidateTextSha256 does not match the exact candidate text.");
  const contextRole = reviewCraftEnum(source.contextRole, SAMPLE_ROLES, "contextRole", blockers, "mixed");
  const evidenceIds = reviewCraftIds(source.evidenceIds, "evidenceIds", blockers, 4_096, true);
  const candidateMeasurements = measureVoice(candidateText);
  if (candidateMeasurements.wordCount < 80) warnings.push("Voice comparison is based on fewer than 80 words and may be unstable.");
  if (blockers.length) return comparisonBlocked(blockers);

  const metricComparisons: BookAuthorialVoiceMetricComparisonV1[] = profile.metrics.map((metric) => {
    const candidate = candidateMeasurements.values[metric.metricId];
    const absoluteDrift = Math.abs(candidate - metric.baseline);
    const normalizedDrift = roundReviewCraft(absoluteDrift / Math.max(metric.tolerance, 0.000001), 4);
    return {
      metricId: metric.metricId,
      baseline: metric.baseline,
      candidate,
      absoluteDrift: roundReviewCraft(absoluteDrift, 4),
      normalizedDrift,
      withinTolerance: normalizedDrift <= 1,
      withinHardBoundary: candidate >= metric.hardMinimum && candidate <= metric.hardMaximum,
      weight: metric.weight,
      core: metric.core,
    };
  });
  const totalWeight = metricComparisons.reduce((sum, item) => sum + item.weight, 0);
  const weightedDrift = roundReviewCraft(metricComparisons.reduce((sum, item) => sum + Math.min(item.normalizedDrift, 4) * item.weight, 0) / Math.max(totalWeight, 1), 4);
  const softOutlierMetricIds = metricComparisons.filter((item) => !item.withinTolerance).map((item) => item.metricId);
  const hardOutlierMetricIds = metricComparisons.filter((item) => item.core && !item.withinHardBoundary).map((item) => item.metricId);
  const antiPatternFindings = detectAntiPatterns(candidateText, profile.antiPatternIds);
  const blockingPatternCount = antiPatternFindings.filter((item) => item.severity === "blocking").length;
  const preservationScore = roundReviewCraft(Math.max(0, 100 - weightedDrift * 14 - hardOutlierMetricIds.length * 8 - blockingPatternCount * 8), 2);
  const accepted = preservationScore >= profile.minimumPreservationScore && !hardOutlierMetricIds.length && blockingPatternCount === 0;
  if (!accepted) {
    if (hardOutlierMetricIds.length) requiredActions.push(`Restore project voice on core metrics: ${hardOutlierMetricIds.join(", ")}.`);
    if (preservationScore < profile.minimumPreservationScore) requiredActions.push(`Raise authorial voice preservation from ${preservationScore} to at least ${profile.minimumPreservationScore}.`);
    const blockingPatterns = antiPatternFindings.filter((item) => item.severity === "blocking").map((item) => item.patternId);
    if (blockingPatterns.length) requiredActions.push(`Remove repeated generic patterns: ${blockingPatterns.join(", ")}.`);
  }
  const unsigned: Omit<BookAuthorialVoiceComparisonV1, "comparisonFingerprint"> = {
    outputKind: "evavo_docs_book_authorial_voice_comparison",
    schemaVersion: 1,
    contract: BOOK_AUTHORIAL_VOICE_CONTRACT,
    comparisonId,
    profileFingerprint: profile.profileFingerprint,
    candidateId,
    candidateTextSha256,
    contextRole,
    metricComparisons,
    weightedDrift,
    preservationScore,
    minimumPreservationScore: profile.minimumPreservationScore,
    softOutlierMetricIds,
    hardOutlierMetricIds,
    antiPatternFindings,
    accepted,
    evidenceIds,
    rawCandidateTextPersisted: false,
    canonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
  const comparisonFingerprint = await sha256ReviewCraftText(canonicalReviewCraftJson(unsigned));
  const comparison: BookAuthorialVoiceComparisonV1 = { ...unsigned, comparisonFingerprint };
  return {
    outputKind: "evavo_docs_book_authorial_voice_comparison_result",
    schemaVersion: 1,
    status: accepted ? "accepted" : "needs_work",
    comparison,
    blockers: [],
    warnings: uniqueReviewCraft(warnings),
    requiredActions: uniqueReviewCraft(requiredActions),
    canonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
}

export async function validateBookAuthorialVoiceProfile(value: unknown): Promise<string[]> {
  const blockers: string[] = [];
  const source = reviewCraftRecord(value, "Authorial voice profile", blockers);
  if (source.outputKind !== "evavo_docs_book_authorial_voice_profile" || source.schemaVersion !== 1 || source.contract !== BOOK_AUTHORIAL_VOICE_CONTRACT || source.status !== "ready") blockers.push("Authorial voice profile identity is invalid.");
  const requiredFalse = ["sourceTextPersisted", "providerExcerptPersisted", "namedCreatorInstructionPermitted", "canonicalAdmissionAllowed", "publicationPerformed"];
  for (const key of requiredFalse) if (source[key] !== false) blockers.push(`Authorial voice profile ${key} must remain false.`);
  if (source.projectOwnedVoiceRequired !== true) blockers.push("Authorial voice profile projectOwnedVoiceRequired must remain true.");
  const fingerprint = reviewCraftDigest(source.profileFingerprint, "profileFingerprint", blockers);
  const { profileFingerprint: _discarded, ...unsigned } = source;
  if (fingerprint !== await sha256ReviewCraftText(canonicalReviewCraftJson(unsigned))) blockers.push("Authorial voice profile fingerprint does not match its exact contents.");
  return uniqueReviewCraft(blockers);
}

export async function validateBookAuthorialVoiceComparison(value: unknown): Promise<string[]> {
  const blockers: string[] = [];
  const source = reviewCraftRecord(value, "Authorial voice comparison", blockers);
  if (source.outputKind !== "evavo_docs_book_authorial_voice_comparison" || source.schemaVersion !== 1 || source.contract !== BOOK_AUTHORIAL_VOICE_CONTRACT) blockers.push("Authorial voice comparison identity is invalid.");
  if (source.rawCandidateTextPersisted !== false || source.canonicalAdmissionAllowed !== false || source.publicationPerformed !== false) blockers.push("Authorial voice comparison authority or privacy flags are invalid.");
  const fingerprint = reviewCraftDigest(source.comparisonFingerprint, "comparisonFingerprint", blockers);
  const { comparisonFingerprint: _discarded, ...unsigned } = source;
  if (fingerprint !== await sha256ReviewCraftText(canonicalReviewCraftJson(unsigned))) blockers.push("Authorial voice comparison fingerprint does not match its exact contents.");
  return uniqueReviewCraft(blockers);
}

function parsePolicy(value: unknown, blockers: string[]): Required<BookAuthorialVoicePolicyV1> {
  if (value === undefined) return { ...DEFAULT_POLICY };
  const source = reviewCraftRecord(value, "Authorial voice policy", blockers);
  rejectReviewCraftUnknown(source, POLICY_KEYS, "Authorial voice policy", blockers);
  const policy: Required<BookAuthorialVoicePolicyV1> = {
    minimumSamples: source.minimumSamples === undefined ? DEFAULT_POLICY.minimumSamples : reviewCraftInteger(source.minimumSamples, "minimumSamples", blockers, 1, 8),
    maximumSamples: source.maximumSamples === undefined ? DEFAULT_POLICY.maximumSamples : reviewCraftInteger(source.maximumSamples, "maximumSamples", blockers, 1, 32),
    minimumTotalWords: source.minimumTotalWords === undefined ? DEFAULT_POLICY.minimumTotalWords : reviewCraftInteger(source.minimumTotalWords, "minimumTotalWords", blockers, 100, 100_000),
    maximumTotalCharacters: source.maximumTotalCharacters === undefined ? DEFAULT_POLICY.maximumTotalCharacters : reviewCraftInteger(source.maximumTotalCharacters, "maximumTotalCharacters", blockers, 10_000, 4_000_000),
    defaultToleranceRatio: source.defaultToleranceRatio === undefined ? DEFAULT_POLICY.defaultToleranceRatio : reviewCraftFinite(source.defaultToleranceRatio, "defaultToleranceRatio", blockers, 0.05, 1),
    hardDriftMultiplier: source.hardDriftMultiplier === undefined ? DEFAULT_POLICY.hardDriftMultiplier : reviewCraftFinite(source.hardDriftMultiplier, "hardDriftMultiplier", blockers, 1.25, 5),
    minimumPreservationScore: source.minimumPreservationScore === undefined ? DEFAULT_POLICY.minimumPreservationScore : reviewCraftFinite(source.minimumPreservationScore, "minimumPreservationScore", blockers, 60, 100),
  };
  if (policy.maximumSamples < policy.minimumSamples) blockers.push("maximumSamples cannot be below minimumSamples.");
  return policy;
}

function parseMetricIds(value: unknown, label: string, blockers: string[], required: boolean): BookAuthorialVoiceMetricId[] {
  if (!Array.isArray(value) || (required && value.length === 0) || value.length > METRIC_IDS.size) {
    blockers.push(`${label} is invalid or unbounded.`);
    return [];
  }
  const result = value.map((item) => reviewCraftEnum(item, METRIC_IDS, label, blockers, "mean_sentence_words"));
  const duplicates = duplicateReviewCraftValues(result);
  if (duplicates.length) blockers.push(`${label} contains duplicates: ${duplicates.join(", ")}.`);
  return uniqueReviewCraft(result).sort();
}

function parseEnhancementTargets(value: unknown, blockers: string[]): BookAuthorialVoiceEnhancementTargetV1[] {
  const records = reviewCraftArray(value, "enhancementTargets", blockers, 0, ENHANCEMENT_TARGET_IDS.size);
  const result = records.map((item, index) => {
    const source = reviewCraftRecord(item, `enhancement target ${index + 1}`, blockers);
    rejectReviewCraftUnknown(source, TARGET_KEYS, `enhancement target ${index + 1}`, blockers);
    return {
      targetId: reviewCraftEnum(source.targetId, ENHANCEMENT_TARGET_IDS, `enhancement target ${index + 1} targetId`, blockers, "concrete_specificity"),
      strength: roundReviewCraft(reviewCraftFinite(source.strength, `enhancement target ${index + 1} strength`, blockers, 0, 1), 3),
      evidenceIds: reviewCraftIds(source.evidenceIds, `enhancement target ${index + 1} evidenceIds`, blockers, 128, true),
    };
  }).sort((left, right) => left.targetId.localeCompare(right.targetId));
  const duplicates = duplicateReviewCraftValues(result.map((item) => item.targetId));
  if (duplicates.length) blockers.push(`Enhancement target IDs are duplicated: ${duplicates.join(", ")}.`);
  return result;
}

function parseAntiPatternIds(value: unknown, blockers: string[]): BookAuthorialVoiceAntiPatternId[] {
  if (!Array.isArray(value) || value.length > ANTI_PATTERN_IDS.size) {
    blockers.push("antiPatternIds is invalid or unbounded.");
    return [];
  }
  const result = value.map((item) => reviewCraftEnum(item, ANTI_PATTERN_IDS, "antiPatternIds", blockers, "stock_breath_release"));
  const duplicates = duplicateReviewCraftValues(result);
  if (duplicates.length) blockers.push(`antiPatternIds contains duplicates: ${duplicates.join(", ")}.`);
  return uniqueReviewCraft(result).sort();
}

function buildMetrics(
  values: Record<BookAuthorialVoiceMetricId, number>,
  preserveMetricIds: BookAuthorialVoiceMetricId[],
  sampleIds: string[],
  policy: Required<BookAuthorialVoicePolicyV1>,
): BookAuthorialVoiceMetricV1[] {
  const preserve = new Set(preserveMetricIds);
  return [...METRIC_IDS].sort().map((metricId) => {
    const baseline = values[metricId];
    const core = preserve.has(metricId);
    const toleranceScale = core ? 1 : 1.6;
    const tolerance = roundReviewCraft(Math.max(Math.abs(baseline) * policy.defaultToleranceRatio, TOLERANCE_FLOORS[metricId]) * toleranceScale, 4);
    const rawMaximum = baseline + tolerance * policy.hardDriftMultiplier;
    return {
      metricId,
      baseline,
      tolerance,
      hardMinimum: roundReviewCraft(Math.max(0, baseline - tolerance * policy.hardDriftMultiplier), 4),
      hardMaximum: roundReviewCraft(RATIO_METRICS.has(metricId) ? Math.min(1, rawMaximum) : rawMaximum, 4),
      weight: core ? METRIC_WEIGHTS[metricId] : Math.max(1, roundReviewCraft(METRIC_WEIGHTS[metricId] * 0.45, 2)),
      core,
      evidenceSampleIds: [...sampleIds],
    };
  });
}

function buildVoiceInstruction(input: {
  voiceProfileId: string;
  voiceProfileVersion: number;
  metrics: BookAuthorialVoiceMetricV1[];
  descriptorIds: string[];
  enhancementTargets: BookAuthorialVoiceEnhancementTargetV1[];
  antiPatternIds: BookAuthorialVoiceAntiPatternId[];
  projectVoiceAnchorIds: string[];
}): string {
  const core = input.metrics.filter((item) => item.core);
  const flexible = input.metrics.filter((item) => !item.core);
  return [
    `PROJECT-OWNED AUTHORIAL VOICE: ${input.voiceProfileId} v${input.voiceProfileVersion}`,
    "Preserve the writer's existing authorship. Improve craft inside that voice; do not normalise it into generic model prose and do not overwrite it with an external creator.",
    `Voice descriptors: ${input.descriptorIds.join(", ") || "evidence-defined"}.`,
    `Project voice anchors: ${input.projectVoiceAnchorIds.join(", ")}.`,
    "Core voice metrics to preserve:",
    ...core.map((item) => `- ${item.metricId}: baseline ${item.baseline}, ordinary tolerance ±${item.tolerance}, hard range ${item.hardMinimum}-${item.hardMaximum}.`),
    "Flexible register metrics:",
    ...flexible.map((item) => `- ${item.metricId}: baseline ${item.baseline}, scene-sensitive tolerance ±${item.tolerance}.`),
    "Enhance without replacing the voice:",
    ...(input.enhancementTargets.length ? input.enhancementTargets.map((item) => `- ${item.targetId}: strength ${item.strength}.`) : ["- Preserve the voice and improve only where scene evidence requires it."]),
    `Avoid project-generic patterns: ${input.antiPatternIds.join(", ") || "none configured"}.`,
    "Use syntax, diction, paragraph movement, dialogue density and punctuation as a coordinated system. Do not chase any one metric mechanically.",
  ].join("\n");
}

function measureVoice(text: string): VoiceMeasurements {
  const words = tokenize(text);
  const sentenceTexts = splitSentences(text);
  const sentenceLengths = sentenceTexts.map((sentence) => tokenize(sentence).length).filter((length) => length > 0);
  const paragraphs = text.split(/\r?\n\s*\r?\n+/u).map((item) => item.trim()).filter(Boolean);
  const paragraphSentenceCounts = paragraphs.map((paragraph) => Math.max(1, splitSentences(paragraph).length));
  const lowerWords = words.map((word) => word.toLocaleLowerCase("en-AU"));
  const wordCount = Math.max(words.length, 1);
  const perThousand = (count: number) => roundReviewCraft(count * 1_000 / wordCount, 4);
  const dialogueWords = quotedWordCount(text);
  const values: Record<BookAuthorialVoiceMetricId, number> = {
    mean_sentence_words: roundReviewCraft(mean(sentenceLengths), 4),
    sentence_length_variation: roundReviewCraft(coefficientOfVariation(sentenceLengths), 4),
    short_sentence_ratio: roundReviewCraft(ratio(sentenceLengths.filter((value) => value <= 7).length, sentenceLengths.length), 4),
    long_sentence_ratio: roundReviewCraft(ratio(sentenceLengths.filter((value) => value >= 25).length, sentenceLengths.length), 4),
    mean_paragraph_sentences: roundReviewCraft(mean(paragraphSentenceCounts), 4),
    paragraph_length_variation: roundReviewCraft(coefficientOfVariation(paragraphSentenceCounts), 4),
    lexical_diversity: roundReviewCraft(movingTypeTokenRatio(lowerWords, 50), 4),
    dialogue_word_ratio: roundReviewCraft(Math.min(1, dialogueWords / wordCount), 4),
    contraction_rate: perThousand(words.filter((word) => /['’]/u.test(word)).length),
    first_person_rate: perThousand(lowerWords.filter((word) => FIRST_PERSON.has(word)).length),
    third_person_rate: perThousand(lowerWords.filter((word) => THIRD_PERSON.has(word)).length),
    emotion_label_rate: perThousand(lowerWords.filter((word) => EMOTION_WORDS.has(word)).length),
    intensifier_rate: perThousand(lowerWords.filter((word) => INTENSIFIERS.has(word)).length),
    filter_verb_rate: perThousand(lowerWords.filter((word) => FILTER_VERBS.has(word)).length),
    dialogue_tag_rate: perThousand(lowerWords.filter((word) => DIALOGUE_TAGS.has(word)).length),
    simile_marker_rate: perThousand(countMatches(text, /\b(?:as if|as though|like a|like an|like the)\b/giu)),
    question_rate: perThousand(countCharacter(text, "?")),
    exclamation_rate: perThousand(countCharacter(text, "!")),
    semicolon_rate: perThousand(countCharacter(text, ";")),
    colon_rate: perThousand(countCharacter(text, ":")),
    em_dash_rate: perThousand(countMatches(text, /—|--/gu)),
    ellipsis_rate: perThousand(countMatches(text, /\.{3}|…/gu)),
    parenthetical_rate: perThousand(countMatches(text, /\([^()]{1,300}\)/gu)),
  };
  return { wordCount: words.length, values };
}

function describeVoice(values: Record<BookAuthorialVoiceMetricId, number>): string[] {
  const result: string[] = [];
  result.push(values.mean_sentence_words < 12 ? "compressed_sentence_span" : values.mean_sentence_words > 21 ? "expansive_sentence_span" : "balanced_sentence_span");
  result.push(values.sentence_length_variation > 0.65 ? "high_cadence_variation" : values.sentence_length_variation < 0.35 ? "steady_cadence" : "moderate_cadence_variation");
  result.push(values.dialogue_word_ratio > 0.4 ? "dialogue_forward" : values.dialogue_word_ratio < 0.15 ? "narration_forward" : "dialogue_narration_balance");
  result.push(values.lexical_diversity > 0.78 ? "wide_lexical_range" : values.lexical_diversity < 0.58 ? "plain_lexical_range" : "selective_lexical_range");
  result.push(values.emotion_label_rate > 6 ? "emotion_explicit" : values.emotion_label_rate < 2 ? "emotion_indirect" : "emotion_mixed_expression");
  if (values.em_dash_rate > 2) result.push("em_dash_friendly");
  if (values.semicolon_rate > 1) result.push("semicolon_friendly");
  if (values.question_rate > 4) result.push("questioning_cadence");
  if (values.contraction_rate > 12) result.push("conversational_contractions");
  if (values.first_person_rate > values.third_person_rate * 1.5) result.push("first_person_lexical_bias");
  if (values.third_person_rate > values.first_person_rate * 1.5) result.push("third_person_lexical_bias");
  return uniqueReviewCraft(result).sort();
}

function detectAntiPatterns(text: string, configured: BookAuthorialVoiceAntiPatternId[]): BookAuthorialVoiceAntiPatternFindingV1[] {
  const definitions: Record<BookAuthorialVoiceAntiPatternId, { regex: RegExp; blockingAt: number }> = {
    stock_breath_release: { regex: /\b(?:let|letting|released|releasing) (?:out )?(?:a|the) breath (?:he|she|they|i|we) (?:did not|didn't|had not|hadn't) (?:know|realise|realize) (?:he|she|they|i|we) (?:was|were) holding\b/giu, blockingAt: 2 },
    jaw_clench: { regex: /\b(?:his|her|their|my|the) jaw (?:clenched|tightened|set)\b/giu, blockingAt: 3 },
    eyes_widen: { regex: /\b(?:his|her|their|my) eyes widened\b/giu, blockingAt: 3 },
    heart_pounded: { regex: /\b(?:his|her|their|my) heart (?:pounded|hammered|thudded)\b/giu, blockingAt: 3 },
    blood_ran_cold: { regex: /\b(?:his|her|their|my) blood ran cold\b/giu, blockingAt: 1 },
    shiver_spine: { regex: /\b(?:a )?(?:shiver|chill) (?:ran|went|traced|crawled) (?:down|up|along) (?:his|her|their|my) spine\b/giu, blockingAt: 2 },
    little_did_they_know: { regex: /\blittle did (?:he|she|they|i|we) know\b/giu, blockingAt: 1 },
    not_x_but_y: { regex: /\bnot\b[^.!?\n]{1,90}\bbut\b/giu, blockingAt: 6 },
    filter_verb_stack: { regex: /\b(?:felt|heard|knew|noticed|realised|realized|saw|seemed|sensed|thought|watched|wondered)\b[^.!?\n]{0,80}\b(?:felt|heard|knew|noticed|realised|realized|saw|seemed|sensed|thought|watched|wondered)\b/giu, blockingAt: 4 },
    sudden_adverb: { regex: /\b(?:suddenly|abruptly|instantly)\b/giu, blockingAt: 8 },
    generic_darkness: { regex: /\bdarkness (?:closed|gathered|pressed|swallowed|wrapped)\b/giu, blockingAt: 3 },
    generic_smile: { regex: /\b(?:smile|smiled) (?:did not|didn't|never) reach (?:his|her|their) eyes\b|\bsmiled thinly\b/giu, blockingAt: 3 },
  };
  return configured.flatMap((patternId) => {
    const definition = definitions[patternId];
    const occurrences = countMatches(text, definition.regex);
    if (!occurrences) return [];
    return [{
      findingId: `voice-pattern:${patternId}`,
      patternId,
      occurrences,
      severity: occurrences >= definition.blockingAt ? "blocking" as const : "warning" as const,
    }];
  }).sort((left, right) => left.patternId.localeCompare(right.patternId));
}

function proseText(value: unknown, label: string, blockers: string[], maximum: number): string {
  if (typeof value !== "string" || value !== value.trim() || value.length < 1 || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    blockers.push(`${label} is invalid.`);
    return "invalid";
  }
  return value;
}

function tokenize(text: string): string[] {
  return text.normalize("NFKC").match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
}

function splitSentences(text: string): string[] {
  return (text.replace(/\r\n?/gu, "\n").match(/[^.!?\n]+(?:[.!?]+["'”’)]*)|[^.!?\n]+$/gmu) ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
}

function quotedWordCount(text: string): number {
  let count = 0;
  for (const match of text.matchAll(/[\"“]([^\"”]{1,50_000})[\"”]/gsu)) count += tokenize(match[1] ?? "").length;
  return count;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function coefficientOfVariation(values: number[]): number {
  const average = mean(values);
  if (!values.length || average === 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance) / average;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function movingTypeTokenRatio(words: string[], window: number): number {
  if (!words.length) return 0;
  if (words.length <= window) return new Set(words).size / words.length;
  let total = 0;
  let windows = 0;
  const step = Math.max(1, Math.floor(window / 5));
  for (let index = 0; index <= words.length - window; index += step) {
    total += new Set(words.slice(index, index + window)).size / window;
    windows += 1;
  }
  return windows ? total / windows : 0;
}

function countMatches(text: string, regex: RegExp): number {
  return [...text.matchAll(regex)].length;
}

function countCharacter(text: string, character: string): number {
  return [...text].filter((value) => value === character).length;
}

function compileBlocked(blockers: string[], warnings: string[], requiredActions: string[]): BookAuthorialVoiceCompileResultV1 {
  return {
    outputKind: "evavo_docs_book_authorial_voice_compile_result",
    schemaVersion: 1,
    status: "blocked",
    blockers: uniqueReviewCraft(blockers),
    warnings: uniqueReviewCraft(warnings),
    requiredActions: uniqueReviewCraft(requiredActions),
    sourceTextPersisted: false,
    canonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
}

function compileNeedsEvidence(warnings: string[], requiredActions: string[]): BookAuthorialVoiceCompileResultV1 {
  return {
    outputKind: "evavo_docs_book_authorial_voice_compile_result",
    schemaVersion: 1,
    status: "needs_more_evidence",
    blockers: [],
    warnings: uniqueReviewCraft(warnings),
    requiredActions: uniqueReviewCraft(requiredActions),
    sourceTextPersisted: false,
    canonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
}

function comparisonBlocked(blockers: string[]): BookAuthorialVoiceComparisonResultV1 {
  return {
    outputKind: "evavo_docs_book_authorial_voice_comparison_result",
    schemaVersion: 1,
    status: "blocked",
    blockers: uniqueReviewCraft(blockers),
    warnings: [],
    requiredActions: ["Correct the malformed or unauthorised authorial voice comparison input."],
    canonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
}
