import type {
  BookDialogueTurnFunction,
  BookNarrativeActionTendency,
  BookNarrativeCharacterStateV1,
  BookNarrativeDensity,
  BookNarrativeDialoguePlanV1,
  BookNarrativeDistance,
  BookNarrativeEmotionBeatV1,
  BookNarrativeEmotionRegulationStrategy,
  BookNarrativePerson,
  BookNarrativeProsePlanV1,
  BookNarrativeRhythm,
  BookNarrativeTense,
} from "./book-studio-narrative-craft-types";
import {
  duplicateReviewCraftValues,
  rejectReviewCraftUnknown,
  reviewCraftArray,
  reviewCraftBool,
  reviewCraftEnum,
  reviewCraftId,
  reviewCraftIds,
  reviewCraftInteger,
  reviewCraftRecord,
  reviewCraftText,
  uniqueReviewCraft,
} from "./book-studio-review-craft-shared";

const ACTION_TENDENCIES = new Set<BookNarrativeActionTendency>(["approach", "avoid", "attack", "freeze", "appease", "hide", "seek_support", "repair", "observe", "endure", "custom"]);
const REGULATION_STRATEGIES = new Set<BookNarrativeEmotionRegulationStrategy>(["situation_selection", "situation_modification", "attentional_deployment", "cognitive_reappraisal", "response_suppression", "expressive_disclosure", "strategic_delay", "mixed"]);
const TURN_FUNCTIONS = new Set<BookDialogueTurnFunction>(["offer_or_claim", "request", "challenge", "answer", "evasion", "repair", "refusal", "concession", "threat", "promise", "silence", "topic_shift", "status_test", "disclosure", "misdirection"]);
const PERSONS = new Set<BookNarrativePerson>(["first", "second", "third"]);
const TENSES = new Set<BookNarrativeTense>(["past", "present"]);
const DISTANCES = new Set<BookNarrativeDistance>(["interior", "close", "medium", "distant", "variable"]);
const RHYTHMS = new Set<BookNarrativeRhythm>(["compressed", "balanced", "expansive", "variable"]);
const DENSITIES = new Set<BookNarrativeDensity>(["low", "moderate", "high", "variable"]);
const GOAL_CONGRUENCE = new Set(["advances", "obstructs", "mixed", "uncertain"] as const);
const CONTROL = new Set(["low", "medium", "high", "uncertain"] as const);
const LEVEL = new Set(["low", "medium", "high"] as const);
const CHARACTER_KEYS = new Set(["characterId", "publicGoal", "privateNeed", "currentBelief", "mistakenBelief", "immediateAppraisal", "emotionalState", "actionTendency", "regulationStrategy", "outwardDisplay", "withheldInformation", "relationshipPressure", "statusPosition", "voiceConstraintIds", "evidenceIds"]);
const DIALOGUE_KEYS = new Set(["enabled", "participantIds", "commonGroundIds", "contestedGroundIds", "withheldKnowledgeIds", "statusRiskIds", "requiredTurnFunctions", "repairOpportunityRequired", "silenceHasMeaning", "maximumConsecutiveExpositoryTurns", "evidenceIds"]);
const EMOTION_KEYS = new Set(["beatId", "sequence", "characterId", "trigger", "goalRelevance", "goalCongruence", "controllability", "agencyAttribution", "certainty", "novelty", "actionTendency", "regulationStrategy", "outwardExpression", "delayedAftereffect", "evidenceIds"]);
const PROSE_KEYS = new Set(["person", "tense", "narrativeDistance", "focalCharacterId", "psychicAccessCharacterIds", "sensoryPriorityIds", "motifIds", "sentenceRhythm", "paragraphRhythm", "figurativeDensity", "expositionDensity", "forbiddenPatternIds", "evidenceIds"]);

export function parseNarrativeCharacters(value: unknown, blockers: string[]): BookNarrativeCharacterStateV1[] {
  const records = reviewCraftArray(value, "characters", blockers, 1, 256);
  const result = records.map((item, index) => {
    const source = reviewCraftRecord(item, `character ${index + 1}`, blockers);
    rejectReviewCraftUnknown(source, CHARACTER_KEYS, `character ${index + 1}`, blockers);
    return {
      characterId: reviewCraftId(source.characterId, `character ${index + 1} characterId`, blockers),
      publicGoal: narrativeFreeText(source.publicGoal, `character ${index + 1} publicGoal`, blockers),
      privateNeed: narrativeFreeText(source.privateNeed, `character ${index + 1} privateNeed`, blockers),
      currentBelief: narrativeFreeText(source.currentBelief, `character ${index + 1} currentBelief`, blockers),
      mistakenBelief: narrativeFreeText(source.mistakenBelief, `character ${index + 1} mistakenBelief`, blockers, true),
      immediateAppraisal: narrativeFreeText(source.immediateAppraisal, `character ${index + 1} immediateAppraisal`, blockers),
      emotionalState: narrativeFreeText(source.emotionalState, `character ${index + 1} emotionalState`, blockers),
      actionTendency: reviewCraftEnum(source.actionTendency, ACTION_TENDENCIES, `character ${index + 1} actionTendency`, blockers, "custom"),
      regulationStrategy: reviewCraftEnum(source.regulationStrategy, REGULATION_STRATEGIES, `character ${index + 1} regulationStrategy`, blockers, "mixed"),
      outwardDisplay: narrativeFreeText(source.outwardDisplay, `character ${index + 1} outwardDisplay`, blockers),
      withheldInformation: narrativeFreeText(source.withheldInformation, `character ${index + 1} withheldInformation`, blockers, true),
      relationshipPressure: narrativeFreeText(source.relationshipPressure, `character ${index + 1} relationshipPressure`, blockers),
      statusPosition: narrativeFreeText(source.statusPosition, `character ${index + 1} statusPosition`, blockers),
      voiceConstraintIds: reviewCraftIds(source.voiceConstraintIds, `character ${index + 1} voiceConstraintIds`, blockers, 256, true),
      evidenceIds: reviewCraftIds(source.evidenceIds, `character ${index + 1} evidenceIds`, blockers, 512, true),
    };
  }).sort((left, right) => left.characterId.localeCompare(right.characterId));
  const duplicates = duplicateReviewCraftValues(result.map((item) => item.characterId));
  if (duplicates.length) blockers.push(`Character IDs are duplicated: ${duplicates.join(", ")}.`);
  return result;
}

export function parseNarrativeDialogue(value: unknown, blockers: string[]): BookNarrativeDialoguePlanV1 {
  const source = reviewCraftRecord(value, "dialogue", blockers);
  rejectReviewCraftUnknown(source, DIALOGUE_KEYS, "dialogue", blockers);
  const enabled = reviewCraftBool(source.enabled, "dialogue.enabled", blockers);
  const rawTurns = Array.isArray(source.requiredTurnFunctions) ? source.requiredTurnFunctions : [];
  if (!Array.isArray(source.requiredTurnFunctions) || rawTurns.length > 32) blockers.push("dialogue.requiredTurnFunctions is invalid or unbounded.");
  const requiredTurnFunctions = rawTurns.map((item) => reviewCraftEnum(item, TURN_FUNCTIONS, "dialogue.requiredTurnFunctions", blockers, "offer_or_claim"));
  const duplicateTurns = duplicateReviewCraftValues(requiredTurnFunctions);
  if (duplicateTurns.length) blockers.push(`dialogue.requiredTurnFunctions contains duplicates: ${duplicateTurns.join(", ")}.`);
  return {
    enabled,
    participantIds: reviewCraftIds(source.participantIds, "dialogue.participantIds", blockers, 128, enabled),
    commonGroundIds: reviewCraftIds(source.commonGroundIds, "dialogue.commonGroundIds", blockers, 512, false),
    contestedGroundIds: reviewCraftIds(source.contestedGroundIds, "dialogue.contestedGroundIds", blockers, 512, false),
    withheldKnowledgeIds: reviewCraftIds(source.withheldKnowledgeIds, "dialogue.withheldKnowledgeIds", blockers, 512, false),
    statusRiskIds: reviewCraftIds(source.statusRiskIds, "dialogue.statusRiskIds", blockers, 512, false),
    requiredTurnFunctions: uniqueReviewCraft(requiredTurnFunctions).sort(),
    repairOpportunityRequired: reviewCraftBool(source.repairOpportunityRequired, "dialogue.repairOpportunityRequired", blockers),
    silenceHasMeaning: reviewCraftBool(source.silenceHasMeaning, "dialogue.silenceHasMeaning", blockers),
    maximumConsecutiveExpositoryTurns: reviewCraftInteger(source.maximumConsecutiveExpositoryTurns, "dialogue.maximumConsecutiveExpositoryTurns", blockers, 0, 4),
    evidenceIds: reviewCraftIds(source.evidenceIds, "dialogue.evidenceIds", blockers, 512, enabled),
  };
}

export function parseNarrativeEmotionBeats(value: unknown, blockers: string[]): BookNarrativeEmotionBeatV1[] {
  const records = reviewCraftArray(value, "emotionBeats", blockers, 1, 512);
  const result = records.map((item, index) => {
    const source = reviewCraftRecord(item, `emotion beat ${index + 1}`, blockers);
    rejectReviewCraftUnknown(source, EMOTION_KEYS, `emotion beat ${index + 1}`, blockers);
    const regulationStrategy = reviewCraftEnum(source.regulationStrategy, REGULATION_STRATEGIES, `emotion beat ${index + 1} regulationStrategy`, blockers, "mixed");
    const delayedAftereffect = narrativeFreeText(source.delayedAftereffect, `emotion beat ${index + 1} delayedAftereffect`, blockers, true);
    if (regulationStrategy === "response_suppression" && !delayedAftereffect) blockers.push(`Emotion beat ${index + 1} uses response suppression without a delayed aftereffect.`);
    return {
      beatId: reviewCraftId(source.beatId, `emotion beat ${index + 1} beatId`, blockers),
      sequence: reviewCraftInteger(source.sequence, `emotion beat ${index + 1} sequence`, blockers, 1, 10_000),
      characterId: reviewCraftId(source.characterId, `emotion beat ${index + 1} characterId`, blockers),
      trigger: narrativeFreeText(source.trigger, `emotion beat ${index + 1} trigger`, blockers),
      goalRelevance: narrativeFreeText(source.goalRelevance, `emotion beat ${index + 1} goalRelevance`, blockers),
      goalCongruence: reviewCraftEnum(source.goalCongruence, GOAL_CONGRUENCE, `emotion beat ${index + 1} goalCongruence`, blockers, "uncertain"),
      controllability: reviewCraftEnum(source.controllability, CONTROL, `emotion beat ${index + 1} controllability`, blockers, "uncertain"),
      agencyAttribution: narrativeFreeText(source.agencyAttribution, `emotion beat ${index + 1} agencyAttribution`, blockers),
      certainty: reviewCraftEnum(source.certainty, LEVEL, `emotion beat ${index + 1} certainty`, blockers, "low"),
      novelty: reviewCraftEnum(source.novelty, LEVEL, `emotion beat ${index + 1} novelty`, blockers, "low"),
      actionTendency: reviewCraftEnum(source.actionTendency, ACTION_TENDENCIES, `emotion beat ${index + 1} actionTendency`, blockers, "custom"),
      regulationStrategy,
      outwardExpression: narrativeFreeText(source.outwardExpression, `emotion beat ${index + 1} outwardExpression`, blockers),
      delayedAftereffect,
      evidenceIds: reviewCraftIds(source.evidenceIds, `emotion beat ${index + 1} evidenceIds`, blockers, 512, true),
    };
  }).sort((left, right) => left.sequence - right.sequence || left.beatId.localeCompare(right.beatId));
  const duplicateBeatIds = duplicateReviewCraftValues(result.map((item) => item.beatId));
  const duplicateSequences = duplicateReviewCraftValues(result.map((item) => String(item.sequence)));
  if (duplicateBeatIds.length) blockers.push(`Emotion beat IDs are duplicated: ${duplicateBeatIds.join(", ")}.`);
  if (duplicateSequences.length) blockers.push(`Emotion beat sequences are duplicated: ${duplicateSequences.join(", ")}.`);
  result.forEach((item, index) => { if (item.sequence !== index + 1) blockers.push("Emotion beat sequence must be contiguous from 1."); });
  return result;
}

export function parseNarrativeProse(value: unknown, blockers: string[]): BookNarrativeProsePlanV1 {
  const source = reviewCraftRecord(value, "prose", blockers);
  rejectReviewCraftUnknown(source, PROSE_KEYS, "prose", blockers);
  return {
    person: reviewCraftEnum(source.person, PERSONS, "prose.person", blockers, "third"),
    tense: reviewCraftEnum(source.tense, TENSES, "prose.tense", blockers, "past"),
    narrativeDistance: reviewCraftEnum(source.narrativeDistance, DISTANCES, "prose.narrativeDistance", blockers, "close"),
    focalCharacterId: reviewCraftId(source.focalCharacterId, "prose.focalCharacterId", blockers),
    psychicAccessCharacterIds: reviewCraftIds(source.psychicAccessCharacterIds, "prose.psychicAccessCharacterIds", blockers, 128, true),
    sensoryPriorityIds: reviewCraftIds(source.sensoryPriorityIds, "prose.sensoryPriorityIds", blockers, 128, true),
    motifIds: reviewCraftIds(source.motifIds, "prose.motifIds", blockers, 128, false),
    sentenceRhythm: reviewCraftEnum(source.sentenceRhythm, RHYTHMS, "prose.sentenceRhythm", blockers, "variable"),
    paragraphRhythm: reviewCraftEnum(source.paragraphRhythm, RHYTHMS, "prose.paragraphRhythm", blockers, "variable"),
    figurativeDensity: reviewCraftEnum(source.figurativeDensity, DENSITIES, "prose.figurativeDensity", blockers, "moderate"),
    expositionDensity: reviewCraftEnum(source.expositionDensity, DENSITIES, "prose.expositionDensity", blockers, "low"),
    forbiddenPatternIds: reviewCraftIds(source.forbiddenPatternIds, "prose.forbiddenPatternIds", blockers, 512, true),
    evidenceIds: reviewCraftIds(source.evidenceIds, "prose.evidenceIds", blockers, 512, true),
  };
}

function narrativeFreeText(value: unknown, label: string, blockers: string[], allowEmpty = false): string {
  return reviewCraftText(value, label, blockers, 2_000, allowEmpty);
}
