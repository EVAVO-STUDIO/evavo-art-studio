import assert from "node:assert/strict";
import test from "node:test";

import { BOOK_NARRATIVE_KNOWLEDGE_MODULES } from "../src/book-studio-narrative-craft-knowledge-modules.ts";
import { BOOK_NARRATIVE_QUALITY_RUBRIC } from "../src/book-studio-narrative-craft-quality.ts";
import {
  bookAuthoringOperationRequiresNarrativeCraft,
  narrativeCraftModeForBookAuthoringOperation,
} from "../src/book-studio-narrative-craft-provider.ts";
import {
  compileBookNarrativeCraftPacket,
  validateBookNarrativeCraftPacket,
} from "../src/book-studio-narrative-craft-packet.ts";
import { evaluateBookNarrativeCraftEvidence } from "../src/book-studio-narrative-craft-evaluate.ts";
import {
  canonicalReviewCraftJson,
  sha256ReviewCraftText,
} from "../src/book-studio-review-craft-shared.ts";

const digest = (character) => `sha256:${character.repeat(64)}`;

async function craftProfile() {
  const unsigned = {
    outputKind: "evavo_docs_book_craft_profile",
    schemaVersion: 1,
    contract: "evavo_docs_book_review_craft_v1",
    authorityMode: "shadow_migration",
    status: "ready",
    programmeId: "programme-alpha",
    profileId: "profile-original-alpha",
    profileVersion: 1,
    providerInstruction: "Use exact project evidence, selective concrete detail, causal consequence, recipient-sensitive dialogue and varied sentence rhythm.",
    projectVoiceAnchorIds: ["voice-anchor-one", "voice-anchor-two", "voice-anchor-three"],
    narrativeConstraintIds: ["constraint-project-world"],
    acceptedPatternIds: ["pattern-specific-observation"],
    rejectedPatternIds: ["pattern-stock-gesture", "pattern-formulaic-reversal", "pattern-exposition-dialogue", "pattern-generic-metaphor", "pattern-interchangeable-voice"],
    providerBriefContainsNamedSources: false,
    directImitationPermitted: false,
    phraseLaunderingPermitted: false,
    projectOwnedExpressionRequired: true,
    canonicalAdmissionAllowed: false,
    websiteCompatibilityRuntimeStillAuthoritative: true,
    dualAuthoritativeWritesAllowed: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
  return {
    ...unsigned,
    profileFingerprint: await sha256ReviewCraftText(canonicalReviewCraftJson(unsigned)),
  };
}

async function validInput() {
  return {
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
  };
}

test("compiles deterministic original narrative craft", async () => {
  const input = await validInput();
  const first = await compileBookNarrativeCraftPacket(input);
  const second = await compileBookNarrativeCraftPacket({
    ...input,
    requestedKnowledgeModuleIds: [...input.requestedKnowledgeModuleIds].reverse(),
    archetypeMix: [...input.archetypeMix].reverse(),
    characters: [...input.characters].reverse(),
  });
  assert.equal(first.status, "ready", JSON.stringify(first.blockers));
  assert.equal(second.status, "ready", JSON.stringify(second.blockers));
  assert.equal(first.packetFingerprint, second.packetFingerprint);
  assert.equal(first.packet.knowledgeModules.length, 11);
  assert.equal(first.packet.qualityRubric.length, 14);
  assert.equal(first.packet.revisionProtocol.length, 9);
  assert.ok(first.packet.minimumDistanceFromArchetype >= 0.05);
  assert.ok(first.packet.writingContextBlock.objectId.length < 128);
  assert.doesNotMatch(first.packet.providerInstruction, /\b(?:write like|in the style of|imitate|mimic)\b/i);
  assert.equal(first.packet.automaticCanonicalAdmissionAllowed, false);
  assert.deepEqual(await validateBookNarrativeCraftPacket(first.packet), []);
});

test("blocks imitation, causal reset, unknown dialogue and viewpoint leakage", async () => {
  const input = await validInput();
  const result = await compileBookNarrativeCraftPacket({
    ...input,
    scene: { ...input.scene, purpose: "Write like a famous creator.", closingState: input.scene.openingState, downstreamConsequenceIds: [] },
    dialogue: { ...input.dialogue, participantIds: ["mara", "unknown-person"], repairOpportunityRequired: false },
    emotionBeats: input.emotionBeats.map((beat, index) => index === 0 ? { ...beat, regulationStrategy: "response_suppression", delayedAftereffect: "" } : beat),
    prose: { ...input.prose, psychicAccessCharacterIds: ["mara", "orren"] },
  });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((item) => /direct creator imitation/i.test(item)));
  assert.ok(result.blockers.some((item) => /closing state/i.test(item)));
  assert.ok(result.blockers.some((item) => /downstream consequence/i.test(item)));
  assert.ok(result.blockers.some((item) => /unknown-person/i.test(item)));
  assert.ok(result.blockers.some((item) => /repair opportunity/i.test(item)));
  assert.ok(result.blockers.some((item) => /response suppression/i.test(item)));
  assert.ok(result.blockers.some((item) => /simultaneous psychic access/i.test(item)));
});

test("rejects packet tampering and requires full quality evidence", async () => {
  const compiled = await compileBookNarrativeCraftPacket(await validInput());
  assert.equal(compiled.status, "ready");
  const tampered = structuredClone(compiled.packet);
  tampered.scene.cost = "No cost at all.";
  assert.ok((await validateBookNarrativeCraftPacket(tampered)).some((item) => /fingerprint/i.test(item)));

  const criterionEvidence = BOOK_NARRATIVE_QUALITY_RUBRIC.map((criterion) => ({
    criterionId: criterion.criterionId,
    score: 92,
    evidenceIds: [`evidence-${criterion.criterionId}`],
    findingIds: [],
    independentlyReviewed: true,
  }));
  const evaluation = await evaluateBookNarrativeCraftEvidence({
    outputKind: "evavo_docs_book_narrative_craft_evaluation_input",
    schemaVersion: 1,
    packet: compiled.packet,
    candidateId: "candidate-one",
    candidateTextSha256: await sha256ReviewCraftText("original candidate prose"),
    criterionEvidence,
    phraseOverlapAccepted: true,
    phraseOverlapScanFingerprint: digest("f"),
    independentReviewIds: ["review-one", "review-two"],
    unresolvedFindingIds: [],
    evidenceIds: ["evaluation-evidence"],
  });
  assert.equal(evaluation.status, "ready_for_review");
  assert.equal(evaluation.evaluation.weightedScore, 92);
  assert.equal(evaluation.evaluation.canonicalAdmissionAllowed, false);
});

test("maps only creative operations to narrative craft", () => {
  assert.equal(bookAuthoringOperationRequiresNarrativeCraft("draft_candidate"), true);
  assert.equal(bookAuthoringOperationRequiresNarrativeCraft("fact_check_candidate"), false);
  assert.equal(narrativeCraftModeForBookAuthoringOperation("line_edit_candidate"), "prose_pass");
  assert.equal(narrativeCraftModeForBookAuthoringOperation("proofread_candidate"), null);
});
