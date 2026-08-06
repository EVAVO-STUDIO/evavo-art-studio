import assert from "node:assert/strict";

import { compileBookCraftProfile } from "../src/book-studio-craft-profile.ts";
import {
  BOOK_NARRATIVE_KNOWLEDGE_MODULES,
  fingerprintBookNarrativeIndependentReviewReceipt,
} from "../src/book-studio-narrative-craft.ts";
import { scanBookPhraseOverlap } from "../src/book-studio-phrase-overlap.ts";
import { sha256ReviewCraftText } from "../src/book-studio-review-craft-shared.ts";

const digest = (character) => `sha256:${character.repeat(64)}`;

export async function craftProfile() {
  const result = await compileBookCraftProfile({
    outputKind: "evavo_docs_book_craft_compile_input",
    schemaVersion: 1,
    programmeId: "programme-alpha",
    profileId: "profile-original-alpha",
    profileVersion: 1,
    influences: [
      {
        influenceId: "abstract-mechanism-a",
        requestedWeight: 1,
        provenance: {
          sourceId: "source-a",
          privateLabel: "private-source-a",
          sourceKind: "abstract_profile",
          rightsBasis: "abstract_observation",
          rightsEvidenceIds: ["rights-a"],
          sourceFingerprint: digest("a"),
          providerContextAllowed: true,
          phraseComparisonAllowed: true,
        },
        mechanisms: [
          { mechanismId: "mechanism-a-causality", dimensionId: "causal-pressure", description: "Increase consequence density through character decisions and irreversible costs.", polarity: 0.9, strength: 1, confidence: 0.95, evidenceIds: ["evidence-a-causality"], surfaceSpecificity: "general" },
          { mechanismId: "mechanism-a-dialogue", dimensionId: "dialogue-indirection", description: "Use recipient-sensitive turns with concealed goals and changing social leverage.", polarity: 0.8, strength: 0.9, confidence: 0.9, evidenceIds: ["evidence-a-dialogue"], surfaceSpecificity: "general" },
        ],
      },
      {
        influenceId: "abstract-mechanism-b",
        requestedWeight: 1,
        provenance: {
          sourceId: "source-b",
          privateLabel: "private-source-b",
          sourceKind: "abstract_profile",
          rightsBasis: "abstract_observation",
          rightsEvidenceIds: ["rights-b"],
          sourceFingerprint: digest("b"),
          providerContextAllowed: true,
          phraseComparisonAllowed: true,
        },
        mechanisms: [
          { mechanismId: "mechanism-b-causality", dimensionId: "causal-pressure", description: "Slow causal disclosure while preserving exact setup and retrospective coherence.", polarity: -0.7, strength: 1, confidence: 0.95, evidenceIds: ["evidence-b-causality"], surfaceSpecificity: "general" },
          { mechanismId: "mechanism-b-dialogue", dimensionId: "dialogue-indirection", description: "Prefer plain surface speech whose omissions become legible through material context.", polarity: -0.8, strength: 0.9, confidence: 0.9, evidenceIds: ["evidence-b-dialogue"], surfaceSpecificity: "general" },
        ],
      },
    ],
    projectVoiceAnchorIds: ["voice-anchor-one", "voice-anchor-two", "voice-anchor-three"],
    narrativeConstraintIds: ["constraint-project-world"],
    acceptedPatternIds: ["pattern-specific-observation"],
    rejectedPatternIds: ["pattern-stock-gesture", "pattern-formulaic-reversal", "pattern-exposition-dialogue", "pattern-generic-metaphor", "pattern-interchangeable-voice"],
  });
  assert.equal(result.status, "ready", JSON.stringify(result.blockers));
  return result.profile;
}

export async function validInput() {
  return {
    outputKind: "evavo_docs_book_narrative_craft_compile_input",
    schemaVersion: 1,
    programmeId: "programme-alpha",
    projectId: "project-alpha",
    volumeId: "volume-one",
    manuscriptRevisionId: "revision-one",
    languageTag: "en-AU",
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
      purpose: "Force Mara to trade private leverage for access while revealing that Orren predicted her request.",
      openingState: "Mara lacks access and believes Orren needs her public support.",
      objective: "Gain entry to the sealed archive without exposing the source of her evidence.",
      opposition: "Orren controls access and can identify the hidden source if Mara argues too precisely.",
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
        immediateAppraisal: "His calm invitation is relevant, obstructive and more informed than expected.",
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
        emotionalState: "Patient satisfaction under a sharper uncertainty about her household.",
        actionTendency: "observe",
        regulationStrategy: "strategic_delay",
        outwardDisplay: "He corrects a minor title and leaves the accusation unanswered long enough for her to fill the silence.",
        withheldInformation: "The informant named the wrong family member.",
        relationshipPressure: "He expects an old favour to give him permission to test her loyalty.",
        statusPosition: "Custodian with local authority, socially indebted to Mara's family.",
        voiceConstraintIds: ["voice-orren-precise", "voice-orren-uses-corrections-as-tests"],
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
      requiredTurnFunctions: ["request", "challenge", "evasion", "repair", "silence", "promise"],
      turnPlan: [
        { turnId: "turn-1", sequence: 1, speakerId: "mara", recipientIds: ["orren"], turnFunction: "request", conversationalObjective: "Make the exception sound routine.", literalTopic: "Archive procedure.", subtextPressure: "She needs access without exposing the seal.", commonGroundUpdateIds: ["ground-request-recorded"], statusMove: "Mara invokes equal council standing.", evidenceIds: ["turn-evidence-1"] },
        { turnId: "turn-2", sequence: 2, speakerId: "orren", recipientIds: ["mara"], turnFunction: "challenge", respondsToTurnId: "turn-1", conversationalObjective: "Force her to acknowledge the exception.", literalTopic: "Who supplied the seal.", subtextPressure: "He offers a possibly wrong name to test correction.", commonGroundUpdateIds: ["ground-seal-known"], statusMove: "Orren exercises custodial authority.", evidenceIds: ["turn-evidence-2"] },
        { turnId: "turn-3", sequence: 3, speakerId: "mara", recipientIds: ["orren"], turnFunction: "evasion", respondsToTurnId: "turn-2", conversationalObjective: "Avoid confirming the source.", literalTopic: "Third-party allegation procedure.", subtextPressure: "Her refusal to correct the name protects the ally.", commonGroundUpdateIds: ["ground-name-unconfirmed"], statusMove: "Mara denies him the expected correction.", evidenceIds: ["turn-evidence-3"] },
        { turnId: "turn-4", sequence: 4, speakerId: "orren", recipientIds: ["mara"], turnFunction: "silence", respondsToTurnId: "turn-3", conversationalObjective: "Make her fill the pause.", literalTopic: "The unanswered allegation.", subtextPressure: "The pause tests whether she will overexplain.", commonGroundUpdateIds: [], statusMove: "Orren converts institutional patience into pressure.", evidenceIds: ["turn-evidence-4"] },
        { turnId: "turn-5", sequence: 5, speakerId: "mara", recipientIds: ["orren"], turnFunction: "repair", respondsToTurnId: "turn-4", repairOfTurnId: "turn-1", conversationalObjective: "Narrow her original request without conceding the seal.", literalTopic: "A supervised inspection rather than unrestricted access.", subtextPressure: "She repairs the request to reduce its apparent threat.", commonGroundUpdateIds: ["ground-request-narrowed"], statusMove: "Mara yields scope but preserves face.", evidenceIds: ["turn-evidence-5"] },
        { turnId: "turn-6", sequence: 6, speakerId: "orren", recipientIds: ["mara"], turnFunction: "promise", respondsToTurnId: "turn-5", conversationalObjective: "Grant access while creating a future test.", literalTopic: "Conditional access before dawn.", subtextPressure: "The condition will reveal which relationship she protects next.", commonGroundUpdateIds: ["ground-access-conditional"], statusMove: "Orren grants the exception and sets the debt.", evidenceIds: ["turn-evidence-6"] },
      ],
      repairOpportunityRequired: true,
      silenceHasMeaning: true,
      maximumConsecutiveExpositoryTurns: 1,
      evidenceIds: ["dialogue-plan-one"],
    },
    emotionBeats: [
      {
        beatId: "beat-mara-recognition", sequence: 1, characterId: "mara", trigger: "Orren names the ally.", goalRelevance: "The name threatens the ally and proves the negotiation is not routine.", goalCongruence: "obstructs", controllability: "medium", agencyAttribution: "Orren deliberately disclosed partial knowledge to provoke correction.", certainty: "high", novelty: "high", actionTendency: "hide", regulationStrategy: "cognitive_reappraisal", outwardExpression: "She asks which archive form records third-party allegations and does not correct the name.", delayedAftereffect: "Her attention narrows to every word that could distinguish knowledge from bluff.", evidenceIds: ["emotion-mara-one"],
      },
      {
        beatId: "beat-orren-miscalculation", sequence: 2, characterId: "orren", trigger: "Mara refuses the expected correction.", goalRelevance: "Her restraint weakens his model of who authorised the theft.", goalCongruence: "mixed", controllability: "high", agencyAttribution: "Mara is deliberately protecting the error he offered.", certainty: "medium", novelty: "medium", actionTendency: "observe", regulationStrategy: "strategic_delay", outwardExpression: "He opens the ledger before answering, converting uncertainty into a procedural pause.", delayedAftereffect: "He grants access but adds a condition that will expose which relationship Mara protects next.", evidenceIds: ["emotion-orren-one"],
      },
    ],
    prose: {
      person: "third", tense: "past", narrativeDistance: "close", focalCharacterId: "mara", psychicAccessCharacterIds: ["mara"], viewpointTransitionIds: [], sensoryPriorityIds: ["sensory-ink-smell", "sensory-key-weight", "sensory-pauses"], motifIds: ["motif-doors", "motif-corrected-names"], sentenceRhythm: "variable", paragraphRhythm: "variable", figurativeDensity: "low", expositionDensity: "low", forbiddenPatternIds: ["pattern-stock-gesture", "pattern-formulaic-reversal", "pattern-exposition-dialogue", "pattern-generic-metaphor", "pattern-interchangeable-voice"], evidenceIds: ["prose-plan-one"],
    },
    acceptedPatternIds: ["pattern-specific-observation"],
    rejectedPatternIds: ["pattern-stock-gesture", "pattern-formulaic-reversal", "pattern-exposition-dialogue", "pattern-generic-metaphor", "pattern-interchangeable-voice"],
    evidenceIds: ["project-evidence-one", "project-evidence-two"],
  };
}

export async function acceptedScan(candidateId, candidateText) {
  const result = await scanBookPhraseOverlap({
    outputKind: "evavo_docs_book_phrase_overlap_scan_input",
    schemaVersion: 1,
    scanId: `scan-${candidateId}`,
    candidateId,
    candidateText,
    references: [{ referenceId: "reference-one", sourceKind: "project_owned", rightsEvidenceIds: ["rights-reference-one"], text: "A completely different rights-cleared comparison passage about rain across a quiet field and no archive negotiation." }],
  });
  assert.equal(result.status, "accepted", JSON.stringify(result.blockers));
  return result.scan;
}

export async function independentReviewReceipt({ packet, candidateId, candidateTextSha256, criterionId, reviewerProducerId, score = 92 }) {
  const unsigned = {
    outputKind: "evavo_docs_book_narrative_independent_review_receipt",
    schemaVersion: 1,
    reviewId: `review-${criterionId}-${reviewerProducerId}`,
    packetFingerprint: packet.packetFingerprint,
    candidateId,
    candidateTextSha256,
    criterionId,
    reviewerProducerId,
    reviewerProvider: reviewerProducerId.includes("human") ? "human" : "other_compatible_model",
    reviewerModel: reviewerProducerId.includes("human") ? "named-human-review" : `review-model-${reviewerProducerId}`,
    score,
    decision: score >= 85 ? "pass" : "needs_work",
    evidenceIds: [`evidence-${criterionId}-${reviewerProducerId}`],
    findingIds: [],
    reviewedAt: "2026-08-04T09:00:00.000Z",
    reviewerWasCandidateProducer: false,
    canonicalAdmissionAllowed: false,
    publicationPerformed: false,
  };
  return { ...unsigned, reviewFingerprint: await fingerprintBookNarrativeIndependentReviewReceipt(unsigned) };
}

export async function criterionEvidence(packet, candidateId, candidateTextSha256, score = 92, reviewers = ["reviewer-alpha", "reviewer-beta"]) {
  const result = [];
  for (const criterion of packet.qualityRubric) {
    const independentReviews = [];
    for (const reviewerProducerId of reviewers) independentReviews.push(await independentReviewReceipt({
      packet, candidateId, candidateTextSha256, criterionId: criterion.criterionId, reviewerProducerId, score,
    }));
    result.push({
      criterionId: criterion.criterionId,
      score,
      evidenceIds: independentReviews.flatMap((review) => review.evidenceIds).sort(),
      findingIds: [],
      independentReviews,
    });
  }
  return result;
}

