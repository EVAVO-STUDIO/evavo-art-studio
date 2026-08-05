import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOK_ART_CANDIDATE_SET_CAPABILITIES,
  BOOK_ART_CANDIDATE_SET_CONTRACT,
  BOOK_ART_CANDIDATE_SET_DEFAULT_CANDIDATES,
  BOOK_ART_CANDIDATE_SET_NEAR_DUPLICATE_BASIS_POINTS,
  BOOK_ART_HANDOFF_CONTRACT,
  compileBookArtCandidateSetWorkOrder,
  compileBookArtProductionWorkOrder,
  evaluateBookArtCandidateSetConsensus,
  fingerprintBookArtBrief,
  fingerprintBookIllustrationValue,
  listBookArtCandidateSetCapabilities,
  validateBookArtCandidateSetConsensusEvaluation,
  validateBookArtCandidateSetWorkOrder,
} from "../dist/index.js";

const digest = (character) => `sha256:${character.repeat(64)}`;

async function baseWorkOrder() {
  const brief = {
    outputKind: "evavo_book_art_brief",
    schemaVersion: 1,
    contract: BOOK_ART_HANDOFF_CONTRACT,
    identity: {
      workspaceId: "workspace-1",
      projectId: "project-1",
      bookId: "book-1",
      editionId: "paperback-1",
      requestId: "request-1",
    },
    purpose: "front_cover_art",
    manuscript: {
      manuscriptRevisionId: "manuscript-4",
      manuscriptSha256: digest("a"),
      extractedTextSha256: digest("b"),
      visualCanonSha256: digest("c"),
      artDirectionSha256: digest("d"),
      approvedEvidenceIds: [
        "docs-main-evidence",
        "docs-writing-art-link-evidence",
        "docs-visual-canon-evidence",
      ],
    },
    conceptTerritoryId: "manuscript-first",
    conceptTerritoryLabel: "Manuscript first",
    creativeThesis:
      "Build a restrained cover around the manuscript's damaged brass transit seal, the flood-darkened ledger cloth and a protected editable title field.",
    primarySubject:
      "The exact damaged brass transit seal described in the admitted manuscript and visual canon",
    supportingSubjects: [
      "Flood-darkened ledger cloth",
      "One period-correct iron clasp",
    ],
    compositionRequirements: [
      "Use an asymmetrical low visual anchor rather than a centred poster pose.",
      "Protect the upper-right title field without generating title pixels.",
    ],
    mustShow: [
      "The split lower tooth of the admitted brass seal",
      "The ledger cloth's diagonal water tide mark",
    ],
    mustNotShow: [
      "Generic fantasy symbols",
      "Stock cinematic hero poses",
      "Generated lettering or pseudo text",
    ],
    spoilerRestrictions: ["Do not reveal the final owner's identity."],
    continuityRequirements: [
      "Match the admitted seal damage, patina and period construction exactly.",
    ],
    historicalAndMaterialRequirements: [
      "Use 1871 brass casting, iron clasp and woven ledger-cloth construction.",
    ],
    negativeSpaceRequirements: [
      "Keep at least 30 percent quiet upper-right space for editable Docs Suite typography.",
    ],
    output: {
      widthPx: 3000,
      heightPx: 4800,
      minimumPpi: 300,
      allowedMimeTypes: ["image/png", "image/tiff"],
      colourIntent: "rgb",
      alpha: "allowed",
      textPolicy: "text_free",
      printUse: true,
      digitalUse: true,
    },
    rightsEvidenceIds: ["rights-project-owned-visual-canon"],
    createdAt: "2026-08-06T00:00:00.000Z",
    briefFingerprint: "",
    providerCandidateMayBeFinal: false,
    publicationPerformed: false,
  };
  brief.briefFingerprint = await fingerprintBookArtBrief(brief);
  const compilation = await compileBookArtProductionWorkOrder(brief);
  assert.equal(compilation.status, "ready", compilation.blockers.join("\n"));
  assert.ok(compilation.workOrder);
  return compilation.workOrder;
}

async function compileSet(candidateCount) {
  return compileBookArtCandidateSetWorkOrder({
    outputKind: "evavo_book_art_candidate_set_work_order_compile_input",
    schemaVersion: 1,
    contract: BOOK_ART_CANDIDATE_SET_CONTRACT,
    baseWorkOrder: await baseWorkOrder(),
    ...(candidateCount === undefined ? {} : { candidateCount }),
    requestedAt: "2026-08-06T00:05:00.000Z",
    requestedBy: "book-automation",
    providerFallbackAllowed: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    publicationAllowed: false,
  });
}

function unsignedVisualConsensus(candidateId, contentCharacter, artifactCharacter) {
  return {
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
}

function visualConsensus(candidateId, contentCharacter, artifactCharacter) {
  const unsigned = unsignedVisualConsensus(
    candidateId,
    contentCharacter,
    artifactCharacter,
  );
  return {
    ...unsigned,
    evaluationFingerprint: fingerprintBookIllustrationValue(unsigned),
  };
}

function candidate(index) {
  const id = `candidate-${index}`;
  const contentCharacter = String(index);
  const artifactCharacter = String(index + 3);
  return {
    candidateId: id,
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
      id,
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

async function consensusInput() {
  const compilation = await compileSet(3);
  assert.equal(compilation.status, "ready", compilation.blockers.join("\n"));
  assert.ok(compilation.workOrder);
  return {
    outputKind: "evavo_art_book_candidate_set_consensus_input",
    schemaVersion: 1,
    contract: BOOK_ART_CANDIDATE_SET_CONTRACT,
    candidateSetId: compilation.workOrder.candidateSetId,
    workOrderFingerprintSha256:
      compilation.workOrder.workOrderFingerprintSha256,
    providerRunFingerprint: digest("5"),
    candidates: [candidate(1), candidate(2), candidate(3)],
    pairwiseComparisons: [pair(1, 2), pair(1, 3, 10), pair(2, 3, 20)],
    setReviewerId: "human-art-director",
    setReviewMethod: "human_with_machine_assistance",
    machineOnlyDecision: false,
    requestedAt: "2026-08-06T00:30:00.000Z",
    requestedBy: "book-automation",
    providerCallAlowed: false,
    reviewerFallbackAllowed: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    bookUseBindingAllowed: false,
    publicationAllowed: false,
  };
}

test("publishes an explicit candidate-set capability and quality boundary", () => {
  const capabilities = listBookArtCandidateSetCapabilities();
  assert.deepEqual(capabilities.capabilities, BOOK_ART_CANDIDATE_SET_CAPABILITIES);
  assert.equal(capabilities.defaultCandidates, 4);
  assert.equal(capabilities.nearDuplicateBasisPoints, 9_200);
  assert.equal(capabilities.providerFallbackAllowed, false);
  assert.equal(capabilities.automaticSelectionAllowed, false);
});

test("compiles four alternatives by default without weakening the base work order", async () => {
  const result = await compileSet();
  assert.equal(result.status, "ready", result.blockers.join("\n"));
  assert.ok(result.workOrder);
  assert.equal(
    result.workOrder.candidateCount,
    BOOK_ART_CANDIDATE_SET_DEFAULT_CANDIDATES,
  );
  assert.equal(result.workOrder.providerRequest.candidateCount, 4);
  assert.equal(result.workOrder.baseWorkOrder.providerRequest.candidateCount, 1);
  assert.equal(result.workOrder.providerRequest.selection.allowFallback, false);
  assert.equal(
    result.workOrder.providerRequest.metadata.completePairwiseComparisonRequired,
    true,
  );
  assert.deepEqual(
    await validateBookArtCandidateSetWorkOrder(result.workOrder),
    [],
  );
});

test("rejects undersized, oversized and fingerprint-tampered candidate sets", async () => {
  for (const count of [2, 9]) {
    const result = await compileSet(count);
    assert.equal(result.status, "blocked");
    assert.match(result.blockers.join("\n"), /candidateCount/i);
  }
  const ready = await compileSet(4);
  assert.ok(ready.workOrder);
  const tampered = structuredClone(ready.workOrder);
  tampered.providerRequest.candidateCount = 3;
  assert.match(
    (await validateBookArtCandidateSetWorkOrder(tampered)).join("\n"),
    /fingerprint|candidate count/i,
  );
});

test("accepts a manuscript-grounded, independently reviewed and genuinely distinct set", async () => {
  const result = evaluateBookArtCandidateSetConsensus(await consensusInput());
  assert.equal(
    result.status,
    "ready_for_docs_quality_gate",
    JSON.stringify(result, null, 2),
  );
  assert.ok(result.evaluation);
  assert.deepEqual(
    validateBookArtCandidateSetConsensusEvaluation(result.evaluation),
    [],
  );
  assert.equal(result.evaluation.selectionPerformed, false);
  assert.equal(result.evaluation.promotionPerformed, false);
  assert.equal(result.evaluation.publicationPerformed, false);
});

test("returns needs_work for near duplicates rather than selecting the least-bad image", async () => {
  const input = await consensusInput();
  input.pairwiseComparisons[0].overallSimilarityBasisPoints =
    BOOK_ART_CANDIDATE_SET_NEAR_DUPLICATE_BASIS_POINTS;
  const result = evaluateBookArtCandidateSetConsensus(input);
  assert.equal(result.status, "needs_work");
  assert.ok(result.requiredActions.some((item) => /near-duplicate/i.test(item)));
  assert.equal(result.evaluation?.selectionPerformed, false);
});

test("blocks missing or duplicated pair coverage", async () => {
  const missing = await consensusInput();
  missing.pairwiseComparisons.pop();
  const missingResult = evaluateBookArtCandidateSetConsensus(missing);
  assert.equal(missingResult.status, "blocked");
  assert.match(missingResult.blockers.join("\n"), /missing/i);

  const duplicated = await consensusInput();
  duplicated.pairwiseComparisons.push(
    structuredClone(duplicated.pairwiseComparisons[0]),
  );
  const duplicatedResult = evaluateBookArtCandidateSetConsensus(duplicated);
  assert.equal(duplicatedResult.status, "blocked");
  assert.match(duplicatedResult.blockers.join("\n"), /duplicated/i);
});

test("blocks machine-only and producer self-review", async () => {
  const machineOnly = await consensusInput();
  machineOnly.machineOnlyDecision = true;
  assert.equal(
    evaluateBookArtCandidateSetConsensus(machineOnly).status,
    "blocked",
  );

  const selfReview = await consensusInput();
  selfReview.setReviewerId = "openai-gpt-image";
  const result = evaluateBookArtCandidateSetConsensus(selfReview);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("\n"), /cannot be a candidate producer/i);
});

test("blocks stale or recomputed per-candidate consensus evidence", async () => {
  const input = await consensusInput();
  input.candidates[0].visualConsensus.candidateContentSha256 = digest("f");
  const result = evaluateBookArtCandidateSetConsensus(input);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("\n"), /fingerprint|different candidate/i);
});

test("returns needs_work for template variants with duplicated concept decisions", async () => {
  const input = await consensusInput();
  input.candidates[1].conceptFingerprint =
    input.candidates[0].conceptFingerprint;
  const result = evaluateBookArtCandidateSetConsensus(input);
  assert.equal(result.status, "needs_work");
  assert.ok(result.requiredActions.some((item) => /distinct concept/i.test(item)));
});

test("detects candidate-set evaluation tampering", async () => {
  const result = evaluateBookArtCandidateSetConsensus(await consensusInput());
  assert.ok(result.evaluation);
  const tampered = structuredClone(result.evaluation);
  tampered.candidates[0].manuscriptEvidenceIds = ["generic-evidence"];
  assert.match(
    validateBookArtCandidateSetConsensusEvaluation(tampered).join("\n"),
    /fingerprint/i,
  );
});
