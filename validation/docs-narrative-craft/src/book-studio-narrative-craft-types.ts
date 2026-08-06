export const BOOK_NARRATIVE_CRAFT_CONTRACT = "evavo_docs_book_narrative_craft_v1" as const;
export const BOOK_NARRATIVE_CRAFT_SCHEMA_VERSION = 1 as const;
export const BOOK_NARRATIVE_CRAFT_KNOWLEDGE_VERSION = 1 as const;

export type BookNarrativeCraftMode =
  | "draft_scene"
  | "revise_scene"
  | "dialogue_pass"
  | "emotion_pass"
  | "prose_pass"
  | "tension_pass"
  | "full_scene_pass";
export type BookNarrativeKnowledgeModuleId =
  | "scene_causality" | "character_appraisal" | "emotion_regulation" | "dialogue_turn_taking"
  | "dialogue_grounding_and_repair" | "dialogue_subtext_and_status" | "viewpoint_information_control"
  | "prose_specificity_and_rhythm" | "suspense_curiosity_surprise"
  | "social_simulation_and_relationship_memory" | "anti_genericity_revision";
export type BookNarrativeArchetypeId =
  | "ordinary_dread_escalation" | "puzzle_propulsion" | "dynastic_causality" | "submerged_minimalism"
  | "youth_horror_escalation" | "epic_ensemble_continuity" | "time_braided_cosmic_intimacy" | "intimate_social_realism";
export type BookNarrativeDimensionId =
  | "narrative_distance" | "causal_density" | "puzzle_density" | "suspense_pressure" | "ensemble_breadth"
  | "prose_ornament" | "dialogue_indirection" | "dread_escalation" | "audience_accessibility" | "temporal_complexity";
export type BookNarrativeActionTendency = "approach" | "avoid" | "attack" | "freeze" | "appease" | "hide" | "seek_support" | "repair" | "observe" | "endure" | "custom";
export type BookNarrativeEmotionRegulationStrategy = "situation_selection" | "situation_modification" | "attentional_deployment" | "cognitive_reappraisal" | "response_suppression" | "expressive_disclosure" | "strategic_delay" | "mixed";
export type BookDialogueTurnFunction = "offer_or_claim" | "request" | "challenge" | "answer" | "evasion" | "repair" | "refusal" | "concession" | "threat" | "promise" | "silence" | "topic_shift" | "status_test" | "disclosure" | "misdirection";
export type BookNarrativePerson = "first" | "second" | "third";
export type BookNarrativeTense = "past" | "present";
export type BookNarrativeDistance = "interior" | "close" | "medium" | "distant" | "variable";
export type BookNarrativeRhythm = "compressed" | "balanced" | "expansive" | "variable";
export type BookNarrativeDensity = "low" | "moderate" | "high" | "variable";

export interface BookNarrativeKnowledgeModuleV1 { moduleId: BookNarrativeKnowledgeModuleId; purpose: string; productionRules: string[]; failureSignals: string[]; researchBasisIds: string[]; }
export interface BookNarrativeArchetypeV1 { archetypeId: BookNarrativeArchetypeId; dimensionValues: Array<{ dimensionId: BookNarrativeDimensionId; value: number }>; productionBiases: string[]; counterweights: string[]; }
export interface BookNarrativeArchetypeWeightV1 { archetypeId: BookNarrativeArchetypeId; requestedWeight: number; }
export interface BookNarrativeNormalizedArchetypeWeightV1 { archetypeId: BookNarrativeArchetypeId; normalizedWeight: number; }
export interface BookNarrativeCompositeDimensionV1 { dimensionId: BookNarrativeDimensionId; value: number; sourceArchetypeIds: BookNarrativeArchetypeId[]; }
export interface BookNarrativeScenePlanV1 { sceneId: string; purpose: string; openingState: string; objective: string; opposition: string; stakes: string; tactic: string; turningEvent: string; outcome: string; cost: string; closingState: string; causalPredecessorIds: string[]; downstreamConsequenceIds: string[]; evidenceIds: string[]; }
export interface BookNarrativeCharacterStateV1 { characterId: string; publicGoal: string; privateNeed: string; currentBelief: string; mistakenBelief: string; immediateAppraisal: string; emotionalState: string; actionTendency: BookNarrativeActionTendency; regulationStrategy: BookNarrativeEmotionRegulationStrategy; outwardDisplay: string; withheldInformation: string; relationshipPressure: string; statusPosition: string; voiceConstraintIds: string[]; evidenceIds: string[]; }
export interface BookNarrativeDialoguePlanV1 { enabled: boolean; participantIds: string[]; commonGroundIds: string[]; contestedGroundIds: string[]; withheldKnowledgeIds: string[]; statusRiskIds: string[]; requiredTurnFunctions: BookDialogueTurnFunction[]; repairOpportunityRequired: boolean; silenceHasMeaning: boolean; maximumConsecutiveExpositoryTurns: number; evidenceIds: string[]; }
export interface BookNarrativeEmotionBeatV1 { beatId: string; sequence: number; characterId: string; trigger: string; goalRelevance: string; goalCongruence: "advances" | "obstructs" | "mixed" | "uncertain"; controllability: "low" | "medium" | "high" | "uncertain"; agencyAttribution: string; certainty: "low" | "medium" | "high"; novelty: "low" | "medium" | "high"; actionTendency: BookNarrativeActionTendency; regulationStrategy: BookNarrativeEmotionRegulationStrategy; outwardExpression: string; delayedAftereffect: string; evidenceIds: string[]; }
export interface BookNarrativeProsePlanV1 { person: BookNarrativePerson; tense: BookNarrativeTense; narrativeDistance: BookNarrativeDistance; focalCharacterId: string; psychicAccessCharacterIds: string[]; sensoryPriorityIds: string[]; motifIds: string[]; sentenceRhythm: BookNarrativeRhythm; paragraphRhythm: BookNarrativeRhythm; figurativeDensity: BookNarrativeDensity; expositionDensity: BookNarrativeDensity; forbiddenPatternIds: string[]; evidenceIds: string[]; }
export interface BookNarrativeCraftPolicyV1 { minimumCompositeArchetypes?: number; maximumCompositeArchetypes?: number; maximumDominantArchetypeWeight?: number; minimumKnowledgeModules?: number; minimumProjectVoiceAnchors?: number; minimumForbiddenPatterns?: number; requireEmotionBeatForPointOfView?: boolean; requireCausalConsequence?: boolean; requireRepairForContestedDialogue?: boolean; minimumIndependentReviewIds?: number; minimumPassingScore?: number; }
export interface BookNarrativeQualityCriterionV1 { criterionId: string; weight: number; mandatory: boolean; passCondition: string; failureSignals: string[]; }
export interface BookNarrativeRevisionStepV1 { sequence: number; stepId: string; instruction: string; requiredEvidenceKinds: string[]; }
export interface BookNarrativeCraftContextBlockV1 { objectId: string; objectFingerprint: string; role: "constraint"; text: string; textSha256: string; }
export interface BookNarrativeCraftPacketV1 {
  outputKind: "evavo_docs_book_narrative_craft_packet"; schemaVersion: 1; contract: typeof BOOK_NARRATIVE_CRAFT_CONTRACT; knowledgeVersion: typeof BOOK_NARRATIVE_CRAFT_KNOWLEDGE_VERSION; authorityMode: "shadow_migration"; status: "ready";
  programmeId: string; projectId: string; volumeId: string; manuscriptRevisionId: string; mode: BookNarrativeCraftMode; craftProfileFingerprint: string;
  knowledgeModules: BookNarrativeKnowledgeModuleV1[]; archetypeMix: BookNarrativeNormalizedArchetypeWeightV1[]; compositeDimensions: BookNarrativeCompositeDimensionV1[]; minimumDistanceFromArchetype: number;
  projectVoiceAnchorIds: string[]; narrativeConstraintIds: string[]; scene: BookNarrativeScenePlanV1; characters: BookNarrativeCharacterStateV1[]; dialogue: BookNarrativeDialoguePlanV1; emotionBeats: BookNarrativeEmotionBeatV1[]; prose: BookNarrativeProsePlanV1; acceptedPatternIds: string[]; rejectedPatternIds: string[]; evidenceIds: string[];
  providerInstruction: string; qualityRubric: BookNarrativeQualityCriterionV1[]; minimumPassingScore: number; minimumIndependentReviewIds: number; writingContextBlock: BookNarrativeCraftContextBlockV1; revisionProtocol: BookNarrativeRevisionStepV1[]; packetFingerprint: string;
  providerBriefContainsNamedSources: false; namedCreatorInstructionPermitted: false; distinctiveSurfaceTransferPermitted: false; phraseLevelTransferPermitted: false; phraseOverlapScanRequired: true; projectOwnedVoiceRequired: true; independentReviewRequired: true; automaticCanonicalAdmissionAllowed: false; providerCallPerformed: false; canonicalManuscriptMutationPerformed: false; websiteCompatibilityRuntimeStillAuthoritative: true; runtimeCutoverApproved: false; publicationPerformed: false;
}
export interface BookNarrativeCraftCompileResultV1 { outputKind: "evavo_docs_book_narrative_craft_compile_result"; schemaVersion: 1; status: "ready" | "blocked"; packet?: BookNarrativeCraftPacketV1; packetFingerprint?: string; blockers: string[]; warnings: string[]; providerCallPerformed: false; canonicalManuscriptMutationPerformed: false; automaticCanonicalAdmissionAllowed: false; publicationPerformed: false; }
export interface BookNarrativeCriterionEvidenceV1 { criterionId: string; score: number; evidenceIds: string[]; findingIds: string[]; independentlyReviewed: boolean; }
export interface BookNarrativeCraftEvaluationV1 { outputKind: "evavo_docs_book_narrative_craft_evaluation"; schemaVersion: 1; contract: typeof BOOK_NARRATIVE_CRAFT_CONTRACT; status: "ready_for_review" | "needs_work" | "blocked"; packetFingerprint: string; candidateId: string; candidateTextSha256: string; weightedScore: number; minimumPassingScore: number; failedCriterionIds: string[]; missingCriterionIds: string[]; unresolvedFindingIds: string[]; independentReviewIds: string[]; requiredActions: string[]; evidenceIds: string[]; evaluationFingerprint: string; phraseOverlapAccepted: boolean; independentReviewComplete: boolean; canonicalAdmissionAllowed: false; canonicalManuscriptMutationPerformed: false; publicationPerformed: false; }
export interface BookNarrativeCraftEvaluationResultV1 { outputKind: "evavo_docs_book_narrative_craft_evaluation_result"; schemaVersion: 1; status: "ready_for_review" | "needs_work" | "blocked"; evaluation?: BookNarrativeCraftEvaluationV1; blockers: string[]; requiredActions: string[]; canonicalAdmissionAllowed: false; canonicalManuscriptMutationPerformed: false; publicationPerformed: false; }
