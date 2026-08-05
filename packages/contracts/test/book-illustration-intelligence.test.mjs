import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  BOOK_ILLUSTRATION_INTELLIGENCE_CAPABILITIES,
  BOOK_ILLUSTRATION_CAPABILITY_DESCRIPTORS,
  compileBookIllustrationGenerationDispatch,
  compileBookIllustrationIntelligencePlan,
  evaluateBookIllustrationCandidate,
  evaluateBookIllustrationVisualConsensus,
  fingerprintBookIllustrationVisualReviewReceipt,
  listBookIllustrationIntelligenceCapabilities,
  canonicalBookIllustrationJson,
  fingerprintBookIllustrationValue,
  validateBookIllustrationIntelligencePlan,
} from "../dist/book-illustration-intelligence.js";

const digest = (character) => `sha256:${character.repeat(64)}`;

function planningInput() {
  return {
    outputKind: "evavo_art_book_illustration_planning_input",
    schemaVersion: 1,
    contract: "evavo_art_book_illustration_intelligence_v1",
    identity: {
      workspaceId: "workspace-1",
      projectId: "project-1",
      bookId: "book-1",
      editionId: "edition-paperback",
      requestId: "request-art-1",
      assetId: "cover-route-1",
    },
    purpose: "front_cover_art",
    contentClass: "historical dark fantasy",
    visualPacketFingerprint: digest("a"),
    sourceBriefFingerprint: digest("b"),
    processFamily: "relief_engraving",
    genreRoute: "grimdark_tabletop_fantasy",
    desiredAesthetic:
      "monumental project-owned military and ecclesiastical silhouettes, severe value grouping, weathered heraldic geometry, material-specific engraved linework, restrained red spot colour, no proprietary symbols",
    narrativeBrief: {
      primarySubject: "a rain-dark surveyor holding a cracked brass lantern beneath a leaning bell tower",
      supportingSubjects: ["flooded stone gate", "distant civic crowd"],
      narrativePurpose: "promise public danger, restraint and civic conflict without revealing the ending",
      emotionalTemperature: "controlled dread rather than spectacle",
      visualAction: "the surveyor tests the flood depth while the silent bell dominates the skyline",
      compositionRequirements: [
        "strong silhouette at thumbnail size",
        "leave clean title space in the upper left",
        "use the gate as narrative geometry rather than decorative scenery",
      ],
      mustShow: ["cracked brass lantern", "leaning bell tower", "flooded cobbles"],
      mustAvoid: [
        "ending revelation",
        "readable generated text",
        "logos",
        "modern materials",
        "generic armoured hero pose",
      ],
      researchEvidenceIds: ["research-lantern-1", "research-gate-1"],
    },
    continuityLockIds: [
      "character:mara",
      "location:east-gate",
      "prop:surveyor-lantern",
      "motif:silent-bell",
    ],
    rightsEvidenceIds: ["rights-original-project-1"],
    namedCreatorReferences: [],
    brandedFranchiseReferences: [],
    printProfile: {
      profileId: "kdp_print",
      trimWidthInches: 6,
      trimHeightInches: 9,
      deliveryWidthInches: 6.25,
      deliveryHeightInches: 9.25,
      geometryAuthority: "docs_suite_exact_dimensions",
      bleedRequired: true,
      minimumPpi: 300,
      pureLineArtPpi: 600,
      screenLpi: 150,
      colourMode: "spot_colour",
      paperDescription: "uncoated cream trade-paperback stock",
      maximumInkCoveragePercent: 240,
    },
    presentationPolicy: {
      generatedArtworkTextFreeRequired: true,
      editableTypographyRequired: true,
      editableLetteringRequired: false,
      labelsOwnedByDocsSuite: true,
      altTextOwnedByDocsSuite: true,
      provenanceDisclosureRequired: true,
    },
    requestedAt: "2026-08-05T05:00:00.000Z",
    requestedBy: "book-automation",
    providerCallAllowed: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    bookUseBindingAllowed: false,
    publicationAllowed: false,
  };
}

function compilePlan() {
  const result = compileBookIllustrationIntelligencePlan(planningInput());
  assert.equal(result.status, "ready");
  assert.ok(result.plan);
  return result.plan;
}

function goodQaInput(plan) {
  return {
    outputKind: "evavo_art_book_illustration_candidate_qa_input",
    schemaVersion: 1,
    contract: "evavo_art_book_illustration_intelligence_v1",
    candidateId: "candidate-cover-1",
    plan,
    observedPlanFingerprint: plan.planFingerprint,
    observedVisualPacketFingerprint: plan.visualPacketFingerprint,
    observedContinuityLockIds: [...plan.continuityLockIds],
    technical: {
      widthPx: 3750,
      heightPx: 5550,
      printWidthInches: 6.25,
      printHeightInches: 9.25,
      effectiveContinuousTonePpi: 600,
      effectivePureLineArtPpi: 600,
      bleedInchesPerOuterEdge: 0.125,
      hasTransparency: true,
      flattenedForDelivery: true,
      editableLayeredMasterAvailable: true,
      minimumPositiveLineWidthPx: 2,
      minimumReverseLineWidthPx: 2.5,
      maximumInkCoveragePercent: 220,
      tonalStepCount: 7,
      embeddedTextDetected: false,
      embeddedLogoDetected: false,
    },
    craft: {
      lineWeightVariance: 82,
      hatchLightConsistency: 91,
      materialMarkVariation: 86,
      repeatedTextureScore: 4,
      randomNoiseScore: 3,
      pseudoDetailScore: 4,
      anatomyScore: 91,
      handsAndFacesScore: 92,
      perspectiveScore: 90,
      continuityScore: 96,
      digitalSmoothingScore: 8,
      compositionScore: 94,
      printSeparationScore: 93,
    },
    rights: {
      namedCreatorImitationDetected: false,
      brandedFranchiseElementsDetected: false,
      distinctiveSurfaceReconstructionDetected: false,
      falseHandmadeClaimDetected: false,
      syntheticProvenanceHidden: false,
    },
    evidenceIds: ["evidence-raster-1", "evidence-craft-review-1"],
    providerCallPerformedByQa: false,
    candidateBytesRewrittenByQa: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    publicationAllowed: false,
  };
}

test("compiles a rights-safe old-school print-craft plan with editable presentation", () => {
  const plan = compilePlan();
  assert.deepEqual(plan.capabilities, BOOK_ILLUSTRATION_INTELLIGENCE_CAPABILITIES);
  assert.equal(plan.genreRoute, "grimdark_tabletop_fantasy");
  assert.equal(plan.markGrammar.contourHierarchy.minimumDistinctWeights, 3);
  assert.equal(plan.markGrammar.hatchGrammar.randomScratchOverlayProhibited, true);
  assert.equal(plan.printRequirements.minimumContinuousTonePpi, 300);
  assert.equal(plan.printRequirements.minimumPureLineArtPpi, 600);
  assert.equal(plan.printRequirements.bleedInchesPerOuterEdge, 0.125);
  assert.equal(plan.layerPlan.generatedTextInsideArtworkAllowed, false);
  assert.equal(plan.layerPlan.typographyLayer, "docs_suite_editable_typography");
  assert.deepEqual(validateBookIllustrationIntelligencePlan(plan), []);
});

test("accepts an evidence-complete candidate only for independent review", () => {
  const plan = compilePlan();
  const result = evaluateBookIllustrationCandidate(goodQaInput(plan));
  assert.equal(result.status, "ready_for_independent_review");
  assert.deepEqual(result.findings, []);
  assert.equal(result.selectionPerformed, false);
  assert.equal(result.promotionPerformed, false);
  assert.equal(result.bookUseBindingCreated, false);
});

test("rejects synthetic-looking craft, print, continuity, presentation and rights failures together", () => {
  const plan = compilePlan();
  const input = goodQaInput(plan);
  Object.assign(input.technical, {
    widthPx: 1200,
    heightPx: 1800,
    effectiveContinuousTonePpi: 190,
    effectivePureLineArtPpi: 250,
    bleedInchesPerOuterEdge: 0,
    flattenedForDelivery: false,
    editableLayeredMasterAvailable: false,
    minimumPositiveLineWidthPx: 0.5,
    minimumReverseLineWidthPx: 0.75,
    maximumInkCoveragePercent: 330,
    tonalStepCount: 22,
    embeddedTextDetected: true,
    embeddedLogoDetected: true,
  });
  Object.assign(input.craft, {
    lineWeightVariance: 10,
    hatchLightConsistency: 20,
    materialMarkVariation: 15,
    repeatedTextureScore: 90,
    randomNoiseScore: 95,
    pseudoDetailScore: 92,
    anatomyScore: 20,
    handsAndFacesScore: 10,
    perspectiveScore: 25,
    continuityScore: 30,
    digitalSmoothingScore: 90,
    compositionScore: 35,
    printSeparationScore: 25,
  });
  Object.assign(input.rights, {
    namedCreatorImitationDetected: true,
    brandedFranchiseElementsDetected: true,
    distinctiveSurfaceReconstructionDetected: true,
    falseHandmadeClaimDetected: true,
    syntheticProvenanceHidden: true,
  });
  input.observedContinuityLockIds = ["character:substituted"];
  const result = evaluateBookIllustrationCandidate(input);
  assert.equal(result.status, "rejected");
  for (const code of [
    "raster_dimensions_below_plan",
    "line_art_ppi_low",
    "bleed_insufficient",
    "embedded_text_detected",
    "random_scratch_overlay",
    "repeated_texture_stamps",
    "hands_faces_failure",
    "continuity_failure",
    "branded_franchise_transfer",
    "false_handmade_claim",
  ]) {
    assert.ok(result.blockerCodes.includes(code), code);
  }
});

test("blocks named-creator, branded-franchise and provenance-concealment prompts", () => {
  const input = planningInput();
  input.namedCreatorReferences = ["Living Illustrator"];
  input.brandedFranchiseReferences = ["Protected Franchise"];
  input.desiredAesthetic = "AI-undetectable art in the style of Living Illustrator";
  const result = compileBookIllustrationIntelligencePlan(input);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("\n"), /Named creator references are prohibited/);
  assert.match(result.blockers.join("\n"), /Branded franchise references are prohibited/);
  assert.match(result.blockers.join("\n"), /provenance-concealment/);
});

test("detects plan tampering", () => {
  const plan = compilePlan();
  const tampered = structuredClone(plan);
  tampered.markGrammar.hatchGrammar.maximumCrosshatchLayers = 99;
  assert.match(validateBookIllustrationIntelligencePlan(tampered).join("\n"), /fingerprint/i);
});

test("uses standards-compliant SHA-256 fingerprints", () => {
  assert.equal(
    fingerprintBookIllustrationValue("abc"),
    "sha256:6cc43f858fbb763301637b5af970e2a46b46f461f27e5a0f41e009c59b827b25",
  );
});


test("does not infer print geometry and requires exact Docs Suite dimensions", () => {
  const missing = planningInput();
  delete missing.printProfile.deliveryWidthInches;
  delete missing.printProfile.deliveryHeightInches;
  const missingResult = compileBookIllustrationIntelligencePlan(missing);
  assert.equal(missingResult.status, "blocked");
  assert.match(missingResult.blockers.join("\n"), /deliveryWidthInches|deliveryHeightInches/);

  const wrongAuthority = planningInput();
  wrongAuthority.printProfile.geometryAuthority = "provider_guess";
  const authorityResult = compileBookIllustrationIntelligencePlan(wrongAuthority);
  assert.equal(authorityResult.status, "blocked");
  assert.match(authorityResult.blockers.join("\n"), /docs_suite_exact_dimensions/);
});

test("requires an exact external template for full-wrap artwork", () => {
  const input = planningInput();
  input.purpose = "full_wrap_art";
  input.printProfile.deliveryWidthInches = 12.8;
  const result = compileBookIllustrationIntelligencePlan(input);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("\n"), /externalTemplateFingerprint/);

  input.printProfile.externalTemplateFingerprint = digest("f");
  const ready = compileBookIllustrationIntelligencePlan(input);
  assert.equal(ready.status, "ready");
  assert.equal(
    ready.plan.printRequirements.externalTemplateFingerprint,
    digest("f"),
  );
});

test("requires editable lettering for graphic-novel artwork", () => {
  const input = planningInput();
  input.purpose = "graphic_novel_page";
  input.processFamily = "graphic_novel_ink";
  input.genreRoute = "graphic_novel";
  input.presentationPolicy.editableLetteringRequired = false;
  const result = compileBookIllustrationIntelligencePlan(input);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("\n"), /editableLetteringRequired/);
});

test("plan validation rejects recomputed unknown authority and geometry tampering", () => {
  const plan = compilePlan();
  const unknown = structuredClone(plan);
  unknown.silentPromotionAuthority = true;
  unknown.planFingerprint = fingerprintBookIllustrationValue(
    Object.fromEntries(Object.entries(unknown).filter(([key]) => key !== "planFingerprint")),
  );
  assert.match(validateBookIllustrationIntelligencePlan(unknown).join("\n"), /unknown fields/);

  const geometry = structuredClone(plan);
  geometry.printRequirements.geometryAuthority = "provider_guess";
  geometry.planFingerprint = fingerprintBookIllustrationValue(
    Object.fromEntries(Object.entries(geometry).filter(([key]) => key !== "planFingerprint")),
  );
  assert.match(validateBookIllustrationIntelligencePlan(geometry).join("\n"), /Docs Suite exact dimensions/);
});

test("rejects calendar-invalid planning timestamps", () => {
  const input = planningInput();
  input.requestedAt = "2026-13-40T05:00:00.000Z";
  const result = compileBookIllustrationIntelligencePlan(input);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("\n"), /real canonical UTC timestamp/);
});


test("matches Node SHA-256 for Unicode and long canonical JSON", () => {
  for (const value of [
    "é漢字😀",
    { process: "wood engraving", paper: "wove — crème", note: "灯" },
    "crosshatch-".repeat(10_000),
  ]) {
    const expected = `sha256:${createHash("sha256")
      .update(canonicalBookIllustrationJson(value), "utf8")
      .digest("hex")}`;
    assert.equal(fingerprintBookIllustrationValue(value), expected);
  }
});


function readyQaResult(plan) {
  const result = evaluateBookIllustrationCandidate(goodQaInput(plan));
  assert.equal(result.status, "ready_for_independent_review");
  return result;
}

function generationDispatchInput(plan, operation = "book.cover.candidates.generate") {
  return {
    outputKind: "evavo_art_book_illustration_generation_dispatch_input",
    schemaVersion: 1,
    contract: "evavo_art_book_illustration_intelligence_v1",
    operation,
    executionId: "execution-cover-1",
    plan,
    observedPlanFingerprint: plan.planFingerprint,
    workOrderFingerprintSha256: digest("1"),
    providerRuntimeRequestFingerprint: digest("2"),
    adapterPolicyFingerprint: digest("3"),
    candidateCount: 4,
    requestedAt: "2026-08-05T05:10:00.000Z",
    requestedBy: "book-automation",
    providerAttemptLimit: 1,
    providerFallbackAllowed: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    bookUseBindingAllowed: false,
    publicationAllowed: false,
  };
}

function unsignedVisualReview(plan, qaResult, reviewerProducerId, score = 92, decision = "pass") {
  return {
    outputKind: "evavo_art_book_visual_review_receipt",
    schemaVersion: 1,
    contract: "evavo_art_book_illustration_intelligence_v1",
    reviewId: `review-${reviewerProducerId}`,
    candidateId: "candidate-cover-1",
    candidateProducerId: "candidate-producer-1",
    candidateContentSha256: digest("4"),
    candidateArtifactFingerprint: digest("5"),
    planFingerprint: plan.planFingerprint,
    qaResultFingerprint: qaResult.resultFingerprint,
    reviewerProducerId,
    reviewerProvider: "other_compatible_model",
    reviewerModel: `visual-review-model-${reviewerProducerId}`,
    score,
    decision,
    evidenceIds: [`evidence-${reviewerProducerId}`],
    findingIds: decision === "pass" ? [] : [`finding-${reviewerProducerId}`],
    reviewedAt: "2026-08-05T05:15:00.000Z",
    reviewerWasCandidateProducer: false,
    selectionAuthorityAllowed: false,
    promotionAuthorityAllowed: false,
    publicationPerformed: false,
  };
}

function visualReview(plan, qaResult, reviewerProducerId, score = 92, decision = "pass") {
  const unsigned = unsignedVisualReview(
    plan,
    qaResult,
    reviewerProducerId,
    score,
    decision,
  );
  return {
    ...unsigned,
    reviewFingerprint: fingerprintBookIllustrationVisualReviewReceipt(unsigned),
  };
}

function consensusInput(plan, qaResult, reviewerReceipts) {
  return {
    outputKind: "evavo_art_book_visual_consensus_input",
    schemaVersion: 1,
    contract: "evavo_art_book_illustration_intelligence_v1",
    candidateId: "candidate-cover-1",
    candidateProducerId: "candidate-producer-1",
    candidateContentSha256: digest("4"),
    candidateArtifactFingerprint: digest("5"),
    plan,
    qaResult,
    reviewerReceipts,
    minimumIndependentReviewers: 2,
    minimumConsensusBasisPoints: 9000,
    minimumPassingReviewerScore: 80,
    requestedAt: "2026-08-05T05:20:00.000Z",
    requestedBy: "book-automation",
    providerCallAllowed: false,
    reviewerFallbackAllowed: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    bookUseBindingAllowed: false,
    publicationAllowed: false,
  };
}

test("publishes exact generation and consensus capability descriptors", () => {
  const capabilities = listBookIllustrationIntelligenceCapabilities();
  for (const capability of [
    "book.cover.candidates.generate",
    "book.interior.candidates.generate",
    "book.visual.consensus",
  ]) {
    assert.ok(capabilities.capabilities.includes(capability), capability);
    assert.ok(
      BOOK_ILLUSTRATION_CAPABILITY_DESCRIPTORS.some(
        (descriptor) => descriptor.capabilityId === capability,
      ),
      capability,
    );
  }
  const generation = BOOK_ILLUSTRATION_CAPABILITY_DESCRIPTORS.find(
    (descriptor) => descriptor.capabilityId === "book.cover.candidates.generate",
  );
  assert.equal(
    generation.runtimeTargetContract,
    "evavo_book_art_provider_shadow_runtime_v1",
  );
  assert.equal(
    generation.runtimeTargetInputKind,
    "evavo_book_art_provider_shadow_job_input",
  );
  assert.equal(generation.providerBacked, true);
  assert.equal(generation.oneProviderAttemptRequired, true);
  assert.equal(generation.providerFallbackAllowed, false);
  const consensus = BOOK_ILLUSTRATION_CAPABILITY_DESCRIPTORS.find(
    (descriptor) => descriptor.capabilityId === "book.visual.consensus",
  );
  assert.equal(consensus.providerBacked, false);
  assert.equal(consensus.selectionPerformedByOperation, false);
});

test("compiles one no-fallback provider dispatch against the existing shadow runtime", () => {
  const plan = compilePlan();
  const result = compileBookIllustrationGenerationDispatch(
    generationDispatchInput(plan),
  );
  assert.equal(result.status, "ready", JSON.stringify(result.blockers));
  assert.equal(result.dispatch.targetContract, "evavo_book_art_provider_shadow_runtime_v1");
  assert.equal(result.dispatch.targetInputKind, "evavo_book_art_provider_shadow_job_input");
  assert.equal(result.dispatch.providerAttemptLimit, 1);
  assert.equal(result.dispatch.providerFallbackAllowed, false);
  assert.equal(result.dispatch.selectionRequired, true);
  assert.equal(result.dispatch.selectionPerformed, false);
  assert.equal(result.dispatch.promotionPerformed, false);
});

test("rejects cover and interior dispatch operation mismatches and fallback authority", () => {
  const plan = compilePlan();
  const wrong = generationDispatchInput(plan, "book.interior.candidates.generate");
  wrong.providerFallbackAllowed = true;
  wrong.providerAttemptLimit = 2;
  const result = compileBookIllustrationGenerationDispatch(wrong);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("\n"), /Interior generation cannot be used for a cover plan/);
  assert.match(result.blockers.join("\n"), /providerAttemptLimit must be exactly 1/);
  assert.match(result.blockers.join("\n"), /providerFallbackAllowed must remain false/);
});

test("reaches independent visual consensus without selecting or promoting the candidate", () => {
  const plan = compilePlan();
  const qaResult = readyQaResult(plan);
  const result = evaluateBookIllustrationVisualConsensus(
    consensusInput(plan, qaResult, [
      visualReview(plan, qaResult, "reviewer-alpha"),
      visualReview(plan, qaResult, "reviewer-beta"),
    ]),
  );
  assert.equal(result.status, "ready_for_governed_selection", JSON.stringify(result.blockers));
  assert.equal(result.evaluation.consensusBasisPoints, 10_000);
  assert.deepEqual(result.evaluation.passingReviewerProducerIds, [
    "reviewer-alpha",
    "reviewer-beta",
  ]);
  assert.equal(result.evaluation.selectionPerformed, false);
  assert.equal(result.evaluation.promotionPerformed, false);
  assert.equal(result.evaluation.bookUseBindingCreated, false);
});

test("preserves dissent and blocks low-scoring receipts falsely labelled pass", () => {
  const plan = compilePlan();
  const qaResult = readyQaResult(plan);
  const result = evaluateBookIllustrationVisualConsensus(
    consensusInput(plan, qaResult, [
      visualReview(plan, qaResult, "reviewer-alpha", 95, "pass"),
      visualReview(plan, qaResult, "reviewer-beta", 60, "pass"),
    ]),
  );
  assert.equal(result.status, "needs_work");
  assert.equal(result.evaluation.consensusBasisPoints, 5_000);
  assert.deepEqual(result.evaluation.dissentingReviewerProducerIds, [
    "reviewer-beta",
  ]);
});

test("rejects visual self-review, duplicate reviewers and freshly recomputed forged receipts", () => {
  const plan = compilePlan();
  const qaResult = readyQaResult(plan);
  const forgedUnsigned = unsignedVisualReview(
    plan,
    qaResult,
    "candidate-producer-1",
  );
  const forged = {
    ...forgedUnsigned,
    reviewFingerprint: fingerprintBookIllustrationVisualReviewReceipt(
      forgedUnsigned,
    ),
  };
  const duplicate = visualReview(plan, qaResult, "reviewer-alpha");
  const result = evaluateBookIllustrationVisualConsensus(
    consensusInput(plan, qaResult, [forged, duplicate, structuredClone(duplicate)]),
  );
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("\n"), /not independent from the candidate producer/);
  assert.match(result.blockers.join("\n"), /reviewer producers are duplicated/i);
});

test("rejects visual reviews bound to different candidate bytes or future timestamps", () => {
  const plan = compilePlan();
  const qaResult = readyQaResult(plan);
  const unsigned = unsignedVisualReview(plan, qaResult, "reviewer-alpha");
  unsigned.candidateContentSha256 = digest("9");
  unsigned.reviewedAt = "2026-08-05T05:30:00.000Z";
  const wrong = {
    ...unsigned,
    reviewFingerprint: fingerprintBookIllustrationVisualReviewReceipt(unsigned),
  };
  const result = evaluateBookIllustrationVisualConsensus(
    consensusInput(plan, qaResult, [
      wrong,
      visualReview(plan, qaResult, "reviewer-beta"),
    ]),
  );
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("\n"), /different candidate, plan or QA evidence/);
  assert.match(result.blockers.join("\n"), /cannot be later than the consensus request/);
});
