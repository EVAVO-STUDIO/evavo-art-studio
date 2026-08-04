import type {
  BookNarrativeCharacterStateV1,
  BookNarrativeCraftMode,
  BookNarrativeCraftPolicyV1,
  BookNarrativeDialoguePlanV1,
  BookNarrativeEmotionBeatV1,
  BookNarrativeKnowledgeModuleId,
  BookNarrativeProsePlanV1,
  BookNarrativeScenePlanV1,
} from "./book-studio-narrative-craft-types";
import { normaliseNarrativeText } from "./book-studio-narrative-craft-state";
import { intersectsReviewCraft } from "./book-studio-review-craft-shared";

const DIRECT_IMITATION = /\b(?:in the style of|write like|sound like|imitate|mimic|recreate the voice of|indistinguishable from|perfectly like)\b/i;

export function validateNarrativeCraftCrossFields(input: {
  mode: BookNarrativeCraftMode;
  moduleIds: BookNarrativeKnowledgeModuleId[];
  policy: Required<BookNarrativeCraftPolicyV1>;
  projectVoiceAnchorIds: string[];
  narrativeConstraintIds: string[];
  scene: BookNarrativeScenePlanV1;
  characters: BookNarrativeCharacterStateV1[];
  dialogue: BookNarrativeDialoguePlanV1;
  emotionBeats: BookNarrativeEmotionBeatV1[];
  prose: BookNarrativeProsePlanV1;
  acceptedPatternIds: string[];
  rejectedPatternIds: string[];
  evidenceIds: string[];
  providerInstructionFromCraftProfile: string;
}, blockers: string[], warnings: string[]): void {
  const characterIds = new Set(input.characters.map((item) => item.characterId));
  if (!characterIds.has(input.prose.focalCharacterId)) blockers.push("The prose focal character is absent from characters.");
  const unknownPsychicAccess = input.prose.psychicAccessCharacterIds.filter((id) => !characterIds.has(id));
  if (unknownPsychicAccess.length) blockers.push(`Psychic-access characters are unknown: ${unknownPsychicAccess.join(", ")}.`);
  if (!input.prose.psychicAccessCharacterIds.includes(input.prose.focalCharacterId)) blockers.push("Psychic access must include the focal character.");
  if (input.prose.narrativeDistance !== "variable" && input.prose.psychicAccessCharacterIds.length > 1) blockers.push("A non-variable narrative distance cannot grant simultaneous psychic access to multiple characters.");

  const unknownParticipants = input.dialogue.participantIds.filter((id) => !characterIds.has(id));
  if (unknownParticipants.length) blockers.push(`Dialogue participants are unknown: ${unknownParticipants.join(", ")}.`);
  if (input.dialogue.enabled && input.dialogue.participantIds.length < 2) blockers.push("Enabled dialogue requires at least two participants.");
  if (!input.dialogue.enabled && input.dialogue.participantIds.length) blockers.push("Disabled dialogue cannot retain participants.");
  if (input.dialogue.enabled && !input.dialogue.requiredTurnFunctions.length) blockers.push("Enabled dialogue requires planned turn functions.");
  if (input.dialogue.contestedGroundIds.length && input.policy.requireRepairForContestedDialogue && !input.dialogue.repairOpportunityRequired) blockers.push("Contested dialogue requires an explicit repair opportunity under the selected policy.");
  if (input.dialogue.repairOpportunityRequired && !input.dialogue.requiredTurnFunctions.includes("repair")) blockers.push("Dialogue requiring repair must include the repair turn function.");
  if (input.dialogue.silenceHasMeaning && !input.dialogue.requiredTurnFunctions.includes("silence")) blockers.push("Meaningful silence must be represented in required turn functions.");

  const unknownEmotionCharacters = input.emotionBeats.filter((item) => !characterIds.has(item.characterId)).map((item) => item.characterId);
  if (unknownEmotionCharacters.length) blockers.push(`Emotion beats reference unknown characters: ${[...new Set(unknownEmotionCharacters)].join(", ")}.`);
  if (input.policy.requireEmotionBeatForPointOfView && !input.emotionBeats.some((item) => item.characterId === input.prose.focalCharacterId)) blockers.push("The focal viewpoint requires at least one emotion-appraisal beat.");
  for (const character of input.characters) if (!input.emotionBeats.some((beat) => beat.characterId === character.characterId)) warnings.push(`Character ${character.characterId} has no explicit emotion beat in this packet.`);

  if (normaliseNarrativeText(input.scene.openingState) === normaliseNarrativeText(input.scene.closingState)) blockers.push("Scene closing state must differ materially from its opening state.");
  if (input.policy.requireCausalConsequence && !input.scene.downstreamConsequenceIds.length) blockers.push("The scene requires at least one downstream consequence identity.");
  if (!input.scene.turningEvent || !input.scene.outcome || !input.scene.cost) blockers.push("Scene turning event, outcome and cost are mandatory.");

  if (input.projectVoiceAnchorIds.length < input.policy.minimumProjectVoiceAnchors) blockers.push(`Narrative craft requires at least ${input.policy.minimumProjectVoiceAnchors} project-owned voice anchors.`);
  if (!input.narrativeConstraintIds.length) blockers.push("Narrative craft requires at least one narrative constraint.");
  if (input.prose.forbiddenPatternIds.length < input.policy.minimumForbiddenPatterns) blockers.push(`Prose plan requires at least ${input.policy.minimumForbiddenPatterns} forbidden patterns.`);
  const patternOverlap = intersectsReviewCraft(input.acceptedPatternIds, input.rejectedPatternIds);
  if (patternOverlap.length) blockers.push(`Patterns cannot be both accepted and rejected: ${patternOverlap.join(", ")}.`);
  const proseAcceptedOverlap = intersectsReviewCraft(input.acceptedPatternIds, input.prose.forbiddenPatternIds);
  if (proseAcceptedOverlap.length) blockers.push(`Accepted patterns cannot be forbidden by prose policy: ${proseAcceptedOverlap.join(", ")}.`);
  if (!input.evidenceIds.length) blockers.push("Narrative craft requires exact evidence identities.");

  const requiredModules = requiredModulesForMode(input.mode, input.dialogue.enabled);
  const missingModules = requiredModules.filter((moduleId) => !input.moduleIds.includes(moduleId));
  if (missingModules.length) blockers.push(`Narrative craft mode ${input.mode} is missing knowledge modules: ${missingModules.join(", ")}.`);

  const inspectedText = [
    input.providerInstructionFromCraftProfile,
    input.scene.purpose, input.scene.objective, input.scene.opposition, input.scene.stakes, input.scene.tactic,
    input.scene.turningEvent, input.scene.outcome, input.scene.cost,
    ...input.characters.flatMap((item) => [item.publicGoal, item.privateNeed, item.currentBelief, item.mistakenBelief, item.immediateAppraisal, item.emotionalState, item.outwardDisplay, item.withheldInformation, item.relationshipPressure, item.statusPosition]),
    ...input.emotionBeats.flatMap((item) => [item.trigger, item.goalRelevance, item.agencyAttribution, item.outwardExpression, item.delayedAftereffect]),
  ];
  if (inspectedText.some((text) => DIRECT_IMITATION.test(text))) blockers.push("Narrative craft input requests direct creator imitation rather than abstract project-owned mechanisms.");
}

function requiredModulesForMode(mode: BookNarrativeCraftMode, dialogueEnabled: boolean): BookNarrativeKnowledgeModuleId[] {
  const base: BookNarrativeKnowledgeModuleId[] = ["scene_causality", "character_appraisal", "emotion_regulation", "viewpoint_information_control", "prose_specificity_and_rhythm", "anti_genericity_revision"];
  if (dialogueEnabled || mode === "dialogue_pass") base.push("dialogue_turn_taking", "dialogue_grounding_and_repair", "dialogue_subtext_and_status");
  if (mode === "tension_pass" || mode === "full_scene_pass" || mode === "draft_scene" || mode === "revise_scene") base.push("suspense_curiosity_surprise");
  if (mode === "full_scene_pass" || mode === "draft_scene" || mode === "revise_scene") base.push("social_simulation_and_relationship_memory");
  return [...new Set(base)];
}
