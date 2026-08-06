import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOK_ART_CANDIDATE_SET_CAPABILITIES,
  BOOK_ART_CANDIDATE_SET_CONTRACT,
  BOOK_ART_CANDIDATE_SET_NEAR_DUPLICATE_BASIS_POINTS,
  evaluateBookArtCandidateSetConsensus,
  fingerprintBookArtCandidateSetConsensusEvaluation,
  fingerprintBookIllustrationValue,
  listBookArtCandidateSetCapabilities,
  validateBookArtCandidateSetConsensusEvaluation,
} from "../dist/index.js";

const digest = (character) => `sha256:${character.repeat(64)}`;

function visualConsensus(candidateId, contentCharacter, artifactCharacter) {
  const unsigned = {
    outputKind: "evavo_art_book_visual_consensus_evaluation",
    schemaVersion: 1,
    contract: "evavo_art_book_illustration_intelligence_v1",
    status: "ready_for_governed_selection",
    candidateId,
    candidateContentSha256: digest(contentCharacter),
    candidateArtifactFingerprint: digest(artifactCharacter),
    planFingerprint: digest("9"),
    qaResultFingerprint: digest("8"),
    reviewFingerprints: [digest("7"), digest("6")],
    passingReviewerProducerIds: ["reviewer-alpha", "reviewer-beta"],
    dissentingReviewerProducerIds: [],
    minorityFindingIds: [],
    consensusBasisPoints: 10_000,
    minimumConsensusBasisPoints: 9_000,
    minimumIndependentReviewers: 2,
    minimumPassingReviewerScore: 80,
    consensusReached: true,
    requiredActions: [],
    providerCallPerformed: false,
    reviewerFallbackAllowed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    publicationPerformed: false,
  };
  return {
    ...unsigned,
    evaluationFingerprint: fingerprintBookIllustrationValue(unsigned),
  };
}

function candidate(index) {
  const candidateId = `candidate-${index}`;
  const contentCharacter = String(index);
  const artifactCharacter = String(index + 3);
  return {
    candidateId,
    candidateProducerId: "openai-gpt-image",
    candidateContentSha256: digest(contentCharacter),
    candidateArtifactFingerprint: digest(artifactCharacter),
    planFingerprint: digest("9"),
    conceptFingerprint: digest(String(index + 3)),
    compositionFingerprint: digest(String(index + 4)),
    silhouetteFingerprint: digest(String(index + 5)),
    manuscriptEvidenceIds: [
      `chapter-04-seal-tooth-${index}`,
      `chapter-11-ledger-tide-mark-${index}`,
    ],
    evidenceIds: [`candidate-inspection-${index}`],
    visualConsensus: visualConsensus(
      candidateId,
      contentCharacter,
      artifactCharacter,
    ),
  };
}

function pair(left, right, offset = 0) {
  return {
    leftCandidateId: `candidate-${left}`,
    rightCandidateId: `candidate-${right}`,
    overallSimilarityBasisPoints: 3_000 + offset,
    conceptSimilarityBasisPoints: 2_000 + offset,
    compositionSimilarityBasisPoints: 2_500 + offset,
    silhouetteSimilarityBasisPoints: 2_700 + offset,
    evidenceIds: [`pair-${left}-${right}`],
  };
}

function consensusInput() {
  return {
    outputKind: "evavo_art_book_candidate_set_consensus_input",
    schemaVersion: 1,
    contract: BOOK_ART_CANDIDATE_SET_CONTRACT,
    candidateSetId: "candidate-set-1234567890abcdef",
    workOrderFingerprintSha256: digest("a"),
    expectedCandidateCount: 3,
    providerRunFingerprint: digest("b"),
    candidates: [candidate(1), candidate(2), candidate(3)],
    pairwiseComparisons: [pair(1, 2), pair(1, 3, 10), pair(2, 3, 20)],
    setReviewerId: "human-art-director",
    setReviewMethod: "human_with_machine_assistance",
    machineOnlyDecision: false,
    requestedAt: "2026-08-06T00:30:00.000Z",
    requestedBy: "book-automation",
    providerCallAllowed: false,
    reviewerFallbackAllowed: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    bookUseBindingAllowed: false,
    publicationAllowed: false,
  };
}

test("publishes the candidate-set quality boundary", () => {
  const capabilities = listBookArtCandidateSetCapabilities();
  assert.deepEqual(capabilities.capabilities, BOOK_ART_CANDIDATE_SET_CAPABILITIES);
  assert.equal(capabilities.minimumCandidates, 3);
  assert.equal(capabilities.defaultCandidates, 4);
  assert.equal(capabilities.maximumCandidates, 8);
  assert.equal(capabilities.nearDuplicateBasisPoints, 9_200);
  assert.equal(capabilities.providerFallbackAllowed, false);
  assert.equal(capabilities.automaticSelectionAllowed, false);
});

test("accepts a manuscript-grounded independently reviewed distinct set", () => {
  const result = evaluateBookArtCandidateSetConsensus(consensusInput());
  assert.equal(result.status, "ready_for_docs_quality_gate", JSON.stringify(result));
  assert.ok(result.evaluation);
  assert.deepEqual(validateBookArtCandidateSetConsensusEvaluation(result.evaluation), []);
  assert.equal(result.evaluation.selectionPerformed, false);
  assert.equal(result.evaluation.promotionPerformed, false);
  assert.equal(result.evaluation.publicationPerformed, false);
});

test("returns needs_work for near duplicates rather than selecting one", () => {
  const input = consensusInput();
  input.pairwiseComparisons[0].overallSimilarityBasisPoints =
    BOOK_ART_CANDIDATE_SET_NEAR_DUPLICATE_BASIS_POINTS;
  const result = evaluateBookArtCandidateSetConsensus(input);
  assert.equal(result.status, "needs_work");
  assert.ok(result.requiredActions.some((item) => /near-duplicate/i.test(item)));
  assert.equal(result.evaluation?.selectionPerformed, false);
});

test("blocks missing or duplicated pair coverage", () => {
  const missing = consensusInput();
  missing.pairwiseComparisons.pop();
  const missingResult = evaluateBookArtCandidateSetConsensus(missing);
  assert.equal(missingResult.status, "blocked");
  assert.match(missingResult.blockers.join("\n"), /missing/i);

  const duplicated = consensusInput();
  duplicated.pairwiseComparisons.push(
    structuredClone(duplicated.pairwiseComparisons[0]),
  );
  const duplicatedResult = evaluateBookArtCandidateSetConsensus(duplicated);
  assert.equal(duplicatedResult.status, "blocked");
  assert.match(duplicatedResult.blockers.join("\n"), /duplicated/i);
});

test("blocks candidate review that omits outputs from the governed set", () => {
  const incomplete = consensusInput();
  incomplete.expectedCandidateCount = 4;
  const result = evaluateBookArtCandidateSetConsensus(incomplete);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("\n"), /exactly 4 candidates/i);
});

test("blocks machine-only approval and producer self-review", () => {
  const machineOnly = consensusInput();
  machineOnly.machineOnlyDecision = true;
  assert.equal(evaluateBookArtCandidateSetConsensus(machineOnly).status, "blocked");

  const selfReview = consensusInput();
  selfReview.setReviewerId = "openai-gpt-image";
  const result = evaluateBookArtCandidateSetConsensus(selfReview);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("\n"), /cannot be a candidate producer/i);
});

test("blocks stale per-candidate consensus evidence", () => {
  const input = consensusInput();
  input.candidates[0].visualConsensus.candidateContentSha256 = digest("f");
  const result = evaluateBookArtCandidateSetConsensus(input);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("\n"), /fingerprint|different candidate/i);
});

test("blocks candidate-producer participation hidden inside visual consensus", () => {
  const input = consensusInput();
  const consensus = input.candidates[0].visualConsensus;
  consensus.passingReviewerProducerIds[0] = "openai-gpt-image";
  const { evaluationFingerprint: _discarded, ...unsigned } = consensus;
  consensus.evaluationFingerprint = fingerprintBookIllustrationValue(unsigned);
  const result = evaluateBookArtCandidateSetConsensus(input);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("\n"), /not independent from the candidate producer/i);
});

test("returns needs_work for template variants", () => {
  const input = consensusInput();
  input.candidates[1].conceptFingerprint = input.candidates[0].conceptFingerprint;
  const result = evaluateBookArtCandidateSetConsensus(input);
  assert.equal(result.status, "needs_work");
  assert.ok(result.requiredActions.some((item) => /distinct concept/i.test(item)));
});

test("detects candidate-set evaluation tampering", () => {
  const result = evaluateBookArtCandidateSetConsensus(consensusInput());
  assert.ok(result.evaluation);
  const tampered = structuredClone(result.evaluation);
  tampered.candidates[0].manuscriptEvidenceIds = ["generic-evidence"];
  assert.match(
    validateBookArtCandidateSetConsensusEvaluation(tampered).join("\n"),
    /fingerprint/i,
  );
});

test("rejects freshly re-fingerprinted forged ready evaluations", () => {
  const result = evaluateBookArtCandidateSetConsensus(consensusInput());
  assert.ok(result.evaluation);
  const forged = structuredClone(result.evaluation);
  forged.pairwiseComparisons[0].overallSimilarityBasisPoints =
    BOOK_ART_CANDIDATE_SET_NEAR_DUPLICATE_BASIS_POINTS;
  forged.evaluationFingerprint =
    fingerprintBookArtCandidateSetConsensusEvaluation(forged);
  assert.match(
    validateBookArtCandidateSetConsensusEvaluation(forged).join("\n"),
    /canonical semantic replay/i,
  );
});
