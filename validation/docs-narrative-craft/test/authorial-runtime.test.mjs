import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOK_NARRATIVE_KNOWLEDGE_MODULES,
  compareBookAuthorialVoice,
  compileBookAuthorialSynthesis,
  compileBookAuthorialVoiceProfile,
  compileBookCraftProfile,
  compileBookIdeaLab,
  compileBookNarrativeCraftPacket,
  compileBookNarrativeRegister,
  evaluateBookIdeaLabCandidates,
  sha256ReviewCraftText,
  validateBookAuthorialSynthesisPacket,
  validateBookAuthorialVoiceProfile,
  validateBookIdeaLabEvaluation,
  validateBookNarrativeRegisterProfile,
} from "../src/authorial-runtime.ts";

const digest = (character) => `sha256:${character.repeat(64)}`;
const sampleOne = `Mara kept the council key in the pocket with the torn lining. It caught whenever she walked quickly, a small metal argument against haste. At the archive door she did not knock. Orren would hear the key before he heard her, and she wanted him to decide which sound mattered. The corridor smelled of wet wool, lamp oil, and the bitter ink the clerks mixed for permanent orders. She counted three breaths, not to calm herself, but to remember the order of the names. Her brother first. The porter second. The woman who copied the seal not at all. When Orren opened the door, he looked past Mara to the empty stair. “You came alone,” he said. “You arranged it that way.” He smiled at the correction and moved his hand from the latch. The opening was no wider than a book. Mara could have forced it. That would have answered the wrong question. She took the key from her pocket and laid it flat on her palm. “I came to discuss the register,” she said, and watched his attention settle on the missing tooth.`;
const sampleTwo = `Rain moved across the harbour in separate grey rooms. From the warehouse roof, Wren could see one room swallowing the customs launch while another left the eastern cranes bright and dry. The men below shouted about rope, but the rope was not the problem. The tide had turned under the barge, pressing its stern towards the pilings one slow handspan at a time. Wren climbed down before anyone asked him to. On the third rung his bad shoulder reminded him of the winter crossing. He shifted his weight, used the left arm, and reached the quay as the first crate broke loose. “Leave the cargo,” Ada called. Nobody did. The crate held medicine, and everyone knew which houses had paid for it. Wren took the hook from the youngest deckhand and set it under the iron band. The wood trembled. The river gave them one chance, perhaps two. He did not tell Ada that his fingers had gone numb. She would hear it in the way he shortened the order. “Now,” he said. Four people pulled, each for a different reason, and the crate came home crooked.`;

async function voice() {
  const result = await compileBookAuthorialVoiceProfile({
    outputKind: "evavo_docs_book_authorial_voice_compile_input",
    schemaVersion: 1,
    programmeId: "programme-alpha",
    projectId: "project-alpha",
    voiceProfileId: "voice-alpha",
    voiceProfileVersion: 1,
    samples: [
      { sampleId: "sample-one", role: "mixed", sourceKind: "project_owned", text: sampleOne, rightsEvidenceIds: ["rights-one"] },
      { sampleId: "sample-two", role: "mixed", sourceKind: "user_owned", text: sampleTwo, rightsEvidenceIds: ["rights-two"] },
    ],
    projectVoiceAnchorIds: ["voice-anchor-one", "voice-anchor-two", "voice-anchor-three"],
    preserveMetricIds: ["mean_sentence_words", "sentence_length_variation", "mean_paragraph_sentences", "lexical_diversity", "dialogue_word_ratio", "emotion_label_rate", "filter_verb_rate", "em_dash_rate"],
    flexibleMetricIds: ["question_rate", "exclamation_rate", "semicolon_rate", "colon_rate"],
    enhancementTargets: [
      { targetId: "concrete_specificity", strength: 0.8, evidenceIds: ["target-specificity"] },
      { targetId: "dialogue_subtext", strength: 0.7, evidenceIds: ["target-subtext"] },
      { targetId: "emotional_granularity", strength: 0.65, evidenceIds: ["target-emotion"] },
    ],
    antiPatternIds: ["stock_breath_release", "jaw_clench", "eyes_widen", "heart_pounded", "blood_ran_cold", "not_x_but_y", "generic_smile"],
    evidenceIds: ["voice-evidence"],
    policy: { minimumSamples: 2, maximumSamples: 8, minimumTotalWords: 100, maximumTotalCharacters: 100_000, defaultToleranceRatio: 0.6, hardDriftMultiplier: 3, minimumPreservationScore: 60 },
  });
  assert.equal(result.status, "ready", JSON.stringify(result));
  return result.profile;
}

async function register(authorialVoice) {
  const result = await compileBookNarrativeRegister({
    outputKind: "evavo_docs_book_narrative_register_compile_input",
    schemaVersion: 1,
    programmeId: "programme-alpha",
    projectId: "project-alpha",
    volumeId: "volume-one",
    registerId: "register-one",
    registerVersion: 1,
    authorialVoiceProfile: authorialVoice,
    genres: [
      { genreId: "historical", requestedWeight: 1 },
      { genreId: "mystery", requestedWeight: 0.8 },
      { genreId: "literary", requestedWeight: 0.6 },
    ],
    sceneFunctionId: "negotiation",
    scenarioId: "council_or_court",
    audienceBand: "adult",
    dimensionOverrides: [{ dimensionId: "social_pressure", value: 0.9, evidenceIds: ["override-social"] }],
    projectPromiseIds: ["promise-consequence"],
    projectAvoidanceIds: ["avoid-exposition"],
    evidenceIds: ["register-evidence"],
  });
  assert.equal(result.status, "ready", JSON.stringify(result));
  return result.profile;
}

async function craftProfile() {
  const result = await compileBookCraftProfile({
    outputKind: "evavo_docs_book_craft_compile_input",
    schemaVersion: 1,
    programmeId: "programme-alpha",
    profileId: "craft-alpha",
    profileVersion: 1,
    influences: [{ influenceId: "one" }, { influenceId: "two" }],
    projectVoiceAnchorIds: ["voice-anchor-one", "voice-anchor-two", "voice-anchor-three"],
    narrativeConstraintIds: ["constraint-project-world"],
    acceptedPatternIds: ["pattern-specific-observation"],
    rejectedPatternIds: ["pattern-stock-gesture", "pattern-formulaic-reversal", "pattern-exposition-dialogue", "pattern-generic-metaphor", "pattern-interchangeable-voice"],
  });
  assert.equal(result.status, "ready", JSON.stringify(result));
  return result.profile;
}

async function craftPacket() {
  const result = await compileBookNarrativeCraftPacket({
    outputKind: "evavo_docs_book_narrative_craft_compile_input",
    schemaVersion: 1,
    programmeId: "programme-alpha",
    projectId: "project-alpha",
    volumeId: "volume-one",
    manuscriptRevisionId: "revision-one",
    mode: "full_scene_pass",
    craftProfile: await craftProfile(),
    requestedKnowledgeModuleIds: BOOK_NARRATIVE_KNOWLEDGE_MODULES.map((item) => item.moduleId),
    archetypeMix: [
      { archetypeId: "dynastic_causality", requestedWeight: 1 },
      { archetypeId: "submerged_minimalism", requestedWeight: 1 },
      { archetypeId: "intimate_social_realism", requestedWeight: 1 },
    ],
    projectVoiceAnchorIds: ["voice-anchor-one", "voice-anchor-two", "voice-anchor-three"],
    narrativeConstraintIds: ["constraint-project-world"],
    scene: {
      sceneId: "scene-council-door", purpose: "Force Mara to exchange leverage for access.", openingState: "Mara lacks archive access.", objective: "Gain entry without exposing her source.", opposition: "Orren controls access and knows too much.", stakes: "Failure exposes Mara's ally.", tactic: "Trade public support for access.", turningEvent: "Orren names the wrong ally.", outcome: "Mara gains conditional access and detects a leak.", cost: "She promises a damaging vote.", closingState: "Mara has access, debt, and proof of a leak.", causalPredecessorIds: ["event-stolen-seal"], downstreamConsequenceIds: ["consequence-vote", "consequence-leak"], evidenceIds: ["scene-evidence"],
    },
    characters: [
      { characterId: "mara", publicGoal: "Secure routine access.", privateNeed: "Protect her ally.", currentBelief: "Orren needs her vote.", mistakenBelief: "Orren does not know the source.", immediateAppraisal: "He is more informed than expected.", emotionalState: "Controlled alarm and relief.", actionTendency: "approach", regulationStrategy: "cognitive_reappraisal", outwardDisplay: "She asks about procedure.", withheldInformation: "The ally's identity.", relationshipPressure: "An old family favour creates leverage.", statusPosition: "Equal councillor under custodial authority.", voiceConstraintIds: ["voice-mara-formal"], evidenceIds: ["character-mara"] },
      { characterId: "orren", publicGoal: "Protect procedure.", privateNeed: "Test Mara's loyalty.", currentBelief: "Mara has the seal.", mistakenBelief: "Her brother authorised it.", immediateAppraisal: "Her restraint weakens his theory.", emotionalState: "Patient uncertainty.", actionTendency: "observe", regulationStrategy: "strategic_delay", outwardDisplay: "He corrects a title and waits.", withheldInformation: "His informant named the wrong person.", relationshipPressure: "He expects gratitude.", statusPosition: "Custodian with local authority.", voiceConstraintIds: ["voice-orren-precise"], evidenceIds: ["character-orren"] },
    ],
    dialogue: { enabled: true, participantIds: ["mara", "orren"], commonGroundIds: ["ground-procedure"], contestedGroundIds: ["ground-seal"], withheldKnowledgeIds: ["knowledge-source"], statusRiskIds: ["risk-exception"], requiredTurnFunctions: ["request", "challenge", "evasion", "repair", "silence"], repairOpportunityRequired: true, silenceHasMeaning: true, maximumConsecutiveExpositoryTurns: 1, evidenceIds: ["dialogue-evidence"] },
    emotionBeats: [
      { beatId: "beat-mara", sequence: 1, characterId: "mara", trigger: "Orren names the ally.", goalRelevance: "The name threatens the ally.", goalCongruence: "obstructs", controllability: "medium", agencyAttribution: "Orren is testing her.", certainty: "high", novelty: "high", actionTendency: "hide", regulationStrategy: "cognitive_reappraisal", outwardExpression: "She asks for the form.", delayedAftereffect: "Her attention narrows.", evidenceIds: ["emotion-mara"] },
      { beatId: "beat-orren", sequence: 2, characterId: "orren", trigger: "Mara does not correct him.", goalRelevance: "His model weakens.", goalCongruence: "mixed", controllability: "high", agencyAttribution: "Mara protects his error.", certainty: "medium", novelty: "medium", actionTendency: "observe", regulationStrategy: "strategic_delay", outwardExpression: "He opens the ledger.", delayedAftereffect: "He adds a testing condition.", evidenceIds: ["emotion-orren"] },
    ],
    prose: { person: "third", tense: "past", narrativeDistance: "close", focalCharacterId: "mara", psychicAccessCharacterIds: ["mara"], sensoryPriorityIds: ["sensory-ink", "sensory-key"], motifIds: ["motif-doors"], sentenceRhythm: "variable", paragraphRhythm: "variable", figurativeDensity: "low", expositionDensity: "low", forbiddenPatternIds: ["pattern-stock-gesture", "pattern-formulaic-reversal", "pattern-exposition-dialogue", "pattern-generic-metaphor", "pattern-interchangeable-voice"], evidenceIds: ["prose-evidence"] },
    acceptedPatternIds: ["pattern-specific-observation"],
    rejectedPatternIds: ["pattern-stock-gesture", "pattern-formulaic-reversal", "pattern-exposition-dialogue", "pattern-generic-metaphor", "pattern-interchangeable-voice"],
    evidenceIds: ["project-evidence"],
  });
  assert.equal(result.status, "ready", JSON.stringify(result));
  return result.packet;
}

function candidate(ideaId, values) {
  return {
    ideaId,
    premise: `${values[0]} changes access through a project-specific institutional pressure.`,
    causalMechanism: `${values[0]} creates an enforceable consequence rather than a coincidence.`,
    characterChoice: `${values[1]} closes a valued alternative for Mara.`,
    opposition: `Orren counters through ${values[3]} and public procedure.`,
    emotionalCost: `${values[2]} changes Mara's family relationship.`,
    materialCost: `The bargain creates a recorded debt and lost protection.`,
    immediateConsequence: `The archive opens under a condition.`,
    downstreamConsequence: `The condition changes a later vote and exposes the leak.`,
    genrePayoff: `A fair clue increases political danger.`,
    thematicPressure: `Private loyalty becomes expensive in public institutions.`,
    imageOrMotif: `${values[4]} changes meaning after the bargain.`,
    surpriseMechanism: `Orren's evidence is real but incomplete.`,
    axisValues: [
      { axisId: "causal_engine", valueId: values[0], explanation: `Driven by ${values[0]}.` },
      { axisId: "character_choice", valueId: values[1], explanation: `Choice is ${values[1]}.` },
      { axisId: "emotional_cost", valueId: values[2], explanation: `Cost is ${values[2]}.` },
      { axisId: "information_design", valueId: values[3], explanation: `Information changes through ${values[3]}.` },
      { axisId: "image_motif", valueId: values[4], explanation: `Motif is ${values[4]}.` },
    ],
    constraintEvidenceIds: ["constraint-project-world"], canonEvidenceIds: ["canon-vote", "canon-leak"], riskIds: [`risk-${ideaId}`],
  };
}

async function ideaEvaluation(authorialVoice, narrativeRegister) {
  const compiled = await compileBookIdeaLab({
    outputKind: "evavo_docs_book_idea_lab_compile_input", schemaVersion: 1, programmeId: "programme-alpha", projectId: "project-alpha", volumeId: "volume-one", manuscriptRevisionId: "revision-one", labId: "lab-one", labVersion: 1, authorialVoiceProfile: authorialVoice, narrativeRegisterProfile: narrativeRegister, domainId: "scene_design", objective: "Improve the council negotiation without changing canon.", existingSolutionSummary: "Mara trades a vote for access.", hardConstraintIds: ["constraint-project-world"], canonEvidenceIds: ["canon-vote", "canon-leak"], seedIds: ["seed-key"], rejectedIdeaPatternIds: ["avoid-rescue", "avoid-random-clue"], requiredDivergenceAxisIds: ["causal_engine", "character_choice", "emotional_cost", "information_design", "image_motif"], requestedCandidateCount: 4, evidenceIds: ["idea-evidence"], policy: { minimumCandidates: 4, maximumCandidates: 8, minimumRequiredAxes: 5, minimumPairwiseDivergence: 0.2, maximumSharedAxisRatio: 0.8, minimumIndependentReviewerIds: 2, minimumRecommendedScore: 80, maximumPortfolioSize: 4 },
  });
  assert.equal(compiled.status, "ready", JSON.stringify(compiled));
  const ideas = [
    candidate("idea-one", ["ledger-debt", "sign-vote", "brother-trust", "controlled-leak", "key-ledger"]),
    candidate("idea-two", ["false-ritual", "confess-challenge", "household-exile", "public-test", "burned-seal"]),
    candidate("idea-three", ["mutual-hostage", "trade-truth", "ally-displacement", "misunderstanding", "two-keys"]),
    candidate("idea-four", ["timed-audit", "resign-office", "role-loss", "witness-record", "missing-page"]),
  ];
  const criterionEvidence = ideas.flatMap((idea, ideaIndex) => compiled.packet.qualityRubric.map((criterion, criterionIndex) => ({ ideaId: idea.ideaId, criterionId: criterion.criterionId, score: 90 + ((ideaIndex + criterionIndex) % 5), reviewerId: (ideaIndex + criterionIndex) % 2 ? "reviewer-one" : "reviewer-two", evidenceIds: [`score-${idea.ideaId}-${criterion.criterionId}`], findingIds: [], independentlyReviewed: true })));
  const result = await evaluateBookIdeaLabCandidates({ outputKind: "evavo_docs_book_idea_lab_evaluation_input", schemaVersion: 1, packet: compiled.packet, evaluationId: "evaluation-one", candidates: ideas, criterionEvidence, independentReviewerIds: ["reviewer-one", "reviewer-two"], unresolvedFindingIds: [], evidenceIds: ["evaluation-evidence"] });
  assert.equal(result.status, "ready_for_human_choice", JSON.stringify(result));
  return result.evaluation;
}

test("authorial runtime preserves project voice and detects generic model mannerisms", async () => {
  const profile = await voice();
  assert.equal(profile.sourceTextPersisted, false);
  assert.doesNotMatch(JSON.stringify(profile), /Mara kept the council key/);
  assert.deepEqual(await validateBookAuthorialVoiceProfile(profile), []);
  const accepted = await compareBookAuthorialVoice({ outputKind: "evavo_docs_book_authorial_voice_comparison_input", schemaVersion: 1, comparisonId: "comparison-one", profile, candidateId: "candidate-one", candidateText: sampleOne, contextRole: "mixed", evidenceIds: ["comparison-evidence"] });
  assert.equal(accepted.status, "accepted", JSON.stringify(accepted));
  const generic = `Her eyes widened. Her eyes widened again. Her eyes widened at the door. Her eyes widened when he spoke. Her blood ran cold. Her heart pounded. Her jaw clenched. She was very afraid, really afraid, absolutely afraid. Suddenly darkness swallowed the room. She smiled, but the smile did not reach her eyes. She released a breath she did not know she was holding. She felt that she knew that he seemed to notice that she was scared. She felt that she knew that he seemed to notice it again. She was not calm but frightened, not ready but desperate, not strong but weak. Then she ran. Then she stopped. Then she ran again. Her eyes widened one last time as her heart hammered and her blood ran cold.`;
  const drift = await compareBookAuthorialVoice({ outputKind: "evavo_docs_book_authorial_voice_comparison_input", schemaVersion: 1, comparisonId: "comparison-two", profile, candidateId: "candidate-two", candidateText: generic, contextRole: "mixed", evidenceIds: ["comparison-generic"] });
  assert.equal(drift.status, "needs_work");
  assert.ok(drift.comparison.antiPatternFindings.some((item) => item.patternId === "eyes_widen" && item.severity === "blocking"));
});

test("register, divergent ideas and synthesis remain subordinate to authorship and canon", async () => {
  const authorialVoice = await voice();
  const narrativeRegister = await register(authorialVoice);
  assert.equal(narrativeRegister.projectVoiceRemainsAuthoritative, true);
  assert.deepEqual(await validateBookNarrativeRegisterProfile(narrativeRegister), []);
  const ideas = await ideaEvaluation(authorialVoice, narrativeRegister);
  assert.equal(ideas.humanChoiceRequired, true);
  assert.equal(ideas.portfolio.length, 4);
  assert.deepEqual(await validateBookIdeaLabEvaluation(ideas), []);
  const craft = await craftPacket();
  const synthesis = await compileBookAuthorialSynthesis({
    outputKind: "evavo_docs_book_authorial_synthesis_compile_input", schemaVersion: 1, programmeId: "programme-alpha", projectId: "project-alpha", volumeId: "volume-one", manuscriptRevisionId: "revision-one", synthesisId: "synthesis-one", synthesisVersion: 1, unitKind: "scene", operation: "revise", targetUnitIds: ["scene-council-door"], sourceTextSha256: await sha256ReviewCraftText(sampleOne), authorialVoiceProfile: authorialVoice, narrativeRegisterProfile: narrativeRegister, narrativeCraftPacket: craft, ideaLabEvaluation: ideas, selectedIdeaId: ideas.recommendedIdeaId,
    enhancementBudgets: [
      { targetId: "concrete_specificity", strength: 0.75, maximumVoiceDriftContribution: 0.12, evidenceIds: ["enhance-specificity"] },
      { targetId: "dialogue_subtext", strength: 0.65, maximumVoiceDriftContribution: 0.1, evidenceIds: ["enhance-subtext"] },
      { targetId: "emotional_granularity", strength: 0.6, maximumVoiceDriftContribution: 0.08, evidenceIds: ["enhance-emotion"] },
    ],
    flavourPlan: { imageSourceDomainIds: ["archive-work", "council-procedure"], motifIds: ["motif-keys", "motif-ledger"], dialogueTextureIds: ["hostile_courteous", "strategic_silence"], proseDeviceBudgets: [{ deviceId: "callback", maximumPerThousandWords: 2, purpose: "Return to the key after its political meaning changes.", evidenceIds: ["device-callback"] }, { deviceId: "understatement", maximumPerThousandWords: 3, purpose: "Let courtesy carry threat.", evidenceIds: ["device-understatement"] }], prohibitedDeviceIds: ["anaphora"], authorialRiskBudget: 0.4, maximumNewMotifs: 1, maximumFigurativeClustersPerThousandWords: 4, evidenceIds: ["flavour-evidence"] },
    changePolicy: { semanticPreservationRequired: true, maximumSurfaceChangeRatio: 0.7, lockedLayerIds: ["meaning", "canon", "viewpoint"], flexibleLayerIds: ["causality", "character_motive", "scene_structure", "paragraph_structure", "sentence_structure", "diction", "imagery", "dialogue_surface", "punctuation"], requireBeforeAfterEvidence: true, requireVoiceComparison: true, requireNarrativeCraftEvaluation: true, requirePhraseOverlapScan: true, requireIndependentReview: true },
    objective: "Increase relational leverage and image coherence without changing canon or replacing voice.", exactMeaningIds: ["meaning-protect-ally"], canonEvidenceIds: ["canon-vote", "canon-leak"], factEvidenceIds: ["fact-procedure"], continuityEvidenceIds: ["continuity-brother"], evidenceIds: ["synthesis-evidence"],
  });
  assert.equal(synthesis.status, "ready", JSON.stringify(synthesis));
  assert.equal(synthesis.packet.projectVoiceRemainsAuthoritative, true);
  assert.equal(synthesis.packet.genreRegisterMayReplaceVoice, false);
  assert.equal(synthesis.packet.ideaMayOverrideCanon, false);
  assert.match(synthesis.packet.providerInstruction, /AUTHORITY PRECEDENCE/);
  assert.deepEqual(await validateBookAuthorialSynthesisPacket(synthesis.packet), []);
});
