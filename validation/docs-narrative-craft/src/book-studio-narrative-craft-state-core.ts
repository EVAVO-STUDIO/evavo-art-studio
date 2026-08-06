import { BOOK_NARRATIVE_KNOWLEDGE_MODULES } from "./book-studio-narrative-craft-knowledge";
import type {
  BookNarrativeCraftPolicyV1,
  BookNarrativeKnowledgeModuleId,
  BookNarrativeScenePlanV1,
} from "./book-studio-narrative-craft-types";
import {
  duplicateReviewCraftValues,
  rejectReviewCraftUnknown,
  reviewCraftBool,
  reviewCraftEnum,
  reviewCraftFinite,
  reviewCraftId,
  reviewCraftIds,
  reviewCraftInteger,
  reviewCraftRecord,
  reviewCraftText,
  uniqueReviewCraft,
} from "./book-studio-review-craft-shared";

const KNOWLEDGE_MODULE_IDS = new Set<BookNarrativeKnowledgeModuleId>(BOOK_NARRATIVE_KNOWLEDGE_MODULES.map((item) => item.moduleId));
const POLICY_KEYS = new Set([
  "minimumCompositeArchetypes", "maximumCompositeArchetypes", "maximumDominantArchetypeWeight",
  "minimumKnowledgeModules", "minimumProjectVoiceAnchors", "minimumForbiddenPatterns",
  "requireEmotionBeatForPointOfView", "requireCausalConsequence", "requireRepairForContestedDialogue",
  "minimumIndependentReviewIds", "minimumPassingScore",
]);
const SCENE_KEYS = new Set([
  "sceneId", "purpose", "openingState", "objective", "opposition", "stakes", "tactic", "turningEvent",
  "outcome", "cost", "closingState", "causalPredecessorIds", "downstreamConsequenceIds", "evidenceIds",
]);

export const DEFAULT_NARRATIVE_CRAFT_POLICY: Required<BookNarrativeCraftPolicyV1> = {
  minimumCompositeArchetypes: 2,
  maximumCompositeArchetypes: 6,
  maximumDominantArchetypeWeight: 0.55,
  minimumKnowledgeModules: 8,
  minimumProjectVoiceAnchors: 3,
  minimumForbiddenPatterns: 5,
  requireEmotionBeatForPointOfView: true,
  requireCausalConsequence: true,
  requireRepairForContestedDialogue: true,
  minimumIndependentReviewIds: 2,
  minimumPassingScore: 85,
};

export function parseNarrativeCraftPolicy(value: unknown, blockers: string[]): Required<BookNarrativeCraftPolicyV1> {
  if (value === undefined) return { ...DEFAULT_NARRATIVE_CRAFT_POLICY };
  const source = reviewCraftRecord(value, "Narrative craft policy", blockers);
  rejectReviewCraftUnknown(source, POLICY_KEYS, "Narrative craft policy", blockers);
  const policy: Required<BookNarrativeCraftPolicyV1> = {
    minimumCompositeArchetypes: source.minimumCompositeArchetypes === undefined ? DEFAULT_NARRATIVE_CRAFT_POLICY.minimumCompositeArchetypes : reviewCraftInteger(source.minimumCompositeArchetypes, "minimumCompositeArchetypes", blockers, 2, 6),
    maximumCompositeArchetypes: source.maximumCompositeArchetypes === undefined ? DEFAULT_NARRATIVE_CRAFT_POLICY.maximumCompositeArchetypes : reviewCraftInteger(source.maximumCompositeArchetypes, "maximumCompositeArchetypes", blockers, 2, 8),
    maximumDominantArchetypeWeight: source.maximumDominantArchetypeWeight === undefined ? DEFAULT_NARRATIVE_CRAFT_POLICY.maximumDominantArchetypeWeight : reviewCraftFinite(source.maximumDominantArchetypeWeight, "maximumDominantArchetypeWeight", blockers, 0.25, 0.75),
    minimumKnowledgeModules: source.minimumKnowledgeModules === undefined ? DEFAULT_NARRATIVE_CRAFT_POLICY.minimumKnowledgeModules : reviewCraftInteger(source.minimumKnowledgeModules, "minimumKnowledgeModules", blockers, 7, 11),
    minimumProjectVoiceAnchors: source.minimumProjectVoiceAnchors === undefined ? DEFAULT_NARRATIVE_CRAFT_POLICY.minimumProjectVoiceAnchors : reviewCraftInteger(source.minimumProjectVoiceAnchors, "minimumProjectVoiceAnchors", blockers, 1, 32),
    minimumForbiddenPatterns: source.minimumForbiddenPatterns === undefined ? DEFAULT_NARRATIVE_CRAFT_POLICY.minimumForbiddenPatterns : reviewCraftInteger(source.minimumForbiddenPatterns, "minimumForbiddenPatterns", blockers, 3, 64),
    requireEmotionBeatForPointOfView: source.requireEmotionBeatForPointOfView === undefined ? DEFAULT_NARRATIVE_CRAFT_POLICY.requireEmotionBeatForPointOfView : reviewCraftBool(source.requireEmotionBeatForPointOfView, "requireEmotionBeatForPointOfView", blockers),
    requireCausalConsequence: source.requireCausalConsequence === undefined ? DEFAULT_NARRATIVE_CRAFT_POLICY.requireCausalConsequence : reviewCraftBool(source.requireCausalConsequence, "requireCausalConsequence", blockers),
    requireRepairForContestedDialogue: source.requireRepairForContestedDialogue === undefined ? DEFAULT_NARRATIVE_CRAFT_POLICY.requireRepairForContestedDialogue : reviewCraftBool(source.requireRepairForContestedDialogue, "requireRepairForContestedDialogue", blockers),
    minimumIndependentReviewIds: source.minimumIndependentReviewIds === undefined ? DEFAULT_NARRATIVE_CRAFT_POLICY.minimumIndependentReviewIds : reviewCraftInteger(source.minimumIndependentReviewIds, "minimumIndependentReviewIds", blockers, 1, 8),
    minimumPassingScore: source.minimumPassingScore === undefined ? DEFAULT_NARRATIVE_CRAFT_POLICY.minimumPassingScore : reviewCraftFinite(source.minimumPassingScore, "minimumPassingScore", blockers, 70, 100),
  };
  if (policy.maximumCompositeArchetypes < policy.minimumCompositeArchetypes) blockers.push("maximumCompositeArchetypes cannot be below minimumCompositeArchetypes.");
  return policy;
}

export function parseNarrativeKnowledgeModuleIds(
  value: unknown,
  blockers: string[],
  policy: Required<BookNarrativeCraftPolicyV1>,
): BookNarrativeKnowledgeModuleId[] {
  if (!Array.isArray(value) || value.length < policy.minimumKnowledgeModules || value.length > KNOWLEDGE_MODULE_IDS.size) {
    blockers.push(`requestedKnowledgeModuleIds must contain ${policy.minimumKnowledgeModules}-${KNOWLEDGE_MODULE_IDS.size} modules.`);
    return [];
  }
  const result = value.map((item) => reviewCraftEnum(item, KNOWLEDGE_MODULE_IDS, "requestedKnowledgeModuleIds", blockers, "scene_causality"));
  const duplicates = duplicateReviewCraftValues(result);
  if (duplicates.length) blockers.push(`requestedKnowledgeModuleIds contains duplicates: ${duplicates.join(", ")}.`);
  return uniqueReviewCraft(result).sort();
}

export function parseNarrativeScene(value: unknown, blockers: string[]): BookNarrativeScenePlanV1 {
  const source = reviewCraftRecord(value, "scene", blockers);
  rejectReviewCraftUnknown(source, SCENE_KEYS, "scene", blockers);
  return {
    sceneId: reviewCraftId(source.sceneId, "scene.sceneId", blockers),
    purpose: narrativeFreeText(source.purpose, "scene.purpose", blockers),
    openingState: narrativeFreeText(source.openingState, "scene.openingState", blockers),
    objective: narrativeFreeText(source.objective, "scene.objective", blockers),
    opposition: narrativeFreeText(source.opposition, "scene.opposition", blockers),
    stakes: narrativeFreeText(source.stakes, "scene.stakes", blockers),
    tactic: narrativeFreeText(source.tactic, "scene.tactic", blockers),
    turningEvent: narrativeFreeText(source.turningEvent, "scene.turningEvent", blockers),
    outcome: narrativeFreeText(source.outcome, "scene.outcome", blockers),
    cost: narrativeFreeText(source.cost, "scene.cost", blockers),
    closingState: narrativeFreeText(source.closingState, "scene.closingState", blockers),
    causalPredecessorIds: reviewCraftIds(source.causalPredecessorIds, "scene.causalPredecessorIds", blockers, 512, false),
    downstreamConsequenceIds: reviewCraftIds(source.downstreamConsequenceIds, "scene.downstreamConsequenceIds", blockers, 512, false),
    evidenceIds: reviewCraftIds(source.evidenceIds, "scene.evidenceIds", blockers, 1_024, true),
  };
}

function narrativeFreeText(value: unknown, label: string, blockers: string[], allowEmpty = false): string {
  return reviewCraftText(value, label, blockers, 2_000, allowEmpty);
}

export function normaliseNarrativeText(value: string): string {
  return value.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").trim();
}
