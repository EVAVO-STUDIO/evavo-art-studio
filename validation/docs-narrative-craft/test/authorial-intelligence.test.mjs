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
  validateBookAuthorialSynthesisPacket,
  validateBookAuthorialVoiceProfile,
  validateBookIdeaLabEvaluation,
  validateBookNarrativeRegisterProfile,
} from "../src/index.ts";
import { sha256ReviewCraftText } from "../src/book-studio-review-craft-shared.ts";

const digest = (character) => `sha256:${character.repeat(64)}`;

const sampleOne = `Mara kept the council key in the pocket with the torn lining. It caught there whenever she walked quickly, a small metal argument against haste. At the archive door she did not knock. Orren would hear the key before he heard her, and she wanted him to decide which sound mattered. The corridor smelled of wet wool, lamp oil, and the bitter ink the clerks mixed for permanent orders. She counted three breaths, not to calm herself, but to remember the order of the names. Her brother first. The porter second. The woman who had copied the seal not at all. When Orren opened the door, he looked past Mara to the empty stair. “You came alone,” he said. “You arranged it that way.” He smiled at the correction and moved his hand from the latch. The opening was no wider than a book. Mara could have forced it. That would have answered the wrong question. She took the key from her pocket and laid it flat on her palm. “I came to discuss the register,” she said, and watched his attention settle on the missing tooth.`;

const sampleTwo = `Rain moved across the harbour in separate grey rooms. From the warehouse roof, Wren could see one room swallowing the customs launch while another left the eastern cranes bright and dry. The men below shouted about rope, but the rope was not the problem. The tide had turned under the barge, pressing its stern towards the pilings one slow handspan at a time. Wren climbed down before anyone asked him to. On the third rung his bad shoulder reminded him of the winter crossing. He shifted his weight, used the left arm, and reached the quay as the first crate broke loose. “Leave the cargo,” Ada called. Nobody did. The crate held medicine, and everyone knew which houses had paid for it. Wren took the hook from the youngest deckhand and set it under the iron band. The wood trembled. The river gave them one chance, perhaps two. He did not tell Ada that his fingers had gone numb. She would hear it in the way he shortened the order. “Now,” he said. Four people pulled, each for a different reason, and the crate came home crooked.`;

async function voiceProfile() {
  const result = await compileBookAuthorialVoiceProfile({
    outputKind: "evavo_docs_book_authorial_voice_compile_input",
    schemaVersion: 1,
    programmeId: "programme-alpha",
    projectId: "project-alpha",
    voiceProfileId: "voice-alpha",
    voiceProfileVersion: 1,
    samples: [
      { sampleId: "sample-mara", role: "mixed", sourceKind: "project_owned", text: sampleOne, rightsEvidenceIds: ["rights-mara"] },
      { sampleId: "sample-wren", role: "mixed", sourceKind: "user_owned", text: sampleTwo, rightsEvidenceIds: ["rights-wren"] },
    ],
    projectVoiceAnchorIds: ["voice-anchor-one", "voice-anchor-two", "voice-anchor-three"],
    preserveMetricIds: [
      "mean_sentence_words", "sentence_length_variation", "mean_paragraph_sentences", "lexical_diversity",
      "dialogue_word_ratio", "emotion_label_rate", "filter_verb_rate", "em_dash_rate",
    ],
    flexibleMetricIds: ["question_rate", "exclamation_rate", "semicolon_rate", "colon_rate"],
    enhancementTargets: [
      { targetId: "concrete_specificity", strength: 0.8, evidenceIds: ["target-specificity"] },
      { targetId: "dialogue_subtext", strength: 0.7, evidenceIds: ["target-subtext"] },
      { targetId: "image_precision", strength: 0.55, evidenceIds: ["target-image"] },
      { targetId: "emotional_granularity", strength: 0.65, evidenceIds: ["target-emotion"] },
    ],
    antiPatternIds: ["stock_breath_release", "jaw_clench", "eyes_widen", "heart_pounded", "blood_ran_cold", "not_x_but_y", "generic_smile"],
    evidenceIds: ["voice-evidence-one", "voice-evidence-two"],
    policy: {
      minimumSamples: 2,
      maximumSamples: 8,
      minimumTotalWords: 100,
      maximumTotalCharacters: 100_000,
      defaultToleranceRatio: 0.6,
      hardDriftMultiplier: 3,
      minimumPreservationScore: 60,
    },
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
    influences: [
      {
        influenceId: "abstract-causal-pressure",
        requestedWeight: 1,
        provenance: {
          sourceId: "source-causal-pressure",
          privateLabel: "private causal analysis",
          sourceKind: "abstract_profile",
          rightsBasis: "abstract_observation",
          rightsEvidenceIds: ["rights-causal"],
          sourceFingerprint: digest("a"),
          providerContextAllowed: true,
          phraseComparisonAllowed: true,
        },
        mechanisms: [
          { mechanismId: "mechanism-causal", dimensionId: "causal-pressure", description: "Increase consequence density through decisions that close valued alternatives.", polarity: 0.9, strength: 1, confidence: 0.95, evidenceIds: ["mechanism-evidence-causal"], surfaceSpecificity: "general" },
          { mechanismId: "mechanism-dialogue-a", dimensionId: "dialogue-indirection", description: "Use recipient-sensitive turns with concealed objectives and changing leverage.", polarity: 0.8, strength: 0.9, confidence: 0.9, evidenceIds: ["mechanism-evidence-dialogue-a"], surfaceSpecificity: "general" },
        ],
      },
      {
        influenceId: "abstract-restraint-pressure",
        requestedWeight: 1,
        provenance: {
          sourceId: "source-restraint-pressure",
          privateLabel: "private restraint analysis",
          sourceKind: "abstract_profile",
          rightsBasis: "abstract_observation",
          rightsEvidenceIds: ["rights-restraint"],
          sourceFingerprint: digest("b"),
          providerContextAllowed: true,
          phraseComparisonAllowed: true,
        },
        mechanisms: [
          { mechanismId: "mechanism-restraint", dimensionId: "causal-pressure", description: "Delay explanatory closure while preserving exact setup and retrospective coherence.", polarity: -0.7, strength: 1, confidence: 0.95, evidenceIds: ["mechanism-evidence-restraint"], surfaceSpecificity: "general" },
          { mechanismId: "mechanism-dialogue-b", dimensionId: "dialogue-indirection", description: "Prefer plain surface speech whose omissions become legible through material context.", polarity: -0.8, strength: 0.9, confidence: 0.9, evidenceIds: ["mechanism-evidence-dialogue-b"], surfaceSpecificity: "general" },
        ],
      },
    ],
    projectVoiceAnchorIds: ["voice-anchor-one", "voice-anchor-two", "voice-anchor-three"],
    narrativeConstraintIds: ["constraint-project-world"],
    acceptedPatternIds: ["pattern-specific-observation"],
    rejectedPatternIds: ["pattern-stock-gesture", "pattern-formulaic-reversal", "pattern-exposition-dialogue", "pattern-generic-metaphor", "pattern-interchangeable-voice"],
  });
  assert.equal(result.status, "ready", JSON.stringify(result));
  return result.profile;
}

async function narrativeCraftPacket() {
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
      sceneId: "scene-council-door",
      purpose: "Force Mara to exchange private leverage for access while revealing that Orren predicted her request.",
      openingState: "Mara lacks archive access and believes Orren needs her public support.",
      objective: "Gain entry without exposing the source of her evidence.",
      opposition: "Orren controls access and can identify the source if Mara argues too precisely.",
      stakes: "Failure closes the archive before dawn and exposes Mara's ally to arrest.",
      tactic: "Offer public support, then redirect the negotiation toward Orren's fear of blame.",
      turningEvent: "Orren names the ally Mara has tried not to mention.",
      outcome: "Mara gains conditional access but confirms that Orren has a leak inside her household.",
      cost: "She promises a vote that will harm her brother and cannot warn the ally without revealing the leak.",
      closingState: "Mara has access, a binding public debt and proof that Orren penetrated her household.",
      causalPredecessorIds: ["event-stolen-seal"],
      downstreamConsequenceIds: ["consequence-brother-vote", "consequence-household-leak"],
      evidenceIds: ["scene-evidence-one"],
    },
    characters: [
      {
        characterId: "mara",
        publicGoal: "Secure access as a routine council accommodation.",
        privateNeed: "Protect the ally who supplied the stolen seal.",
        currentBelief: "Orren needs her vote more than he needs to punish the breach.",
        mistakenBelief: "Orren does not know who supplied the seal.",
        immediateAppraisal: "His calm invitation is obstructive and more informed than expected.",
        emotionalState: "Controlled alarm mixed with relief that the door is still negotiable.",
        actionTendency: "approach",
        regulationStrategy: "cognitive_reappraisal",
        outwardDisplay: "She treats his accusation as an administrative misunderstanding and asks about procedure.",
        withheldInformation: "The ally's name and the copied mark on the seal.",
        relationshipPressure: "Orren once protected her brother and expects gratitude to outweigh suspicion.",
        statusPosition: "Formally equal councillor but dependent on Orren's custodial authority.",
        voiceConstraintIds: ["voice-mara-formal", "voice-mara-avoids-direct-denial"],
        evidenceIds: ["character-mara-state"],
      },
      {
        characterId: "orren",
        publicGoal: "Protect archive procedure and make Mara request an exception openly.",
        privateNeed: "Learn whether Mara will sacrifice family loyalty for institutional power.",
        currentBelief: "Mara has the seal and will bargain rather than deny possession.",
        mistakenBelief: "Her brother authorised the theft.",
        immediateAppraisal: "Her procedural language confirms fear but not the source he expected.",
        emotionalState: "Patient satisfaction under sharper uncertainty about her household.",
        actionTendency: "observe",
        regulationStrategy: "strategic_delay",
        outwardDisplay: "He corrects a minor title and leaves the accusation unanswered long enough for her to fill the silence.",
        withheldInformation: "The informant named the wrong family member.",
        relationshipPressure: "He expects an old favour to give him permission to test her loyalty.",
        statusPosition: "Custodian with local authority, socially indebted to Mara's family.",
        voiceConstraintIds: ["voice-orren-precise", "voice-orren-correction-tests"],
        evidenceIds: ["character-orren-state"],
      },
    ],
    dialogue: {
      enabled: true,
      participantIds: ["mara", "orren"],
      commonGroundIds: ["ground-council-procedure", "ground-old-family-favour"],
      contestedGroundIds: ["ground-seal-authority"],
      withheldKnowledgeIds: ["knowledge-ally-name", "knowledge-informant-error"],
      statusRiskIds: ["risk-open-exception", "risk-family-betrayal"],
      requiredTurnFunctions: ["request", "challenge", "evasion", "repair", "status_test", "silence", "promise"],
      repairOpportunityRequired: true,
      silenceHasMeaning: true,
      maximumConsecutiveExpositoryTurns: 1,
      evidenceIds: ["dialogue-plan-one"],
    },
    emotionBeats: [
      {
        beatId: "beat-mara-recognition",
        sequence: 1,
        characterId: "mara",
        trigger: "Orren names the ally.",
        goalRelevance: "The name threatens the ally and proves the negotiation is not routine.",
        goalCongruence: "obstructs",
        controllability: "medium",
        agencyAttribution: "Orren disclosed partial knowledge to provoke correction.",
        certainty: "high",
        novelty: "high",
        actionTendency: "hide",
        regulationStrategy: "cognitive_reappraisal",
        outwardExpression: "She asks which archive form records third-party allegations and does not correct the name.",
        delayedAftereffect: "Her attention narrows to every word that could distinguish knowledge from bluff.",
        evidenceIds: ["emotion-mara-one"],
      },
      {
        beatId: "beat-orren-miscalculation",
        sequence: 2,
        characterId: "orren",
        trigger: "Mara refuses the expected correction.",
        goalRelevance: "Her restraint weakens his model of who authorised the theft.",
        goalCongruence: "mixed",
        controllability: "high",
        agencyAttribution: "Mara is deliberately protecting the error he offered.",
        certainty: "medium",
        novelty: "medium",
        actionTendency: "observe",
        regulationStrategy: "strategic_delay",
        outwardExpression: "He opens the ledger before answering, converting uncertainty into a procedural pause.",
        delayedAftereffect: "He grants access but adds a condition that will expose which relationship Mara protects next.",
        evidenceIds: ["emotion-orren-one"],
      },
    ],
    prose: {
      person: "third",
      tense: "past",
      narrativeDistance: "close",
      focalCharacterId: "mara",
      psychicAccessCharacterIds: ["mara"],
      sensoryPriorityIds: ["sensory-ink-smell", "sensory-key-weight", "sensory-pauses"],
      motifIds: ["motif-doors", "motif-corrected-names"],
      sentenceRhythm: "variable",
      paragraphRhythm: "variable",
      figurativeDensity: "low",
      expositionDensity: "low",
      forbiddenPatternIds: ["pattern-stock-gesture", "pattern-formulaic-reversal", "pattern-exposition-dialogue", "pattern-generic-metaphor", "pattern-interchangeable-voice"],
      evidenceIds: ["prose-plan-one"],
    },
    acceptedPatternIds: ["pattern-specific-observation"],
    rejectedPatternIds: ["pattern-stock-gesture", "pattern-formulaic-reversal", "pattern-exposition-dialogue", "pattern-generic-metaphor", "pattern-interchangeable-voice"],
    evidenceIds: ["project-evidence-one", "project-evidence-two"],
  });
  assert.equal(result.status, "ready", JSON.stringify(result));
  return result.packet;
}

async function registerProfile(voice) {
  const result = await compileBookNarrativeRegister({
    outputKind: "evavo_docs_book_narrative_register_compile_input",
    schemaVersion: 1,
    programmeId: "programme-alpha",
    projectId: "project-alpha",
    volumeId: "volume-one",
    registerId: "register-council-scene",
    registerVersion: 1,
    authorialVoiceProfile: voice,
    genres: [
      { genreId: "historical", requestedWeight: 1 },
      { genreId: "mystery", requestedWeight: 0.8 },
      { genreId: "literary", requestedWeight: 0.6 },
    ],
    sceneFunctionId: "negotiation",
    scenarioId: "council_or_court",
    audienceBand: "adult",
    dimensionOverrides: [
      { dimensionId: "social_pressure", value: 0.9, evidenceIds: ["override-social-pressure"] },
      { dimensionId: "violence_intensity", value: -0.7, evidenceIds: ["override-low-violence"] },
    ],
    projectPromiseIds: ["promise-political-consequence", "promise-material-history"],
    projectAvoidanceIds: ["avoid-modern-speech", "avoid-exposition-council"],
    evidenceIds: ["register-evidence-one"],
  });
  assert.equal(result.status, "ready", JSON.stringify(result));
  return result.profile;
}

function candidates() {
  const axes = (engine, choice, cost, information, motif) => [
    { axisId: "causal_engine", valueId: engine, explanation: `Causality is driven by ${engine}.` },
    { axisId: "character_choice", valueId: choice, explanation: `The decisive choice is ${choice}.` },
    { axisId: "emotional_cost", valueId: cost, explanation: `The durable emotional cost is ${cost}.` },
    { axisId: "information_design", valueId: information, explanation: `Information changes through ${information}.` },
    { axisId: "image_motif", valueId: motif, explanation: `The physical motif is ${motif}.` },
  ];
  return [
    {
      ideaId: "idea-grounded",
      premise: "Mara buys archive access by accepting a public vote whose wording exposes an old household debt.",
      causalMechanism: "Orren converts custodial procedure into a binding political exchange recorded in the council ledger.",
      characterChoice: "Mara signs the vote condition while refusing to correct Orren's mistaken source name.",
      opposition: "Orren tests whether family loyalty or institutional ambition will control her answer.",
      emotionalCost: "Mara protects the ally while accepting that her brother will read the vote as deliberate betrayal.",
      materialCost: "The signed condition limits her later council action and creates discoverable evidence.",
      immediateConsequence: "The door opens under a condition that Orren can enforce publicly.",
      downstreamConsequence: "Her brother loses a decisive protection and begins searching for the household leak.",
      genrePayoff: "The negotiation supplies a fair clue and increases political danger without physical spectacle.",
      thematicPressure: "Private loyalty becomes expensive when institutions require a public record.",
      imageOrMotif: "The archive key lies across a wet ledger line that cannot be erased.",
      surpriseMechanism: "Orren's wrong source name reveals that his intelligence is real but incomplete.",
      axisValues: axes("institutional-debt", "sign-damaging-vote", "brother-trust", "controlled-leak", "key-on-ledger"),
      constraintEvidenceIds: ["constraint-project-world"],
      canonEvidenceIds: ["canon-council-vote", "canon-household-leak"],
      riskIds: ["risk-brother-alienation"],
    },
    {
      ideaId: "idea-bold",
      premise: "Mara stages a false archival ritual that forces Orren to reveal which witness taught him the wrong form.",
      causalMechanism: "A procedural trap makes Orren choose between exposing his informant and invalidating his own accusation.",
      characterChoice: "Mara risks confessing possession of the seal in order to challenge the legality of Orren's evidence.",
      opposition: "Orren can preserve authority by turning the hearing into a public charge against her household.",
      emotionalCost: "Mara sacrifices the possibility of returning unnoticed to her former family role.",
      materialCost: "Her admission creates a charge that can be revived if the ritual challenge fails.",
      immediateConsequence: "The accusation pauses while the clerks search for a form that does not exist.",
      downstreamConsequence: "The invented ritual becomes a precedent others may weaponise against both councillors.",
      genrePayoff: "A procedural mystery clue becomes an active political reversal.",
      thematicPressure: "Institutions can be changed by a lie even when the lie exposes a truth.",
      imageOrMotif: "A burned seal is pressed into clean wax and leaves only half a crest.",
      surpriseMechanism: "The absent form proves Orren learned procedure from someone outside the archive.",
      axisValues: axes("false-ritual-trap", "confess-and-challenge", "household-exile", "public-procedural-test", "half-burned-seal"),
      constraintEvidenceIds: ["constraint-project-world"],
      canonEvidenceIds: ["canon-seal-possession", "canon-archive-rules"],
      riskIds: ["risk-new-precedent", "risk-public-charge"],
    },
    {
      ideaId: "idea-relational",
      premise: "Mara and Orren each protect a different person implicated by the seal, turning the negotiation into reciprocal hostage-taking.",
      causalMechanism: "Each names a consequence the other cannot permit, creating cooperation without trust.",
      characterChoice: "Mara gives Orren one true detail that disproves his theory but identifies the class of her ally.",
      opposition: "Orren must decide whether solving the theft matters more than preserving his own informant.",
      emotionalCost: "Mara discovers that protecting one ally requires making another person newly vulnerable.",
      materialCost: "Both parties exchange limited access and a future obligation under no written guarantee.",
      immediateConsequence: "They enter the archive together and must perform mutual confidence before the clerks.",
      downstreamConsequence: "Their concealed compact changes later accusations into tests of whether the other will honour silence.",
      genrePayoff: "The mystery advances through relationship leverage and partial truth rather than a new object clue.",
      thematicPressure: "Trust may begin as the accurate management of mutual betrayal.",
      imageOrMotif: "Two keys turn in separate locks on the same cabinet.",
      surpriseMechanism: "Orren's informant is also endangered by the official version of the theft.",
      axisValues: axes("reciprocal-hostage", "trade-partial-truth", "ally-displacement", "staged-mutual-misunderstanding", "two-keys"),
      constraintEvidenceIds: ["constraint-project-world"],
      canonEvidenceIds: ["canon-two-informants", "canon-shared-cabinet"],
      riskIds: ["risk-compact-collapse"],
    },
    {
      ideaId: "idea-hybrid",
      premise: "Mara requests an immediate audit that will grant access only if she resigns the office that gives the discovery political force.",
      causalMechanism: "A time-boxed audit converts private suspicion into a public process whose cost is Mara's authority.",
      characterChoice: "She surrenders office before knowing whether the archive contains enough proof to justify it.",
      opposition: "Orren accelerates the audit so she cannot consult her brother or warn the ally.",
      emotionalCost: "Mara loses the role through which she understood her value and can no longer protect people by command.",
      materialCost: "She gives up salary, access and formal immunity in exchange for one supervised hour.",
      immediateConsequence: "The council clock begins and the archive staff become witnesses rather than scenery.",
      downstreamConsequence: "Any proof she finds belongs to the institution that replaced her, while any failure makes her sacrifice appear guilty.",
      genrePayoff: "The deadline creates thriller pressure while the audit preserves mystery fairness and historical procedure.",
      thematicPressure: "Truth has different value when the finder no longer controls its use.",
      imageOrMotif: "A missing page leaves clean thread between two numbered leaves as the clock strikes.",
      surpriseMechanism: "The absence of the page proves someone prepared for an audit before Mara requested it.",
      axisValues: axes("time-boxed-audit", "sacrifice-office", "loss-of-self-role", "institutional-witness-record", "missing-page-thread"),
      constraintEvidenceIds: ["constraint-project-world"],
      canonEvidenceIds: ["canon-audit-rule", "canon-missing-page"],
      riskIds: ["risk-office-loss", "risk-proof-captured"],
    },
  ];
}

async function ideaEvaluation(voice, register) {
  const compile = await compileBookIdeaLab({
    outputKind: "evavo_docs_book_idea_lab_compile_input",
    schemaVersion: 1,
    programmeId: "programme-alpha",
    projectId: "project-alpha",
    volumeId: "volume-one",
    manuscriptRevisionId: "revision-one",
    labId: "idea-lab-council-door",
    labVersion: 1,
    authorialVoiceProfile: voice,
    narrativeRegisterProfile: register,
    domainId: "scene_design",
    objective: "Find a sharper council-door negotiation that increases causal, relational and thematic pressure without changing established canon.",
    existingSolutionSummary: "Mara bargains her vote for conditional archive access.",
    hardConstraintIds: ["constraint-project-world", "constraint-no-physical-fight"],
    canonEvidenceIds: ["canon-council-vote", "canon-household-leak", "canon-seal-possession"],
    seedIds: ["seed-key", "seed-ledger"],
    rejectedIdeaPatternIds: ["avoid-late-rescue", "avoid-simple-confession", "avoid-random-new-clue"],
    requiredDivergenceAxisIds: ["causal_engine", "character_choice", "emotional_cost", "information_design", "image_motif"],
    requestedCandidateCount: 4,
    evidenceIds: ["idea-lab-evidence"],
    policy: {
      minimumCandidates: 4,
      maximumCandidates: 8,
      minimumRequiredAxes: 5,
      minimumPairwiseDivergence: 0.2,
      maximumSharedAxisRatio: 0.8,
      minimumIndependentReviewerIds: 2,
      minimumRecommendedScore: 80,
      maximumPortfolioSize: 4,
    },
  });
  assert.equal(compile.status, "ready", JSON.stringify(compile));
  const ideas = candidates();
  const criterionEvidence = ideas.flatMap((idea, ideaIndex) => compile.packet.qualityRubric.map((criterion, criterionIndex) => ({
    ideaId: idea.ideaId,
    criterionId: criterion.criterionId,
    score: 90 + ((ideaIndex + criterionIndex) % 5),
    reviewerId: (ideaIndex + criterionIndex) % 2 === 0 ? "reviewer-alpha" : "reviewer-beta",
    evidenceIds: [`score-${idea.ideaId}-${criterion.criterionId}`],
    findingIds: [],
    independentlyReviewed: true,
  })));
  const result = await evaluateBookIdeaLabCandidates({
    outputKind: "evavo_docs_book_idea_lab_evaluation_input",
    schemaVersion: 1,
    packet: compile.packet,
    evaluationId: "idea-evaluation-council-door",
    candidates: ideas,
    criterionEvidence,
    independentReviewerIds: ["reviewer-alpha", "reviewer-beta"],
    unresolvedFindingIds: [],
    evidenceIds: ["idea-evaluation-evidence"],
  });
  assert.equal(result.status, "ready_for_human_choice", JSON.stringify(result));
  return result.evaluation;
}

test("learns a project-owned voice without persisting source prose", async () => {
  const profile = await voiceProfile();
  assert.equal(profile.sampleCount, 2);
  assert.ok(profile.totalWordCount >= 100);
  assert.ok(profile.metrics.length >= 20);
  assert.ok(profile.descriptorIds.length >= 4);
  assert.equal(profile.sourceTextPersisted, false);
  assert.equal(profile.providerExcerptPersisted, false);
  assert.doesNotMatch(JSON.stringify(profile), /Mara kept the council key/);
  assert.deepEqual(await validateBookAuthorialVoiceProfile(profile), []);
});

test("preserves voice while detecting generic drift and stock reactions", async () => {
  const profile = await voiceProfile();
  const accepted = await compareBookAuthorialVoice({
    outputKind: "evavo_docs_book_authorial_voice_comparison_input",
    schemaVersion: 1,
    comparisonId: "comparison-specific",
    profile,
    candidateId: "candidate-specific",
    candidateText: sampleOne,
    contextRole: "mixed",
    evidenceIds: ["comparison-evidence"],
  });
  assert.equal(accepted.status, "accepted", JSON.stringify(accepted));
  assert.ok(accepted.comparison.preservationScore >= profile.minimumPreservationScore);

  const generic = `Her eyes widened. Her eyes widened again. Her eyes widened at the door. Her eyes widened when he spoke. Her blood ran cold. Her heart pounded. Her jaw clenched. She was very afraid, really afraid, absolutely afraid. Suddenly she saw that the darkness swallowed the room. She smiled, but the smile did not reach her eyes. She released a breath she did not know she was holding. Everything was terrible. Everything was dark. Everything was dangerous. She felt that she knew that he seemed to notice that she was scared. She felt that she knew that he seemed to notice it again. She felt that she knew that he seemed to notice it once more. She was not calm but frightened, not ready but desperate, not strong but very weak. Then she ran. Then she stopped. Then she ran again. The moment was incredibly intense and totally overwhelming. Her eyes widened one last time as her heart hammered and her blood ran cold.`;
  const drift = await compareBookAuthorialVoice({
    outputKind: "evavo_docs_book_authorial_voice_comparison_input",
    schemaVersion: 1,
    comparisonId: "comparison-generic",
    profile,
    candidateId: "candidate-generic",
    candidateText: generic,
    contextRole: "mixed",
    evidenceIds: ["comparison-generic-evidence"],
  });
  assert.equal(drift.status, "needs_work");
  assert.ok(drift.comparison.antiPatternFindings.some((item) => item.patternId === "eyes_widen" && item.severity === "blocking"));
});

test("layers genres and scene scenarios around the project voice", async () => {
  const voice = await voiceProfile();
  const register = await registerProfile(voice);
  assert.equal(register.projectVoiceRemainsAuthoritative, true);
  assert.equal(register.genres.length, 3);
  assert.equal(register.sceneFunctionId, "negotiation");
  assert.equal(register.scenarioId, "council_or_court");
  assert.ok(register.productionDirections.length >= 6);
  assert.ok(register.counterweights.length >= 6);
  assert.deepEqual(await validateBookNarrativeRegisterProfile(register), []);
});

test("requires divergent complete ideas and returns a human-choice portfolio", async () => {
  const voice = await voiceProfile();
  const register = await registerProfile(voice);
  const evaluation = await ideaEvaluation(voice, register);
  assert.equal(evaluation.humanChoiceRequired, true);
  assert.equal(evaluation.portfolio.length, 4);
  assert.ok(evaluation.minimumObservedPairwiseDivergence >= 0.2);
  assert.ok(evaluation.recommendedIdeaId);
  assert.deepEqual(await validateBookIdeaLabEvaluation(evaluation), []);
});

test("compiles a final synthesis that improves craft without replacing authorship", async () => {
  const voice = await voiceProfile();
  const register = await registerProfile(voice);
  const craft = await narrativeCraftPacket();
  const ideas = await ideaEvaluation(voice, register);
  const result = await compileBookAuthorialSynthesis({
    outputKind: "evavo_docs_book_authorial_synthesis_compile_input",
    schemaVersion: 1,
    programmeId: "programme-alpha",
    projectId: "project-alpha",
    volumeId: "volume-one",
    manuscriptRevisionId: "revision-one",
    synthesisId: "synthesis-council-door",
    synthesisVersion: 1,
    unitKind: "scene",
    operation: "revise",
    targetUnitIds: ["scene-council-door"],
    sourceTextSha256: await sha256ReviewCraftText(sampleOne),
    authorialVoiceProfile: voice,
    narrativeRegisterProfile: register,
    narrativeCraftPacket: craft,
    ideaLabEvaluation: ideas,
    selectedIdeaId: ideas.recommendedIdeaId,
    enhancementBudgets: [
      { targetId: "concrete_specificity", strength: 0.75, maximumVoiceDriftContribution: 0.12, evidenceIds: ["enhance-specificity"] },
      { targetId: "dialogue_subtext", strength: 0.65, maximumVoiceDriftContribution: 0.1, evidenceIds: ["enhance-subtext"] },
      { targetId: "emotional_granularity", strength: 0.6, maximumVoiceDriftContribution: 0.08, evidenceIds: ["enhance-emotion"] },
    ],
    flavourPlan: {
      imageSourceDomainIds: ["images-archive-work", "images-council-procedure", "images-wet-stone"],
      motifIds: ["motif-keys", "motif-ledger-lines", "motif-corrected-names"],
      dialogueTextureIds: ["hostile_courteous", "strategic_silence", "misunderstanding_and_repair"],
      proseDeviceBudgets: [
        { deviceId: "callback", maximumPerThousandWords: 2, purpose: "Return to the missing tooth of the key after its political meaning changes.", evidenceIds: ["device-callback"] },
        { deviceId: "understatement", maximumPerThousandWords: 3, purpose: "Let institutional courtesy carry threat without generic menace.", evidenceIds: ["device-understatement"] },
        { deviceId: "motif_transformation", maximumPerThousandWords: 2, purpose: "Change the key from access object to evidence of obligation.", evidenceIds: ["device-motif"] },
      ],
      prohibitedDeviceIds: ["anaphora", "polysyndeton"],
      authorialRiskBudget: 0.45,
      maximumNewMotifs: 1,
      maximumFigurativeClustersPerThousandWords: 4,
      evidenceIds: ["flavour-plan-evidence"],
    },
    changePolicy: {
      semanticPreservationRequired: true,
      maximumSurfaceChangeRatio: 0.7,
      lockedLayerIds: ["meaning", "canon", "viewpoint"],
      flexibleLayerIds: ["causality", "character_motive", "scene_structure", "paragraph_structure", "sentence_structure", "diction", "imagery", "dialogue_surface", "punctuation"],
      requireBeforeAfterEvidence: true,
      requireVoiceComparison: true,
      requireNarrativeCraftEvaluation: true,
      requirePhraseOverlapScan: true,
      requireIndependentReview: true,
    },
    objective: "Increase the scene's relational leverage, emotional aftereffect and image coherence without changing canon or replacing the established prose voice.",
    exactMeaningIds: ["meaning-mara-protects-ally", "meaning-orren-knowledge-incomplete"],
    canonEvidenceIds: ["canon-council-vote", "canon-household-leak", "canon-seal-possession"],
    factEvidenceIds: ["fact-archive-procedure"],
    continuityEvidenceIds: ["continuity-brother-relationship", "continuity-orren-favour"],
    evidenceIds: ["synthesis-evidence-one"],
  });
  assert.equal(result.status, "ready", JSON.stringify(result));
  assert.equal(result.packet.projectVoiceRemainsAuthoritative, true);
  assert.equal(result.packet.genreRegisterMayReplaceVoice, false);
  assert.equal(result.packet.ideaMayOverrideCanon, false);
  assert.equal(result.packet.qualityGates.length, 8);
  assert.match(result.packet.providerInstruction, /AUTHORITY PRECEDENCE/);
  assert.match(result.packet.providerInstruction, /FLAVOUR PLAN/);
  assert.deepEqual(await validateBookAuthorialSynthesisPacket(result.packet), []);
});
